let sentinel: WakeLockSentinel | null = null;

/** Keeps the screen on while a focus timer runs. Fails silently where unsupported. */
export async function acquireWakeLock(): Promise<void> {
  try {
    if (sentinel && !sentinel.released) return;
    if ('wakeLock' in navigator) sentinel = await navigator.wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    // Already released.
  }
  sentinel = null;
}
