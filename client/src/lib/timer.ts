/**
 * Focus timer maths. Everything is computed from the wall clock and the
 * persisted fields, never from interval ticks, so the timer survives
 * backgrounding, locking and reloads.
 */
export interface TimerState {
  taskId: string;
  startedAt: string;
  plannedMinutes: number;
  pausedAccumMs: number;
  pausedAt: string | null;
}

const MIN = 60_000;

export function newTimer(taskId: string, plannedMinutes: number, now: number): TimerState {
  return {
    taskId,
    startedAt: new Date(now).toISOString(),
    plannedMinutes,
    pausedAccumMs: 0,
    pausedAt: null,
  };
}

export function elapsedMs(t: TimerState, now: number): number {
  const end = t.pausedAt ? Date.parse(t.pausedAt) : now;
  return Math.max(0, end - Date.parse(t.startedAt) - t.pausedAccumMs);
}

export function remainingMs(t: TimerState, now: number): number {
  return Math.max(0, t.plannedMinutes * MIN - elapsedMs(t, now));
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  return t.pausedAt ? t : { ...t, pausedAt: new Date(now).toISOString() };
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (!t.pausedAt) return t;
  return { ...t, pausedAccumMs: t.pausedAccumMs + (now - Date.parse(t.pausedAt)), pausedAt: null };
}

/**
 * Completed if the timer reached zero, or it was ended within the last
 * minute. Minutes are rounded to one decimal.
 */
export function sessionOutcome(
  t: TimerState,
  now: number,
): { completed: boolean; actualMinutes: number } {
  const planned = t.plannedMinutes * MIN;
  const elapsed = Math.min(elapsedMs(t, now), planned);
  return {
    completed: planned - elapsed <= MIN,
    actualMinutes: Math.round((elapsed / MIN) * 10) / 10,
  };
}

/** "24:59". Minutes are not wrapped into hours. */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
