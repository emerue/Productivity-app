import {
  addSubtask,
  completeTask,
  deleteTask,
  dropTask,
  dueConflict,
  liveSubtasks,
  logEvent,
  logicalDate,
  moveToQuadrant,
  MY_DAY_SOFT_LIMIT,
  newId,
  newList,
  newTask,
  patchTask,
  postponeTask,
  promoteSubtask,
  QUADRANT_LABEL,
  quadrantOf,
  removeSubtask,
  reopenTask,
  reorderSubtasks,
  restoreTask,
  setNotes,
  updateSubtask,
  type DateStr,
  type Day,
  type FocusSession,
  type List,
  type Quadrant,
  type QuickAddResult,
  type Settings,
  type Task,
  type UrgencyContext,
} from '@frog/shared';
import { readLocal, writeLocal } from '../lib/storage';
import { playChime } from '../lib/sound';
import { useData } from './store';
import { commit } from './sync';
import { linger, showToast, unlinger, useUI } from './ui';

const iso = () => new Date().toISOString();
const state = () => useData.getState();

export function today(): DateStr {
  return logicalDate(new Date(), state().settings);
}

export function urgencyCtx(date: DateStr = today()): UrgencyContext {
  return { today: date, urgencyWindowDays: state().settings.urgencyWindowDays };
}

function liveTask(id: string): Task | null {
  const t = state().tasks[id];
  return t && !t.deleted ? t : null;
}

