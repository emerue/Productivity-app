import { addDays, diffDays, logicalDate, type DateStr, type Settings } from '@frog/shared';
import { formatInTimeZone } from 'date-fns-tz';
import { useEffect, useState } from 'react';
import { useData } from '../data/store';

/** Current time, refreshed every `intervalMs` and whenever the tab becomes visible. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** The logical date (respects day start hour and timezone). */
export function useToday(): DateStr {
  const now = useNow();
  const tz = useData((s) => s.settings.timezone);
  const start = useData((s) => s.settings.dayStartHour);
  return logicalDate(now, { timezone: tz, dayStartHour: start });
}

export function todayNow(settings: Pick<Settings, 'timezone' | 'dayStartHour'>): DateStr {
  return logicalDate(new Date(), settings);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: DateStr) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday };
}

/** Header date: "Sun 27 Sep". */
export function formatHeaderDate(date: DateStr): string {
  const { m, d, weekday } = parts(date);
  return `${WEEKDAY[weekday]} ${d} ${MONTH[m - 1]}`;
}

/**
 * Compact due label relative to today: "Today", "Tomorrow", "Yesterday",
 * weekday within the coming week ("Thu"), otherwise "12 Oct" (with year if not this year).
 */
export function formatDue(date: DateStr, today: DateStr): string {
  const delta = diffDays(date, today);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  const { y, m, d, weekday } = parts(date);
  if (delta > 1 && delta < 7) return WEEKDAY[weekday] as string;
  const sameYear = y === Number(today.slice(0, 4));
  return sameYear ? `${d} ${MONTH[m - 1]}` : `${d} ${MONTH[m - 1]} ${y}`;
}

/** `formatDue` for use mid-sentence: "due tomorrow", "due Thu". */
export function formatDueInline(date: DateStr, today: DateStr): string {
  const label = formatDue(date, today);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? label.toLowerCase() : label;
}

/** Longer form for chips and prompts: "Thu 1 Oct". */
export function formatDateLong(date: DateStr, today: DateStr): string {
  const delta = diffDays(date, today);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  const { y, m, d, weekday } = parts(date);
  const sameYear = y === Number(today.slice(0, 4));
  return `${WEEKDAY[weekday]} ${d} ${MONTH[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

export function formatClock(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, 'HH:mm');
}

export { addDays };
