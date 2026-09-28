import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  /** Toasts with an action stay until pressed or dismissed. */
  sticky?: boolean;
}

interface UIState {
  toast: Toast | null;
  /** Task whose "Move to…" sheet is open. */
  moveTaskId: string | null;
  /** Task whose actions sheet (edit, list, due, delete…) is open. */
  actionsTaskId: string | null;
  /** Task whose move hit a due-date conflict, with the quadrant the user asked for. */
  conflict: { taskId: string; target: 'schedule' | 'drop' } | null;
  quickAddOpen: boolean;
  /** Keyboard selection on desktop lists. */
  selectedTaskId: string | null;
  /** Recently completed tasks stay visible briefly so the row can collapse. */
  lingering: Record<string, number>;
  confirm: ConfirmRequest | null;
  /** Show the "full day" hint in My Day (once per day). */
  fullDayHint: boolean;
  /** A new service worker is waiting. */
  updateReady: (() => void) | null;
}

export interface ConfirmRequest {
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
}

export const useUI = create<UIState>()(() => ({
  toast: null,
  moveTaskId: null,
  actionsTaskId: null,
  conflict: null,
  quickAddOpen: false,
  selectedTaskId: null,
  lingering: {},
  confirm: null,
  fullDayHint: false,
  updateReady: null,
}));

/** A small, single question. Resolves true when confirmed. */
export function askConfirm(
  text: string,
  confirmLabel: string,
  cancelLabel = 'Cancel',
): Promise<boolean> {
  return new Promise((resolve) => {
    useUI.getState().confirm?.resolve(false);
    useUI.setState({
      confirm: {
        text,
        confirmLabel,
        cancelLabel,
        resolve: (ok) => {
          useUI.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(
  text: string,
  action?: Toast['action'],
  opts: { sticky?: boolean } = {},
): void {
  clearTimeout(toastTimer);
  const toast: Toast = { id: ++toastSeq, text, action, sticky: opts.sticky };
  useUI.setState({ toast });
  if (!opts.sticky) {
    toastTimer = setTimeout(() => {
      if (useUI.getState().toast?.id === toast.id) useUI.setState({ toast: null });
    }, 5000);
  }
}

export function dismissToast(): void {
  clearTimeout(toastTimer);
  useUI.setState({ toast: null });
}

/** Completed rows stay visible for the check (180ms) plus the pause before collapsing (700ms). */
export const LINGER_MS = 950;

export function linger(taskId: string): void {
  const until = Date.now() + LINGER_MS;
  useUI.setState((s) => ({ lingering: { ...s.lingering, [taskId]: until } }));
  setTimeout(() => {
    useUI.setState((s) => {
      const { [taskId]: _gone, ...rest } = s.lingering;
      return { lingering: rest };
    });
  }, LINGER_MS);
}

export function unlinger(taskId: string): void {
  useUI.setState((s) => {
    const { [taskId]: _gone, ...rest } = s.lingering;
    return { lingering: rest };
  });
}
