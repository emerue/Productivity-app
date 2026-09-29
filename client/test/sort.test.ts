import { newTask, type Task } from '@frog/shared';
import { describe, expect, it } from 'vitest';
import { sortTasks } from '../src/lib/sort';

function task(title: string, updatedAt: string, due: string | null = null): Task {
  return { ...newTask({ title, listId: 'l_personal', due }, updatedAt), updatedAt };
}

const a = task('banana', '2026-09-28T08:00:00.000Z', '2026-10-02');
const b = task('Apple', '2026-09-28T12:00:00.000Z');
const c = task('cherry', '2026-09-28T10:00:00.000Z', '2026-09-30');
const d = task('Task 10', '2026-09-28T09:00:00.000Z');
const e = task('Task 9', '2026-09-28T07:00:00.000Z');
const titles = (ts: Task[]) => ts.map((t) => t.title);

describe('sortTasks', () => {
  it('puts the most recently updated first', () => {
    expect(titles(sortTasks([a, b, c, d, e], 'recent'))).toEqual([
      'Apple',
      'cherry',
      'Task 10',
      'banana',
      'Task 9',
    ]);
  });

  it('orders by due date, undated last (newest first)', () => {
    expect(titles(sortTasks([a, b, c, d, e], 'due'))).toEqual([
      'cherry',
      'banana',
      'Apple',
      'Task 10',
      'Task 9',
    ]);
  });

  it('orders by name, ignoring case and reading numbers naturally', () => {
    expect(titles(sortTasks([a, b, c, d, e], 'title'))).toEqual([
      'Apple',
      'banana',
      'cherry',
      'Task 9',
      'Task 10',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [a, b];
    sortTasks(input, 'recent');
    expect(input).toEqual([a, b]);
  });
});
