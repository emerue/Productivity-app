import {
  archiveTask,
  COMPLETED_ARCHIVE_DAYS,
  logicalDate,
  shouldAutoArchive,
  TOMBSTONE_TTL_DAYS,
  type Task,
} from '@frog/shared';
import cron from 'node-cron';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, writeFileAtomic } from './atomic.js';
import { backupStore } from './backups.js';
import type { Logger, StoreManager } from './manager.js';

const DAY_MS = 86_400_000;

/** Removes tombstones (lists, tasks, steps) older than 30 days. Returns how many. */
export function purgeTombstones(manager: StoreManager, now: Date = new Date()): number {
  const cutoff = now.getTime() - TOMBSTONE_TTL_DAYS * DAY_MS;
  const expired = (deletedAt: string | undefined, updatedAt: string) =>
    Date.parse(deletedAt ?? updatedAt) < cutoff;
  let purged = 0;
  manager.mutate((store) => {
    for (const [id, list] of Object.entries(store.lists)) {
      if (list.deleted && expired(list.deletedAt, list.updatedAt)) {
        delete store.lists[id];
        purged++;
      }
    }
    for (const [id, task] of Object.entries(store.tasks)) {
      if (task.deleted && expired(task.deletedAt, task.updatedAt)) {
        delete store.tasks[id];
        purged++;
        continue;
      }
      const kept = task.subtasks.filter((s) => !(s.deleted && expired(s.deletedAt, s.updatedAt)));
      if (kept.length !== task.subtasks.length) {
        purged += task.subtasks.length - kept.length;
        store.tasks[id] = { ...task, subtasks: kept };
      }
    }
  });
  return purged;
}

/** Archives Drop tasks with no update for `dropArchiveDays`. */
export function autoArchiveDrop(manager: StoreManager, now: Date = new Date()): number {
  const { settings } = manager.store;
  const ctx = {
    today: logicalDate(now, settings),
    urgencyWindowDays: settings.urgencyWindowDays,
    dropArchiveDays: settings.dropArchiveDays,
  };
  const iso = now.toISOString();
  const ids = Object.values(manager.store.tasks)
    .filter((t) => shouldAutoArchive(t, ctx))
    .map((t) => t.id);
  if (ids.length === 0) return 0;
  manager.mutate((store) => {
    for (const id of ids) store.tasks[id] = archiveTask(store.tasks[id]!, iso);
  });
  for (const id of ids) manager.stamp('tasks', id);
  return ids.length;
}

/**
 * Moves tasks completed more than 90 days ago to `archive/YYYY.json`, then
 * tombstones them in the live store so every device drops them.
 */
export async function archiveCompleted(
  manager: StoreManager,
  dataDir: string,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = now.getTime() - COMPLETED_ARCHIVE_DAYS * DAY_MS;
  const old = Object.values(manager.store.tasks).filter(
    (t) => !t.deleted && t.status === 'done' && t.completedAt && Date.parse(t.completedAt) < cutoff,
  );
  if (old.length === 0) return 0;

  const byYear = new Map<string, Task[]>();
  for (const t of old) {
    const year = (t.completedAt as string).slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), t]);
  }
  const dir = path.join(dataDir, 'archive');
  await ensureDir(dir);
  for (const [year, tasks] of byYear) {
    const file = path.join(dir, `${year}.json`);
    const existing = existsSync(file)
      ? (JSON.parse(await readFile(file, 'utf8')) as { tasks: Record<string, Task> })
      : { tasks: {} };
    for (const t of tasks) existing.tasks[t.id] = t;
    await writeFileAtomic(file, JSON.stringify(existing, null, 2));
  }

  const iso = now.toISOString();
  manager.mutate((store) => {
    for (const t of old) {
      const current = store.tasks[t.id];
      if (current)
        store.tasks[t.id] = { ...current, deleted: true, deletedAt: iso, updatedAt: iso };
    }
  });
  for (const t of old) manager.stamp('tasks', t.id);
  return old.length;
}

export async function runNightly(
  manager: StoreManager,
  dataDir: string,
  logger: Logger,
  now = new Date(),
) {
  const archived = autoArchiveDrop(manager, now);
  const moved = await archiveCompleted(manager, dataDir, now);
  const purged = purgeTombstones(manager, now);
  logger.info(
    `Nightly: auto-archived ${archived}, moved ${moved} to archive, purged ${purged} tombstones`,
  );
}

/** Schedules backups and maintenance in the user's timezone. */
export function startJobs(
  manager: StoreManager,
  dataDir: string,
  logger: Logger,
): { stop: () => void } {
  const timezone = manager.store.settings.timezone;
  const safely = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`${name} failed`, err);
    }
  };
  const tasks = [
    cron.schedule(
      '0 * * * *',
      safely('Hourly backup', () => backupStore(manager, dataDir, 'hourly')),
      {
        timezone,
      },
    ),
    cron.schedule(
      '0 3 * * *',
      safely('Daily backup', () => backupStore(manager, dataDir, 'daily')),
      {
        timezone,
      },
    ),
    cron.schedule(
      '10 3 * * *',
      safely('Nightly jobs', () => runNightly(manager, dataDir, logger)),
      {
        timezone,
      },
    ),
  ];
  return {
    stop: () => {
      for (const t of tasks) void t.stop();
    },
  };
}
