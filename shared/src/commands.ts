import type { DateStr } from './dates.js';
import { addToDay, becameFull, dayOf, daysWithout, planDay, setFrog, withoutTask } from './day.js';
import { newId } from './ids.js';
import { liveLists, nextListOrder, pickList } from './lists.js';
import { dueConflict, quadrantOf, type Quadrant, type UrgencyContext } from './quadrant.js';
import type { QuickAddResult } from './quickadd.js';
import { makeRepeat, type RepeatRule } from './repeat.js';
import type { Day, FocusSession, List, Settings, Task } from './schema.js';
import {
  addSubtask,
  completeRepeating,
  completeTask,
  deleteTask,
  dropTask,
  liveSubtasks,
  logEvent,
  moveToQuadrant,
  newList,
  newTask,
  patchTask,
  postponeTask,
  promoteSubtask,
  removeSubtask,
  reopenTask,
  reorderSubtasks,
  restoreTask,
  setNotes,
  setTaskRepeat,
  undoCompleteRepeating,
  updateSubtask,
} from './tasks.js';

/**
 * Task commands: every user edit as a pure function of a store snapshot.
 *
 * A command returns the entities to write (`edit`), an `undo` where the UI
 * offers one, and whatever the UI needs to say about it. It returns null when
 * there is nothing to do (unknown or deleted task, no change). Undo is a
 * function of the snapshot at undo time, because other edits may have landed
 * in between. The client commits the edit and shows the toast; nothing here
 * touches state, storage or the clock.
 */

export interface Snapshot {
  lists: Record<string, List>;
  tasks: Record<string, Task>;
  days: Record<string, Day>;
  settings: Settings;
}

/** When the command runs: the logical date and the timestamp to write. */
export interface Clock {
  today: DateStr;
  now: string;
}

export interface StoreEdit {
  lists?: List[];
  tasks?: Task[];
  days?: Day[];
  focusSessions?: FocusSession[];
  settings?: Settings;
}

export type Undo = (s: Snapshot, c: Clock) => StoreEdit;

export type CommandResult<T extends object = object> = { edit: StoreEdit; undo?: Undo } & T;

function liveTask(s: Snapshot, id: string): Task | null {
  const t = s.tasks[id];
  return t && !t.deleted ? t : null;
}

export function urgencyOf(s: Snapshot, c: Clock): UrgencyContext {
  return { today: c.today, urgencyWindowDays: s.settings.urgencyWindowDays };
}

/** A task that lands in Drop (or is archived) leaves today's and future My Days. */
function leavesMyDay(s: Snapshot, c: Clock, before: Task, after: Task): Day[] {
  const ctx = urgencyOf(s, c);
  const nowDrop = quadrantOf(after, ctx) === 'drop' && quadrantOf(before, ctx) !== 'drop';
  return nowDrop || after.status === 'archived'
    ? daysWithout(s.days, after.id, c.today, c.now)
    : [];
}

/** Tasks with the soft-limit check for the full-day hint. */
type DayResult = CommandResult<{ filled: boolean }>;

// ---------------------------------------------------------------------------
// My Day

export function addToMyDay(s: Snapshot, c: Clock, id: string, date = c.today): DayResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  const before = dayOf(date, s.days);
  const after = addToDay(before, id, c.now);
  if (!after) return null;
  return {
    edit: { days: [after], tasks: [logEvent(task, 'addedToMyDay', c.now, { date })] },
    filled: date === c.today && becameFull(before, after, s.tasks),
  };
}

export function removeFromMyDay(
  s: Snapshot,
  c: Clock,
  id: string,
  date = c.today,
): CommandResult | null {
  const day = withoutTask(dayOf(date, s.days), id, c.now);
  return day ? { edit: { days: [day] } } : null;
}

/** Only an important task can be the Frog. */
export function makeFrog(s: Snapshot, c: Clock, id: string, date = c.today): DayResult | null {
  const task = liveTask(s, id);
  if (!task || !task.important) return null;
  const before = dayOf(date, s.days);
  const after = setFrog(before, id, s.tasks, c.now);
  if (!after) return null;
  return {
    edit: { days: [after], tasks: [logEvent(task, 'madeFrog', c.now, { date })] },
    filled: date === c.today && becameFull(before, after, s.tasks),
  };
}

// ---------------------------------------------------------------------------
// Quick add

/** What quick add uses when the input has no token for it (from the screen it's on). */
export interface QuickAddDefaults {
  /** The list being viewed (or picked under the input). */
  listId?: string | null;
  /** The day being viewed in the Agenda. */
  due?: DateStr | null;
  /** Adding from My Day puts the task in My Day. */
  myDay?: boolean;
}

