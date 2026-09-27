import { HISTORY_CAP } from './constants.js';
import { diffDays, type DateStr } from './dates.js';
import { newId } from './ids.js';
import { flagsForQuadrant, quadrantOf, type Quadrant, type UrgencyContext } from './quadrant.js';
import type { HistoryEvent, HistoryEventType, List, Subtask, Task } from './schema.js';

type EventData = NonNullable<HistoryEvent['data']>;

// ---------------------------------------------------------------------------
// Reading

export function isOpen(task: Task): boolean {
  return !task.deleted && task.status === 'open';
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
  };
}

export function newList(name: string, order: number, now: string): List {
  return { id: newId('l'), name: name.trim(), order, updatedAt: now, rev: 0 };
}

// ---------------------------------------------------------------------------
// Task operations (pure; return a new task)

/** Scalar field edit. Bumps `updatedAt`. */
export function patchTask(
  task: Task,
  patch: Partial<
    Pick<Task, 'title' | 'listId' | 'important' | 'urgentFlag' | 'due' | 'waitingOn' | 'followUp'>
  >,
  now: string,
): Task {
  return { ...task, ...patch, updatedAt: now };
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
