import type { DateStr } from './dates.js';
import { quadrantOf } from './quadrant.js';
import type { Settings, Task } from './schema.js';
import { isOpen, nextAction, postponeCount } from './tasks.js';

export interface ScoreContext {
  /** The day being planned (tomorrow in evening planning, today in "Plan today"). */
  target: DateStr;
  settings: Pick<Settings, 'urgencyWindowDays'>;
  /** Tasks carried forward from the previous day. */
  carriedForward?: ReadonlySet<string>;
}

const QUADRANT_SCORE = { do: 40, schedule: 25, delegate: 0, drop: 0 } as const;

/** Deterministic priority score. Never shown in the UI. */
export function scoreTask(task: Task, ctx: ScoreContext): number {
  const quadrant = quadrantOf(task, {
    today: ctx.target,
    urgencyWindowDays: ctx.settings.urgencyWindowDays,
  });
  let score: number = QUADRANT_SCORE[quadrant];
  if (quadrant === 'delegate' && task.followUp !== null && task.followUp <= ctx.target) score += 15;
  if (task.due !== null) {
    if (task.due === ctx.target) score += 20;
    else if (task.due < ctx.target) score += 25;
  }
  if (ctx.carriedForward?.has(task.id)) score += 10;
  score += Math.min(postponeCount(task) * 3, 12);
  if (nextAction(task)) score += 5;
  return score;
}

/** Open tasks, highest score first. Ties: earlier due, then older. */
export function rankTasks(tasks: Iterable<Task>, ctx: ScoreContext): Task[] {
  const scored: { task: Task; score: number }[] = [];
  for (const task of tasks) if (isOpen(task)) scored.push({ task, score: scoreTask(task, ctx) });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.task.due ?? '9999').localeCompare(b.task.due ?? '9999') ||
      a.task.createdAt.localeCompare(b.task.createdAt) ||
      a.task.id.localeCompare(b.task.id),
  );
  return scored.map((s) => s.task);
}

/** The highest-scoring important task, or null. */
export function suggestFrog(tasks: Iterable<Task>, ctx: ScoreContext): Task | null {
  return rankTasks(tasks, ctx).find((t) => t.important) ?? null;
}
