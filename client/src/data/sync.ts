import type { Store, StoreEdit, SyncResponse } from '@frog/shared';
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
import { setSync, useData } from './store';
import { createSyncEngine, expiredTombstones } from './syncEngine';

/** The app's sync engine: HTTP to the server, IndexedDB for local data. */
const engine = createSyncEngine({
  store: useData,
  transport: {
    sync: (req) => api<SyncResponse>('/sync', { body: req }),
    loadStore: () => api<Store>('/store'),
  },
  persistence: { saveEntity, removeEntity, saveMeta, replaceAll },
  isOnline: () => navigator.onLine,
});

export type Commit = StoreEdit;

/**
 * The single write path for local edits: update state immediately, persist to
 * IndexedDB, add to the outbox, schedule a sync.
 */
export const commit = engine.commit;
export const scheduleSync = engine.scheduleSync;
export const syncNow = engine.syncNow;

// ---------------------------------------------------------------------------
// Sync loop

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
  engine.resumeOutbox(snapshot.outbox);
  useData.setState({ ...snapshot, status: 'ready' });
}

/** Drops local tombstones older than the server's purge window. */
function purgeLocalTombstones(snapshot: LocalSnapshot): void {
  for (const [kind, id] of expiredTombstones(snapshot, Date.now())) {
    delete snapshot[kind][id];
    void removeEntity(kind, id);
  }
}

/** The server store was replaced (import). Local data is replaced to match. */
export async function reloadFromServer(): Promise<void> {
  try {
    await engine.loadFromServer();
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
    await engine.loadFromServer();
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
  await engine.loadFromServer();
  startSyncLoop();
}

export async function signOut(): Promise<void> {
  await api('/logout', { method: 'POST' }).catch(() => undefined);
  await clearAll();
  engine.resumeOutbox({});
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
