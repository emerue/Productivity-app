import {
  applyChanges,
  entityKey,
  TOMBSTONE_TTL_DAYS,
  type Changes,
  type Day,
  type EntityKind,
  type FocusSession,
  type List,
  type Settings,
  type Store,
  type SyncResponse,
  type Task,
} from '@frog/shared';
import { api, ApiError } from './api';
import {
  clearAll,
  loadLocal,
  removeEntity,
  replaceAll,
  saveEntity,
  saveMeta,
  type LocalSnapshot,
} from './db';
import { setSync, useData, type DataState } from './store';

const KINDS: EntityKind[] = ['lists', 'tasks', 'days', 'focusSessions'];
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Local commits

export interface Commit {
  lists?: List[];
  tasks?: Task[];
  days?: Day[];
  focusSessions?: FocusSession[];
  settings?: Settings;
}

let seq = 0;

/**
 * The single write path for local edits: update state immediately, persist to
 * IndexedDB, add to the outbox, schedule a sync.
 */
export function commit(c: Commit): void {
  const s = useData.getState();
  const outbox = { ...s.outbox };
  const next: Partial<DataState> = { outbox };
  for (const kind of KINDS) {
    const items = c[kind];
    if (!items?.length) continue;
    const record = { ...(s[kind] as Record<string, unknown>) };
    for (const entity of items) {
      const key = entityKey(kind, entity as never);
      record[key] = entity;
      outbox[`${kind}:${key}`] = ++seq;
      void saveEntity(kind, key, entity as never);
    }
    (next as Record<string, unknown>)[kind] = record;
  }
  if (c.settings) {
    next.settings = c.settings;
    outbox.settings = ++seq;
    void saveMeta('settings', c.settings);
  }
  useData.setState(next);
  void saveMeta('outbox', outbox);
  scheduleSync(1000);
}

// ---------------------------------------------------------------------------
// Sync loop

let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight: Promise<void> | null = null;
let rerun = false;

export function scheduleSync(delay = 1000): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

export function syncNow(): Promise<void> {
  if (useData.getState().status !== 'ready') return Promise.resolve();
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = runSync().finally(() => {
    inFlight = null;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  });
  return inFlight;
}

function buildChanges(s: DataState, keys: string[]): Changes {
  const changes: Changes = { lists: [], tasks: [], days: [], focusSessions: [] };
  for (const key of keys) {
    if (key === 'settings') {
      changes.settings = s.settings;
      continue;
    }
    const [kind, id] = key.split(/:(.*)/s) as [EntityKind, string];
    const entity = (s[kind] as Record<string, unknown> | undefined)?.[id];
    if (entity) (changes[kind] as unknown[]).push(entity);
  }
  return changes;
}

async function runSync(): Promise<void> {
  const s = useData.getState();
  if (!navigator.onLine) {
    setSync({ online: false });
    return;
  }
  const sent = { ...s.outbox };
  setSync({ syncing: true, online: true });
  try {
    const res = await api<SyncResponse>('/sync', {
      body: { sinceRev: s.rev, epoch: s.epoch, changes: buildChanges(s, Object.keys(sent)) },
    });
    applyServerChanges(res, sent);
    setSync({ failures: 0, authRequired: false });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : -1;
    if (status === 401) {
      setSync({ authRequired: true });
    } else if (status === 409) {
      await reloadFromServer();
    } else {
      setSync({ failures: useData.getState().sync.failures + 1, online: navigator.onLine });
      if (status === 400) console.error('[frog] Server rejected local changes', err);
    }
  } finally {
    setSync({ syncing: false });
  }
}

/** Merges server entities with the same rules as the server; acknowledges sent outbox items. */
function applyServerChanges(res: SyncResponse, sent: Record<string, number>): void {
  const s = useData.getState();
  const next = {
    lists: { ...s.lists },
    tasks: { ...s.tasks },
    days: { ...s.days },
    focusSessions: { ...s.focusSessions },
    settings: s.settings,
  };
  applyChanges(next, res.changes);

  const outbox = { ...s.outbox };
  for (const [key, n] of Object.entries(sent)) if (outbox[key] === n) delete outbox[key];

  useData.setState({ ...next, rev: res.rev, outbox });

  for (const kind of KINDS) {
    for (const entity of res.changes[kind] as { id?: string; date?: string }[]) {
      const key = entityKey(kind, entity as never);
      const merged = (next[kind] as Record<string, unknown>)[key];
      if (merged) void saveEntity(kind, key, merged as never);
    }
  }
  if (res.changes.settings) void saveMeta('settings', next.settings);
  void saveMeta('rev', res.rev);
  void saveMeta('outbox', outbox);
}

let loopStarted = false;

export function startSyncLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  window.addEventListener('online', () => {
    setSync({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => setSync({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
  void syncNow();
}

// ---------------------------------------------------------------------------
// Boot, sign in, sign out

function hydrate(snapshot: LocalSnapshot): void {
  seq = Math.max(0, ...Object.values(snapshot.outbox));
  useData.setState({ ...snapshot, status: 'ready' });
}

/** Drops local tombstones older than the server's purge window. */
function purgeLocalTombstones(snapshot: LocalSnapshot): void {
  const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * DAY_MS;
  for (const kind of ['lists', 'tasks'] as const) {
    const record = snapshot[kind] as Record<string, { deleted?: boolean; deletedAt?: string }>;
    for (const [id, e] of Object.entries(record)) {
      if (
        e.deleted &&
        e.deletedAt &&
        Date.parse(e.deletedAt) < cutoff &&
        !snapshot.outbox[`${kind}:${id}`]
      ) {
        delete record[id];
        void removeEntity(kind, id);
      }
    }
  }
}

async function loadFromServer(): Promise<void> {
  const store = await api<Store>('/store');
  await replaceAll(store);
  seq = 0;
  useData.setState({
    lists: store.lists,
    tasks: store.tasks,
    days: store.days,
    focusSessions: store.focusSessions,
    settings: store.settings,
    rev: store.rev,
    epoch: store.epoch,
    outbox: {},
    status: 'ready',
  });
}

/** The server store was replaced (import). Local data is replaced to match. */
async function reloadFromServer(): Promise<void> {
  try {
    await loadFromServer();
  } catch (err) {
    console.error('[frog] Reload after import failed', err);
  }
}

export async function boot(): Promise<void> {
  const local = await loadLocal().catch(() => null);
  if (local) {
    purgeLocalTombstones(local);
    hydrate(local);
    startSyncLoop();
    return;
  }
  try {
    await api('/session');
    await loadFromServer();
    startSyncLoop();
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    useData.setState({ status: status === 401 ? 'signedOut' : 'offlineNoData' });
  }
}

export async function signIn(password: string): Promise<void> {
  await api('/login', { body: { password } });
  if (useData.getState().status === 'ready') {
    setSync({ authRequired: false });
    void syncNow();
    return;
  }
  await loadFromServer();
  startSyncLoop();
}

export async function signOut(): Promise<void> {
  await api('/logout', { method: 'POST' }).catch(() => undefined);
  await clearAll();
  seq = 0;
  useData.setState({
    status: 'signedOut',
    lists: {},
    tasks: {},
    days: {},
    focusSessions: {},
    outbox: {},
    rev: 0,
    epoch: '',
    sync: { ...useData.getState().sync, authRequired: false, failures: 0 },
  });
}
