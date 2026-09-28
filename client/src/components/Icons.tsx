import { useId } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: false as const,
});

/** The app glyph: a single-colour frog head. */
export function FrogGlyph({ size = 20, className }: IconProps) {
  const id = `frog-mask-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          <circle cx="7.6" cy="7.4" r="1.35" fill="#000" />
          <circle cx="16.4" cy="7.4" r="1.35" fill="#000" />
          <path
            d="M8.4 14.2c1.05.95 2.25 1.4 3.6 1.4s2.55-.45 3.6-1.4"
            fill="none"
            stroke="#000"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill="currentColor">
        <circle cx="7.6" cy="7.4" r="3.4" />
        <circle cx="16.4" cy="7.4" r="3.4" />
        <ellipse cx="12" cy="13.8" rx="9" ry="6.4" />
      </g>
    </svg>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PlayIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  );
}

export function NoteIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 4h9l4 4v12H6z M14.5 4v4.5H19 M9 12.5h7 M9 16h5" {...stroke} strokeWidth={1.6} />
    </svg>
  );
}

export function MoreIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="5.5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function PlusIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" {...stroke} strokeWidth={2} />
    </svg>
  );
}

export function ChevronRight({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9.5 6l6 6-6 6" {...stroke} />
    </svg>
  );
}

export function ChevronLeft({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14.5 6l-6 6 6 6" {...stroke} />
    </svg>
  );
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...stroke} />
    </svg>
  );
}

export function GripIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      {[8, 12, 16].map((y) => (
        <g key={y} fill="currentColor">
          <circle cx="9.5" cy={y} r="1.3" />
          <circle cx="14.5" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

export function SearchIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="6" {...stroke} />
      <path d="M15.5 15.5L20 20" {...stroke} />
    </svg>
  );
}

/** Tab bar icons: simple outlines. */
export function SunIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4" {...stroke} />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"
        {...stroke}
      />
    </svg>
  );
}

export function GridIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" {...stroke} />
      <path d="M12 4v16M4 12h16" {...stroke} />
    </svg>
  );
}

export function ListIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" {...stroke} />
      <circle cx="4.8" cy="6.5" r="1.1" fill="currentColor" />
      <circle cx="4.8" cy="12" r="1.1" fill="currentColor" />
      <circle cx="4.8" cy="17.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function CalendarIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" {...stroke} />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" {...stroke} />
    </svg>
  );
}
