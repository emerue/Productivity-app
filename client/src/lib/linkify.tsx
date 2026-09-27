import type { ReactNode } from 'react';

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

/** Splits plain text into strings and links. No markdown, nothing else. */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    const start = m.index;
    if (start > last) out.push(text.slice(last, start));
    const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
    out.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
