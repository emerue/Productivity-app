import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  isPlanningWindow,
  isValidDateStr,
  logicalDate,
  logicalTomorrow,
  makeDateStr,
  weekdayOf,
} from '../src/dates.js';

const lagos = { timezone: 'Africa/Lagos', dayStartHour: 4, planTime: '20:00' };

describe('calendar arithmetic', () => {
  it('adds and diffs across month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-01', '2026-09-27')).toBe(4);
    expect(diffDays('2026-09-27', '2026-10-01')).toBe(-4);
  });

  it('validates dates', () => {
    expect(isValidDateStr('2026-02-29')).toBe(false);
    expect(isValidDateStr('2028-02-29')).toBe(true);
    expect(isValidDateStr('2026-9-1')).toBe(false);
    expect(makeDateStr(2026, 2, 31)).toBeNull();
    expect(makeDateStr(2026, 10, 12)).toBe('2026-10-12');
  });

  it('knows weekdays', () => {
    expect(weekdayOf('2026-09-27')).toBe(0); // Sunday
    expect(weekdayOf('2026-10-01')).toBe(4); // Thursday
  });
});

describe('logicalDate', () => {
  // Lagos is UTC+1 all year.
  it('uses the calendar date after the day start hour', () => {
    expect(logicalDate(new Date('2026-09-27T09:00:00Z'), lagos)).toBe('2026-09-27');
    expect(logicalDate(new Date('2026-09-27T03:00:00Z'), lagos)).toBe('2026-09-27'); // 04:00 local
  });

  it('keeps 00:30 local on the previous logical day', () => {
    // 00:30 in Lagos on the 28th is 23:30 UTC on the 27th.
    const now = new Date('2026-09-27T23:30:00Z');
    expect(logicalDate(now, lagos)).toBe('2026-09-27');
    expect(logicalTomorrow(now, lagos)).toBe('2026-09-28');
  });

  it('switches at exactly the boundary', () => {
    expect(logicalDate(new Date('2026-09-28T02:59:59Z'), lagos)).toBe('2026-09-27'); // 03:59 local
    expect(logicalDate(new Date('2026-09-28T03:00:00Z'), lagos)).toBe('2026-09-28'); // 04:00 local
  });

  it('respects the configured timezone', () => {
    const now = new Date('2026-09-27T23:30:00Z');
    expect(logicalDate(now, { timezone: 'UTC', dayStartHour: 0 })).toBe('2026-09-27');
    expect(logicalDate(now, { timezone: 'Asia/Tokyo', dayStartHour: 4 })).toBe('2026-09-28'); // 08:30
  });

  it('handles DST transitions by wall clock', () => {
    // New York springs forward on 2026-03-08 at 02:00. 04:30 local is 08:30 UTC.
    const ny = { timezone: 'America/New_York', dayStartHour: 4 };
    expect(logicalDate(new Date('2026-03-08T08:30:00Z'), ny)).toBe('2026-03-08');
    expect(logicalDate(new Date('2026-03-08T06:30:00Z'), ny)).toBe('2026-03-07'); // 01:30 local
  });
});

describe('isPlanningWindow', () => {
  it('opens at plan time and stays open until the day boundary', () => {
    expect(isPlanningWindow(new Date('2026-09-27T18:59:00Z'), lagos)).toBe(false); // 19:59
    expect(isPlanningWindow(new Date('2026-09-27T19:00:00Z'), lagos)).toBe(true); // 20:00
    expect(isPlanningWindow(new Date('2026-09-27T23:30:00Z'), lagos)).toBe(true); // 00:30
    expect(isPlanningWindow(new Date('2026-09-28T02:59:00Z'), lagos)).toBe(true); // 03:59
    expect(isPlanningWindow(new Date('2026-09-28T03:00:00Z'), lagos)).toBe(false); // 04:00
  });

  it('works when plan time is after midnight', () => {
    const s = { ...lagos, planTime: '01:00' };
    expect(isPlanningWindow(new Date('2026-09-27T22:00:00Z'), s)).toBe(false); // 23:00
    expect(isPlanningWindow(new Date('2026-09-28T00:30:00Z'), s)).toBe(true); // 01:30
  });
});
