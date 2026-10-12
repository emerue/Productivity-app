import {
  isOverdue,
  nextAction,
  rankTasks,
  stepProgress,
  type DateStr,
  type Quadrant,
  type ScoreContext,
  type Task,
} from '@frog/shared';
import { formatDueInline } from './time';

/** "Waiting on Ada, follow up Thu" for Delegate; otherwise "Next: …"; otherwise null. */
export function taskSubtitle(task: Task, quadrant: Quadrant, today: DateStr): string | null {
  if (quadrant === 'delegate' && task.waitingOn) {
    const follow = task.followUp ? `, follow up ${formatDueInline(task.followUp, today)}` : '';
    return `Waiting on ${task.waitingOn}${follow}`;
  }
  const next = nextAction(task);
  return next ? `Next: ${next.title}` : null;
}

/** "Due today", "Due tomorrow", "Due Thu", "Overdue since 9 Oct". */
export function dueLabel(due: DateStr, today: DateStr): string {
  const when = formatDueInline(due, today);
  if (due < today) return `Overdue since ${when}`;
  return due === today ? 'Due today' : `Due ${when}`;
}

export interface RowDetail {
  text: string;
  overdue?: boolean;
}

/**
 * The quiet line under a task's title, in words: when it's due, what's next
 * (or who it's waiting on), and its list where lists mix. Done tasks only
 * keep their list.
 */
export function rowDetails(
  task: Task,
  quadrant: Quadrant,
  today: DateStr,
  listName?: string,
): RowDetail[] {
  const out: RowDetail[] = [];
  const done = task.status !== 'open';
  if (!done && task.due) {
    out.push({ text: dueLabel(task.due, today), overdue: isOverdue(task, today) || undefined });
  }
  if (!done) {
    const steps = stepProgress(task);
    const sub = taskSubtitle(task, quadrant, today);
    if (sub && quadrant === 'delegate' && task.waitingOn) out.push({ text: sub });
    else if (sub) out.push({ text: `${sub} (${steps.done} of ${steps.total})` });
    else if (steps.total > 0) out.push({ text: `All ${plural(steps.total, 'step')} done` });
  }
  if (listName) out.push({ text: listName });
  return out;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Ranks open tasks, keeping just-completed ones in place while their row collapses. */
export function rankWithLingering(
  tasks: Task[],
  lingering: Record<string, number>,
  ctx: ScoreContext,
): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const asOpen = tasks.map((t) =>
    t.status === 'done' && t.id in lingering ? { ...t, status: 'open' as const } : t,
  );
  return rankTasks(asOpen, ctx).map((t) => byId.get(t.id) as Task);
}
