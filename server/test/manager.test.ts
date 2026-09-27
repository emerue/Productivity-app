import {
  addSubtask,
  deleteTask,
  newTask,
  patchTask,
  setNotes,
  StoreSchema,
  updateSubtask,
  type Task,
} from '@frog/shared';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from '../src/store/atomic.js';
import { InvalidChangeError, StoreManager, SyncConflictError } from '../src/store/manager.js';
import { openManager, quietLogger, tempDir } from './helpers.js';

const T0 = '2026-09-27T09:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const NOW = new Date(at(120));

function firstListId(m: StoreManager) {
  return Object.values(m.store.lists)[0]!.id;
}

function readStore(file: string) {
  return readFile(file, 'utf8').then((s) => StoreSchema.parse(JSON.parse(s)));
}

describe('first boot and persistence', () => {
  it('creates a seeded store with the four lists and default settings', async () => {
    const m = await openManager();
    const names = Object.values(m.store.lists).map((l) => l.name);
    expect(names).toEqual(['Heirs', 'Siren', 'ABZUURD', 'Personal']);
    expect(m.store.settings.timezone).toBe('Africa/Lagos');
    expect(m.store.lists[m.store.settings.defaultListId]?.name).toBe('Personal');
    expect(existsSync(m.file)).toBe(true);
  });

  it('flushes changes to disk and reloads them', async () => {
    const dir = await tempDir();
    const m = await openManager(dir);
    const task = newTask({ title: 'Persist me', listId: firstListId(m) }, T0);
    m.sync(
      { sinceRev: 0, changes: { lists: [], tasks: [task], days: [], focusSessions: [] } },
      NOW,
    );
    await m.flushNow();
    const reopened = await StoreManager.open({ dataDir: dir, logger: quietLogger });
    expect(reopened.store.tasks[task.id]?.title).toBe('Persist me');
  });

  it('ignores a leftover .tmp from an interrupted write (acceptance 10)', async () => {
    const dir = await tempDir();
    const m = await openManager(dir);
    await m.flushNow();
    const good = await readFile(m.file, 'utf8');
    // Simulate a crash after writing half of the temp file, before rename.
    await writeFile(`${m.file}.tmp`, good.slice(0, good.length / 2));
    const reopened = await StoreManager.open({ dataDir: dir, logger: quietLogger });
    expect(reopened.store.epoch).toBe(m.store.epoch);
    expect(existsSync(`${m.file}.tmp`)).toBe(false);
  });

  it('never leaves the live file partially written', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'x.json');
    await writeFileAtomic(file, '{"v":1}');
    await writeFileAtomic(file, '{"v":2}');
    expect(await readFile(file, 'utf8')).toBe('{"v":2}');
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it('refuses to start on an invalid store.json', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'store.json'), JSON.stringify({ schemaVersion: 1, rev: 'x' }));
    await expect(StoreManager.open({ dataDir: dir, logger: quietLogger })).rejects.toThrow(
      /validation/,
    );
  });

  it('serialises concurrent flushes', async () => {
    const m = await openManager();
    const listId = firstListId(m);
    const flushes: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      m.sync(
        {
          sinceRev: 0,
          changes: {
            lists: [],
            tasks: [newTask({ title: `t${i}`, listId }, T0)],
            days: [],
            focusSessions: [],
          },
        },
        NOW,
      );
      flushes.push(m.flushNow());
    }
    await Promise.all(flushes);
    const onDisk = await readStore(m.file);
    expect(Object.keys(onDisk.tasks)).toHaveLength(20);
  });
});

