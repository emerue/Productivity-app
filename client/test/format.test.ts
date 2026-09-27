import { describe, expect, it } from 'vitest';
import { formatDateLong, formatDue, formatHeaderDate } from '../src/lib/time';

const today = '2026-09-27'; // Sunday

describe('date labels', () => {
  it('formats the header date', () => {
    expect(formatHeaderDate(today)).toBe('Sun 27 Sep');
  });

  it('formats due dates relative to today', () => {
    expect(formatDue('2026-09-27', today)).toBe('Today');
    expect(formatDue('2026-09-28', today)).toBe('Tomorrow');
    expect(formatDue('2026-09-26', today)).toBe('Yesterday');
    expect(formatDue('2026-10-01', today)).toBe('Thu');
    expect(formatDue('2026-10-12', today)).toBe('12 Oct');
    expect(formatDue('2026-09-12', today)).toBe('12 Sep');
    expect(formatDue('2027-01-05', today)).toBe('5 Jan 2027');
  });

  it('formats long dates for chips', () => {
    expect(formatDateLong('2026-10-01', today)).toBe('Thu 1 Oct');
    expect(formatDateLong('2026-09-28', today)).toBe('Tomorrow');
  });
});
