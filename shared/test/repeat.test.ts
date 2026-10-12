import { describe, expect, it } from 'vitest';
import {
  completeRepeating,
  dropTask,
  isOccurrence,
  makeRepeat,
  matchPreset,
  newTask,
  nextDue,
  occurrenceAfter,
  occurrencesBetween,
  parseQuickAdd,
  patchTask,
  postponeTask,
  presetRule,
  repeatLabel,
  setTaskRepeat,
  type Repeat,
} from '../src/index.js';

const r = (rule: Omit<Repeat, 'anchor'>, anchor: string): Repeat => makeRepeat(rule, anchor);

describe('occurrenceAfter', () => {
  it('daily and every n days', () => {
    expect(occurrenceAfter(r({ unit: 'day', every: 1 }, '2026-09-28'), '2026-09-28')).toBe(
      '2026-09-29',
    );
    expect(occurrenceAfter(r({ unit: 'day', every: 3 }, '2026-09-28'), '2026-09-29')).toBe(
      '2026-10-01',
    );
  });

  it('returns the anchor when asked from before it', () => {
    expect(occurrenceAfter(r({ unit: 'month', every: 1 }, '2026-10-05'), '2026-09-01')).toBe(
      '2026-10-05',
    );
  });

  it('weekly on the anchor weekday, and every 2 weeks', () => {
    const weekly = r({ unit: 'week', every: 1 }, '2026-09-28'); // Monday
    expect(weekly.weekdays).toEqual([1]);
    expect(occurrenceAfter(weekly, '2026-09-28')).toBe('2026-10-05');
    const fortnight = r({ unit: 'week', every: 2 }, '2026-09-28');
    expect(occurrenceAfter(fortnight, '2026-09-30')).toBe('2026-10-12');
  });

  it('weekdays skip the weekend', () => {
    const wd = r(presetRule('weekdays', '2026-10-02'), '2026-10-02'); // Friday
    expect(occurrenceAfter(wd, '2026-10-02')).toBe('2026-10-05'); // Monday
  });

  it('every 2 weeks on Mon and Thu', () => {
    const s = r({ unit: 'week', every: 2, weekdays: [4, 1] }, '2026-09-28');
    expect(occurrencesBetween(s, '2026-09-28', '2026-10-25')).toEqual([
      '2026-09-28',
      '2026-10-01',
      '2026-10-12',
      '2026-10-15',
    ]);
  });

  it('monthly clamps to short months without drifting', () => {
    const m = r({ unit: 'month', every: 1 }, '2026-01-31');
    expect(occurrencesBetween(m, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(isOccurrence(m, '2026-02-28')).toBe(true);
    expect(isOccurrence(m, '2026-03-28')).toBe(false);
  });

  it('yearly on 29 Feb falls back to 28 Feb', () => {
    const y = r({ unit: 'year', every: 1 }, '2028-02-29');
    expect(occurrenceAfter(y, '2028-02-29')).toBe('2029-02-28');
    expect(occurrenceAfter(y, '2031-03-01')).toBe('2032-02-29');
  });

  it('every 3 months', () => {
    const q = r({ unit: 'month', every: 3 }, '2026-09-28');
    expect(occurrenceAfter(q, '2026-09-28')).toBe('2026-12-28');
    expect(occurrenceAfter(q, '2027-01-01')).toBe('2027-03-28');
  });
});

describe('nextDue', () => {
  it('moves to the next occurrence after the due date', () => {
    const m = r({ unit: 'month', every: 1 }, '2026-09-28');
    expect(nextDue(m, '2026-09-28', '2026-09-28')).toBe('2026-10-28');
  });

  it('skips occurrences that are already past', () => {
    const d = r({ unit: 'day', every: 1 }, '2026-09-20');
    expect(nextDue(d, '2026-09-22', '2026-09-30')).toBe('2026-09-30');
  });

  it('completing early keeps the series', () => {
    const w = r({ unit: 'week', every: 1 }, '2026-10-05');
    expect(nextDue(w, '2026-10-05', '2026-09-30')).toBe('2026-10-12');
  });
});

describe('labels and presets', () => {
  it('describes repeats', () => {
    expect(repeatLabel(r({ unit: 'day', every: 1 }, '2026-09-28'))).toBe('Daily');
    expect(repeatLabel(r({ unit: 'day', every: 2 }, '2026-09-28'))).toBe('Every 2 days');
    expect(repeatLabel(r(presetRule('weekdays', '2026-09-28'), '2026-09-28'))).toBe('Weekdays');
    expect(repeatLabel(r({ unit: 'week', every: 1 }, '2026-09-29'))).toBe('Weekly on Tue');
    expect(repeatLabel(r({ unit: 'week', every: 2, weekdays: [4, 1] }, '2026-09-28'))).toBe(
      'Every 2 weeks on Mon, Thu',
    );
    expect(repeatLabel(r({ unit: 'month', every: 1 }, '2026-09-28'))).toBe('Monthly on the 28th');
    expect(repeatLabel(r({ unit: 'month', every: 1 }, '2026-09-01'))).toBe('Monthly on the 1st');
    expect(repeatLabel(r({ unit: 'month', every: 1 }, '2026-09-12'))).toBe('Monthly on the 12th');
    expect(repeatLabel(r({ unit: 'year', every: 1 }, '2026-09-28'))).toBe('Yearly on 28 Sep');
  });

  it('matches presets', () => {
    expect(matchPreset(r({ unit: 'month', every: 1 }, '2026-09-28'))).toBe('monthly');
    expect(matchPreset(r({ unit: 'week', every: 1 }, '2026-09-28'))).toBe('weekly');
    expect(matchPreset(r({ unit: 'week', every: 2 }, '2026-09-28'))).toBeNull();
  });
});

describe('completeRepeating', () => {
  it('completes this one and spawns the next with unticked steps', () => {
    const now = '2026-09-28T10:00:00.000Z';
    const repeat = r({ unit: 'month', every: 1 }, '2026-09-28');
    const task = {
      ...newTask({ title: 'Monthly report', listId: 'l_heirs', due: '2026-09-28', repeat }, now),
      subtasks: [
        {
          id: 's_abcd',
          title: 'Pull numbers',
          done: true,
          doneAt: now,
          order: 0,
          updatedAt: now,
        },
      ],
    };
    const out = completeRepeating(task, '2026-09-28', now)!;
    expect(out.done.status).toBe('done');
    expect(out.done.repeat).toBeNull();
    expect(out.next.status).toBe('open');
    expect(out.next.due).toBe('2026-10-28');
    expect(out.next.repeat).toEqual(repeat);
    expect(out.next.subtasks.map((s) => [s.title, s.done])).toEqual([['Pull numbers', false]]);
    expect(out.next.id).not.toBe(task.id);
  });

  it('ignores tasks without a repeat', () => {
    const t = newTask({ title: 'x', listId: 'l_heirs' }, '2026-09-28T10:00:00.000Z');
    expect(completeRepeating(t, '2026-09-28', t.createdAt)).toBeNull();
  });
});

describe('a repeat always has a due date', () => {
  const now = '2026-09-28T10:00:00.000Z';
  const series = () =>
    newTask(
      {
        title: 'Weekly review',
        listId: 'l_heirs',
        due: '2026-09-28',
        repeat: r({ unit: 'week', every: 1 }, '2026-09-28'),
      },
      now,
    );

  it('clearing the due date ends the series', () => {
    expect(patchTask(series(), { due: null }, now).repeat).toBeNull();
  });

  it('Drop (which clears the due date) ends the series', () => {
    const ctx = { today: '2026-09-28', urgencyWindowDays: 2 };
    expect(dropTask(series(), now, ctx).repeat).toBeNull();
  });

  it('moving the due date keeps the anchor', () => {
    const moved = postponeTask(series(), '2026-09-28', '2026-10-01', true, now);
    expect(moved.repeat?.anchor).toBe('2026-09-28');
  });

  it('setting a repeat on an undated task dates it today', () => {
    const t = newTask({ title: 'x', listId: 'l_heirs' }, now);
    const out = setTaskRepeat(t, { unit: 'month', every: 1 }, '2026-09-28', now);
    expect(out.due).toBe('2026-09-28');
    expect(out.repeat).toEqual({ unit: 'month', every: 1, anchor: '2026-09-28' });
    expect(setTaskRepeat(out, null, '2026-09-28', now).repeat).toBeNull();
  });
});

describe('quick add repeat tokens', () => {
  const ctx = { lists: [], today: '2026-09-28' };
  it('parses presets and n-unit forms', () => {
    expect(parseQuickAdd('Report *monthly', ctx).repeat).toEqual({ unit: 'month', every: 1 });
    expect(parseQuickAdd('Standup *weekdays', ctx).repeat?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(parseQuickAdd('Review *2w', ctx).repeat).toEqual({ unit: 'week', every: 2 });
    expect(parseQuickAdd('Review *2w', ctx).title).toBe('Review');
  });

  it('leaves unknown * words in the title', () => {
    expect(parseQuickAdd('5 *stars', ctx).title).toBe('5 *stars');
    expect(parseQuickAdd('5 *stars', ctx).repeat).toBeNull();
  });
});
