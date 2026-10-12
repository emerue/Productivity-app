import { HISTORY_CAP } from './constants.js';
import { addDays, diffDays, type DateStr } from './dates.js';
import { newId } from './ids.js';
import { flagsForQuadrant, quadrantOf, type Quadrant, type UrgencyContext } from './quadrant.js';
import { makeRepeat, nextDue, type RepeatRule } from './repeat.js';
import type { HistoryEvent, HistoryEventType, List, Subtask, Task } from './schema.js';

type EventData = NonNullable<HistoryEvent['data']>;

// ---------------------------------------------------------------------------
// Reading

export function isOpen(task: Task): boolean {
  return !task.deleted && task.status === 'open';
}

/** Shown anywhere: not deleted and not archived (open or done). */
export function isVisible(task: Task | undefined): task is Task {
  return !!task && !task.deleted && task.status !== 'archived';
}

/** Non-deleted steps in display order. */
export function liveSubtasks(task: Pick<Task, 'subtasks'>): Subtask[] {
  return task.subtasks
    .filter((s) => !s.deleted)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The first incomplete step, or null. */
export function nextAction(task: Pick<Task, 'subtasks'>): Subtask | null {
  return liveSubtasks(task).find((s) => !s.done) ?? null;
}

export function stepProgress(task: Pick<Task, 'subtasks'>): { done: number; total: number } {
  const steps = liveSubtasks(task);
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export function postponeCount(task: Pick<Task, 'history'>): number {
  return task.history.filter((e) => e.type === 'postponed').length;
}

/** Latest edit to any part of the task. */
export function lastTouched(task: Task): string {
  let latest = task.updatedAt > task.notesUpdatedAt ? task.updatedAt : task.notesUpdatedAt;
  for (const s of task.subtasks) if (s.updatedAt > latest) latest = s.updatedAt;
  return latest;
}

export function hasNotes(task: Pick<Task, 'notes'>): boolean {
  return task.notes.trim().length > 0;
}

// ---------------------------------------------------------------------------
// History

export function makeEvent(type: HistoryEventType, at: string, data?: EventData): HistoryEvent {
  return data ? { id: newId('h'), type, at, data } : { id: newId('h'), type, at };
}

export function capHistory(history: HistoryEvent[]): HistoryEvent[] {
  return history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history;
}

export function logEvent(task: Task, type: HistoryEventType, at: string, data?: EventData): Task {
  return { ...task, history: capHistory([...task.history, makeEvent(type, at, data)]) };
}

// ---------------------------------------------------------------------------
// Constructors

export interface NewTaskInput {
  title: string;
  listId: string;
  important?: boolean;
  urgentFlag?: boolean;
  due?: DateStr | null;
  waitingOn?: string | null;
  followUp?: DateStr | null;
  repeat?: Task['repeat'];
}

export function newTask(input: NewTaskInput, now: string): Task {
  return {
    id: newId('t'),
    title: input.title.trim(),
    listId: input.listId,
    important: input.important ?? true,
    urgentFlag: input.urgentFlag ?? false,
    due: input.due ?? null,
    waitingOn: input.waitingOn ?? null,
    followUp: input.followUp ?? null,
    notes: '',
    notesUpdatedAt: now,
    subtasks: [],
    status: 'open',
    createdAt: now,
    completedAt: null,
    updatedAt: now,
    rev: 0,
    history: [makeEvent('created', now)],
    ...(input.repeat ? { repeat: input.repeat } : {}),
  };
}

/**
 * Completes a repeating task and builds the next one in its series: same title,
 * list, flags, notes and steps (unticked), due on the next occurrence that isn't
 * in the past. The completed one leaves the series (`repeat: null`).
 */
export function completeRepeating(
  task: Task,
  today: DateStr,
  now: string,
): { done: Task; next: Task } | null {
  if (!task.repeat || task.status !== 'open') return null;
  const due = nextDue(task.repeat, task.due, today);
  const shift = task.due ? diffDays(due, task.due) : 0;
  const base = newTask(
    {
      title: task.title,
      listId: task.listId,
      important: task.important,
      urgentFlag: task.urgentFlag,
      due,
      waitingOn: task.waitingOn,
      followUp: task.followUp ? addDays(task.followUp, shift) : null,
      repeat: task.repeat,
    },
    now,
  );
  const next: Task = {
    ...base,
    notes: task.notes,
    subtasks: liveSubtasks(task).map((st, i) => ({
      id: newId('s'),
      title: st.title,
      done: false,
      doneAt: null,
      order: i,
      updatedAt: now,
    })),
    history: [makeEvent('created', now, { repeatOf: task.id })],
  };
  const done = completeTask({ ...task, repeat: null }, now);
  return { done, next };
}

export function newList(name: string, order: number, now: string): List {
  return { id: newId('l'), name: name.trim(), order, updatedAt: now, rev: 0 };
}

// ---------------------------------------------------------------------------
// Task operations (pure; return a new task)

/**
 * Scalar field edit. Bumps `updatedAt`.
 *
 * Every edit keeps the repeat rule: a repeat counts from a date, so an edit
 * that leaves a repeating task without a due date (clearing it, Drop) ends the
 * series. Changing the due date keeps the anchor, so the pattern holds.
 */
export function patchTask(
  task: Task,
  patch: Partial<
    Pick<
      Task,
      'title' | 'listId' | 'important' | 'urgentFlag' | 'due' | 'waitingOn' | 'followUp' | 'repeat'
    >
  >,
  now: string,
): Task {
  const next = { ...task, ...patch, updatedAt: now };
  return next.repeat && !next.due ? { ...next, repeat: null } : next;
}

/**
 * Sets or clears a task's repeat. The rule is anchored on the due date; an
 * undated task is dated `today` first.
 */
export function setTaskRepeat(
  task: Task,
  rule: RepeatRule | null,
  today: DateStr,
  now: string,
): Task {
  if (!rule) return task.repeat ? patchTask(task, { repeat: null }, now) : task;
  const due = task.due ?? today;
  return patchTask(task, { due, repeat: makeRepeat(rule, due) }, now);
}

/** Puts a task completed by `completeRepeating` back: open, with its repeat. */
export function undoCompleteRepeating(done: Task, repeat: Task['repeat'], now: string): Task {
  const reopened = reopenTask(done, now);
  return reopened.due && repeat ? { ...reopened, repeat } : reopened;
}

export function completeTask(task: Task, now: string): Task {
  if (task.status === 'done') return task;
  return logEvent({ ...task, status: 'done', completedAt: now, updatedAt: now }, 'completed', now);
}

export function reopenTask(task: Task, now: string): Task {
  if (task.status === 'open') return task;
  return logEvent({ ...task, status: 'open', completedAt: null, updatedAt: now }, 'reopened', now);
}

export function archiveTask(task: Task, now: string): Task {
  if (task.status === 'archived') return task;
  return logEvent({ ...task, status: 'archived', updatedAt: now }, 'archived', now);
}

export function deleteTask(task: Task, now: string): Task {
  const { restore: _restore, ...rest } = task;
  return { ...rest, deleted: true, deletedAt: now, updatedAt: now };
}

/** Explicit un-delete. The `restore` marker lets it beat the tombstone in merge. */
export function restoreTask(task: Task, now: string): Task {
  const { deletedAt: _deletedAt, ...rest } = task;
  return { ...rest, deleted: false, restore: true, updatedAt: now };
}

export function moveToQuadrant(
  task: Task,
  target: Quadrant,
  now: string,
  ctx: UrgencyContext,
): Task {
  const from = quadrantOf(task, ctx);
  const moved = patchTask(task, flagsForQuadrant(target), now);
  const to = quadrantOf(moved, ctx);
  return from === to ? moved : logEvent(moved, 'movedQuadrant', now, { from, to });
}

/** Evening planning "Drop": not important, not urgent, due cleared. */
export function dropTask(task: Task, now: string, ctx: UrgencyContext): Task {
  const from = quadrantOf(task, ctx);
  const dropped = patchTask(task, { important: false, urgentFlag: false, due: null }, now);
  return from === 'drop' ? dropped : logEvent(dropped, 'movedQuadrant', now, { from, to: 'drop' });
}

export function postponeTask(
  task: Task,
  from: DateStr,
  to: DateStr,
  setDue: boolean,
  now: string,
): Task {
  const moved = setDue ? patchTask(task, { due: to }, now) : task;
  return logEvent(moved, 'postponed', now, { from, to });
}

export function setNotes(task: Task, notes: string, now: string): Task {
  return { ...task, notes, notesUpdatedAt: now };
}

export interface AutoArchiveContext extends UrgencyContext {
  dropArchiveDays: number;
}

/** Drop tasks untouched for `dropArchiveDays` get archived. */
export function shouldAutoArchive(task: Task, ctx: AutoArchiveContext): boolean {
  if (!isOpen(task) || quadrantOf(task, ctx) !== 'drop') return false;
  const touched = lastTouched(task).slice(0, 10);
  return diffDays(ctx.today, touched) >= ctx.dropArchiveDays;
}

// ---------------------------------------------------------------------------
// Steps

function withSubtasks(task: Task, subtasks: Subtask[]): Task {
  return { ...task, subtasks };
}

export function addSubtask(
  task: Task,
  title: string,
  now: string,
): { task: Task; subtask: Subtask } {
  const steps = liveSubtasks(task);
  const last = steps[steps.length - 1];
  const subtask: Subtask = {
    id: newId('s'),
    title: title.trim(),
    done: false,
    doneAt: null,
    order: last ? last.order + 1 : 0,
    updatedAt: now,
  };
  return { task: withSubtasks(task, [...task.subtasks, subtask]), subtask };
}

export function updateSubtask(
  task: Task,
  id: string,
  patch: Partial<Pick<Subtask, 'title' | 'done'>>,
  now: string,
): Task {
  return withSubtasks(
    task,
    task.subtasks.map((s) => {
      if (s.id !== id) return s;
      const next: Subtask = { ...s, ...patch, updatedAt: now };
      if (patch.done !== undefined && patch.done !== s.done) next.doneAt = patch.done ? now : null;
      return next;
    }),
  );
}

export function removeSubtask(task: Task, id: string, now: string): Task {
  return withSubtasks(
    task,
    task.subtasks.map((s) =>
      s.id === id ? { ...s, deleted: true, deletedAt: now, updatedAt: now } : s,
    ),
  );
}

/** Rewrites `order` to match `orderedIds`; only steps whose position changed get a new `updatedAt`. */
export function reorderSubtasks(task: Task, orderedIds: string[], now: string): Task {
  const index = new Map(orderedIds.map((id, i) => [id, i]));
  return withSubtasks(
    task,
    task.subtasks.map((s) => {
      const i = index.get(s.id);
      return i === undefined || i === s.order ? s : { ...s, order: i, updatedAt: now };
    }),
  );
}

/** Turns a step into its own task in the same list; the step is removed. */
export function promoteSubtask(
  task: Task,
  id: string,
  now: string,
): { task: Task; promoted: Task } | null {
  const step = task.subtasks.find((s) => s.id === id && !s.deleted);
  if (!step) return null;
  const promoted = newTask({ title: step.title, listId: task.listId }, now);
  return { task: removeSubtask(task, id, now), promoted };
}
