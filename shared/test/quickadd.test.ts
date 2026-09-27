import { describe, expect, it } from 'vitest';
import { quadrantOf } from '../src/quadrant.js';
import { parseDueToken, parseQuickAdd, removeToken } from '../src/quickadd.js';
import { list } from './helpers.js';

const today = '2026-09-27'; // Sunday
const lists = [
  list('l_heirs', 'Heirs', 0),
  list('l_siren', 'Siren', 1),
  list('l_abz', 'ABZUURD', 2),
  list('l_personal', 'Personal', 3),
];
const ctx = { lists, today };
const parse = (s: string) => parseQuickAdd(s, ctx);

describe('parseQuickAdd', () => {
  it('handles the acceptance example', () => {
    const r = parse('Send CSAT evidence @heirs ^thu !u');
    expect(r.title).toBe('Send CSAT evidence');
    expect(r.listId).toBe('l_heirs');
    expect(r.due).toBe('2026-10-01');
    expect(r.urgentFlag).toBe(true);
    expect(r.important).toBe(true);
    expect(quadrantOf(r, { today, urgencyWindowDays: 2 })).toBe('do');
  });

  it('leaves plain text alone with defaults', () => {
    expect(parse('  Call supplier  ')).toMatchObject({
      title: 'Call supplier',
      important: true,
      urgentFlag: false,
      due: null,
      listId: null,
      newListName: null,
      addToMyDay: false,
      waitingOn: null,
      tokens: [],
    });
  });

  it('parses importance flags', () => {
    expect(parse('x !n').important).toBe(false);
    expect(parse('x !i').important).toBe(true);
    expect(parse('x !U').urgentFlag).toBe(true);
    expect(parse('x !i').title).toBe('x');
  });

  it('matches lists by case-insensitive prefix', () => {
    expect(parse('x @sir').listId).toBe('l_siren');
    expect(parse('x @ABZ').listId).toBe('l_abz');
    expect(parse('x @Personal').listId).toBe('l_personal');
  });

  it('offers a new list for unknown names', () => {
    const r = parse('x @Garden');
    expect(r.listId).toBeNull();
    expect(r.newListName).toBe('Garden');
    expect(r.tokens[0]).toMatchObject({ kind: 'newList', name: 'Garden' });
  });

  it('ignores deleted lists', () => {
    const r = parseQuickAdd('x @old', {
      lists: [{ ...list('l_old', 'Old'), deleted: true }],
      today,
    });
    expect(r.newListName).toBe('old');
  });

  it('adds to My Day only for a standalone +', () => {
    expect(parse('x +').addToMyDay).toBe(true);
    expect(parse('+ x').addToMyDay).toBe(true);
    const r = parse('C++ refactor');
    expect(r.addToMyDay).toBe(false);
    expect(r.title).toBe('C++ refactor');
  });

  it('parses waiting-on as Delegate', () => {
    const r = parse('Contract review >Ada');
    expect(r).toMatchObject({
      waitingOn: 'Ada',
      important: false,
      urgentFlag: true,
      title: 'Contract review',
    });
    expect(quadrantOf(r, { today, urgencyWindowDays: 2 })).toBe('delegate');
  });

  it('accepts tokens anywhere', () => {
    const r = parse('!u @heirs Send ^tom the + deck');
    expect(r.title).toBe('Send the deck');
    expect(r.due).toBe('2026-09-28');
    expect(r.addToMyDay).toBe(true);
  });

  it('keeps unknown tokens in the title', () => {
    expect(parse('x ^someday !x').title).toBe('x ^someday !x');
    expect(parse('email a@b.com').title).toBe('email a@b.com');
    expect(parse('x ^ @ >').title).toBe('x ^ @ >');
  });

  it('lets the last token of a kind win', () => {
    expect(parse('x @heirs @siren').listId).toBe('l_siren');
    expect(parse('x ^today ^tom').due).toBe('2026-09-28');
  });

  it('reports token positions for chip removal', () => {
    const input = 'Pitch deck @siren ^fri';
    const r = parse(input);
    const listToken = r.tokens.find((t) => t.kind === 'list')!;
    expect(input.slice(listToken.start, listToken.end)).toBe('@siren');
    expect(removeToken(input, listToken)).toBe('Pitch deck ^fri');
  });
});

describe('parseDueToken', () => {
  it('handles relative words', () => {
    expect(parseDueToken('today', today)).toBe('2026-09-27');
    expect(parseDueToken('tom', today)).toBe('2026-09-28');
    expect(parseDueToken('tomorrow', today)).toBe('2026-09-28');
  });

  it('uses the next occurrence of a weekday', () => {
    expect(parseDueToken('mon', today)).toBe('2026-09-28');
    expect(parseDueToken('thu', today)).toBe('2026-10-01');
    expect(parseDueToken('thursday', today)).toBe('2026-10-01');
    expect(parseDueToken('sat', today)).toBe('2026-10-03');
    expect(parseDueToken('sun', today)).toBe('2026-10-04'); // same weekday → next week
  });

  it('parses day-month forms', () => {
    expect(parseDueToken('12oct', today)).toBe('2026-10-12');
    expect(parseDueToken('12october', today)).toBe('2026-10-12');
    expect(parseDueToken('12/10', today)).toBe('2026-10-12');
    expect(parseDueToken('2026-10-12', today)).toBe('2026-10-12');
  });

  it('picks the closest year for day-month', () => {
    expect(parseDueToken('5/1', '2026-12-20')).toBe('2027-01-05');
    expect(parseDueToken('12/9', today)).toBe('2026-09-12'); // past → overdue, accepted
    expect(parseDueToken('28dec', '2027-01-03')).toBe('2026-12-28');
  });

  it('rejects impossible dates', () => {
    expect(parseDueToken('31/2', today)).toBeNull();
    expect(parseDueToken('2026-02-30', today)).toBeNull();
    expect(parseDueToken('12xyz', today)).toBeNull();
    expect(parseDueToken('mo', today)).toBeNull();
  });
});
