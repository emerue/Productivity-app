import {
  groupByQuadrant,
  isVisible,
  type DateStr,
  type Quadrant,
  type Task,
  type UrgencyContext,
} from '@frog/shared';
import { useMemo } from 'react';
import { useData } from '../data/store';
import { rankWithLingering } from './format';
import { useToday } from './time';

/**
 * Task queries the screens share: one source for "today" and the urgency
 * window, one rule for which tasks show, and the ranked quadrant grouping
 * that Matrix and the list view both use.
 */

/** Today's urgency context (logical date + window from Settings). */
export function useUrgency(): UrgencyContext {
  const today = useToday();
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  return useMemo(() => ({ today, urgencyWindowDays }), [today, urgencyWindowDays]);
}

export interface RankedTasks {
  /** Open tasks (plus lingering ones) by score for today. */
  ranked: Task[];
  groups: Record<Quadrant, Task[]>;
}

/** Ranks `tasks` for `ctx.today` and groups them by quadrant. */
export function rankByQuadrant(
  tasks: Task[],
  lingering: Record<string, number>,
  ctx: UrgencyContext,
): RankedTasks {
  const ranked = rankWithLingering(tasks.filter(isVisible), lingering, {
    target: ctx.today,
    settings: ctx,
  });
  return { ranked, groups: groupByQuadrant(ranked, ctx) };
}

/**
 * Tasks matching `q` in the title or notes, archived ones included (search is
 * how you find them): open first, then done, then archived; recent first.
 */
export function searchTasks(tasks: Record<string, Task>, q: string, limit = 100): Task[] {
  const needle = q.trim().toLowerCase();
  const rank = (t: Task) => (t.status === 'open' ? 0 : t.status === 'done' ? 1 : 2);
  return Object.values(tasks)
    .filter(
      (t) =>
        !t.deleted &&
        (t.title.toLowerCase().includes(needle) || t.notes.toLowerCase().includes(needle)),
    )
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Closed tasks: done ones newest first, archived ones by last update. */
export function closedTasks(tasks: Record<string, Task>, status: 'done' | 'archived'): Task[] {
  return Object.values(tasks)
    .filter((t) => !t.deleted && t.status === status)
    .sort((a, b) =>
      status === 'done'
        ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
        : b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** Open tasks due before `today`, oldest first. */
export function overdueTasks(tasks: Record<string, Task>, today: DateStr): Task[] {
  return Object.values(tasks)
    .filter((t) => isVisible(t) && t.status === 'open' && t.due !== null && t.due < today)
    .sort((a, b) => a.due!.localeCompare(b.due!) || a.title.localeCompare(b.title));
}
