import { SCHEMA_VERSION } from '@frog/shared';

/**
 * Sequential schema migrations. Each one takes a raw store at `from` and
 * returns it at `from + 1`. Add new migrations to the end; never edit old ones.
 *
 * Example for a future v2:
 *   { from: 1, up: (s) => ({ ...s, schemaVersion: 2, newField: [] }) }
 */
export interface Migration {
  from: number;
  up: (store: Record<string, unknown>) => Record<string, unknown>;
}

export const migrations: Migration[] = [];

export function needsMigration(raw: Record<string, unknown>): boolean {
  return typeof raw.schemaVersion === 'number' && raw.schemaVersion < SCHEMA_VERSION;
}

export function runMigrations(raw: Record<string, unknown>): Record<string, unknown> {
  let store = raw;
  let version = typeof store.schemaVersion === 'number' ? store.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `store.json is schema v${version}, newer than this build (v${SCHEMA_VERSION}). Update the app.`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const migration = migrations.find((m) => m.from === version);
    if (!migration) throw new Error(`No migration from schema v${version}.`);
    store = migration.up(store);
    version += 1;
    if (store.schemaVersion !== version)
      throw new Error(`Migration from v${version - 1} did not set v${version}.`);
  }
  return store;
}
