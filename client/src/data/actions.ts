import {
  commands,
  dayOf as dayIn,
  liveLists as liveListsIn,
  logicalDate,
  pickList,
  QUADRANT_LABEL,
  quadrantOf,
  type Clock,
  type CommandResult,
  type DateStr,
  type Day,
  type FocusSession,
  type List,
  type Quadrant,
  type QuickAddDefaults,
  type QuickAddResult,
  type RepeatRule,
  type Settings,
  type Snapshot,
  type Task,
  type UrgencyContext,
} from '@frog/shared';
import { readLocal, writeLocal } from '../lib/storage';
import { playChime } from '../lib/sound';
import { formatHeaderDate } from '../lib/time';
import { useData } from './store';
import { commit } from './sync';
import { linger, showToast, unlinger, useUI } from './ui';

/**
 * The React side of the task commands in `@frog/shared`: run a command against
 * the current store, commit its edit, then do what only the UI can (toasts with
 * undo, the chime, the full-day hint). The rules themselves live in shared.
 */

export type { QuickAddDefaults };

const state = () => useData.getState();
const snapshot = (): Snapshot => state();

function clock(): Clock {
  return { today: today(), now: new Date().toISOString() };
}

/** Runs a command and commits its edit. Returns the result (or null when it did nothing). */
function run<R extends CommandResult>(fn: (s: Snapshot, c: Clock) => R | null): R | null {
  const r = fn(snapshot(), clock());
  if (r) commit(r.edit);
  return r;
}

/** An undo action for a toast: re-reads the store when pressed. */
function undoOf(r: CommandResult, after?: () => void) {
  const undo = r.undo;
  if (!undo) return undefined;
  return {
    label: 'Undo',
    run: () => {
      after?.();
      commit(undo(snapshot(), clock()));
    },
  };
}

function fullDayHint(r: { filled: boolean }): void {
  const date = today();
  if (!r.filled || readLocal('fullDayHint') === date) return;
  writeLocal('fullDayHint', date);
  useUI.setState({ fullDayHint: true });
}

export function today(): DateStr {
  return logicalDate(new Date(), state().settings);
}

export function urgencyCtx(date: DateStr = today()): UrgencyContext {
  return { today: date, urgencyWindowDays: state().settings.urgencyWindowDays };
}

export function liveLists(lists: Record<string, List> = state().lists): List[] {
  return liveListsIn(lists);
}

export function dayOf(date: DateStr, days: Record<string, Day> = state().days): Day {
  return dayIn(date, days);
}

export function defaultListId(): string {
  const s = state();
  return pickList(s.lists, [s.settings.defaultListId])?.id ?? s.settings.defaultListId;
}

// ---------------------------------------------------------------------------
// My Day

export function addToMyDay(id: string, date?: DateStr): void {
  const r = run((s, c) => commands.addToMyDay(s, c, id, date));
  if (r) fullDayHint(r);
}

export function removeFromMyDay(id: string, date?: DateStr): void {
  run((s, c) => commands.removeFromMyDay(s, c, id, date));
}

/** Makes the task the day's Frog. A previous Frog moves to the top of My Day. */
export function makeFrog(id: string, date?: DateStr): void {
  const r = run((s, c) => commands.makeFrog(s, c, id, date));
  if (r) fullDayHint(r);
}

// ---------------------------------------------------------------------------
// Tasks

/** Creates a task from parsed quick-add input and says where it landed. */
export function createFromQuickAdd(
  r: QuickAddResult,
  defaults: QuickAddDefaults = {},
): Task | null {
  const res = run((s, c) => commands.createFromQuickAdd(s, c, r, defaults));
  if (!res) return null;
  fullDayHint(res);
  const where = `${QUADRANT_LABEL[quadrantOf(res.task, urgencyCtx())]} in ${res.listName}`;
  showToast(res.addedToMyDay ? `Added to ${where} and My Day` : `Added to ${where}`, undoOf(res));
  return res.task;
}

export function completeTaskNow(id: string): void {
  const r = run((s, c) => commands.complete(s, c, id));
  if (!r) return;
  if (!r.wasFrog) linger(id);
  if (r.wasFrog && state().settings.sounds) playChime();
  const next = r.next?.due ? `. Next on ${formatHeaderDate(r.next.due)}` : '';
  showToast(
    `Completed${next}`,
    undoOf(r, () => unlinger(id)),
  );
}

/** Sets or clears a task's repeat (an undated task is dated today). */
export function setRepeat(id: string, rule: RepeatRule | null): void {
  run((s, c) => commands.setRepeat(s, c, id, rule));
}

