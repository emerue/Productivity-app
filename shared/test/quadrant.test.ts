import { describe, expect, it } from 'vitest';
import { dueConflict, flagsForQuadrant, isUrgent, quadrantOf, QUADRANTS } from '../src/quadrant.js';
import { moveToQuadrant, newTask } from '../src/tasks.js';
import { T0, task } from './helpers.js';

const ctx = { today: '2026-09-27', urgencyWindowDays: 2 };

describe('quadrantOf', () => {
  it('derives all four quadrants from importance and urgency', () => {
    expect(quadrantOf({ important: true, urgentFlag: true, due: null }, ctx)).toBe('do');
    expect(quadrantOf({ important: true, urgentFlag: false, due: null }, ctx)).toBe('schedule');
    expect(quadrantOf({ important: false, urgentFlag: true, due: null }, ctx)).toBe('delegate');
    expect(quadrantOf({ important: false, urgentFlag: false, due: null }, ctx)).toBe('drop');
  });

  it('defaults new tasks to important', () => {
    expect(newTask({ title: 'x', listId: 'l_a' }, T0).important).toBe(true);
  });

  it('makes a task urgent when due within the window, overdue included', () => {
    const base = { important: true, urgentFlag: false };
    expect(isUrgent({ ...base, due: '2026-09-29' }, ctx)).toBe(true); // today + 2
    expect(isUrgent({ ...base, due: '2026-09-30' }, ctx)).toBe(false); // today + 3
    expect(isUrgent({ ...base, due: '2026-09-01' }, ctx)).toBe(true); // overdue
  });

  it('moves Schedule to Do as the due date approaches (acceptance 3)', () => {
    const t = { important: true, urgentFlag: false, due: '2026-10-01' };
    expect(quadrantOf(t, { ...ctx, today: '2026-09-28' })).toBe('schedule'); // 3 days away
    expect(quadrantOf(t, { ...ctx, today: '2026-09-29' })).toBe('do'); // 2 days away
  });
});

describe('manual moves', () => {
  it('sets the documented flags', () => {
    expect(flagsForQuadrant('do')).toEqual({ important: true, urgentFlag: true });
    expect(flagsForQuadrant('schedule')).toEqual({ important: true, urgentFlag: false });
    expect(flagsForQuadrant('delegate')).toEqual({ important: false, urgentFlag: true });
    expect(flagsForQuadrant('drop')).toEqual({ important: false, urgentFlag: false });
  });

  it('lands in the target quadrant when there is no due date', () => {
    for (const q of QUADRANTS) {
      const moved = moveToQuadrant(task(), q, T0, ctx);
      expect(quadrantOf(moved, ctx)).toBe(q);
    }
  });

  it('logs movedQuadrant with from/to', () => {
    const moved = moveToQuadrant(task(), 'do', T0, ctx);
    const event = moved.history.at(-1);
    expect(event?.type).toBe('movedQuadrant');
    expect(event?.data).toEqual({ from: 'schedule', to: 'do' });
  });

  it('flags a due-date conflict only for Schedule and Drop', () => {
    const t = { due: '2026-09-28' };
    expect(dueConflict(t, 'schedule', ctx)).toBe(true);
    expect(dueConflict(t, 'drop', ctx)).toBe(true);
    expect(dueConflict(t, 'do', ctx)).toBe(false);
    expect(dueConflict(t, 'delegate', ctx)).toBe(false);
    expect(dueConflict({ due: '2026-10-20' }, 'schedule', ctx)).toBe(false);
    expect(dueConflict({ due: null }, 'drop', ctx)).toBe(false);
  });
});
