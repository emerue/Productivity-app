import {
  applyChanges,
  entityKey,
  TOMBSTONE_TTL_DAYS,
  type Changes,
  type EntityKind,
  type EntityMap,
  type Settings,
  type Store,
  type StoreEdit,
  type SyncRequest,
  type SyncResponse,
} from '@frog/shared';
import type { StoreApi } from 'zustand';
import type { DataState, SyncState } from './store';

/**
 * The client half of the sync protocol, with the network and local storage
 * passed in as adapters (HTTP + IndexedDB in the app, an in-memory server and
 * a Map in tests). It owns the outbox: every local edit gets a sequence
 * number, and an outbox entry is acknowledged only if it wasn't edited again
 * while its sync was in flight.
 */

export interface SyncTransport {
  /** Throws an error with a numeric `status` (401, 409, 400…; 0 = unreachable). */
  sync(req: SyncRequest): Promise<SyncResponse>;
  loadStore(): Promise<Store>;
}

export interface SyncPersistence {
  saveEntity<K extends EntityKind>(kind: K, key: string, value: EntityMap[K]): unknown;
  removeEntity(kind: EntityKind, key: string): unknown;
  saveMeta(key: string, value: unknown): unknown;
  replaceAll(store: Store): Promise<void>;
}

export interface SyncEngineDeps {
  store: Pick<StoreApi<DataState>, 'getState' | 'setState'>;
  transport: SyncTransport;
  persistence: SyncPersistence;
  isOnline: () => boolean;
  /** Runs `fn` after `ms`; returns a cancel function. Defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => () => void;
  log?: (message: string, err: unknown) => void;
}

export interface SyncEngine {
  /** The single write path for local edits: state, local storage, outbox, sync soon. */
  commit(edit: StoreEdit): void;
  scheduleSync(delay?: number): void;
  syncNow(): Promise<void>;
  /** Replaces local data with the server's store (first load, or after an import). */
  loadFromServer(): Promise<void>;
  /** Continues outbox numbering after loading a local snapshot. */
  resumeOutbox(outbox: Record<string, number>): void;
}

const KINDS: EntityKind[] = ['lists', 'tasks', 'days', 'focusSessions'];

const statusOf = (err: unknown): number =>
  typeof (err as { status?: unknown })?.status === 'number'
    ? (err as { status: number }).status
    : -1;

function defaultSchedule(fn: () => void, ms: number): () => void {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
}