describe('sync', () => {
  const empty = { lists: [], tasks: [], days: [], focusSessions: [] };

  it('stamps revisions and returns only newer entities', async () => {
    const m = await openManager();
    const listId = firstListId(m);
    const a = newTask({ title: 'A', listId }, T0);
    const r1 = m.sync({ sinceRev: 0, changes: { ...empty, tasks: [a] } }, NOW);
    expect(r1.rev).toBe(1);
    expect(r1.changes.tasks.map((t) => t.id)).toContain(a.id);

    const b = newTask({ title: 'B', listId }, T0);
    const r2 = m.sync({ sinceRev: r1.rev, changes: { ...empty, tasks: [b] } }, NOW);
    expect(r2.rev).toBe(2);
    expect(r2.changes.tasks.map((t) => t.title)).toEqual(['B']);

    // Re-sending the same entity does not bump the revision.
    const r3 = m.sync({ sinceRev: r2.rev, changes: { ...empty, tasks: [b] } }, NOW);
    expect(r3.rev).toBe(2);
    expect(r3.changes.tasks).toEqual([]);
  });

  it('merges notes from one device and a ticked step from another (acceptance 8)', async () => {
    const m = await openManager();
    let base = newTask({ title: 'Q3 review', listId: firstListId(m) }, T0);
    const step = addSubtask(base, 'Draft SLA', T0);
    base = step.task;
    m.sync({ sinceRev: 0, changes: { ...empty, tasks: [base] } }, NOW);

    const laptop = setNotes(base, 'From the laptop', at(10));
    const phone = updateSubtask(base, step.subtask.id, { done: true }, at(11));
    m.sync({ sinceRev: 1, changes: { ...empty, tasks: [laptop] } }, NOW);
    const r = m.sync({ sinceRev: 1, changes: { ...empty, tasks: [phone] } }, NOW);

    const merged = r.changes.tasks[0] as Task;
    expect(merged.notes).toBe('From the laptop');
    expect(merged.subtasks[0]?.done).toBe(true);
  });

  it('keeps a deleted task deleted when another device edits it offline (acceptance 9)', async () => {
    const m = await openManager();
    const base = newTask({ title: 'Doomed', listId: firstListId(m) }, T0);
    m.sync({ sinceRev: 0, changes: { ...empty, tasks: [base] } }, NOW);
    m.sync({ sinceRev: 1, changes: { ...empty, tasks: [deleteTask(base, at(5))] } }, NOW);
    const r = m.sync(
      { sinceRev: 0, changes: { ...empty, tasks: [patchTask(base, { title: 'Edited' }, at(50))] } },
      NOW,
    );
    expect(m.store.tasks[base.id]?.deleted).toBe(true);
    expect(r.changes.tasks.find((t) => t.id === base.id)?.deleted).toBe(true);
  });

  it('clamps timestamps from a device clock that runs ahead', async () => {
    const m = await openManager();
    const t = patchTask(
      newTask({ title: 'x', listId: firstListId(m) }, T0),
      { title: 'Future' },
      '2030-01-01T00:00:00.000Z',
    );
    m.sync({ sinceRev: 0, changes: { ...empty, tasks: [t] } }, NOW);
    expect(m.store.tasks[t.id]?.updatedAt).toBe(NOW.toISOString());
  });

  it('rejects a stale epoch after an import', async () => {
    const m = await openManager();
    expect(() => m.sync({ sinceRev: 0, epoch: 'old-epoch', changes: empty }, NOW)).toThrow(
      SyncConflictError,
    );
  });

  it('refuses to delete the last list', async () => {
    const m = await openManager();
    const dead = Object.values(m.store.lists).map((l) => ({
      ...l,
      deleted: true,
      deletedAt: at(1),
      updatedAt: at(1),
    }));
    expect(() => m.sync({ sinceRev: 0, changes: { ...empty, lists: dead } }, NOW)).toThrow(
      InvalidChangeError,
    );
    expect(Object.values(m.store.lists).every((l) => !l.deleted)).toBe(true);
  });

  it('sends everything to a client that is ahead of the server', async () => {
    const m = await openManager();
    const r = m.sync({ sinceRev: 999, changes: empty }, NOW);
    expect(r.changes.lists).toHaveLength(0); // seeded lists are rev 0
    const t = newTask({ title: 'x', listId: firstListId(m) }, T0);
    m.sync({ sinceRev: 0, changes: { ...empty, tasks: [t] } }, NOW);
    expect(m.sync({ sinceRev: 999, changes: empty }, NOW).changes.tasks).toHaveLength(1);
  });
});
