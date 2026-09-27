import { useEffect } from 'react';
import { useUI } from '../data/ui';

/**
 * The ordered task ids currently on screen, for J/K selection. The most
 * recently mounted list wins; the Matrix registers all four cells in order.
 */
let visible: string[] = [];

export function useVisibleTasks(ids: string[]): void {
  const key = ids.join(',');
  useEffect(() => {
    visible = key ? key.split(',') : [];
    const selected = useUI.getState().selectedTaskId;
    if (selected && !visible.includes(selected)) useUI.setState({ selectedTaskId: null });
    return () => {
      if (visible.join(',') === key) visible = [];
    };
  }, [key]);
}

export function moveSelection(delta: 1 | -1): string | null {
  if (visible.length === 0) return null;
  const current = useUI.getState().selectedTaskId;
  const i = current ? visible.indexOf(current) : -1;
  const next =
    i === -1
      ? delta === 1
        ? 0
        : visible.length - 1
      : Math.min(visible.length - 1, Math.max(0, i + delta));
  const id = visible[next] ?? null;
  useUI.setState({ selectedTaskId: id });
  if (id) {
    document
      .querySelector(`[data-task-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  return id;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
