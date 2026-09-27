let ctx: AudioContext | null = null;

/**
 * One soft two-note chime, synthesised so there is no audio file to cache.
 * Fails silently where audio is unavailable or blocked.
 */
export function playChime(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const start = ctx.currentTime + 0.02;
    [659.25, 987.77].forEach((freq, i) => {
      const t = start + i * 0.16;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    });
  } catch {
    // No audio.
  }
}

/** Unlocks audio on iOS; call from a user gesture before a chime may be needed. */
export function primeAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // No audio.
  }
}
