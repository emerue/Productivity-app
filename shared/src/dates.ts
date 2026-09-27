import { formatInTimeZone } from 'date-fns-tz';
import type { Settings } from './schema.js';

/** A calendar date in the user's timezone, `YYYY-MM-DD`. */
export type DateStr = string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = parseDateStr(s);
  return !Number.isNaN(d.getTime()) && toDateStr(d) === s;
}

/** Midnight UTC of the date. Only use for calendar arithmetic. */
export function parseDateStr(s: DateStr): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function toDateStr(d: Date): DateStr {
  return d.toISOString().slice(0, 10);
}

/** Builds a date from parts, or null if the date does not exist (e.g. 31 Feb). */
export function makeDateStr(year: number, month: number, day: number): DateStr | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return toDateStr(d);
}

export function addDays(s: DateStr, n: number): DateStr {
  return toDateStr(new Date(parseDateStr(s).getTime() + n * DAY_MS));
}

/** Whole days from `b` to `a` (a − b). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parseDateStr(a).getTime() - parseDateStr(b).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(s: DateStr): number {
  return parseDateStr(s).getUTCDay();
}

export interface LocalParts {
  date: DateStr;
  hour: number;
  minute: number;
}

/** Wall-clock date and time of `now` in `timezone`. */
export function localParts(now: Date, timezone: string): LocalParts {
  const [date, hh, mm] = formatInTimeZone(now, timezone, 'yyyy-MM-dd HH mm').split(' ');
  return { date: date as string, hour: Number(hh), minute: Number(mm) };
}

type DayBoundary = Pick<Settings, 'timezone' | 'dayStartHour'>;

/**
 * The user's logical date. A logical day runs from `dayStartHour` to the next
 * day's `dayStartHour` in `timezone`, so 00:30 still belongs to the previous day.
 */
export function logicalDate(now: Date, settings: DayBoundary): DateStr {
  const { date, hour } = localParts(now, settings.timezone);
  return hour < settings.dayStartHour ? addDays(date, -1) : date;
}

export function logicalTomorrow(now: Date, settings: DayBoundary): DateStr {
  return addDays(logicalDate(now, settings), 1);
}

/** True from `planTime` until the next day boundary. */
export function isPlanningWindow(
  now: Date,
  settings: Pick<Settings, 'timezone' | 'dayStartHour' | 'planTime'>,
): boolean {
  const { hour, minute } = localParts(now, settings.timezone);
  const [ph, pm] = settings.planTime.split(':').map(Number) as [number, number];
  const start = settings.dayStartHour * 60;
  const sinceDayStart = (hour * 60 + minute - start + 1440) % 1440;
  const planSinceDayStart = (ph * 60 + pm - start + 1440) % 1440;
  return sinceDayStart >= planSinceDayStart;
}
