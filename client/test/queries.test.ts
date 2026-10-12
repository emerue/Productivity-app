import { completeTask, newTask, type Task } from '@frog/shared';
import { describe, expect, it } from 'vitest';
import { closedTasks, overdueTasks, rankByQuadrant, searchTasks } from '../src/lib/queries';

const T0 = '2026-09-27T09:00:00.000Z';
const TODAY = '2026-09-27';
const ctx = { today: TODAY, urgencyWindowDays: 2 };

const task = (o: Partial<Task> = {}): Task => ({
  ...newTask({ title: 'Task', listId: 'l_a' }, T0),
  ...o,
});
const byId = (...ts: Task[]) => Object.fromEntries(ts.map((t) => [t.id, t]));

describe('rankByQuadrant', () => {
  it('groups open tasks by quadrant, most pressing first', () => {
    const doIt = task({ title: 'Do', urgentFlag: true });
    const dueSoon = task({ title: 'Due tomorrow', due: '2026-09-28' });
    const later = task({ title: 'Later' });
    const waiting = task({ title: 'Waiting', important: false, urgentFlag: true });
    const drop = task({ title: 'Drop', important: false });
    const archived = task({ title: 'Archived', status: 'archived' });
    const { groups } = rankByQuadrant([later, drop, dueSoon, doIt, waiting, archived], {}, ctx);
    const titles = (ts: Task[]) => ts.map((t) => t.title);
    expect(titles(groups.do)).toEqual(['Due tomorrow', 'Do']);
    expect(titles(groups.schedule)).toEqual(['Later']);
    expect(titles(groups.delegate)).toEqual(['Waiting']);
    expect(titles(groups.drop)).toEqual(['Drop']);
  });

  it('keeps a just-completed task in place while it lingers', () => {
    const done = completeTask(task({ title: 'Just done' }), T0);
    expect(rankByQuadrant([done], { [done.id]: 1 }, ctx).groups.schedule).toEqual([done]);
    expect(rankByQuadrant([done], {}, ctx).ranked).toEqual([]);
  });
});

describe('search, closed and overdue', () => {
  it('search finds archived tasks too, open first', () => {
    const open = task({ title: 'Invoice Ada' });
    const archived = task({ title: 'Old invoice', status: 'archived' });
    const deleted = task({ title: 'Invoice', deleted: true });
    expect(searchTasks(byId(archived, open, deleted), 'invoice')).toEqual([open, archived]);
  });

  it('closed tasks: done newest first', () => {
    const a = { ...completeTask(task(), T0), completedAt: '2026-09-20T00:00:00.000Z' };
    const b = { ...completeTask(task(), T0), completedAt: '2026-09-25T00:00:00.000Z' };
    expect(closedTasks(byId(a, b), 'done')).toEqual([b, a]);
  });

  it('overdue: open tasks due before today, oldest first', () => {
    const old = task({ due: '2026-09-01' });
    const recent = task({ due: '2026-09-26' });
    const today = task({ due: TODAY });
    const done = completeTask(task({ due: '2026-09-02' }), T0);
    expect(overdueTasks(byId(recent, today, old, done), TODAY)).toEqual([old, recent]);
  });
});
