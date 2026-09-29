import type { Task } from '@frog/shared';
import { readLocal, writeLocal } from './storage';

/** How a list's open tasks are ordered. `priority` groups them by quadrant. */
export type TaskSort = 'recent' | 'priority' | 'due' | 'title';

export const TASK_SORTS: { value: TaskSort; label: string }[] = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'due', label: 'Due date' },
  { value: 'title', label: 'Name' },
];

const KEY = 'listSort';

export function readTaskSort(): TaskSort {
  const v = readLocal(KEY);
  return TASK_SORTS.some((s) => s.value === v) ? (v as TaskSort) : 'recent';
}

export function writeTaskSort(sort: TaskSort): void {
  writeLocal(KEY, sort);
}

const newestFirst = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt);

/** Flat orderings (everything except `priority`, which the list view groups itself). */
export function sortTasks(tasks: Task[], sort: Exclude<TaskSort, 'priority'>): Task[] {
  const out = [...tasks];
  switch (sort) {
    case 'recent':
      return out.sort(newestFirst);
    case 'due':
      // Dated tasks first, soonest on top; undated ones after, newest first.
      return out.sort((a, b) =>
        a.due && b.due
          ? a.due.localeCompare(b.due) || newestFirst(a, b)
          : a.due
            ? -1
            : b.due
              ? 1
              : newestFirst(a, b),
      );
    case 'title':
      return out.sort(
        (a, b) =>
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) ||
          newestFirst(a, b),
      );
  }
}
