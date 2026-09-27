/** localStorage for per-device UI conveniences only. Never throws. */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(`frog.${key}`);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`frog.${key}`);
    else localStorage.setItem(`frog.${key}`, value);
  } catch {
    // Storage unavailable (private mode); the convenience is simply lost.
  }
}
