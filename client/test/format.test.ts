import { addSubtask, completeTask, newTask, type Task } from '@frog/shared';
import { describe, expect, it } from 'vitest';
import { dueLabel, rowDetails } from '../src/lib/format';
import { formatDateLong, formatDue, formatHeaderDate } from '../src/lib/time';

const today = '2026-09-27'; // Sunday

describe('date labels', () => {
  it('formats the header date', () => {
    expect(formatHeaderDate(today)).toBe('Sun 27 Sep');
  });

  it('formats due dates relative to today', () => {
    expect(formatDue('2026-09-27', today)).toBe('Today');
    expect(formatDue('2026-09-28', today)).toBe('Tomorrow');
    expect(formatDue('2026-09-26', today)).toBe('Yesterday');
    expect(formatDue('2026-10-01', today)).toBe('Thu');
    expect(formatDue('2026-10-12', today)).toBe('12 Oct');
    expect(formatDue('2026-09-12', today)).toBe('12 Sep');
    expect(formatDue('2027-01-05', today)).toBe('5 Jan 2027');
  });

  it('formats long dates for chips', () => {
    expect(formatDateLong('2026-10-01', today)).toBe('Thu 1 Oct');
    expect(formatDateLong('2026-09-28', today)).toBe('Tomorrow');
  });
});

describe('row details', () => {
  const T0 = '2026-09-27T09:00:00.000Z';
  const task = (o: Partial<Task> = {}): Task => ({
    ...newTask({ title: 'Task', listId: 'l_a' }, T0),
    ...o,
  });

  it('says when a task is due, in words', () => {
    expect(dueLabel('2026-09-27', today)).toBe('Due today');
    expect(dueLabel('2026-09-28', today)).toBe('Due tomorrow');
    expect(dueLabel('2026-10-01', today)).toBe('Due Thu');
    expect(dueLabel('2026-09-20', today)).toBe('Overdue since 20 Sep');
  });

  it('lists due date, next step with progress, then the list', () => {
    const t = addSubtask(
      addSubtask(task({ due: '2026-09-28' }), 'Pull stats', T0).task,
      'Send',
      T0,
    ).task;
    expect(rowDetails(t, 'schedule', today, 'Heirs')).toEqual([
      { text: 'Due tomorrow' },
      { text: 'Next: Pull stats (0 of 2)' },
      { text: 'Heirs' },
    ]);
  });

  it('marks overdue and names who a Delegate task waits on', () => {
    const t = task({ due: '2026-09-20', important: false, urgentFlag: true, waitingOn: 'Tunde' });
    expect(rowDetails(t, 'delegate', today)).toEqual([
      { text: 'Overdue since 20 Sep', overdue: true },
      { text: 'Waiting on Tunde' },
    ]);
  });

  it('done tasks keep only their list', () => {
    const t = completeTask(task({ due: '2026-09-20' }), T0);
    expect(rowDetails(t, 'do', today, 'Heirs')).toEqual([{ text: 'Heirs' }]);
  });
});
