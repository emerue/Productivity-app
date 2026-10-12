import { describe, expect, it } from 'vitest';
import * as commands from '../src/commands.js';
import type { Clock, Snapshot, StoreEdit } from '../src/commands.js';
import { emptyDay } from '../src/day.js';
import { parseQuickAdd } from '../src/quickadd.js';
import type { Day, Task } from '../src/schema.js';
import { createSeedStore } from '../src/seed.js';
import { at, T0, task } from './helpers.js';

const TODAY = '2026-09-27';
const c1: Clock = { today: TODAY, now: at(10) };
const c2: Clock = { today: TODAY, now: at(20) };

function snap(tasks: Task[] = [], days: Day[] = []): Snapshot {
  const seed = createSeedStore(T0);
  return {
    lists: seed.lists,
    settings: seed.settings,
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    days: Object.fromEntries(days.map((d) => [d.date, d])),
  };
}

/** What the client's commit does to state. */
function apply(s: Snapshot, e: StoreEdit): Snapshot {
  const next = { ...s, lists: { ...s.lists }, tasks: { ...s.tasks }, days: { ...s.days } };
  for (const l of e.lists ?? []) next.lists[l.id] = l;
  for (const t of e.tasks ?? []) next.tasks[t.id] = t;
  for (const d of e.days ?? []) next.days[d.date] = d;
  if (e.settings) next.settings = e.settings;
  return next;
}

/** Runs a command, then its undo against the resulting state. */
function roundTrip(
  s: Snapshot,
  r: commands.CommandResult | null,
): { after: Snapshot; undone: Snapshot } {
  expect(r).not.toBeNull();
  const after = apply(s, r!.edit);
  expect(r!.undo).toBeDefined();
  return { after, undone: apply(after, r!.undo!(after, c2)) };
}

const day = (frog: string | null, myDay: string[]): Day => ({ ...emptyDay(TODAY), frog, myDay });
const live = (s: Snapshot) => Object.values(s.tasks).filter((t) => !t.deleted);
const firstList = (s: Snapshot) => Object.values(s.lists)[0]!;

describe('repeat invariants (every edit path)', () => {
  const repeating = () => {
    const t = task({ due: TODAY });
    return commands.setRepeat(snap([t]), c1, t.id, { unit: 'week', every: 1 })!.edit.tasks![0]!;
  };

  it('setting a repeat on an undated task dates it today', () => {
    const t = task();
    const out = commands.setRepeat(snap([t]), c1, t.id, { unit: 'day', every: 1 })!.edit.tasks![0]!;
    expect(out.due).toBe(TODAY);
    expect(out.repeat?.anchor).toBe(TODAY);
  });

  it('clearing the due date ends the series', () => {
    const t = repeating();
    const out = commands.update(snap([t]), c1, t.id, { due: null })!.edit.tasks![0]!;
    expect(out.repeat).toBeNull();
  });

  it("evening planning's Drop ends the series", () => {
    const t = repeating();
    const out = commands.dropFromPlan(snap([t]), c1, t.id)!.edit.tasks![0]!;
    expect(out.due).toBeNull();
    expect(out.repeat).toBeNull();
  });

  it('moving to Drop keeps the series (the due date stays)', () => {
    const t = repeating();
    const out = commands.move(snap([t]), c1, t.id, 'drop')!.edit.tasks![0]!;
    expect(out.repeat).not.toBeNull();
  });

  it('rescheduling keeps the pattern and its anchor', () => {
    const t = repeating();
    const out = commands.reschedule(snap([t]), c1, t.id, '2026-09-30')!.edit.tasks![0]!;
    expect(out.due).toBe('2026-09-30');
    expect(out.repeat).toEqual(t.repeat);
  });

  it('quick add with a repeat and no date dates it today', () => {
    const s = snap();
    const parsed = parseQuickAdd('Water plants *weekly', {
      lists: Object.values(s.lists),
      today: TODAY,
    });
    const r = commands.createFromQuickAdd(s, c1, parsed)!;
    expect(r.task.due).toBe(TODAY);
    expect(r.task.repeat?.anchor).toBe(TODAY);
  });
});

