import {
  applyChanges,
  clampFuture,
  createSeedStore,
  mergeList,
  newEpoch,
  StoreSchema,
  type Changes,
  type EntityKind,
  type Store,
  type SyncRequest,
  type SyncResponse,
} from '@frog/shared';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { needsMigration, runMigrations } from '../migrations/index.js';
import { ensureDir, writeFileAtomic } from './atomic.js';

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

export const consoleLogger: Logger = {
  info: (msg) => console.log(`[frog] ${msg}`),
  error: (msg, err) => console.error(`[frog] ${msg}`, err ?? ''),
};

export class SyncConflictError extends Error {
  constructor(readonly epoch: string) {
    super('Store was replaced. Reload the full store.');
  }
}

export class InvalidChangeError extends Error {}

export interface ManagerOptions {
  dataDir: string;
  /** Minimum gap between disk flushes. */
  flushDelayMs?: number;
  logger?: Logger;
  /** Called with the raw store before a migration runs (backup hook). */
  beforeMigrate?: (file: string) => Promise<void>;
}

const KINDS: EntityKind[] = ['lists', 'tasks', 'days', 'focusSessions'];

/**
 * Owns the store. Reads are served from memory. Every change updates memory
 * immediately and schedules a debounced flush; disk writes run one at a time on
 * a single promise chain.
 */
export class StoreManager {
  readonly file: string;
  private state: Store;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private lastFlushError: unknown = null;
  private readonly flushDelayMs: number;
  private readonly logger: Logger;

  private constructor(file: string, state: Store, opts: ManagerOptions) {
    this.file = file;
    this.state = state;
    this.flushDelayMs = opts.flushDelayMs ?? 500;
    this.logger = opts.logger ?? consoleLogger;
  }

  static async open(opts: ManagerOptions): Promise<StoreManager> {
    await ensureDir(opts.dataDir);
    const file = path.join(opts.dataDir, 'store.json');
    const logger = opts.logger ?? consoleLogger;
    // A leftover .tmp is an interrupted write; the live file is still the good one.
    await rm(`${file}.tmp`, { force: true });

    if (!existsSync(file)) {
      const manager = new StoreManager(file, createSeedStore(new Date().toISOString()), opts);
      logger.info(`First boot: created ${file}`);
      await manager.flushNow();
      return manager;
    }

    let raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const migrate = needsMigration(raw);
    if (migrate) {
      await opts.beforeMigrate?.(file);
      raw = runMigrations(raw);
      logger.info(`Migrated store to schema v${String(raw.schemaVersion)}`);
    }
    const parsed = StoreSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`store.json failed validation: ${parsed.error.message}`);
    }
    const manager = new StoreManager(file, parsed.data, opts);
    if (migrate) {
      manager.markDirty();
      await manager.flushNow();
    }
    return manager;
  }

  get store(): Readonly<Store> {
    return this.state;
  }

  get healthy(): boolean {
    return this.lastFlushError === null;
  }

  /** Applies a synchronous mutation in memory and schedules a flush. */
  mutate<T>(fn: (store: Store) => T): T {
    const result = fn(this.state);
    this.markDirty();
    return result;
  }

  /** Stamps a changed entity with the next store revision. */
  stamp(kind: EntityKind | 'settings', key: string): void {
    const rev = ++this.state.rev;
    if (kind === 'settings') {
      this.state.settings = { ...this.state.settings, rev };
    } else {
      const record = this.state[kind] as Record<string, { rev: number }>;
      const entity = record[key];
      if (entity) record[key] = { ...entity, rev };
    }
  }

  sync(req: SyncRequest, now: Date = new Date()): SyncResponse {
    if (req.epoch && req.epoch !== this.state.epoch) throw new SyncConflictError(this.state.epoch);

    const changes = clampFuture(req.changes, now);
    this.assertListsRemain(changes);

    const changed = applyChanges(this.state, changes, (kind, key) => this.stamp(kind, key));
    if (changed > 0) this.markDirty();

    // A client ahead of the server (e.g. after a restore from backup) gets everything.
    const since = req.sinceRev > this.state.rev ? 0 : req.sinceRev;
    return { rev: this.state.rev, epoch: this.state.epoch, changes: this.changesSince(since) };
  }

  changesSince(rev: number): Changes {
    const out: Changes = { lists: [], tasks: [], days: [], focusSessions: [] };
    for (const kind of KINDS) {
      const bucket = out[kind] as { rev: number }[];
      for (const entity of Object.values(this.state[kind] as Record<string, { rev: number }>)) {
        if (entity.rev > rev) bucket.push(entity);
      }
    }
    if (this.state.settings.rev > rev) out.settings = this.state.settings;
    return out;
  }

  /** Replaces the whole store (import). Caller must have validated it. */
  async replace(next: Store): Promise<Store> {
    const rev = Math.max(next.rev, this.state.rev) + 1;
    this.state = { ...next, rev, epoch: newEpoch() };
    this.markDirty();
    await this.flushNow();
    return this.state;
  }

  /** Rejects a batch that would leave the store with no live list. */
  private assertListsRemain(changes: Changes): void {
    if (changes.lists.length === 0) return;
    const lists = { ...this.state.lists };
    for (const l of changes.lists) lists[l.id] = lists[l.id] ? mergeList(lists[l.id]!, l) : l;
    if (!Object.values(lists).some((l) => !l.deleted)) {
      throw new InvalidChangeError('At least one list must remain.');
    }
  }

  markDirty(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushNow();
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  /** Writes the store now (queued behind any write in progress). */
  flushNow(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.writeChain = this.writeChain.then(() => this.writeOnce());
    return this.writeChain;
  }

  private async writeOnce(): Promise<void> {
    if (!this.dirty && existsSync(this.file)) return;
    this.dirty = false;
    const snapshot = JSON.stringify(this.state, null, 2);
    const check = StoreSchema.safeParse(this.state);
    if (!check.success) {
      this.lastFlushError = check.error;
      this.logger.error('Refusing to write an invalid store', check.error.message);
      return;
    }
    try {
      await writeFileAtomic(this.file, snapshot);
      this.lastFlushError = null;
    } catch (err) {
      this.dirty = true;
      this.lastFlushError = err;
      this.logger.error('Failed to write store.json', err);
    }
  }

  /** Flushes and stops timers. Call on shutdown. */
  async close(): Promise<void> {
    await this.flushNow();
  }
}
