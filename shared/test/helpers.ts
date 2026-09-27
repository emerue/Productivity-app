import type { List, Task } from '../src/schema.js';
import { newTask } from '../src/tasks.js';

export const T0 = '2026-09-27T09:00:00.000Z';

export function at(minutesAfterT0: number): string {
  return new Date(Date.parse(T0) + minutesAfterT0 * 60_000).toISOString();
}

export function list(id: string, name: string, order = 0): List {
  return { id, name, order, updatedAt: T0, rev: 0 };
}

export function task(overrides: Partial<Task> = {}): Task {
  return { ...newTask({ title: 'Task', listId: 'l_default' }, T0), ...overrides };
}
