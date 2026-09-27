import { nextAction, type DateStr, type Quadrant, type Task } from '@frog/shared';
import { formatDue } from './time';

/** "Waiting on Ada, follow up Thu" for Delegate; otherwise "Next: …"; otherwise null. */
export function taskSubtitle(task: Task, quadrant: Quadrant, today: DateStr): string | null {
  if (quadrant === 'delegate' && task.waitingOn) {
    const follow = task.followUp ? `, follow up ${formatDue(task.followUp, today)}` : '';
    return `Waiting on ${task.waitingOn}${follow}`;
  }
  const next = nextAction(task);
  return next ? `Next: ${next.title}` : null;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
