import { describe, expect, it } from 'vitest';
import {
  addToDay,
  becameFull,
  dayTaskIds,
  daysWithout,
  emptyDay,
  isInDay,
  leftovers,
  planDay,
  plannedCount,
  setFrog,
  todayPlan,
  withoutTask,
} from '../src/day.js';
import type { Day, Task } from '../src/schema.js';
import { completeTask } from '../src/tasks.js';
import { at, T0, task } from './helpers.js';

const TODAY = '2026-09-27';
const NOW = at(5);

const byId = (...ts: Task[]) => Object.fromEntries(ts.map((t) => [t.id, t]));
const byDate = (...ds: Day[]) => Object.fromEntries(ds.map((d) => [d.date, d]));
const day = (date: string, frog: string | null, myDay: string[]): Day => ({
  ...emptyDay(date),
  frog,
  myDay,
});

describe('membership', () => {
  it('counts the Frog and My Day, without duplicates', () => {
    const d = day(TODAY, 't_a', ['t_b', 't_c']);
    expect(dayTaskIds(d)).toEqual(['t_a', 't_b', 't_c']);
    expect(isInDay(d, 't_a')).toBe(true);
    expect(isInDay(d, 't_c')).toBe(true);
    expect(isInDay(d, 't_x')).toBe(false);
    expect(isInDay(undefined, 't_a')).toBe(false);
  });

  it('plannedCount only counts open tasks', () => {
    const a = task();
    const b = completeTask(task(), T0);
    const c = { ...task(), deleted: true };
    expect(plannedCount(day(TODAY, a.id, [b.id, c.id]), byId(a, b, c))).toBe(1);
  });
});

describe('edits', () => {
  it('adding twice is a no-op', () => {
    const d = addToDay(emptyDay(TODAY), 't_a', NOW)!;
    expect(d.myDay).toEqual(['t_a']);
    expect(addToDay(d, 't_a', NOW)).toBeNull();
    expect(addToDay(day(TODAY, 't_a', []), 't_a', NOW)).toBeNull();
  });

  it('a new Frog moves an open old Frog to the top of My Day, never duplicated', () => {
    const old = task();
    const next = task();
    const d = setFrog(day(TODAY, old.id, ['t_x', next.id]), next.id, byId(old, next), NOW)!;
    expect(d.frog).toBe(next.id);
    expect(d.myDay).toEqual([old.id, 't_x']);
  });

  it('a done old Frog does not come back into My Day', () => {
    const old = completeTask(task(), T0);
    const next = task();
    const d = setFrog(day(TODAY, old.id, []), next.id, byId(old, next), NOW)!;
    expect(d.myDay).toEqual([]);
  });

  it('planDay keeps the Frog out of My Day', () => {
    const d = planDay(emptyDay(TODAY), 't_a', ['t_a', 't_b', 't_b'], NOW);
    expect(d).toMatchObject({ frog: 't_a', myDay: ['t_b'], planned: true, plannedAt: NOW });
  });

  it('withoutTask clears the Frog or My Day, and is null when absent', () => {
    expect(withoutTask(day(TODAY, 't_a', ['t_b']), 't_a', NOW)).toMatchObject({
      frog: null,
      myDay: ['t_b'],
    });
    expect(withoutTask(day(TODAY, 't_a', ['t_b']), 't_x', NOW)).toBeNull();
  });

  it('daysWithout touches only days from the given date on', () => {
    const days = byDate(
      day('2026-09-26', 't_a', []),
      day(TODAY, null, ['t_a']),
      day('2026-09-28', null, ['t_b']),
    );
    expect(daysWithout(days, 't_a', TODAY, NOW).map((d) => d.date)).toEqual([TODAY]);
  });

  it('becameFull fires on the edit that passes the soft limit', () => {
    const ts = Array.from({ length: 6 }, () => task());
    const tasks = byId(...ts);
    const ids = ts.map((t) => t.id);
    const four = day(TODAY, null, ids.slice(0, 4));
    const five = day(TODAY, null, ids.slice(0, 5));
    const six = day(TODAY, null, ids.slice(0, 6));
    expect(becameFull(four, five, tasks)).toBe(true);
    expect(becameFull(five, six, tasks)).toBe(false);
  });
});

describe('views', () => {
  it('leftovers are open planned tasks, Frog first', () => {
    const frog = task();
    const done = completeTask(task(), T0);
    const open = task();
    const days = byDate(day(TODAY, frog.id, [done.id, open.id]));
    expect(leftovers(TODAY, days, byId(frog, done, open))).toEqual([frog.id, open.id]);
  });

  it('todayPlan sorts tasks into the My Day sections', () => {
    const frog = task({ title: 'Frog' });
    const planned = task({ title: 'Planned' });
    const finished = completeTask(task({ title: 'Finished' }), T0);
    const lingering = completeTask(task({ title: 'Lingering' }), T0);
    const archived = { ...task({ title: 'Archived' }), status: 'archived' as const };
    const overdue = task({ title: 'Overdue', due: '2026-09-20' });
    const dueToday = task({ title: 'Due today', due: TODAY });
    const fromEarlier = task({ title: 'Earlier' });
    const earlierButDue = task({ title: 'Earlier, due', due: TODAY });
    const tooOld = task({ title: 'Too old' });
    const tasks = byId(
      frog,
      planned,
      finished,
      lingering,
      archived,
      overdue,
      dueToday,
      fromEarlier,
      earlierButDue,
      tooOld,
    );
    const days = byDate(
      day(TODAY, frog.id, [planned.id, finished.id, lingering.id, archived.id]),
      day('2026-09-25', null, [fromEarlier.id, earlierButDue.id, planned.id]),
      day('2026-09-01', null, [tooOld.id]),
    );

    const view = todayPlan(TODAY, days, tasks, {
      urgencyWindowDays: 2,
      lingering: { [lingering.id]: 1 },
    });
    const titles = (ts: Task[]) => ts.map((t) => t.title);
    expect(view.frog?.title).toBe('Frog');
    expect(titles(view.rows)).toEqual(['Planned', 'Lingering']);
    expect(titles(view.completed)).toEqual(['Finished']);
    expect(titles(view.dueUnplanned)).toEqual(['Overdue', 'Due today', 'Earlier, due']);
    expect(titles(view.earlier)).toEqual(['Earlier']);
    expect(view.hasAnything).toBe(true);
    expect(view.allDone).toBe(false);
    expect(view.candidates).toEqual([]);
  });

  it('todayPlan suggests Frogs from important tasks, planned ones first', () => {
    const planned = task({ title: 'Planned' });
    const other = task({ title: 'Other', urgentFlag: true });
    const minor = task({ title: 'Minor', important: false, urgentFlag: true });
    const view = todayPlan(
      TODAY,
      byDate(day(TODAY, null, [planned.id])),
      byId(planned, other, minor),
      {
        urgencyWindowDays: 2,
      },
    );
    expect(view.candidates.map((t) => t.title)).toEqual(['Planned', 'Other']);
  });

  it('allDone once every planned task is closed', () => {
    const a = completeTask(task(), T0);
    const view = todayPlan(TODAY, byDate(day(TODAY, a.id, [])), byId(a), { urgencyWindowDays: 2 });
    expect(view.allDone).toBe(true);
  });
});
