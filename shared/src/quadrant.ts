import { diffDays, type DateStr } from './dates.js';
import type { Settings, Task } from './schema.js';

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop';

export const QUADRANTS: readonly Quadrant[] = ['do', 'schedule', 'delegate', 'drop'];

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  do: 'Do',
  schedule: 'Schedule',
  delegate: 'Delegate',
  drop: 'Drop',
};

export interface UrgencyContext {
  /** The logical date urgency is judged against. */
  today: DateStr;
  urgencyWindowDays: Settings['urgencyWindowDays'];
}

type UrgencyFields = Pick<Task, 'due' | 'urgentFlag'>;

/** Urgent because the due date is within the window (overdue included). */
export function isDueUrgent(task: Pick<Task, 'due'>, ctx: UrgencyContext): boolean {
  return task.due !== null && diffDays(task.due, ctx.today) <= ctx.urgencyWindowDays;
}

export function isUrgent(task: UrgencyFields, ctx: UrgencyContext): boolean {
  return task.urgentFlag || isDueUrgent(task, ctx);
}

export function isOverdue(task: Pick<Task, 'due'>, today: DateStr): boolean {
  return task.due !== null && task.due < today;
}

/** Derived, never stored. */
export function quadrantOf(task: UrgencyFields & Pick<Task, 'important'>, ctx: UrgencyContext): Quadrant {
  const urgent = isUrgent(task, ctx);
  if (task.important) return urgent ? 'do' : 'schedule';
  return urgent ? 'delegate' : 'drop';
}

/** Flags a manual move sets. */
export function flagsForQuadrant(q: Quadrant): Pick<Task, 'important' | 'urgentFlag'> {
  switch (q) {
    case 'do':
      return { important: true, urgentFlag: true };
    case 'schedule':
      return { important: true, urgentFlag: false };
    case 'delegate':
      return { important: false, urgentFlag: true };
    case 'drop':
      return { important: false, urgentFlag: false };
  }
}

/**
 * Moving to Schedule or Drop cannot take effect while the due date keeps the
 * task urgent. The UI asks whether to change the due date.
 */
export function dueConflict(task: Pick<Task, 'due'>, target: Quadrant, ctx: UrgencyContext): boolean {
  return (target === 'schedule' || target === 'drop') && isDueUrgent(task, ctx);
}
