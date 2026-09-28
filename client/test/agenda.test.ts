import { newTask, type Day, type Task } from '@frog/shared';
import { describe, expect, it } from 'vitest';
import { buildAgenda, weekStart } from '../src/lib/agenda';

const now = '2026-09-27T09:00:00.000Z';
const list = 'l_personal';

function task(title: string, extra: Partial<Task> = {}): Task {
  return { ...newTask({ title, listId: list }, now), ...extra };
}

function byId(...tasks: Task[]): Record<string, Task> {
  return Object.fromEntries(tasks.map((t) => [t.id, t]));
}

function day(date: string, frog: string | null, myDay: string[]): Day {
  return { date, frog, myDay, planned: true, plannedAt: now, updatedAt: now, rev: 0 };
}

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart('2026-09-28')).toBe('2026-09-28'); // Monday
    expect(weekStart('2026-10-01')).toBe('2026-09-28'); // Thursday
    expect(weekStart('2026-10-04')).toBe('2026-09-28'); // Sunday
  });
});

describe('buildAgenda', () => {
  it('collects due, planned and follow-up tasks per day', () => {
    const due = task('Due Tue', { due: '2026-09-29' });
    const planned = task('Planned Mon');
    const follow = task('Chase Ada', { waitingOn: 'Ada', followUp: '2026-09-30' });
    const undated = task('No date');
    const agenda = buildAgenda('2026-09-28', 7, byId(due, planned, follow, undated), {
      '2026-09-28': day('2026-09-28', null, [planned.id]),
    });
    expect(agenda).toHaveLength(7);
    expect(agenda[0]!.tasks.map((t) => t.title)).toEqual(['Planned Mon']);
    expect(agenda[1]!.tasks.map((t) => t.title)).toEqual(['Due Tue']);
    expect(agenda[2]!.tasks.map((t) => t.title)).toEqual(['Chase Ada']);
    expect(agenda.flatMap((d) => d.tasks).some((t) => t.title === 'No date')).toBe(false);
  });

  it('lists a task once per day, Frog first and done last', () => {
    const frog = task('Zebra frog', { due: '2026-09-28' });
    const a = task('Apple', { due: '2026-09-28' });
    const done = task('Done one', { due: '2026-09-28', status: 'done', completedAt: now });
    const [d] = buildAgenda('2026-09-28', 1, byId(frog, a, done), {
      '2026-09-28': day('2026-09-28', frog.id, [a.id]),
    });
    expect(d!.tasks.map((t) => t.title)).toEqual(['Zebra frog', 'Apple', 'Done one']);
  });

  it('skips deleted and archived tasks', () => {
    const gone = task('Gone', { due: '2026-09-28', deleted: true });
    const archived = task('Archived', { due: '2026-09-28', status: 'archived' });
    const [d] = buildAgenda('2026-09-28', 1, byId(gone, archived), {});
    expect(d!.tasks).toEqual([]);
  });
});
