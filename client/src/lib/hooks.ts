import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Opens and closes the task detail, addressed by `?task=<id>` on the current route. */
export function useTaskDetail() {
  const [params, setParams] = useSearchParams();
  const openTask = useCallback(
    (id: string, extra: Record<string, string> = {}) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('task', id);
        next.delete('slice');
        next.delete('focus');
        for (const [k, v] of Object.entries(extra)) next.set(k, v);
        return next;
      });
    },
    [setParams],
  );
  const closeTask = useCallback(() => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('task');
      next.delete('slice');
      next.delete('focus');
      return next;
    });
  }, [setParams]);
  return { taskId: params.get('task'), params, openTask, closeTask };
}

/** Value that follows `value` after it stops changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
