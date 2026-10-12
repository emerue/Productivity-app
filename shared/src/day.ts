import { MY_DAY_SOFT_LIMIT } from './constants.js';
import { addDays, type DateStr } from './dates.js';
import type { Day, Task } from './schema.js';
import { rankTasks } from './suggestions.js';
import { isOpen, isVisible } from './tasks.js';

/**
 * A Day is the plan for one date: the Frog plus the other My Day tasks, in
 * order. The Frog never appears in `myDay`. Everything that reads or edits a
 * Day goes through here so that rule (and "is this task planned?") lives in
 * one place.
 */

type Tasks = Record<string, Task>;
type Days = Record<string, Day>;

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

export function dayOf(date: DateStr, days: Days): Day {
  return days[date] ?? emptyDay(date);
}

/** The Frog, then My Day, without duplicates. */
export function dayTaskIds(day: Day | undefined): string[] {
  if (!day) return [];
  return [...new Set([day.frog, ...day.myDay].filter((id): id is string => !!id))];
}

export function isInDay(day: Day | undefined, id: string): boolean {
  return !!day && (day.frog === id || day.myDay.includes(id));
}

/** Open planned tasks, the Frog included. */
export function plannedCount(day: Day, tasks: Tasks): number {
  return dayTaskIds(day).filter((id) => {
    const t = tasks[id];
    return !!t && isOpen(t);
  }).length;
}

/** Whether this edit is the one that filled the day past the soft limit. */
export function becameFull(before: Day, after: Day, tasks: Tasks): boolean {
  const limit = MY_DAY_SOFT_LIMIT + 1;
  return plannedCount(before, tasks) < limit && plannedCount(after, tasks) >= limit;
}

// ---------------------------------------------------------------------------
// Edits (pure; return a new Day, or null when nothing changes)

export function addToDay(day: Day, id: string, now: string): Day | null {
  if (isInDay(day, id)) return null;
  return { ...day, myDay: [...day.myDay, id], updatedAt: now };
}

export function withoutTask(day: Day, id: string, now: string): Day | null {
  if (!isInDay(day, id)) return null;
  return {
    ...day,
    frog: day.frog === id ? null : day.frog,
    myDay: day.myDay.filter((x) => x !== id),
    updatedAt: now,
  };
}

/** Days on or after `from` that reference the task, with it removed. */
export function daysWithout(days: Days, id: string, from: DateStr, now: string): Day[] {
  return Object.values(days)
    .filter((d) => d.date >= from)
    .map((d) => withoutTask(d, id, now))
    .filter((d): d is Day => d !== null);
}

/** Makes `id` the Frog. An open previous Frog moves to the top of My Day. */
export function setFrog(day: Day, id: string, tasks: Tasks, now: string): Day | null {
  if (day.frog === id) return null;
  const old = day.frog ? tasks[day.frog] : undefined;
  const prev = old && isOpen(old) ? [old.id] : [];
  return {
    ...day,
    frog: id,
    myDay: [...prev, ...day.myDay.filter((x) => x !== id && !prev.includes(x))],
    updatedAt: now,
  };
}

/** The result of evening planning. */
export function planDay(day: Day, frog: string | null, myDay: string[], now: string): Day {
  return {
    ...day,
    frog,
    myDay: [...new Set(myDay)].filter((id) => id !== frog),
    planned: true,
    plannedAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Views

/** Open tasks planned on `date` (Frog first): what's left over to review. */
export function leftovers(date: DateStr, days: Days, tasks: Tasks): string[] {
  return dayTaskIds(days[date]).filter((id) => {
    const t = tasks[id];
    return !!t && isOpen(t);
  });
}

export interface TodayPlanOptions {
  urgencyWindowDays: number;
  /** Just-completed tasks whose rows are still collapsing. */
  lingering?: Record<string, unknown>;
  /** How far back "From earlier days" looks. */
  lookbackDays?: number;
}

export interface TodayPlan {
  frog: Task | null;
  /** Other planned tasks still shown in the main list. */
  rows: Task[];
  /** Open tasks due today or overdue that aren't planned. */
  dueUnplanned: Task[];
  /** Open tasks from recent days' plans that aren't in today's (or due). */
  earlier: Task[];
  completed: Task[];
  hasAnything: boolean;
  allDone: boolean;
  /** Up to three Frog suggestions when there is no Frog. */
  candidates: Task[];
}

export const LEFTOVER_DAYS = 14;

/** Everything the My Day screen shows for `today`. */
export function todayPlan(
  today: DateStr,
  days: Days,
  tasks: Tasks,
  opts: TodayPlanOptions,
): TodayPlan {
  const lingering = opts.lingering ?? {};
  const day = dayOf(today, days);
  const visible = (id: string | null) => {
    const t = id ? tasks[id] : undefined;
    return isVisible(t) ? t : null;
  };
  const frog = visible(day.frog);
  const planned = day.myDay
    .filter((id) => id !== day.frog)
    .map(visible)
    .filter((t): t is Task => t !== null);
  const rows = planned.filter((t) => t.status === 'open' || t.id in lingering);
  const completed = planned.filter((t) => t.status === 'done' && !(t.id in lingering));

  const dueUnplanned = Object.values(tasks)
    .filter((t) => isOpen(t) && t.due !== null && t.due <= today && !isInDay(day, t.id))
    .sort((a, b) => a.due!.localeCompare(b.due!) || a.createdAt.localeCompare(b.createdAt));
  const due = new Set(dueUnplanned.map((t) => t.id));

  const from = addDays(today, -(opts.lookbackDays ?? LEFTOVER_DAYS));
  const earlierIds = new Set<string>();
  for (const d of Object.values(days).sort((a, b) => b.date.localeCompare(a.date))) {
    if (d.date >= today || d.date < from) continue;
    for (const id of dayTaskIds(d)) earlierIds.add(id);
  }
  const earlier = [...earlierIds]
    .map((id) => tasks[id])
    .filter((t): t is Task => !!t && isOpen(t) && !isInDay(day, t.id) && !due.has(t.id));

  const hasAnything = frog !== null || planned.length > 0;
  const allDone =
    hasAnything && (!frog || frog.status === 'done') && planned.every((t) => t.status !== 'open');
  const candidates = frog
    ? []
    : rankTasks(Object.values(tasks), {
        target: today,
        settings: { urgencyWindowDays: opts.urgencyWindowDays },
      })
        .filter((t) => t.important)
        .sort((a, b) => Number(isInDay(day, b.id)) - Number(isInDay(day, a.id)))
        .slice(0, 3);

  return { frog, rows, dueUnplanned, earlier, completed, hasAnything, allDone, candidates };
}
