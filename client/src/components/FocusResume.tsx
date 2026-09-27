import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMeta } from '../data/db';
import type { TimerState } from '../lib/timer';

/**
 * On app start, a persisted focus timer means the app was closed mid-session:
 * reopen Focus Mode. If the time ran out meanwhile, Focus shows the end screen
 * and logs the session.
 */
export function FocusResume() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    void getMeta<TimerState>('timer').then((t) => {
      if (t && pathname !== `/focus/${t.taskId}`) navigate(`/focus/${t.taskId}`);
    });
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
