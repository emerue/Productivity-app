import { describe, expect, it } from 'vitest';
import { rankTasks, scoreTask, suggestFrog } from '../src/suggestions.js';
import { addSubtask, completeTask, logEvent } from '../src/tasks.js';
import { at, T0, task } from './helpers.js';

const target = '2026-09-28';
const ctx = { target, settings: { urgencyWindowDays: 2 } };

function postponed(n: number) {
  let t = task();
  for (let i = 0; i < n; i++) t = logEvent(t, 'postponed', at(i + 1));
  return t;
}

describe('scoreTask', () => {
  it('scores quadrants', () => {
    expect(scoreTask(task({ urgentFlag: true }), ctx)).toBe(40);
    expect(scoreTask(task(), ctx)).toBe(25);
    expect(scoreTask(task({ important: false, urgentFlag: true }), ctx)).toBe(0);
    expect(scoreTask(task({ important: false }), ctx)).toBe(0);
  });

  it('gives Delegate points only when follow-up is due', () => {
    const d = { important: false, urgentFlag: true };
    expect(scoreTask(task({ ...d, followUp: '2026-09-28' }), ctx)).toBe(15);
    expect(scoreTask(task({ ...d, followUp: '2026-09-20' }), ctx)).toBe(15);
    expect(scoreTask(task({ ...d, followUp: '2026-10-05' }), ctx)).toBe(0);
  });

  it('adds due-date bonuses relative to the planned day', () => {
    expect(scoreTask(task({ due: target }), ctx)).toBe(40 + 20); // due → Do
    expect(scoreTask(task({ due: '2026-09-26' }), ctx)).toBe(40 + 25);
  });

  it('adds carry-forward, postponement (capped) and next-action bonuses', () => {
    const t = task();
    expect(scoreTask(t, { ...ctx, carriedForward: new Set([t.id]) })).toBe(35);
    expect(scoreTask(postponed(2), ctx)).toBe(25 + 6);
    expect(scoreTask(postponed(9), ctx)).toBe(25 + 12);
    expect(scoreTask(addSubtask(task(), 'Step', T0).task, ctx)).toBe(30);
  });
});

describe('rankTasks and suggestFrog', () => {
  it('ranks by score and skips closed tasks', () => {
    const a = task({ title: 'schedule' });
    const b = task({ title: 'do', urgentFlag: true });
    const c = completeTask(task({ title: 'done', urgentFlag: true }), T0);
    const d = task({ title: 'deleted', urgentFlag: true, deleted: true });
    expect(rankTasks([a, b, c, d], ctx).map((t) => t.title)).toEqual(['do', 'schedule']);
  });

  it('breaks ties by due date, then age', () => {
    const later = task({ title: 'later', due: '2026-10-20', createdAt: at(1) });
    const sooner = task({ title: 'sooner', due: '2026-10-10', createdAt: at(2) });
    const older = task({ title: 'older', createdAt: at(0) });
    const newer = task({ title: 'newer', createdAt: at(5) });
    const ranked = rankTasks([newer, later, older, sooner], ctx).map((t) => t.title);
    expect(ranked).toEqual(['sooner', 'later', 'older', 'newer']);
  });

  it('suggests the highest-scoring important task as Frog', () => {
    const delegate = task({ title: 'delegate', important: false, urgentFlag: true, due: '2026-09-20' });
    const schedule = task({ title: 'schedule' });
    expect(suggestFrog([delegate, schedule], ctx)?.title).toBe('schedule');
    expect(suggestFrog([delegate], ctx)).toBeNull();
  });
});
