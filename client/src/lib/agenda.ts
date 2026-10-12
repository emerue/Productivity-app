import {
  addDays,
  dayTaskIds,
  isOccurrence,
  isOpen,
  isVisible,
  type DateStr,
  type Day,
  type Task,
} from '@frog/shared';

export { weekStart } from '@frog/shared';

export interface AgendaDay {
  date: DateStr;
  tasks: Task[];
  /** Future occurrences of repeating tasks (not real tasks yet), by title. */
  upcoming: Task[];
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
  const all = Object.values(tasks).filter(isVisible);
  const repeating = all.filter((t) => isOpen(t) && t.repeat && t.due);
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(start, i);
    const day = days[date];
    const seen = new Set<string>();
    const picked: Task[] = [];
    const add = (t: Task | undefined) => {
      if (!isVisible(t) || seen.has(t.id)) return;
      seen.add(t.id);
      picked.push(t);
    };
    dayTaskIds(day).forEach((id) => add(tasks[id]));
    all.filter((t) => t.due === date).forEach(add);
    all.filter((t) => isOpen(t) && t.followUp === date).forEach(add);
    const rank = (t: Task) => (t.status === 'open' ? (day?.frog === t.id ? 0 : 1) : 2);
    picked.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    // The live task sits on its due date; later occurrences are previews.
    const upcoming = repeating
      .filter((t) => date > t.due! && !seen.has(t.id) && isOccurrence(t.repeat!, date))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { date, tasks: picked, upcoming };
  });
}