/** The entities named by outbox keys (`kind:id`, or `settings`). */
export function buildChanges(s: DataState, keys: string[]): Changes {
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

/** Outbox entries still pending after `sent` was acknowledged. */
export function acknowledge(
  outbox: Record<string, number>,
  sent: Record<string, number>,
): Record<string, number> {
  const next = { ...outbox };
  for (const [key, n] of Object.entries(sent)) if (next[key] === n) delete next[key];
  return next;
}

/**
 * Local tombstones older than the server's purge window, unless still waiting
 * to be sent. Returns `kind:id` keys to remove.
 */
export function expiredTombstones(
  snapshot: Pick<DataState, 'lists' | 'tasks' | 'outbox'>,
  nowMs: number,
): [kind: 'lists' | 'tasks', id: string][] {
  const cutoff = nowMs - TOMBSTONE_TTL_DAYS * 86_400_000;
  const out: [kind: 'lists' | 'tasks', id: string][] = [];
  for (const kind of ['lists', 'tasks'] as const) {
    const record = snapshot[kind] as Record<string, { deleted?: boolean; deletedAt?: string }>;
    for (const [id, e] of Object.entries(record)) {
      if (
        e.deleted &&
        e.deletedAt &&
        Date.parse(e.deletedAt) < cutoff &&
        !snapshot.outbox[`${kind}:${id}`]
      )
        out.push([kind, id]);
    }
  }
  return out;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { store, transport, persistence, isOnline } = deps;
  const schedule = deps.schedule ?? defaultSchedule;
  const log = deps.log ?? ((m, e) => console.error(`[frog] ${m}`, e));
  const setSync = (patch: Partial<SyncState>) =>
    store.setState({ sync: { ...store.getState().sync, ...patch } });

  let seq = 0;
  let cancel: (() => void) | undefined;
  let inFlight: Promise<void> | null = null;
  let rerun = false;

  function commit(edit: StoreEdit): void {
    const s = store.getState();
    const outbox = { ...s.outbox };
    const next: Partial<DataState> = { outbox };
    for (const kind of KINDS) {
      const items = edit[kind];
      if (!items?.length) continue;
      const record = { ...(s[kind] as Record<string, unknown>) };
      for (const entity of items) {
        const key = entityKey(kind, entity as never);
        record[key] = entity;
        outbox[`${kind}:${key}`] = ++seq;
        void persistence.saveEntity(kind, key, entity as never);
      }
      (next as Record<string, unknown>)[kind] = record;
    }
    if (edit.settings) {
      next.settings = edit.settings;
      outbox.settings = ++seq;
      void persistence.saveMeta('settings', edit.settings);
    }
    store.setState(next);
    void persistence.saveMeta('outbox', outbox);
    scheduleSync(1000);
  }

  function scheduleSync(delay = 1000): void {
    cancel?.();
    cancel = schedule(() => void syncNow(), delay);
  }

  function syncNow(): Promise<void> {
    if (store.getState().status !== 'ready') return Promise.resolve();
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

  async function runSync(): Promise<void> {
    const s = store.getState();
    if (!isOnline()) {
      setSync({ online: false, settled: true });
      return;
    }
    const sent = { ...s.outbox };
    setSync({ syncing: true, online: true });
    try {
      const res = await transport.sync({
        sinceRev: s.rev,
        epoch: s.epoch,
        changes: buildChanges(s, Object.keys(sent)),
      });
      applyServerChanges(res, sent);
      setSync({ failures: 0, authRequired: false });
    } catch (err) {
      const status = statusOf(err);
      if (status === 401) {
        setSync({ authRequired: true });
      } else if (status === 409) {
        try {
          await loadFromServer();
        } catch (e) {
          log('Reload after import failed', e);
        }
      } else {
        setSync({ failures: store.getState().sync.failures + 1, online: isOnline() });
        if (status === 400) log('Server rejected local changes', err);
      }
    } finally {
      setSync({ syncing: false, settled: true });
    }
  }

  /** Merges server entities with the same rules as the server; acknowledges sent outbox items. */
  function applyServerChanges(res: SyncResponse, sent: Record<string, number>): void {
    const s = store.getState();
    const next = {
      lists: { ...s.lists },
      tasks: { ...s.tasks },
      days: { ...s.days },
      focusSessions: { ...s.focusSessions },
      settings: s.settings as Settings,
    };
    applyChanges(next, res.changes);
    const outbox = acknowledge(s.outbox, sent);
    store.setState({ ...next, rev: res.rev, outbox });

    for (const kind of KINDS) {
      for (const entity of res.changes[kind] as { id?: string; date?: string }[]) {
        const key = entityKey(kind, entity as never);
        const merged = (next[kind] as Record<string, unknown>)[key];
        if (merged) void persistence.saveEntity(kind, key, merged as never);
      }
    }
    if (res.changes.settings) void persistence.saveMeta('settings', next.settings);
    void persistence.saveMeta('rev', res.rev);
    void persistence.saveMeta('outbox', outbox);
  }

  async function loadFromServer(): Promise<void> {
    const remote = await transport.loadStore();
    await persistence.replaceAll(remote);
    seq = 0;
    store.setState({
      lists: remote.lists,
      tasks: remote.tasks,
      days: remote.days,
      focusSessions: remote.focusSessions,
      settings: remote.settings,
      rev: remote.rev,
      epoch: remote.epoch,
      outbox: {},
      status: 'ready',
    });
  }

  function resumeOutbox(outbox: Record<string, number>): void {
    seq = Math.max(0, ...Object.values(outbox));
  }

  return { commit, scheduleSync, syncNow, loadFromServer, resumeOutbox };
}