describe('undo round-trips', () => {
  it('completing a repeating task, then undo: one open task with its repeat', () => {
    const base = task({ due: TODAY });
    const s0 = apply(
      snap([base]),
      commands.setRepeat(snap([base]), c1, base.id, { unit: 'day', every: 1 })!.edit,
    );
    const r = commands.complete(s0, c1, base.id)!;
    expect(r.next?.due).toBe('2026-09-28');
    const { after, undone } = roundTrip(s0, r);
    expect(live(after)).toHaveLength(2);
    expect(live(undone)).toHaveLength(1);
    const back = undone.tasks[base.id]!;
    expect(back.status).toBe('open');
    expect(back.repeat).toEqual(s0.tasks[base.id]!.repeat);
  });

  it('undoing a completed repeat also removes the spawned task from My Day', () => {
    const base = task({ due: TODAY });
    const s0 = apply(
      snap([base]),
      commands.setRepeat(snap([base]), c1, base.id, { unit: 'day', every: 1 })!.edit,
    );
    const r = commands.complete(s0, c1, base.id)!;
    let after = apply(s0, r.edit);
    after = apply(after, commands.addToMyDay(after, c1, r.next!.id)!.edit);
    const undone = apply(after, r.undo!(after, c2));
    expect(undone.days[TODAY]!.myDay).not.toContain(r.next!.id);
  });

  it('completing a plain task, then undo: reopened', () => {
    const t = task();
    const { undone } = roundTrip(snap([t]), commands.complete(snap([t]), c1, t.id));
    expect(undone.tasks[t.id]!.status).toBe('open');
  });

  it('deleting restores the task and its place in My Day', () => {
    const t = task();
    const s0 = snap([t], [day(t.id, [])]);
    const { after, undone } = roundTrip(s0, commands.remove(s0, c1, t.id));
    expect(after.days[TODAY]!.frog).toBeNull();
    expect(undone.tasks[t.id]!.deleted).toBe(false);
    expect(undone.days[TODAY]!.frog).toBe(t.id);
  });

  it('moving to another list and back', () => {
    const s0 = snap();
    const [a, b] = Object.values(s0.lists);
    const t = task({ listId: a!.id });
    const s1 = apply(s0, { tasks: [t] });
    const { after, undone } = roundTrip(s1, commands.moveToList(s1, c1, t.id, b!.id));
    expect(after.tasks[t.id]!.listId).toBe(b!.id);
    expect(undone.tasks[t.id]!.listId).toBe(a!.id);
  });

  it('a quadrant move undoes to where it came from', () => {
    const t = task();
    const { after, undone } = roundTrip(snap([t]), commands.move(snap([t]), c1, t.id, 'delegate'));
    expect(after.tasks[t.id]).toMatchObject({ important: false, urgentFlag: true });
    expect(undone.tasks[t.id]).toMatchObject({ important: true, urgentFlag: false });
  });

  it('quick add undo deletes the task and takes it out of My Day', () => {
    const s0 = snap();
    const parsed = parseQuickAdd('Call Ada', { lists: Object.values(s0.lists), today: TODAY });
    const r = commands.createFromQuickAdd(s0, c1, parsed, { myDay: true });
    const { after, undone } = roundTrip(s0, r);
    expect(after.days[TODAY]!.myDay).toEqual([r!.task.id]);
    expect(undone.tasks[r!.task.id]!.deleted).toBe(true);
    expect(undone.days[TODAY]!.myDay).toEqual([]);
  });
});

describe('My Day rules', () => {
  it('Drop or archive takes a task out of today and later days', () => {
    const t = task();
    const s0 = snap([t], [day(null, [t.id])]);
    const r = commands.move(s0, c1, t.id, 'drop')!;
    expect(r.edit.days![0]!.myDay).toEqual([]);
  });

  it('a due-date conflict has no undo', () => {
    const t = task({ due: TODAY });
    const r = commands.move(snap([t]), c1, t.id, 'schedule')!;
    expect(r.conflict).toBe(true);
    expect(r.undo).toBeUndefined();
  });

  it('only important tasks become the Frog', () => {
    const minor = task({ important: false });
    expect(commands.makeFrog(snap([minor]), c1, minor.id)).toBeNull();
  });

  it('reports the edit that fills the day', () => {
    const ts = Array.from({ length: 5 }, () => task());
    const s0 = snap(ts, [
      day(
        null,
        ts.slice(0, 4).map((t) => t.id),
      ),
    ]);
    expect(commands.addToMyDay(s0, c1, ts[4]!.id)!.filled).toBe(true);
  });
});

describe('quick add placement', () => {
  const parse = (s: Snapshot, text: string) =>
    parseQuickAdd(text, { lists: Object.values(s.lists), today: TODAY });

  it('tokens beat the screen; the screen beats the default list', () => {
    const s = snap();
    const [a, b] = Object.values(s.lists);
    expect(commands.placeQuickAdd(parse(s, 'x'), { listId: a!.id }, s, TODAY).listId).toBe(a!.id);
    expect(
      commands.placeQuickAdd(parse(s, `x @${b!.name}`), { listId: a!.id }, s, TODAY).listId,
    ).toBe(b!.id);
    expect(commands.placeQuickAdd(parse(s, 'x'), {}, s, TODAY).listId).toBe(
      s.settings.defaultListId,
    );
  });

  it('a deleted screen list falls back to the default', () => {
    const s = snap();
    const gone = firstList(s);
    s.lists[gone.id] = { ...gone, deleted: true };
    expect(commands.placeQuickAdd(parse(s, 'x'), { listId: gone.id }, s, TODAY).listId).toBe(
      s.settings.defaultListId,
    );
  });

  it('an unknown @list is created at the end', () => {
    const s = snap();
    const r = commands.createFromQuickAdd(s, c1, parse(s, 'x @Garden'))!;
    expect(r.edit.lists![0]).toMatchObject({ name: 'Garden', order: 4 });
    expect(r.task.listId).toBe(r.edit.lists![0]!.id);
  });
});

describe('lists', () => {
  it('refuses to delete the last list', () => {
    const s = snap();
    const keep = firstList(s);
    for (const l of Object.values(s.lists))
      if (l.id !== keep.id) s.lists[l.id] = { ...l, deleted: true };
    expect(commands.deleteList(s, c1, keep.id, null)).toBeNull();
  });

  it('moves tasks and the default list away from a deleted list', () => {
    const s = snap();
    const target = firstList(s);
    const t = task({ listId: s.settings.defaultListId });
    const r = commands.deleteList(
      apply(s, { tasks: [t] }),
      c1,
      s.settings.defaultListId,
      target.id,
    )!;
    expect(r.edit.tasks![0]!.listId).toBe(target.id);
    expect(r.edit.settings!.defaultListId).toBe(target.id);
  });
});
