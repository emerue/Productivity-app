import { describe, expect, it } from 'vitest';
import { HISTORY_CAP } from '../src/constants.js';
import {
  addSubtask,
  completeTask,
  deleteTask,
  dropTask,
  logEvent,
  nextAction,
  postponeCount,
  postponeTask,
  promoteSubtask,
  removeSubtask,
  reopenTask,
  reorderSubtasks,
  restoreTask,
  shouldAutoArchive,
  stepProgress,
  updateSubtask,
} from '../src/tasks.js';
import { at, T0, task } from './helpers.js';

function withSteps(...titles: string[]) {
  let t = task();
  const ids: string[] = [];
  for (const title of titles) {
    const r = addSubtask(t, title, T0);
    t = r.task;
    ids.push(r.subtask.id);
  }
  return { t, ids };
}

describe('nextAction', () => {
  it('is null without steps', () => {
    expect(nextAction(task())).toBeNull();
  });

  it('is the first incomplete step', () => {
    const { t, ids } = withSteps('Draft SLA section', 'Send to Ada', 'Book review');
    expect(nextAction(t)?.title).toBe('Draft SLA section');
    const t2 = updateSubtask(t, ids[0]!, { done: true }, at(1));
    expect(nextAction(t2)?.title).toBe('Send to Ada');
    expect(stepProgress(t2)).toEqual({ done: 1, total: 3 });
  });

  it('comes back when a step is unticked', () => {
    const { t, ids } = withSteps('A', 'B');
    const done = updateSubtask(t, ids[0]!, { done: true }, at(1));
    const undone = updateSubtask(done, ids[0]!, { done: false }, at(2));
    expect(nextAction(undone)?.title).toBe('A');
    expect(undone.subtasks[0]?.doneAt).toBeNull();
  });

  it('promotes the following open step when the current one is deleted', () => {
    const { t, ids } = withSteps('A', 'B', 'C');
    expect(nextAction(removeSubtask(t, ids[0]!, at(1)))?.title).toBe('B');
    expect(stepProgress(removeSubtask(t, ids[0]!, at(1))).total).toBe(2);
  });

  it('follows reordering', () => {
    const { t, ids } = withSteps('A', 'B', 'C');
    const r = reorderSubtasks(t, [ids[2]!, ids[0]!, ids[1]!], at(1));
    expect(nextAction(r)?.title).toBe('C');
  });
});

describe('task operations', () => {
  it('completes and reopens with history', () => {
    const done = completeTask(task(), at(1));
    expect(done.status).toBe('done');
    expect(done.completedAt).toBe(at(1));
    const open = reopenTask(done, at(2));
    expect(open.status).toBe('open');
    expect(open.completedAt).toBeNull();
    expect(open.history.map((e) => e.type)).toEqual(['created', 'completed', 'reopened']);
  });

  it('caps history at 100 events, dropping the oldest', () => {
    let t = task();
    for (let i = 0; i < HISTORY_CAP + 20; i++) t = logEvent(t, 'postponed', at(i + 1));
    expect(t.history).toHaveLength(HISTORY_CAP);
    expect(t.history[0]?.type).toBe('postponed');
  });

  it('counts postponements', () => {
    let t = task();
    t = postponeTask(t, '2026-09-27', '2026-09-28', false, at(1));
    t = postponeTask(t, '2026-09-28', '2026-10-02', true, at(2));
    expect(postponeCount(t)).toBe(2);
    expect(t.due).toBe('2026-10-02');
  });

  it('drops: not important, not urgent, due cleared', () => {
    const t = dropTask(task({ due: '2026-09-28', urgentFlag: true }), at(1), {
      today: '2026-09-27',
      urgencyWindowDays: 2,
    });
    expect(t).toMatchObject({ important: false, urgentFlag: false, due: null });
    expect(t.history.at(-1)?.data).toEqual({ from: 'do', to: 'drop' });
  });

  it('promotes a step to its own task in the same list', () => {
    const { t, ids } = withSteps('A', 'B');
    const r = promoteSubtask(t, ids[0]!, at(1));
    expect(r?.promoted.title).toBe('A');
    expect(r?.promoted.listId).toBe(t.listId);
    expect(nextAction(r!.task)?.title).toBe('B');
  });

  it('deletes with a tombstone and restores with a marker', () => {
    const dead = deleteTask(task(), at(1));
    expect(dead).toMatchObject({ deleted: true, deletedAt: at(1) });
    const back = restoreTask(dead, at(2));
    expect(back).toMatchObject({ deleted: false, restore: true, updatedAt: at(2) });
    expect(back.deletedAt).toBeUndefined();
  });
});

describe('shouldAutoArchive', () => {
  const ctx = { today: '2026-10-20', urgencyWindowDays: 2, dropArchiveDays: 14 };
  const dropTaskT = task({ important: false, urgentFlag: false });

  it('archives Drop tasks untouched for the configured days', () => {
    expect(shouldAutoArchive(dropTaskT, ctx)).toBe(true);
    expect(shouldAutoArchive(dropTaskT, { ...ctx, today: '2026-10-10' })).toBe(false);
  });

  it('counts step edits as updates', () => {
    const touched = addSubtask(dropTaskT, 'x', '2026-10-15T09:00:00.000Z').task;
    expect(shouldAutoArchive(touched, ctx)).toBe(false);
  });

  it('ignores other quadrants and closed tasks', () => {
    expect(shouldAutoArchive(task(), ctx)).toBe(false);
    expect(shouldAutoArchive(completeTask(dropTaskT, T0), ctx)).toBe(false);
  });
});