export interface Placement {
  /** An existing live list, or null when `newListName` will be created. */
  listId: string | null;
  newListName: string | null;
  due: DateStr | null;
  addToMyDay: boolean;
}

/**
 * Where a new task lands: tokens first, then the screen's defaults, then the
 * Settings default list. A repeat needs a date to count from, so it dates the
 * task today when nothing else does.
 */
export function placeQuickAdd(
  r: QuickAddResult,
  defaults: QuickAddDefaults,
  s: Pick<Snapshot, 'lists' | 'settings'>,
  today: DateStr,
): Placement {
  const newListName = r.listId ? null : r.newListName;
  const listId =
    r.listId ??
    (newListName
      ? null
      : (pickList(s.lists, [defaults.listId, s.settings.defaultListId])?.id ??
        s.settings.defaultListId));
  let due = r.due ?? defaults.due ?? null;
  if (r.repeat) due ??= today;
  return { listId, newListName, due, addToMyDay: r.addToMyDay || !!defaults.myDay };
}

export function createFromQuickAdd(
  s: Snapshot,
  c: Clock,
  r: QuickAddResult,
  defaults: QuickAddDefaults = {},
): CommandResult<{ task: Task; listName: string; addedToMyDay: boolean; filled: boolean }> | null {
  const title = r.title.trim();
  if (!title) return null;
  const place = placeQuickAdd(r, defaults, s, c.today);
  const lists: List[] = [];
  let listId = place.listId;
  if (!listId) {
    const list = newList(place.newListName!, nextListOrder(s.lists), c.now);
    lists.push(list);
    listId = list.id;
  }
  let task = newTask(
    {
      title,
      listId,
      important: r.important,
      urgentFlag: r.urgentFlag,
      due: place.due,
      waitingOn: r.waitingOn,
      repeat: r.repeat && place.due ? makeRepeat(r.repeat, place.due) : null,
    },
    c.now,
  );
  const days: Day[] = [];
  let filled = false;
  if (place.addToMyDay) {
    task = logEvent(task, 'addedToMyDay', c.now, { date: c.today });
    const before = dayOf(c.today, s.days);
    const after = addToDay(before, task.id, c.now)!;
    days.push(after);
    filled = becameFull(before, after, { ...s.tasks, [task.id]: task });
  }
  const id = task.id;
  return {
    edit: { lists, tasks: [task], days },
    task,
    listName: lists[0]?.name ?? s.lists[listId]?.name ?? 'list',
    addedToMyDay: place.addToMyDay,
    filled,
    undo: (s2, c2) => {
      const t = liveTask(s2, id);
      if (!t) return {};
      return { tasks: [deleteTask(t, c2.now)], days: daysWithout(s2.days, id, c2.today, c2.now) };
    },
  };
}

// ---------------------------------------------------------------------------
// Tasks

/** Completes a task; a repeating one also spawns the next in its series. */
export function complete(
  s: Snapshot,
  c: Clock,
  id: string,
): CommandResult<{ wasFrog: boolean; next: Task | null }> | null {
  const task = liveTask(s, id);
  if (!task || task.status === 'done') return null;
  const wasFrog = dayOf(c.today, s.days).frog === id;
  const series = completeRepeating(task, c.today, c.now);
  if (!series) {
    return {
      edit: { tasks: [completeTask(task, c.now)] },
      wasFrog,
      next: null,
      undo: (s2, c2) => reopen(s2, c2, id)?.edit ?? {},
    };
  }
  const nextId = series.next.id;
  return {
    edit: { tasks: [series.done, series.next] },
    wasFrog,
    next: series.next,
    // Back to one open task carrying the repeat; the spawned one goes.
    undo: (s2, c2) => {
      const done = liveTask(s2, id);
      const spawned = liveTask(s2, nextId);
      const tasks: Task[] = [];
      if (spawned) tasks.push(deleteTask(spawned, c2.now));
      if (done) tasks.push(undoCompleteRepeating(done, task.repeat, c2.now));
      const days = spawned ? daysWithout(s2.days, nextId, c2.today, c2.now) : [];
      return { tasks, days };
    },
  };
}

export function reopen(s: Snapshot, c: Clock, id: string): CommandResult | null {
  const task = liveTask(s, id);
  if (!task || task.status === 'open') return null;
  return { edit: { tasks: [reopenTask(task, c.now)] } };
}

