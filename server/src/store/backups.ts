import { formatInTimeZone } from 'date-fns-tz';
import { chmod, copyFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, FILE_MODE } from './atomic.js';
import type { StoreManager } from './manager.js';

export type BackupKind = 'hourly' | 'daily' | 'pre-migration' | 'pre-import';

export const BACKUP_KEEP: Record<BackupKind, number> = {
  hourly: 48,
  daily: 30,
  'pre-migration': 20,
  'pre-import': 20,
};

const STAMP: Record<BackupKind, string> = {
  hourly: 'yyyyMMdd-HH',
  daily: 'yyyyMMdd',
  'pre-migration': 'yyyyMMdd-HHmmss',
  'pre-import': 'yyyyMMdd-HHmmss',
};

/** Copies `file` into `backups/<kind>/store-<stamp>.json` and prunes old copies. */
export async function backupFile(
  file: string,
  dataDir: string,
  kind: BackupKind,
  now: Date = new Date(),
  timezone = 'UTC',
): Promise<string> {
  const dir = path.join(dataDir, 'backups', kind);
  await ensureDir(dir);
  const target = path.join(dir, `store-${formatInTimeZone(now, timezone, STAMP[kind])}.json`);
  await copyFile(file, target);
  await chmod(target, FILE_MODE).catch(() => undefined);
  await pruneBackups(dir, BACKUP_KEEP[kind]);
  return target;
}

/** Flushes pending changes, then backs up the live file. */
export async function backupStore(
  manager: StoreManager,
  dataDir: string,
  kind: BackupKind,
  now: Date = new Date(),
): Promise<string> {
  await manager.flushNow();
  return backupFile(manager.file, dataDir, kind, now, manager.store.settings.timezone);
}

/** Stamps sort chronologically, so keep the last `keep` names. */
export async function pruneBackups(dir: string, keep: number): Promise<void> {
  const files = (await readdir(dir)).filter((f) => /^store-.*\.json$/.test(f)).sort();
  const excess = files.slice(0, Math.max(0, files.length - keep));
  await Promise.all(excess.map((f) => rm(path.join(dir, f), { force: true })));
}
