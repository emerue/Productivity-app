import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useReducedMotion } from '../lib/hooks';

interface SheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  /** 'tall' opens to 90% height; 'auto' fits content. */
  size?: 'tall' | 'auto';
}

/** Bottom sheet with a drag handle. Swipe down or tap outside to close. */
export function Sheet({ label, onClose, children, size = 'tall' }: SheetProps) {
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, reduced ? 0 : 200);
  }, [onClose, reduced]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Leave focus alone if content already focused a field (e.g. "Waiting on").
    if (!panelRef.current?.contains(document.activeElement))
      panelRef.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [close]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dy > 100) close();
    else setDy(0);
  };

  return (
    <div className={closing ? 'sheet-root is-closing' : 'sheet-root'}>
      <div className="sheet-scrim" onClick={close} />
      <div
        ref={panelRef}
        className={`sheet sheet--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
      >
        <div
          className="sheet__handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span />
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  );
}
