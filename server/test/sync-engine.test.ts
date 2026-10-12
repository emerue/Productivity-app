import { newTask, patchTask, type Store, type SyncRequest } from '@frog/shared';
import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { DataState } from '../../client/src/data/store.js';
import {
  acknowledge,
  createSyncEngine,
  expiredTombstones,
  type SyncEngine,
} from '../../client/src/data/syncEngine.js';
import { SyncConflictError, type StoreManager } from '../src/store/manager.js';
import { openManager } from './helpers.js';

/**
 * The client sync engine against a real (in-memory) StoreManager: two devices,
 * offline edits, edits made while a sync is in flight, and an import (409).
 */

const T0 = '2026-09-27T09:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

interface Device {
  engine: SyncEngine;
  state: () => DataState;
  online: boolean;
  /** Holds the next sync request until released. */
  hold: () => () => void;
}

function device(manager: StoreManager): Device {
  const seed = manager.store as Store;
  const store = createStore<DataState>()(() => ({
    status: 'ready',
    lists: {},
    tasks: {},
    days: {},
    focusSessions: {},
    settings: seed.settings,
    rev: 0,
    epoch: seed.epoch,
    outbox: {},
    sync: { online: true, failures: 0, authRequired: false, syncing: false, settled: false },
  }));
  let gate: Promise<void> | null = null;
  const d: Device = {
    online: true,
    state: () => store.getState(),
    hold: () => {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return release;
    },
    engine: createSyncEngine({
      store,
      isOnline: () => d.online,
      schedule: () => () => undefined,
      log: () => undefined,
      persistence: {
        saveEntity: () => undefined,
        removeEntity: () => undefined,
        saveMeta: () => undefined,
        replaceAll: async () => undefined,
      },
      transport: {
        sync: async (req: SyncRequest) => {
          // The request is built (and the outbox snapshotted) before this awaits.
          const body = structuredClone(req);
          if (gate) {
            const g = gate;
            gate = null;
            await g;
          }
          try {
            return structuredClone(manager.sync(body));
          } catch (err) {
            throw new HttpError(err instanceof SyncConflictError ? 409 : 400);
          }
        },
        loadStore: async () => structuredClone(manager.store as Store),
      },
    }),
  };
  return d;
}

const listId = (m: StoreManager) => Object.values(m.store.lists)[0]!.id;

describe('sync engine', () => {
  it('two devices converge, including offline edits', async () => {
    const m = await openManager();
    const a = device(m);
    const b = device(m);
    await a.engine.syncNow();
    await b.engine.syncNow();

    const t = newTask({ title: 'Draft SLA', listId: listId(m) }, at(1));
    a.engine.commit({ tasks: [t] });
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.state().tasks[t.id]?.title).toBe('Draft SLA');

    // B edits offline; A edits a different field later.
    b.online = false;
    b.engine.commit({
      tasks: [patchTask(b.state().tasks[t.id]!, { title: 'Draft SLA v2' }, at(2))],
    });
    await b.engine.syncNow();
    expect(b.state().outbox).not.toEqual({});
    a.engine.commit({ tasks: [patchTask(a.state().tasks[t.id]!, { important: false }, at(3))] });
    await a.engine.syncNow();

    b.online = true;
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(b.state().outbox).toEqual({});
    expect(a.state().tasks[t.id]).toEqual(b.state().tasks[t.id]);
    expect(a.state().tasks[t.id]).toEqual(m.store.tasks[t.id]);
  });

  it('an edit made while its sync is in flight stays in the outbox and goes next', async () => {
    const m = await openManager();
    const a = device(m);
    await a.engine.syncNow();
    const t = newTask({ title: 'One', listId: listId(m) }, at(1));
    a.engine.commit({ tasks: [t] });

    const release = a.hold();
    const first = a.engine.syncNow();
    a.engine.commit({ tasks: [patchTask(t, { title: 'Two' }, at(2))] });
    release();
    await first;
    // The rerun after the in-flight sync sends the second edit.
    await a.engine.syncNow();
    expect(m.store.tasks[t.id]?.title).toBe('Two');
    expect(a.state().outbox).toEqual({});
  });

  it('an import (409) replaces local data with the server store', async () => {
    const m = await openManager();
    const a = device(m);
    await a.engine.syncNow();
    const t = newTask({ title: 'Lost to import', listId: listId(m) }, at(1));
    a.engine.commit({ tasks: [t] });
    await m.replace({ ...(m.store as Store), tasks: {} });
    await a.engine.syncNow();
    expect(a.state().epoch).toBe(m.store.epoch);
    expect(a.state().tasks[t.id]).toBeUndefined();
    expect(a.state().outbox).toEqual({});
  });

  it('acknowledge keeps entries edited again since they were sent', () => {
    expect(acknowledge({ 'tasks:a': 3, 'tasks:b': 2 }, { 'tasks:a': 1, 'tasks:b': 2 })).toEqual({
      'tasks:a': 3,
    });
  });

  it('expiredTombstones skips ones still waiting to be sent', () => {
    const old = '2026-01-01T00:00:00.000Z';
    const dead = { deleted: true, deletedAt: old };
    const snapshot = {
      lists: {},
      tasks: { t_a: dead, t_b: dead } as unknown as DataState['tasks'],
      outbox: { 'tasks:t_b': 1 },
    };
    expect(expiredTombstones(snapshot, Date.parse(T0))).toEqual([['tasks', 't_a']]);
  });
});
