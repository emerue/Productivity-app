import type { Day, FocusSession, List, Settings, Task } from '@frog/shared';
import { create } from 'zustand';

export type BootStatus = 'loading' | 'signedOut' | 'offlineNoData' | 'ready';

export interface SyncState {
  online: boolean;
  /** Consecutive failed syncs while online. */
  failures: number;
  /** Server said 401; local data is kept, a banner asks to sign in again. */
  authRequired: boolean;
  syncing: boolean;
}

export interface DataState {
  status: BootStatus;
  lists: Record<string, List>;
  tasks: Record<string, Task>;
  days: Record<string, Day>;
  focusSessions: Record<string, FocusSession>;
  settings: Settings;
  rev: number;
  epoch: string;
  /** Entity keys (`kind:id`, or `settings`) waiting to be sent, with an edit counter. */
  outbox: Record<string, number>;
  sync: SyncState;
}

/** Placeholder until the real settings load; never persisted. */
const bootSettings: Settings = {
  planTime: '20:00',
  dayStartHour: 4,
  timezone: 'Africa/Lagos',
  timerPresets: [5, 25, 50],
  urgencyWindowDays: 2,
  dropArchiveDays: 14,
  defaultListId: 'l_none',
  wakeLock: true,
  sounds: true,
  theme: 'system',
  updatedAt: new Date(0).toISOString(),
  rev: 0,
};

export const useData = create<DataState>()(() => ({
  status: 'loading',
  lists: {},
  tasks: {},
  days: {},
  focusSessions: {},
  settings: bootSettings,
  rev: 0,
  epoch: '',
  outbox: {},
  sync: {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    failures: 0,
    authRequired: false,
    syncing: false,
  },
}));

export function setSync(patch: Partial<SyncState>): void {
  useData.setState((s) => ({ sync: { ...s.sync, ...patch } }));
}