export function setRepeat(
  s: Snapshot,
  c: Clock,
  id: string,
  rule: RepeatRule | null,
): CommandResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  const next = setTaskRepeat(task, rule, c.today, c.now);
  return next === task ? null : { edit: { tasks: [next] } };
}

export function remove(s: Snapshot, c: Clock, id: string): CommandResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  const days = daysWithout(s.days, id, c.today, c.now);
  const previous = days.map((d) => dayOf(d.date, s.days));
  return {
    edit: { tasks: [deleteTask(task, c.now)], days },
    undo: (s2, c2) => {
      const dead = s2.tasks[id];
      if (!dead) return {};
      return {
        tasks: [restoreTask(dead, c2.now)],
        days: previous.map((d) => ({ ...d, updatedAt: c2.now })),
      };
    },
  };
}

export function update(
  s: Snapshot,
  c: Clock,
  id: string,
  patch: Partial<Pick<Task, 'title' | 'listId' | 'due' | 'waitingOn' | 'followUp'>>,
): CommandResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  const next = patchTask(task, patch, c.now);
  return { edit: { tasks: [next], days: leavesMyDay(s, c, task, next) } };
}

export function moveToList(
  s: Snapshot,
  c: Clock,
  id: string,
  listId: string,
): CommandResult<{ listName: string }> | null {
  const task = liveTask(s, id);
  const list = s.lists[listId];
  if (!task || !list || list.deleted || task.listId === listId) return null;
  const from = task.listId;
  return {
    edit: { tasks: [patchTask(task, { listId }, c.now)] },
    listName: list.name,
    undo: (s2, c2) => {
      const current = liveTask(s2, id);
      return current ? { tasks: [patchTask(current, { listId: from }, c2.now)] } : {};
    },
  };
}

export function updateNotes(
  s: Snapshot,
  c: Clock,
  id: string,
  notes: string,
): CommandResult | null {
  const task = liveTask(s, id);
  if (!task || task.notes === notes) return null;
  return { edit: { tasks: [setNotes(task, notes, c.now)] } };
}

/**
 * Manual move between quadrants. `conflict` is set when the due date keeps the
 * task urgent (the UI then offers to change the date); there is no undo then.
 */
