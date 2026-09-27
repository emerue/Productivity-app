import { useEffect, useRef } from 'react';
import { dismissToast, useUI } from '../data/ui';

export function Toasts() {
  const toast = useUI((s) => s.toast);
  return (
    <div className="toast-region" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span className="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              className="toast__action"
              onClick={() => {
                toast.action!.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A single question with two answers. */
export function ConfirmDialog() {
  const confirm = useUI((s) => s.confirm);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirm) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') confirm.resolve(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);

  if (!confirm) return null;
  return (
    <div className="scrim" onClick={() => confirm.resolve(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-text"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-text" className="dialog__text">
          {confirm.text}
        </p>
        <div className="dialog__actions">
          <button className="btn btn--secondary" onClick={() => confirm.resolve(false)}>
            {confirm.cancelLabel}
          </button>
          <button ref={okRef} className="btn btn--ink" onClick={() => confirm.resolve(true)}>
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