export function reopen(id: string): void {
  unlinger(id);
  run((s, c) => commands.reopen(s, c, id));
}

export function removeTask(id: string): void {
  const r = run((s, c) => commands.remove(s, c, id));
  if (r) showToast('Deleted', undoOf(r));
}

/** Archived tasks come back as open tasks. */
export function unarchive(id: string): void {
  if (run((s, c) => commands.reopen(s, c, id))) showToast('Restored');
}

export function updateTask(
  id: string,
  patch: Partial<Pick<Task, 'title' | 'listId' | 'due' | 'waitingOn' | 'followUp'>>,
): void {
  run((s, c) => commands.update(s, c, id, patch));
}

/** Moves a task to another list, with undo. */
export function moveToList(id: string, listId: string): void {
  const r = run((s, c) => commands.moveToList(s, c, id, listId));
  if (r) showToast(`Moved to ${r.listName}`, undoOf(r));
}

export function updateNotes(id: string, notes: string): void {
  run((s, c) => commands.updateNotes(s, c, id, notes));
}

/**
 * Manual move. Returns 'conflict' when the due date keeps the task urgent
 * (the UI then offers to change the date).
 */
export function moveTask(id: string, target: Quadrant): 'ok' | 'conflict' {
  const r = run((s, c) => commands.move(s, c, id, target));
  if (!r) return 'ok';
  if (r.conflict) {
    useUI.setState({ conflict: { taskId: id, target: target as 'schedule' | 'drop' } });
    return 'conflict';
  }
  if (r.from !== target) {
    showToast(target === 'drop' ? 'Dropped' : `Moved to ${QUADRANT_LABEL[target]}`, undoOf(r));
  }
  return 'ok';
}

// ---------------------------------------------------------------------------
// Steps

export function addStep(taskId: string, title: string): string | null {
  return run((s, c) => commands.addStep(s, c, taskId, title))?.stepId ?? null;
}

export function renameStep(taskId: string, stepId: string, title: string): void {
  run((s, c) => commands.renameStep(s, c, taskId, stepId, title));
}

/** Returns true when this tick finished every step (the UI then offers to complete the task). */
export function toggleStep(taskId: string, stepId: string): boolean {
  return run((s, c) => commands.toggleStep(s, c, taskId, stepId))?.finishedAll ?? false;
}

export function deleteStep(taskId: string, stepId: string): void {
  run((s, c) => commands.deleteStep(s, c, taskId, stepId));
}

export function reorderSteps(taskId: string, orderedIds: string[]): void {
  run((s, c) => commands.reorderSteps(s, c, taskId, orderedIds));
}

export function promoteStep(taskId: string, stepId: string): void {
  if (run((s, c) => commands.promoteStep(s, c, taskId, stepId))) showToast('Promoted to task');
}

// ---------------------------------------------------------------------------
// Lists

export function createList(name: string): List | null {
  return run((s, c) => commands.createList(s, c, name))?.list ?? null;
}

export function renameList(id: string, name: string): void {
  run((s, c) => commands.renameList(s, c, id, name));
}

/** Deletes a list, moving its tasks (open and closed) to `moveTo`. */
export function deleteList(id: string, moveTo: string | null): void {
  if (run((s, c) => commands.deleteList(s, c, id, moveTo))) showToast('List deleted');
}

// ---------------------------------------------------------------------------
// Settings and sessions

export function updateSettings(patch: Partial<Omit<Settings, 'updatedAt' | 'rev'>>): void {
  run((s, c) => commands.updateSettings(s, c, patch));
}

export function logFocusSession(s: Omit<FocusSession, 'id' | 'rev'>): void {
  commit(commands.logFocusSession(s).edit);
}

// ---------------------------------------------------------------------------
// Evening planning

/** "Tomorrow": carry forward (logged as a postponement; due date unchanged). */
export function carryForward(id: string, from: DateStr, to: DateStr): void {
  run((s, c) => commands.carryForward(s, c, id, from, to));
}

/** "Pick a date": reschedule by setting the due date. */
export function reschedule(id: string, date: DateStr): void {
  run((s, c) => commands.reschedule(s, c, id, date));
}

/** "Drop": not important, not urgent, due cleared. */
export function dropFromPlan(id: string): void {
  run((s, c) => commands.dropFromPlan(s, c, id));
}

/** Writes the planned day and logs history on each task. */
export function finishPlan(date: DateStr, frog: string | null, myDay: string[]): void {
  run((s, c) => commands.finishPlan(s, c, date, frog, myDay));
}
