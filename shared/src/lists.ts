import type { List } from './schema.js';

type Lists = Record<string, List>;

/** Lists that aren't deleted, in display order. */
export function liveLists(lists: Lists): List[] {
  return Object.values(lists)
    .filter((l) => !l.deleted)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * The live list a new task lands in: the first of `preferred` that is live,
 * then the first live list. `preferred` is usually [picked, screen, default].
 */
export function pickList(lists: Lists, preferred: (string | null | undefined)[]): List | undefined {
  for (const id of preferred) {
    const l = id ? lists[id] : undefined;
    if (l && !l.deleted) return l;
  }
  return liveLists(lists)[0];
}

/** `order` for a list added at the end. */
export function nextListOrder(lists: Lists): number {
  return Math.max(-1, ...liveLists(lists).map((l) => l.order)) + 1;
}
