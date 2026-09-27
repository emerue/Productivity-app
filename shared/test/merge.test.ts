import { describe, expect, it } from 'vitest';
import {
  applyChanges,
  clampFuture,
  mergeDay,
  mergeFocusSession,
  mergeHistory,
  mergeList,
  mergeTask,
  sameContent,
  type MergeableState,
} from '../src/merge.js';
import type { Day, FocusSession, Task } from '../src/schema.js';
import { defaultSettings } from '../src/seed.js';
import {
  addSubtask,
  completeTask,
  deleteTask,
  logEvent,
  nextAction,
  patchTask,
  restoreTask,
  setNotes,
  updateSubtask,
} from '../src/tasks.js';
import { at, list, T0, task } from './helpers.js';

/** Asserts commutativity and returns the merge. */
function merge(a: Task, b: Task): Task {
  const ab = mergeTask(a, b);
  const ba = mergeTask(b, a);
  expect(sameContent(ab, ba)).toBe(true);
  return ab;
}

function withSteps(t: Task, ...titles: string[]) {
  const ids: string[] = [];
  for (const title of titles) {
    const r = addSubtask(t, title, T0);
    t = r.task;
    ids.push(r.subtask.id);
  }
  return { t, ids };
}

describe('mergeTask: two devices offline', () => {
  it('keeps edits to different fields made at different levels', () => {
    const base = task({ title: 'Q3 review' });
    const laptop = patchTask(base, { due: '2026-10-01' }, at(5));
    const phone = setNotes(base, 'Ask finance for numbers', at(10));
    const m = merge(laptop, phone);
    expect(m.due).toBe('2026-10-01');
    expect(m.notes).toBe('Ask finance for numbers');
  });

  it('uses last-writer-wins for the same scalar field', () => {
    const base = task();
    const a = patchTask(base, { title: 'Older' }, at(5));
    const b = patchTask(base, { title: 'Newer' }, at(6));
    expect(merge(a, b).title).toBe('Newer');
  });

  it('keeps notes from the laptop and a ticked step from the phone (acceptance 8)', () => {
    const { t: base, ids } = withSteps(task(), 'Draft', 'Send');
    const laptop = setNotes(base, 'Notes from the laptop', at(5));
    const phone = updateSubtask(base, ids[0]!, { done: true }, at(6));
    const m = merge(laptop, phone);
    expect(m.notes).toBe('Notes from the laptop');
    expect(m.subtasks.find((s) => s.id === ids[0])?.done).toBe(true);
    expect(nextAction(m)?.title).toBe('Send');
  });

  it('unions steps added on both devices', () => {
    const base = task();
    const a = addSubtask(base, 'From A', at(1)).task;
    const b = addSubtask(base, 'From B', at(2)).task;
    expect(merge(a, b).subtasks.map((s) => s.title).sort()).toEqual(['From A', 'From B']);
  });

  it('merges the same step by its own updatedAt', () => {
    const { t: base, ids } = withSteps(task(), 'Step');
    const a = updateSubtask(base, ids[0]!, { title: 'Renamed' }, at(5));
    const b = updateSubtask(base, ids[0]!, { done: true }, at(3));
    const m = merge(a, b);
    expect(m.subtasks[0]).toMatchObject({ title: 'Renamed', done: false });
  });

  it('keeps a deleted step deleted', () => {
    const { t: base, ids } = withSteps(task(), 'Step');
    const a = { ...base, subtasks: base.subtasks.map((s) => ({ ...s, deleted: true, deletedAt: at(1), updatedAt: at(1) })) };
    const b = updateSubtask(base, ids[0]!, { title: 'Edited later' }, at(9));
    expect(merge(a, b).subtasks[0]?.deleted).toBe(true);
  });

  it('unions history by id, sorted by time', () => {
    const base = task();
    const a = logEvent(base, 'postponed', at(3));
    const b = logEvent(base, 'addedToMyDay', at(2), { date: '2026-09-27' });
    const m = merge(a, b);
    expect(m.history.map((e) => e.type)).toEqual(['created', 'addedToMyDay', 'postponed']);
    expect(mergeHistory(m.history, m.history)).toHaveLength(3);
  });

  it('is idempotent', () => {
    const t = setNotes(completeTask(task(), at(1)), 'n', at(2));
    expect(sameContent(mergeTask(t, t), t)).toBe(true);
  });

  it('breaks exact timestamp ties deterministically', () => {
    const base = task();
    const a = patchTask(base, { title: 'A' }, at(5));
    const b = patchTask(base, { title: 'B' }, at(5));
    expect(merge(a, b).title).toBe(merge(b, a).title);
  });
});

