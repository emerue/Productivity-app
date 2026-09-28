import type { Settings } from '@frog/shared';
import { readLocal, writeLocal } from './storage';

const LIGHT = '#F5F6F3';
const DARK = '#121614';

/** Applies the theme; "system" leaves it to `prefers-color-scheme`. */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  writeLocal('theme', theme);

  // Browser chrome colour: one meta per scheme for "system", a single forced value otherwise.
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  metas.forEach((meta, i) => {
    if (theme === 'system') {
      const dark = i === 1;
      meta.content = dark ? DARK : LIGHT;
      meta.media = dark ? '(prefers-color-scheme: dark)' : '(prefers-color-scheme: light)';
    } else {
      meta.content = theme === 'dark' ? DARK : LIGHT;
      meta.removeAttribute('media');
    }
  });
}

/** First paint: reuse the last theme so there is no flash before settings load. */
export function applyStoredTheme(): void {
  const stored = readLocal('theme');
  if (stored === 'light' || stored === 'dark') applyTheme(stored);
}
