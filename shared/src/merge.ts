import { HISTORY_CAP, MAX_CLOCK_SKEW_MS } from './constants.js';
import type {
  Changes,
  Day,
  FocusSession,
  HistoryEvent,
  List,
  Settings,
  Subtask,
  Task,
} from './schema.js';

/**
 * Merge rules (brief section 6). Every function is commutative and idempotent,
 * so the server and all clients converge regardless of arrival order:
 *
 * - Entities: last-writer-wins on `updatedAt`.
 * - Tasks merge at three levels: scalar fields by `updatedAt`, `notes` by
 *   `notesUpdatedAt`, steps per id by their own `updatedAt`. History is a union.
 * - Tombstones beat plain edits, older or newer. Only a restore (`restore: true`
 *   with `updatedAt` after the deletion) brings an entity back.
 * - Focus sessions are append-only.
 */

const ts = (iso: string | undefined): number => (iso ? Date.parse(iso) : 0);

/** JSON with sorted keys and `rev` dropped, for deterministic tie-breaks and equality. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) => {
    if (key === 'rev') return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    }
    return v;
  });
}

/** Content equality ignoring `rev` and key order. */
export function sameContent(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function pickNewer<T>(a: T, b: T, stampA: string | undefined, stampB: string | undefined): T {
  const ta = ts(stampA);
  const tb = ts(stampB);
  if (ta !== tb) return ta > tb ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

const maxRev = (a: { rev: number }, b: { rev: number }) => Math.max(a.rev, b.rev);

const earlier = (a: string | undefined, b: string | undefined): string | undefined =>
  a === undefined ? b : b === undefined ? a : ts(a) <= ts(b) ? a : b;

interface Tombstoned {
  updatedAt: string;
  deleted?: boolean;
  deletedAt?: string;
  restore?: boolean;
}

/** Applies tombstone rules to an already field-merged value. */
function resolveTombstone<T extends Tombstoned>(a: T, b: T, merged: T): T {
  const { deleted: _d, deletedAt: _da, restore: _r, ...base } = merged;
  const aDel = a.deleted === true;
  const bDel = b.deleted === true;

  if (aDel && bDel) {
    return { ...base, deleted: true, deletedAt: earlier(a.deletedAt, b.deletedAt) ?? merged.updatedAt } as T;
  }
  if (!aDel && !bDel) {
    // Keep the restore marker sticky so a stale tombstone can't win later.
    return (a.restore || b.restore ? { ...base, deleted: false, restore: true } : base) as T;
  }
  const dead = aDel ? a : b;
  const live = aDel ? b : a;
  const deletedAt = dead.deletedAt ?? dead.updatedAt;
  if (live.restore && ts(live.updatedAt) > ts(deletedAt)) {
    return { ...base, deleted: false, restore: true } as T;
  }
  return { ...base, deleted: true, deletedAt } as T;
}

export function mergeList(a: List, b: List): List {
  const winner = pickNewer(a, b, a.updatedAt, b.updatedAt);
  return resolveTombstone(a, b, { ...winner, rev: maxRev(a, b) });
}

export function mergeSubtask(a: Subtask, b: Subtask): Subtask {
  const winner = pickNewer(a, b, a.updatedAt, b.updatedAt);
  if (a.deleted || b.deleted) {
    const deletedAt = earlier(a.deleted ? a.deletedAt : undefined, b.deleted ? b.deletedAt : undefined);
    return { ...winner, deleted: true, deletedAt: deletedAt ?? winner.updatedAt };
  }
  return winner;
}

export function mergeSubtasks(a: Subtask[], b: Subtask[]): Subtask[] {
  const byId = new Map<string, Subtask>();
  for (const s of a) byId.set(s.id, s);
  for (const s of b) {
    const existing = byId.get(s.id);
    byId.set(s.id, existing ? mergeSubtask(existing, s) : s);
  }
  return [...byId.values()].sort((x, y) => x.order - y.order || x.id.localeCompare(y.id));
}

export function mergeHistory(a: HistoryEvent[], b: HistoryEvent[]): HistoryEvent[] {
  const byId = new Map<string, HistoryEvent>();
  for (const e of a) byId.set(e.id, e);
  for (const e of b) if (!byId.has(e.id)) byId.set(e.id, e);
  const all = [...byId.values()].sort((x, y) => ts(x.at) - ts(y.at) || x.id.localeCompare(y.id));
  return all.length > HISTORY_CAP ? all.slice(all.length - HISTORY_CAP) : all;
}

/** The scalar part of a task, used for the tie-break so notes/steps don't influence it. */
function scalarPart(t: Task) {
  const { notes: _n, notesUpdatedAt: _nu, subtasks: _s, history: _h, rev: _r, ...rest } = t;
  return rest;
}

export function mergeTask(a: Task, b: Task): Task {
  const ta = ts(a.updatedAt);
  const tb = ts(b.updatedAt);
  const scalar =
    ta !== tb ? (ta > tb ? a : b) : stableStringify(scalarPart(a)) >= stableStringify(scalarPart(b)) ? a : b;
  const notesSide = pickNewer(
    { notes: a.notes, notesUpdatedAt: a.notesUpdatedAt },
    { notes: b.notes, notesUpdatedAt: b.notesUpdatedAt },
    a.notesUpdatedAt,
    b.notesUpdatedAt,
  );
  const merged: Task = {
    ...scalar,
    notes: notesSide.notes,
    notesUpdatedAt: notesSide.notesUpdatedAt,
    subtasks: mergeSubtasks(a.subtasks, b.subtasks),
    history: mergeHistory(a.history, b.history),
    rev: maxRev(a, b),
  };
  return resolveTombstone(a, b, merged);
}

export function mergeDay(a: Day, b: Day): Day {
  return { ...pickNewer(a, b, a.updatedAt, b.updatedAt), rev: maxRev(a, b) };
}

export function mergeSettings(a: Settings, b: Settings): Settings {
  return { ...pickNewer(a, b, a.updatedAt, b.updatedAt), rev: maxRev(a, b) };
}

/** Append-only: sessions never change after they are logged. Keep the stamped copy. */
export function mergeFocusSession(a: FocusSession, b: FocusSession): FocusSession {
  return a.rev >= b.rev ? a : b;
}

// ---------------------------------------------------------------------------
// Collections

export type EntityKind = 'lists' | 'tasks' | 'days' | 'focusSessions';

export interface EntityMap {
  lists: List;
  tasks: Task;
  days: Day;
  focusSessions: FocusSession;
}

export const MERGERS: { [K in EntityKind]: (a: EntityMap[K], b: EntityMap[K]) => EntityMap[K] } = {
  lists: mergeList,
  tasks: mergeTask,
  days: mergeDay,
  focusSessions: mergeFocusSession,
};

export function entityKey<K extends EntityKind>(kind: K, entity: EntityMap[K]): string {
  return kind === 'days' ? (entity as Day).date : (entity as { id: string }).id;
}

export function mergeEntity<K extends EntityKind>(
  kind: K,
  existing: EntityMap[K] | undefined,
  incoming: EntityMap[K],
): EntityMap[K] {
  return existing ? MERGERS[kind](existing, incoming) : incoming;
}

export interface MergeableState {
  lists: Record<string, List>;
  tasks: Record<string, Task>;
  days: Record<string, Day>;
  focusSessions: Record<string, FocusSession>;
  settings: Settings;
}

/**
 * Merges a batch of changes into `state` (mutating it). Calls `onChange` for
 * every entity whose content actually changed, with the merged value, so the
 * caller can stamp revisions or persist.
 */
export function applyChanges(
  state: MergeableState,
  changes: Partial<Changes>,
  onChange?: (kind: EntityKind | 'settings', key: string, merged: unknown) => void,
): number {
  let changed = 0;
  const kinds: EntityKind[] = ['lists', 'tasks', 'days', 'focusSessions'];
  for (const kind of kinds) {
    const incoming = (changes[kind] ?? []) as EntityMap[typeof kind][];
    const record = state[kind] as Record<string, EntityMap[typeof kind]>;
    for (const entity of incoming) {
      const key = entityKey(kind, entity);
      const existing = record[key];
      const merged = mergeEntity(kind, existing, entity);
      if (existing && sameContent(existing, merged)) {
        if (merged.rev > existing.rev) record[key] = { ...existing, rev: merged.rev };
        continue;
      }
      record[key] = merged;
      changed++;
      onChange?.(kind, key, merged);
    }
  }
  if (changes.settings) {
    const merged = mergeSettings(state.settings, changes.settings);
    if (!sameContent(state.settings, merged)) {
      state.settings = merged;
      changed++;
      onChange?.('settings', 'settings', merged);
    } else if (merged.rev > state.settings.rev) {
      state.settings = { ...state.settings, rev: merged.rev };
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Clock skew

const TIMESTAMP_KEYS = new Set([
  'updatedAt',
  'notesUpdatedAt',
  'deletedAt',
  'completedAt',
  'createdAt',
  'doneAt',
  'plannedAt',
  'at',
  'start',
]);

/** Returns a deep copy with any timestamp more than 5 minutes ahead of `now` set to `now`. */
export function clampFuture<T>(value: T, now: Date): T {
  const limit = now.getTime() + MAX_CLOCK_SKEW_MS;
  const nowIso = now.toISOString();
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        out[k] = TIMESTAMP_KEYS.has(k) && typeof x === 'string' && Date.parse(x) > limit ? nowIso : walk(x);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
