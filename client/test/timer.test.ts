import { describe, expect, it } from 'vitest';
import {
  elapsedMs,
  formatRemaining,
  newTimer,
  pauseTimer,
  remainingMs,
  resumeTimer,
  sessionOutcome,
} from '../src/lib/timer';

const T0 = Date.parse('2026-09-27T09:00:00Z');
const MIN = 60_000;

describe('focus timer', () => {
  it('computes remaining time from the wall clock', () => {
    const t = newTimer('t_1234', 25, T0);
    expect(remainingMs(t, T0)).toBe(25 * MIN);
    // Phone locked for 10 minutes: no ticks, still correct (acceptance 7).
    expect(remainingMs(t, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(t, T0 + 30 * MIN)).toBe(0);
  });

  it('excludes paused time', () => {
    let t = newTimer('t_1234', 25, T0);
    t = pauseTimer(t, T0 + 5 * MIN);
    expect(remainingMs(t, T0 + 50 * MIN)).toBe(20 * MIN);
    t = resumeTimer(t, T0 + 15 * MIN);
    expect(t.pausedAccumMs).toBe(10 * MIN);
    expect(elapsedMs(t, T0 + 20 * MIN)).toBe(10 * MIN);
    expect(remainingMs(t, T0 + 20 * MIN)).toBe(15 * MIN);
  });

  it('survives a reload: the persisted state is all it needs', () => {
    const t = JSON.parse(JSON.stringify(pauseTimer(newTimer('t_1234', 5, T0), T0 + MIN)));
    expect(remainingMs(resumeTimer(t, T0 + 3 * MIN), T0 + 3 * MIN)).toBe(4 * MIN);
  });

  it('logs completed when the timer reaches zero or ends in the last minute', () => {
    const t = newTimer('t_1234', 25, T0);
    expect(sessionOutcome(t, T0 + 26 * MIN)).toEqual({ completed: true, actualMinutes: 25 });
    expect(sessionOutcome(t, T0 + 24.5 * MIN)).toEqual({ completed: true, actualMinutes: 24.5 });
    expect(sessionOutcome(t, T0 + 12 * MIN)).toEqual({ completed: false, actualMinutes: 12 });
  });

  it('formats remaining time', () => {
    expect(formatRemaining(25 * MIN)).toBe('25:00');
    expect(formatRemaining(61_000)).toBe('1:01');
    expect(formatRemaining(400)).toBe('0:01');
    expect(formatRemaining(0)).toBe('0:00');
  });
});
