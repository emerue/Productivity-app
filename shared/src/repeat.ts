import { addDays, diffDays, makeDateStr, weekdayOf, weekStart, type DateStr } from './dates.js';
import type { Repeat, RepeatUnit } from './schema.js';

/**
 * Repeating tasks. A series is one open task carrying `repeat`; completing it
 * spawns the next one. Occurrences are counted from `anchor` (the due date when
 * the repeat was set), so monthly/yearly dates don't drift after a short month:
 * "31 Jan monthly" gives 28 Feb, then 31 Mar.
 */

/** A repeat without its anchor: what a preset or the quick-add token describes. */
export type RepeatRule = Omit<Repeat, 'anchor'>;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

function parts(d: DateStr): { y: number; m: number; day: number } {
  return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) };
}

/** `anchor` plus `n` months, clamped to the month's last day. */
function addMonthsClamped(anchor: DateStr, n: number): DateStr {
  const { y, m, day } = parts(anchor);
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  for (let d = day; d >= 28; d--) {
    const out = makeDateStr(ty, tm, d);
    if (out) return out;
  }
  return makeDateStr(ty, tm, day) as DateStr;
}

function stepMonths(r: Repeat): number {
  return r.unit === 'year' ? 12 * r.every : r.every;
}

/** Whether `d` is an occurrence of the series (on or after the anchor). */
export function isOccurrence(r: Repeat, d: DateStr): boolean {
  if (d < r.anchor) return false;
  switch (r.unit) {
    case 'day':
      return diffDays(d, r.anchor) % r.every === 0;
    case 'week': {
      const weeks = diffDays(weekStart(d), weekStart(r.anchor)) / 7;
      if (weeks % r.every !== 0) return false;
      return r.weekdays?.length
        ? r.weekdays.includes(weekdayOf(d))
        : weekdayOf(d) === weekdayOf(r.anchor);
    }
    case 'month':
    case 'year': {
      const a = parts(r.anchor);
      const b = parts(d);
      const months = (b.y - a.y) * 12 + (b.m - a.m);
      return months % stepMonths(r) === 0 && addMonthsClamped(r.anchor, months) === d;
    }
  }
}

/** The first occurrence strictly after `after`. */
export function occurrenceAfter(r: Repeat, after: DateStr): DateStr {
  if (after < r.anchor) return r.anchor;
  switch (r.unit) {
    case 'day': {
      const k = Math.floor(diffDays(after, r.anchor) / r.every) + 1;
      return addDays(r.anchor, k * r.every);
    }
    case 'week': {
      if (!r.weekdays?.length) {
        const k = Math.floor(diffDays(after, r.anchor) / (7 * r.every)) + 1;
        return addDays(r.anchor, k * 7 * r.every);
      }
      // At most `every` weeks plus one to reach the next matching weekday.
      for (let d = addDays(after, 1), i = 0; i < 7 * (r.every + 1); d = addDays(d, 1), i++) {
        if (isOccurrence(r, d)) return d;
      }
      return addDays(after, 7 * r.every); // unreachable with a valid rule
    }
    case 'month':
    case 'year': {
      const step = stepMonths(r);
      const a = parts(r.anchor);
      const b = parts(after);
      let k = Math.max(0, Math.floor(((b.y - a.y) * 12 + (b.m - a.m)) / step) - 1);
      let d = addMonthsClamped(r.anchor, k * step);
      while (d <= after) d = addMonthsClamped(r.anchor, ++k * step);
      return d;
    }
  }
}

/** Occurrences in [from, to], at most `limit`. */
export function occurrencesBetween(r: Repeat, from: DateStr, to: DateStr, limit = 400): DateStr[] {
  const out: DateStr[] = [];
  let d = isOccurrence(r, from) ? from : occurrenceAfter(r, from);
  while (d <= to && out.length < limit) {
    out.push(d);
    d = occurrenceAfter(r, d);
  }
  return out;
}

/**
 * Due date for the task that follows a completed one: the next occurrence after
 * the current due date, skipping any that are already in the past.
 */
export function nextDue(r: Repeat, due: DateStr | null, today: DateStr): DateStr {
  const from = due ?? r.anchor;
  const yesterday = addDays(today, -1);
  return occurrenceAfter(r, from > yesterday ? from : yesterday);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const UNIT_NAME: Record<RepeatUnit, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
};

function weekdayList(days: number[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** "Daily", "Weekdays", "Weekly on Mon", "Every 2 weeks on Mon, Thu", "Monthly on the 28th"… */
export function repeatLabel(r: Repeat): string {
  const { day, m } = parts(r.anchor);
  const every = r.every === 1 ? null : `Every ${r.every} ${UNIT_NAME[r.unit]}s`;
  switch (r.unit) {
    case 'day':
      return every ?? 'Daily';
    case 'week': {
      const days = r.weekdays?.length ? r.weekdays : [weekdayOf(r.anchor)];
      if (r.every === 1 && days.length === 5 && WEEKDAYS_MON_FRI.every((d) => days.includes(d)))
        return 'Weekdays';
      if (r.every === 1 && days.length === 7) return 'Daily';
      return `${every ?? 'Weekly'} on ${weekdayList(days)}`;
    }
    case 'month':
      return `${every ?? 'Monthly'} on the ${ordinal(day)}`;
    case 'year':
      return `${every ?? 'Yearly'} on ${day} ${MONTH_SHORT[m - 1]}`;
  }
}

/** Short form for rows and chips: "Daily", "Weekly", "Monthly", "Every 2 weeks". */
export function repeatShort(r: Pick<Repeat, 'unit' | 'every' | 'weekdays'>): string {
  if (r.every !== 1) return `Every ${r.every} ${UNIT_NAME[r.unit]}s`;
  if (r.unit === 'week' && r.weekdays?.length === 5) return 'Weekdays';
  return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[r.unit];
}

export type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/** The rule for a preset; weekly repeats on the anchor's weekday. */
export function presetRule(preset: RepeatPreset, anchor: DateStr): RepeatRule {
  switch (preset) {
    case 'daily':
      return { unit: 'day', every: 1 };
    case 'weekdays':
      return { unit: 'week', every: 1, weekdays: [...WEEKDAYS_MON_FRI] };
    case 'weekly':
      return { unit: 'week', every: 1, weekdays: [weekdayOf(anchor)] };
    case 'monthly':
      return { unit: 'month', every: 1 };
    case 'yearly':
      return { unit: 'year', every: 1 };
  }
}

/** Which preset (if any) a repeat matches, given its anchor. */
export function matchPreset(r: Repeat): RepeatPreset | null {
  for (const p of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) {
    const rule = presetRule(p, r.anchor);
    const days = (x?: number[]) => [...(x ?? [])].sort((a, b) => a - b).join(',');
    if (rule.unit === r.unit && rule.every === r.every && days(rule.weekdays) === days(r.weekdays))
      return p;
  }
  return null;
}

/** A complete repeat from a rule; weekly rules without days take the anchor's weekday. */
export function makeRepeat(rule: RepeatRule, anchor: DateStr): Repeat {
  const every = Math.max(1, Math.min(365, Math.round(rule.every)));
  if (rule.unit !== 'week') return { unit: rule.unit, every, anchor };
  const weekdays = [...new Set(rule.weekdays?.length ? rule.weekdays : [weekdayOf(anchor)])].sort(
    (a, b) => a - b,
  );
  return { unit: 'week', every, weekdays, anchor };
}
