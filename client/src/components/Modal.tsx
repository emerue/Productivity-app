import { useEffect, useRef, type ReactNode } from 'react';
import { useIsDesktop } from '../lib/hooks';
import { Sheet } from './Sheet';

interface ModalProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/** A short choice or question: bottom sheet on mobile, centred dialog on desktop. */
export function Modal({ label, onClose, children }: ModalProps) {
  const isDesktop = useIsDesktop();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDesktop) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [isDesktop, onClose]);

  if (!isDesktop) {
    return (
      <Sheet label={label} onClose={onClose} size="auto">
        <div className="modal-body">{children}</div>
      </Sheet>
    );
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
