import type { Settings } from '@frog/shared';
import { readLocal, writeLocal } from './storage';

/** Applies the theme; "system" leaves it to `prefers-color-scheme`. */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  writeLocal('theme', theme);
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? '#121614' : '#F5F6F3';
    if (theme !== 'system') meta.removeAttribute('media');
  }
}

/** First paint: reuse the last theme so there is no flash before settings load. */
export function applyStoredTheme(): void {
  const stored = readLocal('theme');
  if (stored === 'light' || stored === 'dark') applyTheme(stored);
}
