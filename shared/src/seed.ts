import {
  DEFAULT_LIST_NAME,
  DEFAULT_LIST_NAMES,
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
} from './constants.js';
import { newEpoch } from './ids.js';
import type { List, Settings, Store } from './schema.js';
import { newList } from './tasks.js';

export function defaultSettings(defaultListId: string, now: string): Settings {
  return {
    ...DEFAULT_SETTINGS,
    timerPresets: [...DEFAULT_SETTINGS.timerPresets],
    defaultListId,
    updatedAt: now,
    rev: 0,
  };
}

/** The store created on first boot: seeded lists and default settings. */
export function createSeedStore(now: string): Store {
  const lists: Record<string, List> = {};
  DEFAULT_LIST_NAMES.forEach((name, i) => {
    const list = newList(name, i, now);
    lists[list.id] = list;
  });
  const defaultList = Object.values(lists).find((l) => l.name === DEFAULT_LIST_NAME) as List;
  return {
    schemaVersion: SCHEMA_VERSION,
    epoch: newEpoch(),
    rev: 0,
    lists,
    tasks: {},
    days: {},
    focusSessions: {},
    settings: defaultSettings(defaultList.id, now),
    pushSubscriptions: [],
  };
}
