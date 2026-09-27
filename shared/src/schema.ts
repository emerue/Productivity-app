import { z } from 'zod';
import { SCHEMA_VERSION } from './constants.js';

const isoDateTime = z.string().datetime({ offset: true });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const prefixedId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_-]{4,64}$`), `Expected ${prefix}_ id`);

export const TaskId = prefixedId('t');
export const SubtaskId = prefixedId('s');
export const ListId = prefixedId('l');
export const FocusSessionId = prefixedId('f');
export const HistoryId = prefixedId('h');

const rev = z.number().int().nonnegative();

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ListSchema = z.object({
  id: ListId,
  name: z.string().trim().min(1).max(80),
  order: z.number().finite(),
  updatedAt: isoDateTime,
  rev,
  deleted: z.boolean().optional(),
  deletedAt: isoDateTime.optional(),
  restore: z.boolean().optional(),
});

export const HISTORY_EVENT_TYPES = [
  'created',
  'completed',
  'reopened',
  'postponed',
  'addedToMyDay',
  'madeFrog',
  'movedQuadrant',
  'archived',
] as const;

export const HistoryEventSchema = z.object({
  id: HistoryId,
  type: z.enum(HISTORY_EVENT_TYPES),
  at: isoDateTime,
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const SubtaskSchema = z.object({
  id: SubtaskId,
  title: z.string().max(1000),
  done: z.boolean(),
  doneAt: isoDateTime.nullable(),
  order: z.number().finite(),
  updatedAt: isoDateTime,
  deleted: z.boolean().optional(),
  deletedAt: isoDateTime.optional(),
});

export const TaskSchema = z.object({
  id: TaskId,
  title: z.string().max(1000),
  listId: ListId,
  important: z.boolean(),
  urgentFlag: z.boolean(),
  due: dateStr.nullable(),
  waitingOn: z.string().max(200).nullable(),
  followUp: dateStr.nullable(),
  notes: z.string().max(200_000),
  notesUpdatedAt: isoDateTime,
  subtasks: z.array(SubtaskSchema).max(500),
  status: z.enum(['open', 'done', 'archived']),
  createdAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
  updatedAt: isoDateTime,
  rev,
  history: z.array(HistoryEventSchema).max(1000),
  deleted: z.boolean().optional(),
  deletedAt: isoDateTime.optional(),
  restore: z.boolean().optional(),
});

export const DaySchema = z.object({
  date: dateStr,
  frog: TaskId.nullable(),
  myDay: z.array(TaskId).max(200),
  planned: z.boolean(),
  plannedAt: isoDateTime.nullable(),
  updatedAt: isoDateTime,
  rev,
});

export const FocusSessionSchema = z.object({
  id: FocusSessionId,
  taskId: TaskId,
  start: isoDateTime,
  plannedMinutes: z.number().positive().max(600),
  actualMinutes: z.number().min(0).max(1440),
  completed: z.boolean(),
  rev,
});

export const SettingsSchema = z.object({
  planTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm'),
  dayStartHour: z.number().int().min(0).max(12),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
  timerPresets: z.array(z.number().int().min(1).max(240)).min(1).max(4),
  urgencyWindowDays: z.number().int().min(0).max(60),
  dropArchiveDays: z.number().int().min(1).max(365),
  defaultListId: ListId,
  wakeLock: z.boolean(),
  sounds: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  updatedAt: isoDateTime,
  rev,
});

export const PushSubscriptionSchema = z.object({ endpoint: z.string().url() }).passthrough();

export const StoreSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    epoch: z.string().min(1).max(64),
    rev,
    lists: z.record(ListSchema),
    tasks: z.record(TaskSchema),
    days: z.record(DaySchema),
    focusSessions: z.record(FocusSessionSchema),
    settings: SettingsSchema,
    pushSubscriptions: z.array(PushSubscriptionSchema),
  })
  .superRefine((store, ctx) => {
    const checkKeys = (name: string, rec: Record<string, { id?: string; date?: string }>) => {
      for (const [key, value] of Object.entries(rec)) {
        const own = value.id ?? value.date;
        if (own !== key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name, key],
            message: 'Key does not match id',
          });
        }
      }
    };
    checkKeys('lists', store.lists);
    checkKeys('tasks', store.tasks);
    checkKeys('days', store.days);
    checkKeys('focusSessions', store.focusSessions);
    const liveLists = Object.values(store.lists).filter((l) => !l.deleted);
    if (liveLists.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lists'],
        message: 'At least one list is required',
      });
    }
  });

export const ChangesSchema = z.object({
  lists: z.array(ListSchema).default([]),
  tasks: z.array(TaskSchema).default([]),
  days: z.array(DaySchema).default([]),
  focusSessions: z.array(FocusSessionSchema).default([]),
  settings: SettingsSchema.optional(),
});

export const SyncRequestSchema = z.object({
  sinceRev: rev,
  epoch: z.string().optional(),
  changes: ChangesSchema,
});

export type List = z.infer<typeof ListSchema>;
export type HistoryEventType = (typeof HISTORY_EVENT_TYPES)[number];
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;
export type Subtask = z.infer<typeof SubtaskSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Day = z.infer<typeof DaySchema>;
export type FocusSession = z.infer<typeof FocusSessionSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Changes = z.infer<typeof ChangesSchema>;
export type ChangesInput = z.input<typeof ChangesSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export interface SyncResponse {
  rev: number;
  epoch: string;
  changes: Changes;
}
