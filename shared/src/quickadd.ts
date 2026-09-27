import { addDays, diffDays, makeDateStr, weekdayOf, type DateStr } from './dates.js';
import type { List } from './schema.js';

export type QuickAddToken = { raw: string; start: number; end: number } & (
  | { kind: 'urgent' }
  | { kind: 'notImportant' }
  | { kind: 'important' }
  | { kind: 'list'; listId: string; name: string }
  | { kind: 'newList'; name: string }
  | { kind: 'due'; date: DateStr }
  | { kind: 'myDay' }
  | { kind: 'waiting'; name: string }
);

export interface QuickAddResult {
  title: string;
  important: boolean;
  urgentFlag: boolean;
  due: DateStr | null;
  /** Existing list matched by `@name`, or null (use default, or create `newListName`). */
  listId: string | null;
  newListName: string | null;
  addToMyDay: boolean;
  waitingOn: string | null;
  tokens: QuickAddToken[];
}

export interface QuickAddContext {
  lists: Iterable<List>;
  today: DateStr;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** `word` is a prefix (3+ letters) of one entry in `names`. Returns its index or -1. */
function prefixIndex(word: string, names: string[]): number {
  if (word.length < 3) return -1;
  return names.findIndex((n) => n.startsWith(word));
}

/** Of last, this and next year, the occurrence of day/month closest to today. */
function closestDayMonth(day: number, month: number, today: DateStr): DateStr | null {
  const year = Number(today.slice(0, 4));
  let best: DateStr | null = null;
  for (const y of [year - 1, year, year + 1]) {
    const d = makeDateStr(y, month, day);
    if (!d) continue;
    if (best === null || Math.abs(diffDays(d, today)) < Math.abs(diffDays(best, today))) best = d;
  }
  return best;
}

export function parseDueToken(word: string, today: DateStr): DateStr | null {
  const w = word.toLowerCase();
  if (w === 'today') return today;
  if (w === 'tom' || w === 'tomorrow') return addDays(today, 1);

  const wd = prefixIndex(w, WEEKDAYS);
  if (wd >= 0 && /^[a-z]+$/.test(w)) {
    const delta = (wd - weekdayOf(today) + 7) % 7 || 7;
    return addDays(today, delta);
  }

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (m) return makeDateStr(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (m) return closestDayMonth(Number(m[1]), Number(m[2]), today);

  m = /^(\d{1,2})([a-z]{3,})$/.exec(w);
  if (m) {
    const month = prefixIndex(m[2] as string, MONTHS);
    if (month >= 0) return closestDayMonth(Number(m[1]), month + 1, today);
  }
  return null;
}

function matchList(name: string, lists: List[]): List | null {
  const q = name.toLowerCase();
  const live = lists.filter((l) => !l.deleted).sort((a, b) => a.order - b.order);
  return (
    live.find((l) => l.name.toLowerCase() === q) ??
    live.find((l) => l.name.toLowerCase().startsWith(q)) ??
    null
  );
}

/**
 * Parses quick-add input. Tokens may appear anywhere; everything else is the title.
 * When a token repeats, the last one wins.
 */
export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  const lists = [...ctx.lists];
  const result: QuickAddResult = {
    title: '',
    important: true,
    urgentFlag: false,
    due: null,
    listId: null,
    newListName: null,
    addToMyDay: false,
    waitingOn: null,
    tokens: [],
  };
  const titleWords: string[] = [];

  for (const match of input.matchAll(/\S+/g)) {
    const raw = match[0];
    const pos = { raw, start: match.index, end: match.index + raw.length };
    const lower = raw.toLowerCase();
    let token: QuickAddToken | null = null;

    if (lower === '!u') token = { ...pos, kind: 'urgent' };
    else if (lower === '!n') token = { ...pos, kind: 'notImportant' };
    else if (lower === '!i') token = { ...pos, kind: 'important' };
    else if (raw === '+') token = { ...pos, kind: 'myDay' };
    else if (raw.length > 1 && raw.startsWith('@')) {
      const name = raw.slice(1);
      const list = matchList(name, lists);
      token = list
        ? { ...pos, kind: 'list', listId: list.id, name: list.name }
        : { ...pos, kind: 'newList', name };
    } else if (raw.length > 1 && raw.startsWith('^')) {
      const date = parseDueToken(raw.slice(1), ctx.today);
      if (date) token = { ...pos, kind: 'due', date };
    } else if (raw.length > 1 && raw.startsWith('>')) {
      token = { ...pos, kind: 'waiting', name: raw.slice(1) };
    }

    if (!token) {
      titleWords.push(raw);
      continue;
    }
    result.tokens.push(token);
  }

  // Apply in a fixed order so `>Name` and `!u` combine predictably regardless of position.
  for (const t of result.tokens) {
    switch (t.kind) {
      case 'list':
        result.listId = t.listId;
        result.newListName = null;
        break;
      case 'newList':
        result.listId = null;
        result.newListName = t.name;
        break;
      case 'due':
        result.due = t.date;
        break;
      case 'myDay':
        result.addToMyDay = true;
        break;
      case 'waiting':
        result.waitingOn = t.name;
        break;
      default:
        break;
    }
  }
  const has = (kind: QuickAddToken['kind']) => result.tokens.some((t) => t.kind === kind);
  if (has('waiting')) {
    result.important = false;
    result.urgentFlag = true;
  }
  if (has('notImportant')) result.important = false;
  if (has('urgent')) result.urgentFlag = true;

  result.title = titleWords.join(' ');
  return result;
}

/** Removes one token's text from the input (for chip removal). */
export function removeToken(input: string, token: Pick<QuickAddToken, 'start' | 'end'>): string {
  return (input.slice(0, token.start) + input.slice(token.end)).replace(/\s{2,}/g, ' ').trimStart();
}
