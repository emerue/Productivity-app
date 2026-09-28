import { addDays, isOpen, weekdayOf, type DateStr, type Day, type Task } from '@frog/shared';

/** Monday of the week containing `date`. */
export function weekStart(date: DateStr): DateStr {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

export interface AgendaDay {
  date: DateStr;
  tasks: Task[];
}

/**
 * What belongs to each day in [start, start + count): tasks due that day,
 * tasks planned into that day's My Day (or its Frog), and Delegate follow-ups.
 * Open before done; the Frog first; then by title.
 */
export function buildAgenda(
  start: DateStr,
  count: number,
  tasks: Record<string, Task>,
  days: Record<string, Day>,
): AgendaDay[] {
  const all = Object.values(tasks).filter((t) => !t.deleted && t.status !== 'archived');
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    const day = days[date];
    const seen = new Set<string>();
    const picked: Task[] = [];
    const add = (t: Task | undefined) => {
      if (!t || t.deleted || t.status === 'archived' || seen.has(t.id)) return;
      seen.add(t.id);
      picked.push(t);
    };
    if (day) [day.frog, ...day.myDay].forEach((id) => id && add(tasks[id]));
    all.filter((t) => t.due === date).forEach(add);
    all.filter((t) => isOpen(t) && t.followUp === date).forEach(add);
    const rank = (t: Task) => (t.status === 'open' ? (day?.frog === t.id ? 0 : 1) : 2);
    picked.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    return { date, tasks: picked };
  });
}
