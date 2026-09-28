// Renders every app icon from one source: icons/frog-glyph.svg.
// Run: npm run icons -w client   (writes public/icons/*)
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const FROG = '#2E6A4C';
const PAPER = '#F5F6F3';

const source = readFileSync(`${root}icons/frog-glyph.svg`, 'utf8');
const inner = source
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replaceAll('currentColor', PAPER);

/**
 * @param size canvas size in px
 * @param radius corner radius as a fraction of size (0 = full bleed, for masked platforms)
 * @param glyph glyph width as a fraction of size
 */
function icon(size, radius, glyph) {
  const s = (size * glyph) / 18; // glyph is ~18 units wide
  const tx = size / 2 - 12 * s;
  const ty = size / 2 - 12.1 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${FROG}"/>
  <g transform="translate(${tx} ${ty}) scale(${s})">${inner}</g>
</svg>`;
}

const png = (svg) => new Resvg(svg).render().asPng();
const out = `${root}public/icons/`;
mkdirSync(out, { recursive: true });

writeFileSync(`${out}icon.svg`, icon(64, 0.22, 0.62));
writeFileSync(`${out}icon-192.png`, png(icon(192, 0.22, 0.62)));
writeFileSync(`${out}icon-512.png`, png(icon(512, 0.22, 0.62)));
writeFileSync(`${out}maskable-512.png`, png(icon(512, 0, 0.5)));
writeFileSync(`${out}apple-touch-icon.png`, png(icon(180, 0, 0.6)));
console.log('Icons written to public/icons/');