export function liveLists(lists: Record<string, List> = state().lists): List[] {
  return Object.values(lists)
    .filter((l) => !l.deleted)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Days

export function emptyDay(date: DateStr): Day {
  return {
    date,
    frog: null,
    myDay: [],
    planned: false,
    plannedAt: null,
    updatedAt: new Date(0).toISOString(),
    rev: 0,
  };
}

export function dayOf(date: DateStr, days: Record<string, Day> = state().days): Day {
  return days[date] ?? emptyDay(date);
}

function editDay(date: DateStr, fn: (d: Day) => Day): Day {
  return { ...fn(dayOf(date)), updatedAt: iso() };
}

/** Frog plus other open My Day tasks. */
function plannedCount(day: Day): number {
  const open = (id: string) => liveTask(id)?.status === 'open';
  return (day.frog && open(day.frog) ? 1 : 0) + day.myDay.filter(open).length;
}

function maybeFullDayHint(before: Day, after: Day, date: DateStr): void {
  if (date !== today()) return;
  const limit = MY_DAY_SOFT_LIMIT + 1;
  if (
    plannedCount(before) < limit &&
    plannedCount(after) >= limit &&
    readLocal('fullDayHint') !== date
  ) {
    writeLocal('fullDayHint', date);
    useUI.setState({ fullDayHint: true });
  }
}

/** Removes a task from a day's Frog and My Day. Returns null when it was in neither. */
function withoutTask(day: Day, id: string): Day | null {
  if (day.frog !== id && !day.myDay.includes(id)) return null;
  return {
    ...day,
    frog: day.frog === id ? null : day.frog,
    myDay: day.myDay.filter((x) => x !== id),
    updatedAt: iso(),
  };
}

/** Days from today onward that reference the task. */
function daysWithout(id: string): Day[] {
  const t = today();
  return Object.values(state().days)
    .filter((d) => d.date >= t)
    .map((d) => withoutTask(d, id))
    .filter((d): d is Day => d !== null);
}

export function addToMyDay(id: string, date: DateStr = today()): void {
  const task = liveTask(id);
  if (!task) return;
  const before = dayOf(date);
  if (before.frog === id || before.myDay.includes(id)) return;
  const after = editDay(date, (d) => ({ ...d, myDay: [...d.myDay, id] }));
  commit({ days: [after], tasks: [logEvent(task, 'addedToMyDay', iso(), { date })] });
  maybeFullDayHint(before, after, date);
}

export function removeFromMyDay(id: string, date: DateStr = today()): void {
  const day = withoutTask(dayOf(date), id);
  if (day) commit({ days: [day] });
}

/** Makes the task the day's Frog. A previous Frog moves to the top of My Day. */
export function makeFrog(id: string, date: DateStr = today()): void {
  const task = liveTask(id);
  if (!task || !task.important) return;
  const before = dayOf(date);
  if (before.frog === id) return;
  const after = editDay(date, (d) => {
    const prev = d.frog && d.frog !== id && liveTask(d.frog)?.status === 'open' ? [d.frog] : [];
    return {
      ...d,
      frog: id,
      myDay: [...prev, ...d.myDay.filter((x) => x !== id && !prev.includes(x))],
    };
  });
  commit({ days: [after], tasks: [logEvent(task, 'madeFrog', iso(), { date })] });
  maybeFullDayHint(before, after, date);
}

// ---------------------------------------------------------------------------
// Tasks

export function defaultListId(): string {
  const s = state();
  const l = s.lists[s.settings.defaultListId];
  return l && !l.deleted ? l.id : (liveLists()[0]?.id ?? s.settings.defaultListId);
}

/** What quick add uses when the input has no token for it (from the screen it's on). */
export interface QuickAddDefaults {
  /** The list being viewed. */
  listId?: string | null;
  /** The day being viewed in the Agenda. */
  due?: DateStr | null;
  /** Adding from My Day puts the task in My Day. */
  myDay?: boolean;
}

/** Creates a task from parsed quick-add input and says where it landed. */
export function createFromQuickAdd(
  r: QuickAddResult,
  defaults: QuickAddDefaults = {},
): Task | null {
  const title = r.title.trim();
  if (!title) return null;
  const now = iso();
  const lists: List[] = [];
  let listId = r.listId;
  if (!listId && r.newListName) {
    const order = Math.max(-1, ...liveLists().map((l) => l.order)) + 1;
    const list = newList(r.newListName, order, now);
    lists.push(list);
    listId = list.id;
  }
  const fallback = defaults.listId ? state().lists[defaults.listId] : undefined;
  listId ??= fallback && !fallback.deleted ? fallback.id : defaultListId();
  const addToMyDay = r.addToMyDay || !!defaults.myDay;

  let task = newTask(
    {
      title,
      listId,
      important: r.important,
      urgentFlag: r.urgentFlag,
      due: r.due ?? defaults.due ?? null,
      waitingOn: r.waitingOn,
    },
    now,
  );
  const date = today();
  const before = dayOf(date);
  const days: Day[] = [];
  if (addToMyDay) {
    task = logEvent(task, 'addedToMyDay', now, { date });
    days.push(editDay(date, (d) => ({ ...d, myDay: [...d.myDay, task.id] })));
  }
  commit({ lists, tasks: [task], days });
  if (days[0]) maybeFullDayHint(before, days[0], date);

  const listName = lists[0]?.name ?? state().lists[listId]?.name ?? 'list';
  const where = `${QUADRANT_LABEL[quadrantOf(task, urgencyCtx(date))]} in ${listName}`;
  showToast(addToMyDay ? `Added to ${where} and My Day` : `Added to ${where}`, {
    label: 'Undo',
    run: () => undoCreate(task.id),
  });
  return task;
}

function undoCreate(id: string): void {
  const task = liveTask(id);
  if (!task) return;
  commit({ tasks: [deleteTask(task, iso())], days: daysWithout(id) });
}

export function isTodaysFrog(id: string): boolean {
  return dayOf(today()).frog === id;
}

export function completeTaskNow(id: string): void {
  const task = liveTask(id);
  if (!task || task.status === 'done') return;
  const frog = isTodaysFrog(id);
  if (!frog) linger(id);
  commit({ tasks: [completeTask(task, iso())] });
  if (frog && state().settings.sounds) playChime();
  showToast('Completed', { label: 'Undo', run: () => reopen(id) });
}

export function reopen(id: string): void {
  const task = liveTask(id);
  if (!task) return;
  unlinger(id);
  commit({ tasks: [reopenTask(task, iso())] });
}

export function removeTask(id: string): void {
  const task = liveTask(id);
  if (!task) return;
  const days = daysWithout(id);
  const previous = days.map((d) => dayOf(d.date));
  commit({ tasks: [deleteTask(task, iso())], days });
  showToast('Deleted', {
    label: 'Undo',
    run: () => {
      const dead = state().tasks[id];
      if (!dead) return;
      commit({
        tasks: [restoreTask(dead, iso())],
        days: previous.map((d) => ({ ...d, updatedAt: iso() })),
      });
    },
  });
}

/** Archived tasks come back as open tasks. */
export function unarchive(id: string): void {
  const task = liveTask(id);
  if (!task) return;
  commit({ tasks: [reopenTask(task, iso())] });
  showToast('Restored');
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'title' | 'listId' | 'due' | 'waitingOn' | 'followUp'>>,
): void {
  const task = liveTask(id);
  if (!task) return;
  const next = patchTask(task, patch, iso());
  commit({ tasks: [next], days: leavesMyDay(task, next) });
}

/** Moves a task to another list, with undo. */
export function moveToList(id: string, listId: string): void {
  const task = liveTask(id);
  const list = state().lists[listId];
  if (!task || !list || list.deleted || task.listId === listId) return;
  const from = task.listId;
  commit({ tasks: [patchTask(task, { listId }, iso())] });
  showToast(`Moved to ${list.name}`, {
    label: 'Undo',
    run: () => {
      const current = liveTask(id);
      if (current) commit({ tasks: [patchTask(current, { listId: from }, iso())] });
    },
  });
}

export function updateNotes(id: string, notes: string): void {
  const task = liveTask(id);
  if (!task || task.notes === notes) return;
  commit({ tasks: [setNotes(task, notes, iso())] });
}

/** A task that lands in Drop (or is closed) leaves today's and future My Days. */
function leavesMyDay(before: Task, after: Task): Day[] {
  const ctx = urgencyCtx();
  const nowDrop = quadrantOf(after, ctx) === 'drop' && quadrantOf(before, ctx) !== 'drop';
  return nowDrop || after.status === 'archived' ? daysWithout(after.id) : [];
}

/**
 * Manual move. Returns 'conflict' when the due date keeps the task urgent
 * (the UI then offers to change the date).
 */
export function moveTask(id: string, target: Quadrant): 'ok' | 'conflict' {
  const task = liveTask(id);
  if (!task) return 'ok';
  const ctx = urgencyCtx();
  const from = quadrantOf(task, ctx);
  const moved = moveToQuadrant(task, target, iso(), ctx);
  commit({ tasks: [moved], days: leavesMyDay(task, moved) });

  if (dueConflict(task, target, ctx)) {
    useUI.setState({ conflict: { taskId: id, target: target as 'schedule' | 'drop' } });
    return 'conflict';
  }
  if (from !== target) {
    showToast(target === 'drop' ? 'Dropped' : `Moved to ${QUADRANT_LABEL[target]}`, {
      label: 'Undo',
      run: () => {
        const current = liveTask(id);
        if (current) commit({ tasks: [moveToQuadrant(current, from, iso(), ctx)] });
      },
    });
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Steps

export function addStep(taskId: string, title: string): string | null {
  const task = liveTask(taskId);
  if (!task || !title.trim()) return null;
  const r = addSubtask(task, title, iso());
  commit({ tasks: [r.task] });
  return r.subtask.id;
}

export function renameStep(taskId: string, stepId: string, title: string): void {
  const task = liveTask(taskId);
  const step = task?.subtasks.find((s) => s.id === stepId);
  if (!task || !step || step.title === title) return;
  commit({ tasks: [updateSubtask(task, stepId, { title }, iso())] });
}

/** Returns true when this tick finished every step (the UI then offers to complete the task). */
export function toggleStep(taskId: string, stepId: string): boolean {
  const task = liveTask(taskId);
  const step = task?.subtasks.find((s) => s.id === stepId);
  if (!task || !step) return false;
  const next = updateSubtask(task, stepId, { done: !step.done }, iso());
  commit({ tasks: [next] });
  const steps = liveSubtasks(next);
  return !step.done && steps.length > 0 && steps.every((s) => s.done);
}

export function deleteStep(taskId: string, stepId: string): void {
  const task = liveTask(taskId);
  if (!task) return;
  commit({ tasks: [removeSubtask(task, stepId, iso())] });
}

export function reorderSteps(taskId: string, orderedIds: string[]): void {
  const task = liveTask(taskId);
  if (!task) return;
  commit({ tasks: [reorderSubtasks(task, orderedIds, iso())] });
}

export function promoteStep(taskId: string, stepId: string): void {
  const task = liveTask(taskId);
  if (!task) return;
  const r = promoteSubtask(task, stepId, iso());
  if (!r) return;
  commit({ tasks: [r.task, r.promoted] });
  showToast('Promoted to task');
}

// ---------------------------------------------------------------------------
// Lists

export function createList(name: string): List | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const order = Math.max(-1, ...liveLists().map((l) => l.order)) + 1;
  const list = newList(trimmed, order, iso());
  commit({ lists: [list] });
  return list;
}

export function renameList(id: string, name: string): void {
  const list = state().lists[id];
  const trimmed = name.trim();
  if (!list || !trimmed || list.name === trimmed) return;
  commit({ lists: [{ ...list, name: trimmed, updatedAt: iso() }] });
}

/** Deletes a list, moving its tasks (open and closed) to `moveTo`. */
export function deleteList(id: string, moveTo: string | null): void {
  const s = state();
  const list = s.lists[id];
  if (!list || liveLists().length <= 1) return;
  const now = iso();
  const tasks = Object.values(s.tasks)
    .filter((t) => t.listId === id && !t.deleted)
    .map((t) => patchTask(t, { listId: moveTo as string }, now));
  if (tasks.length > 0 && !moveTo) return;
  const { restore: _r, ...rest } = list;
  const settings: Settings | undefined =
    s.settings.defaultListId === id
      ? {
          ...s.settings,
          defaultListId: moveTo ?? liveLists().find((l) => l.id !== id)!.id,
          updatedAt: now,
        }
      : undefined;
  commit({ lists: [{ ...rest, deleted: true, deletedAt: now, updatedAt: now }], tasks, settings });
  showToast('List deleted');
}

// ---------------------------------------------------------------------------
// Settings and sessions

export function updateSettings(patch: Partial<Omit<Settings, 'updatedAt' | 'rev'>>): void {
  commit({ settings: { ...state().settings, ...patch, updatedAt: iso() } });
}

export function logFocusSession(s: Omit<FocusSession, 'id' | 'rev'>): void {
  commit({ focusSessions: [{ ...s, id: newId('f'), rev: 0 }] });
}

// ---------------------------------------------------------------------------
// Evening planning

/** "Tomorrow": carry forward (logged as a postponement; due date unchanged). */
export function carryForward(id: string, from: DateStr, to: DateStr): void {
  const task = liveTask(id);
  if (task) commit({ tasks: [postponeTask(task, from, to, false, iso())] });
}

/** "Pick a date": reschedule by setting the due date. */
export function reschedule(id: string, date: DateStr): void {
  const task = liveTask(id);
  if (task) commit({ tasks: [postponeTask(task, task.due ?? today(), date, true, iso())] });
}

/** "Drop": not important, not urgent, due cleared. */
export function dropFromPlan(id: string): void {
  const task = liveTask(id);
  if (!task) return;
  commit({ tasks: [dropTask(task, iso(), urgencyCtx())], days: daysWithout(id) });
}

/** Writes the planned day and logs history on each task. */
export function finishPlan(date: DateStr, frog: string | null, myDay: string[]): void {
  const now = iso();
  const tasks: Task[] = [];
  for (const id of myDay) {
    const t = liveTask(id);
    if (t) tasks.push(logEvent(t, 'addedToMyDay', now, { date }));
  }
  if (frog) {
    const t = liveTask(frog);
    if (t) tasks.push(logEvent(t, 'madeFrog', now, { date }));
  }
  const day: Day = {
    ...dayOf(date),
    frog,
    myDay: myDay.filter((id) => id !== frog),
    planned: true,
    plannedAt: now,
    updatedAt: now,
  };
  commit({ days: [day], tasks });
}
