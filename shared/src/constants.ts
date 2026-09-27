/** Product name. Rename the app here. */
export const APP_NAME = 'Frog';

export const SCHEMA_VERSION = 1;

/** Max history events kept per task (oldest dropped). */
export const HISTORY_CAP = 100;

/** Tombstones older than this are purged by the nightly job. */
export const TOMBSTONE_TTL_DAYS = 30;

/** Completed tasks older than this move to archive/YYYY.json. */
export const COMPLETED_ARCHIVE_DAYS = 90;

/** Server clamps timestamps further than this into the future. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const DEFAULT_LIST_NAMES = ['Heirs', 'Siren', 'ABZUURD', 'Personal'] as const;
export const DEFAULT_LIST_NAME = 'Personal';

export const DEFAULT_SETTINGS = {
  planTime: '20:00',
  dayStartHour: 4,
  timezone: 'Africa/Lagos',
  timerPresets: [5, 25, 50],
  urgencyWindowDays: 2,
  dropArchiveDays: 14,
  wakeLock: true,
  sounds: true,
  theme: 'system',
} as const;

/** Soft target for My Day: Frog plus this many tasks. */
export const MY_DAY_SOFT_LIMIT = 4;

/** Past this many steps, suggest splitting the task. */
export const STEP_HINT_THRESHOLD = 5;