export function move(
  s: Snapshot,
  c: Clock,
  id: string,
  target: Quadrant,
): CommandResult<{ from: Quadrant; conflict: boolean }> | null {
  const task = liveTask(s, id);
  if (!task) return null;
  const ctx = urgencyOf(s, c);
  const from = quadrantOf(task, ctx);
  const moved = moveToQuadrant(task, target, c.now, ctx);
  const conflict = dueConflict(task, target, ctx);
  return {
    edit: { tasks: [moved], days: leavesMyDay(s, c, task, moved) },
    from,
    conflict,
    ...(!conflict && from !== target
      ? {
          undo: (s2: Snapshot, c2: Clock) => {
            const current = liveTask(s2, id);
            return current ? { tasks: [moveToQuadrant(current, from, c2.now, ctx)] } : {};
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Steps

export function addStep(
  s: Snapshot,
  c: Clock,
  taskId: string,
  title: string,
): CommandResult<{ stepId: string }> | null {
  const task = liveTask(s, taskId);
  if (!task || !title.trim()) return null;
  const r = addSubtask(task, title, c.now);
  return { edit: { tasks: [r.task] }, stepId: r.subtask.id };
}

export function renameStep(
  s: Snapshot,
  c: Clock,
  taskId: string,
  stepId: string,
  title: string,
): CommandResult | null {
  const task = liveTask(s, taskId);
  const step = task?.subtasks.find((x) => x.id === stepId);
  if (!task || !step || step.title === title) return null;
  return { edit: { tasks: [updateSubtask(task, stepId, { title }, c.now)] } };
}

/** `finishedAll` is set when this tick finished every step. */
export function toggleStep(
  s: Snapshot,
  c: Clock,
  taskId: string,
  stepId: string,
): CommandResult<{ finishedAll: boolean }> | null {
  const task = liveTask(s, taskId);
  const step = task?.subtasks.find((x) => x.id === stepId);
  if (!task || !step) return null;
  const next = updateSubtask(task, stepId, { done: !step.done }, c.now);
  const steps = liveSubtasks(next);
  return {
    edit: { tasks: [next] },
    finishedAll: !step.done && steps.length > 0 && steps.every((x) => x.done),
  };
}

export function deleteStep(s: Snapshot, c: Clock, taskId: string, stepId: string) {
  const task = liveTask(s, taskId);
  return task ? { edit: { tasks: [removeSubtask(task, stepId, c.now)] } } : null;
}

export function reorderSteps(s: Snapshot, c: Clock, taskId: string, orderedIds: string[]) {
  const task = liveTask(s, taskId);
  return task ? { edit: { tasks: [reorderSubtasks(task, orderedIds, c.now)] } } : null;
}

export function promoteStep(s: Snapshot, c: Clock, taskId: string, stepId: string) {
  const task = liveTask(s, taskId);
  const r = task ? promoteSubtask(task, stepId, c.now) : null;
  return r ? { edit: { tasks: [r.task, r.promoted] } } : null;
}

// ---------------------------------------------------------------------------
// Lists

export function createList(
  s: Snapshot,
  c: Clock,
  name: string,
): CommandResult<{ list: List }> | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const list = newList(trimmed, nextListOrder(s.lists), c.now);
  return { edit: { lists: [list] }, list };
}

export function renameList(s: Snapshot, c: Clock, id: string, name: string): CommandResult | null {
  const list = s.lists[id];
  const trimmed = name.trim();
  if (!list || !trimmed || list.name === trimmed) return null;
  return { edit: { lists: [{ ...list, name: trimmed, updatedAt: c.now }] } };
}

/**
 * Deletes a list, moving its tasks (open and closed) to `moveTo`. Refused for
 * the last list, and for a list with tasks when there's nowhere to move them.
 */
export function deleteList(
  s: Snapshot,
  c: Clock,
  id: string,
  moveTo: string | null,
): CommandResult | null {
  const list = s.lists[id];
  const others = Object.values(s.lists).filter((l) => !l.deleted && l.id !== id);
  if (!list || list.deleted || others.length === 0) return null;
  const owned = Object.values(s.tasks).filter((t) => t.listId === id && !t.deleted);
  if (owned.length > 0 && !moveTo) return null;
  const tasks = owned.map((t) => patchTask(t, { listId: moveTo! }, c.now));
  const { restore: _r, ...rest } = list;
  const settings: Settings | undefined =
    s.settings.defaultListId === id
      ? {
          ...s.settings,
          defaultListId: moveTo ?? liveLists(s.lists).find((l) => l.id !== id)!.id,
          updatedAt: c.now,
        }
      : undefined;
  return {
    edit: {
      lists: [{ ...rest, deleted: true, deletedAt: c.now, updatedAt: c.now }],
      tasks,
      ...(settings ? { settings } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Evening planning

/** "Tomorrow": carry forward (logged as a postponement; due date unchanged). */
export function carryForward(
  s: Snapshot,
  c: Clock,
  id: string,
  from: DateStr,
  to: DateStr,
): CommandResult | null {
  const task = liveTask(s, id);
  return task ? { edit: { tasks: [postponeTask(task, from, to, false, c.now)] } } : null;
}

/** "Pick a date": reschedule by setting the due date. A repeat keeps its pattern. */
export function reschedule(s: Snapshot, c: Clock, id: string, date: DateStr): CommandResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  return { edit: { tasks: [postponeTask(task, task.due ?? c.today, date, true, c.now)] } };
}

/** "Drop": not important, not urgent, due cleared (which ends a repeat). */
export function dropFromPlan(s: Snapshot, c: Clock, id: string): CommandResult | null {
  const task = liveTask(s, id);
  if (!task) return null;
  return {
    edit: {
      tasks: [dropTask(task, c.now, urgencyOf(s, c))],
      days: daysWithout(s.days, id, c.today, c.now),
    },
  };
}

/** Writes the planned day and logs history on each task. */
export function finishPlan(
  s: Snapshot,
  c: Clock,
  date: DateStr,
  frog: string | null,
  myDay: string[],
): CommandResult {
  const tasks: Task[] = [];
  for (const id of myDay) {
    const t = liveTask(s, id);
    if (t) tasks.push(logEvent(t, 'addedToMyDay', c.now, { date }));
  }
  const f = frog ? liveTask(s, frog) : null;
  if (f) tasks.push(logEvent(f, 'madeFrog', c.now, { date }));
  return { edit: { days: [planDay(dayOf(date, s.days), frog, myDay, c.now)], tasks } };
}

// ---------------------------------------------------------------------------
// Settings and sessions

export function updateSettings(
  s: Snapshot,
  c: Clock,
  patch: Partial<Omit<Settings, 'updatedAt' | 'rev'>>,
): CommandResult {
  return { edit: { settings: { ...s.settings, ...patch, updatedAt: c.now } } };
}

export function logFocusSession(s: Omit<FocusSession, 'id' | 'rev'>): CommandResult {
  return { edit: { focusSessions: [{ ...s, id: newId('f'), rev: 0 }] } };
}
