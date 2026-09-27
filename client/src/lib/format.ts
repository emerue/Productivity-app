import {
  nextAction,
  rankTasks,
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