describe('tombstones', () => {
  it('beats a newer offline edit (acceptance 9)', () => {
    const base = task();
    const deleted = deleteTask(base, at(1));
    const edited = setNotes(patchTask(base, { title: 'Edited offline' }, at(30)), 'x', at(30));
    const m = merge(deleted, edited);
    expect(m.deleted).toBe(true);
    expect(m.deletedAt).toBe(at(1));
  });

  it('beats an older edit', () => {
    const base = task();
    const edited = patchTask(base, { title: 'Earlier' }, at(1));
    expect(merge(deleteTask(base, at(5)), edited).deleted).toBe(true);
  });

  it('keeps the earliest deletion when both sides deleted', () => {
    const base = task();
    const m = merge(deleteTask(base, at(2)), deleteTask(base, at(1)));
    expect(m.deletedAt).toBe(at(1));
  });

  it('only an explicit restore un-deletes', () => {
    const base = task();
    const dead = deleteTask(base, at(1));
    const restored = restoreTask(dead, at(2));
    const m = merge(dead, restored);
    expect(m.deleted).toBe(false);
    expect(m.restore).toBe(true);
    // A stale tombstone arriving later cannot kill the restored task.
    const m2 = merge(m, dead);
    expect(m2.deleted).toBe(false);
    // Deleting again after the restore works.
    expect(merge(m2, deleteTask(m2, at(3))).deleted).toBe(true);
  });

  it('keeps the restore marker when a plain edit wins scalar fields', () => {
    const base = task();
    const dead = deleteTask(base, at(1));
    const restored = restoreTask(dead, at(2));
    const plain = patchTask(base, { title: 'Offline edit' }, at(3));
    const m = merge(restored, plain);
    expect(m.title).toBe('Offline edit');
    expect(m.restore).toBe(true);
    expect(merge(m, dead).deleted).toBe(false);
  });

  it('applies to lists too', () => {
    const l = list('l_x', 'Old');
    const dead = { ...l, deleted: true, deletedAt: at(1), updatedAt: at(1) };
    const renamed = { ...l, name: 'New', updatedAt: at(10) };
    expect(mergeList(dead, renamed).deleted).toBe(true);
    expect(mergeList(renamed, dead).deleted).toBe(true);
  });
});

describe('days, sessions, settings', () => {
  const day = (frog: string | null, updatedAt: string): Day => ({
    date: '2026-09-28',
    frog,
    myDay: [],
    planned: true,
    plannedAt: updatedAt,
    updatedAt,
    rev: 0,
  });

  it('uses last-writer-wins for days', () => {
    expect(mergeDay(day('t_aaaa', at(1)), day('t_bbbb', at(2))).frog).toBe('t_bbbb');
    expect(mergeDay(day('t_bbbb', at(2)), day('t_aaaa', at(1))).frog).toBe('t_bbbb');
  });

  it('keeps focus sessions append-only, preferring the stamped copy', () => {
    const s: FocusSession = {
      id: 'f_1234',
      taskId: 't_aaaa',
      start: T0,
      plannedMinutes: 25,
      actualMinutes: 25,
      completed: true,
      rev: 0,
    };
    expect(mergeFocusSession(s, { ...s, rev: 7 }).rev).toBe(7);
  });

  it('applyChanges reports only real changes', () => {
    const t = task();
    const state: MergeableState = {
      lists: {},
      tasks: { [t.id]: { ...t, rev: 3 } },
      days: {},
      focusSessions: {},
      settings: defaultSettings('l_default', T0),
    };
    const seen: string[] = [];
    const changed = applyChanges(
      state,
      {
        tasks: [t, patchTask(task(), { title: 'New task' }, at(1))],
        settings: { ...state.settings, sounds: false, updatedAt: at(1) },
      },
      (kind, key) => seen.push(`${kind}:${key}`),
    );
    expect(changed).toBe(2);
    expect(seen).toHaveLength(2);
    expect(state.settings.sounds).toBe(false);
    expect(state.tasks[t.id]?.rev).toBe(3);
  });
});

describe('clampFuture', () => {
  it('clamps timestamps more than 5 minutes ahead, deeply', () => {
    const now = new Date(T0);
    const future = at(60);
    const t = addSubtask(patchTask(task(), { title: 'x' }, future), 'step', future).task;
    const clamped = clampFuture(t, now);
    expect(clamped.updatedAt).toBe(T0);
    expect(clamped.subtasks[0]?.updatedAt).toBe(T0);
    expect(clamped.createdAt).toBe(t.createdAt);
  });

  it('leaves small skew alone', () => {
    const t = patchTask(task(), { title: 'x' }, at(4));
    expect(clampFuture(t, new Date(T0)).updatedAt).toBe(at(4));
  });

  it('does not touch date-only fields', () => {
    const t = task({ due: '2099-01-01' });
    expect(clampFuture(t, new Date(T0)).due).toBe('2099-01-01');
  });
});
