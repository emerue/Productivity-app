import type { EntityKind, EntityMap, Settings, Store } from '@frog/shared';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * IndexedDB is the client's offline data layer: a full copy of the store plus
 * the outbox. Entities are stored one row each so an edit writes one row.
 */
interface FrogDB extends DBSchema {
  entities: { key: string; value: { kind: EntityKind; value: EntityMap[EntityKind] } };
  meta: { key: string; value: unknown };
}

export interface LocalSnapshot {
  lists: Store['lists'];
  tasks: Store['tasks'];
  days: Store['days'];
  focusSessions: Store['focusSessions'];
  settings: Settings;
  rev: number;
  epoch: string;
  outbox: Record<string, number>;
}

let dbPromise: Promise<IDBPDatabase<FrogDB>> | null = null;

function db(): Promise<IDBPDatabase<FrogDB>> {
  dbPromise ??= openDB<FrogDB>('frog', 1, {
    upgrade(database) {
      database.createObjectStore('entities');
      database.createObjectStore('meta');
    },
  });
  return dbPromise;
}

const rowKey = (kind: EntityKind, key: string) => `${kind}:${key}`;

export async function loadLocal(): Promise<LocalSnapshot | null> {
  const d = await db();
  const settings = (await d.get('meta', 'settings')) as Settings | undefined;
  const epoch = (await d.get('meta', 'epoch')) as string | undefined;
  if (!settings || !epoch) return null;
  const snapshot: LocalSnapshot = {
    lists: {},
    tasks: {},
    days: {},
    focusSessions: {},
    settings,
    epoch,
    rev: ((await d.get('meta', 'rev')) as number | undefined) ?? 0,
    outbox: ((await d.get('meta', 'outbox')) as Record<string, number> | undefined) ?? {},
  };
  let cursor = await d.transaction('entities').store.openCursor();
  while (cursor) {
    const { kind, value } = cursor.value;
    const key = cursor.key.slice(kind.length + 1);
    (snapshot[kind] as Record<string, unknown>)[key] = value;
    cursor = await cursor.continue();
  }
  return snapshot;
}

// Writes are coalesced into one transaction per tick.
type PendingWrite =
  | {
      store: 'entities';
      key: string;
      value: { kind: EntityKind; value: EntityMap[EntityKind] } | null;
    }
  | { store: 'meta'; key: string; value: unknown };

let pending = new Map<string, PendingWrite>();
let scheduled: Promise<void> | null = null;

function schedule(): Promise<void> {
  scheduled ??= Promise.resolve().then(async () => {
    const batch = pending;
    pending = new Map();
    scheduled = null;
    const d = await db();
    const tx = d.transaction(['entities', 'meta'], 'readwrite');
    for (const w of batch.values()) {
      if (w.store === 'entities') {
        if (w.value === null) void tx.objectStore('entities').delete(w.key);
        else void tx.objectStore('entities').put(w.value, w.key);
      } else {
        void tx.objectStore('meta').put(w.value, w.key);
      }
    }
    await tx.done;
  });
  return scheduled;
}

export function saveEntity<K extends EntityKind>(
  kind: K,
  key: string,
  value: EntityMap[K],
): Promise<void> {
  const k = rowKey(kind, key);
  pending.set(`e:${k}`, { store: 'entities', key: k, value: { kind, value } });
  return schedule();
}

export function removeEntity(kind: EntityKind, key: string): Promise<void> {
  const k = rowKey(kind, key);
  pending.set(`e:${k}`, { store: 'entities', key: k, value: null });
  return schedule();
}

export function saveMeta(key: string, value: unknown): Promise<void> {
  pending.set(`m:${key}`, { store: 'meta', key, value });
  return schedule();
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}

export async function deleteMeta(key: string): Promise<void> {
  await (await db()).delete('meta', key);
}

/** Replaces all local data with a server store (first load, or after an import). */
export async function replaceAll(store: Store): Promise<void> {
  await schedule();
  const d = await db();
  const tx = d.transaction(['entities', 'meta'], 'readwrite');
  const entities = tx.objectStore('entities');
  await entities.clear();
  for (const kind of ['lists', 'tasks', 'days', 'focusSessions'] as const) {
    for (const [key, value] of Object.entries(store[kind])) {
      void entities.put({ kind, value }, rowKey(kind, key));
    }
  }
  const meta = tx.objectStore('meta');
  void meta.put(store.settings, 'settings');
  void meta.put(store.rev, 'rev');
  void meta.put(store.epoch, 'epoch');
  void meta.put({}, 'outbox');
  await tx.done;
}

/** Sign out: remove every trace of the store from this device. */
export async function clearAll(): Promise<void> {
  pending = new Map();
  const d = await db();
  const tx = d.transaction(['entities', 'meta'], 'readwrite');
  await tx.objectStore('entities').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
}
