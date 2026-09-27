import { addSubtask, completeTask, deleteTask, newTask, removeSubtask } from '@frog/shared';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupStore } from '../src/store/backups.js';
import { archiveCompleted, autoArchiveDrop, purgeTombstones } from '../src/store/jobs.js';
import type { StoreManager } from '../src/store/manager.js';
import { openManager, tempDir } from './helpers.js';

const empty = { lists: [], tasks: [], days: [], focusSessions: [] };
const listOf = (m: StoreManager) => Object.values(m.store.lists)[0]!.id;
const put = (m: StoreManager, tasks: ReturnType<typeof newTask>[]) =>
  m.sync({ sinceRev: 0, changes: { ...empty, tasks } }, new Date('2026-12-31T00:00:00Z'));

describe('purgeTombstones', () => {
  it('removes tombstones older than 30 days and keeps recent ones', async () => {
    const m = await openManager();
    const listId = listOf(m);
    const old = deleteTask(
      newTask({ title: 'old', listId }, '2026-08-01T00:00:00.000Z'),
      '2026-08-01T00:00:00.000Z',
    );
    const recent = deleteTask(
      newTask({ title: 'recent', listId }, '2026-09-20T00:00:00.000Z'),
      '2026-09-20T00:00:00.000Z',
    );
    const withStep = addSubtask(
      newTask({ title: 'steps', listId }, '2026-08-01T00:00:00.000Z'),
      's',
      '2026-08-01T00:00:00.000Z',
    );
    const stepped = removeSubtask(withStep.task, withStep.subtask.id, '2026-08-01T00:00:00.000Z');
    put(m, [old, recent, stepped]);

    const purged = purgeTombstones(m, new Date('2026-09-27T00:00:00Z'));
    expect(purged).toBe(2);
    expect(m.store.tasks[old.id]).toBeUndefined();
    expect(m.store.tasks[recent.id]).toBeDefined();
    expect(m.store.tasks[stepped.id]?.subtasks).toHaveLength(0);
  });
});

describe('autoArchiveDrop', () => {
  it('archives Drop tasks untouched for 14 days and stamps them for sync', async () => {
    const m = await openManager();
    const listId = listOf(m);
    const stale = newTask({ title: 'stale', listId, important: false }, '2026-09-01T09:00:00.000Z');
    const fresh = newTask({ title: 'fresh', listId, important: false }, '2026-09-25T09:00:00.000Z');
    put(m, [stale, fresh]);
    const revBefore = m.store.rev;
    expect(autoArchiveDrop(m, new Date('2026-09-27T09:00:00Z'))).toBe(1);
    expect(m.store.tasks[stale.id]?.status).toBe('archived');
    expect(m.store.tasks[stale.id]?.history.at(-1)?.type).toBe('archived');
    expect(m.store.tasks[stale.id]?.rev).toBeGreaterThan(revBefore);
    expect(m.store.tasks[fresh.id]?.status).toBe('open');
  });
});

describe('archiveCompleted', () => {
  it('moves tasks completed over 90 days ago to archive/YYYY.json and tombstones them', async () => {
    const dir = await tempDir();
    const m = await openManager(dir);
    const listId = listOf(m);
    const old = completeTask(
      newTask({ title: 'old', listId }, '2026-01-01T00:00:00.000Z'),
      '2026-02-01T00:00:00.000Z',
    );
    const recent = completeTask(
      newTask({ title: 'recent', listId }, '2026-09-01T00:00:00.000Z'),
      '2026-09-02T00:00:00.000Z',
    );
    put(m, [old, recent]);

    expect(await archiveCompleted(m, dir, new Date('2026-09-27T00:00:00Z'))).toBe(1);
    const archive = JSON.parse(await readFile(path.join(dir, 'archive', '2026.json'), 'utf8'));
    expect(archive.tasks[old.id].title).toBe('old');
    expect(m.store.tasks[old.id]?.deleted).toBe(true);
    expect(m.store.tasks[recent.id]?.deleted).toBeUndefined();
  });
});

describe('backups', () => {
  it('writes hourly backups and keeps the newest 48', async () => {
    const dir = await tempDir();
    const m = await openManager(dir);
    const start = Date.parse('2026-09-20T00:00:00Z');
    for (let h = 0; h < 50; h++)
      await backupStore(m, dir, 'hourly', new Date(start + h * 3_600_000));
    const files = (await readdir(path.join(dir, 'backups', 'hourly'))).sort();
    expect(files).toHaveLength(48);
    // Stamps are Lagos time (UTC+1): 50 backups from 01:00 on the 20th, oldest two pruned.
    expect(files[0]).toBe('store-20260920-03.json');
    expect(files.at(-1)).toBe('store-20260922-02.json');
  });

  it('writes daily backups with the date stamp', async () => {
    const dir = await tempDir();
    const m = await openManager(dir);
    const file = await backupStore(m, dir, 'daily', new Date('2026-09-27T02:00:00Z'));
    expect(path.basename(file)).toBe('store-20260927.json');
    expect(existsSync(file)).toBe(true);
  });
});
