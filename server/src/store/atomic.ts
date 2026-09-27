import { chmod, mkdir, open, rename } from 'node:fs/promises';
import path from 'node:path';

export const FILE_MODE = 0o600;
export const DIR_MODE = 0o700;

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: DIR_MODE });
}

/**
 * Crash-safe write: write `<file>.tmp`, fsync, close, then rename over the
 * target. The live file is never written in place, so a crash leaves either
 * the old file or the new one, never a partial one.
 */
export async function writeFileAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.tmp`;
  const handle = await open(tmp, 'w', FILE_MODE);
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
  await chmod(file, FILE_MODE).catch(() => undefined);
  await syncDir(path.dirname(file));
}

/** Persists the rename itself (POSIX). Not supported on Windows; ignored there. */
async function syncDir(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best effort.
  }
}
