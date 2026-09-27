import { liveSubtasks, nextAction, type Task } from '@frog/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle } from '../components/CheckCircle';
import { NotesField } from '../components/NotesField';
import { ConfirmDialog, Toasts } from '../components/Toasts';
import { logFocusSession, toggleStep } from '../data/actions';
import { deleteMeta, getMeta, saveMeta } from '../data/db';
import { useData } from '../data/store';
import { requestComplete } from '../lib/complete';
import { notify, requestNotifyPermission } from '../lib/notify';
import { playChime, primeAudio } from '../lib/sound';
import {
  elapsedMs,
  formatRemaining,
  newTimer,
  pauseTimer,
  remainingMs,
  resumeTimer,
  sessionOutcome,
  type TimerState,
} from '../lib/timer';
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock';

type Phase = 'loading' | 'setup' | 'running' | 'paused' | 'ended';

const presetLabel = (m: number) => (m === 5 ? 'Just 5 minutes' : `${m} minutes`);

function logSession(t: TimerState, now: number): void {
  const { completed, actualMinutes } = sessionOutcome(t, now);
  logFocusSession({
    taskId: t.taskId,
    start: t.startedAt,
    plannedMinutes: t.plannedMinutes,
    actualMinutes,
    completed,
  });
}

function FocusSteps({ task }: { task: Task }) {
  const steps = liveSubtasks(task);
  if (steps.length === 0) return null;
  return (
    <ul className="focus__steps" aria-label="Steps">
      {steps.map((s) => (
        <li key={s.id} className="focus__step" data-done={s.done || undefined}>
          <CheckCircle
            size="step"
            checked={s.done}
            label={s.done ? `Mark ${s.title} not done` : `Mark ${s.title} done`}
            onToggle={() => toggleStep(task.id, s.id)}
          />
          <span>{s.title}</span>
        </li>
      ))}
    </ul>
  );
}

export function FocusScreen() {
  const { taskId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const task = useData((s) => s.tasks[taskId]);
  const settings = useData((s) => s.settings);
  const presets = settings.timerPresets;

  const [phase, setPhase] = useState<Phase>('loading');
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [preset, setPreset] = useState(() =>
    presets.includes(25) ? 25 : (presets[Math.min(1, presets.length - 1)] ?? 25),
  );
  const [now, setNow] = useState(() => Date.now());
  const [reachedZero, setReachedZero] = useState(false);
  const timerRef = useRef<TimerState | null>(null);
  timerRef.current = timer;

  const leave = useCallback(() => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/', { replace: true });
  }, [location.key, navigate]);

  const start = useCallback(
    (minutes: number) => {
      const t = newTimer(taskId, minutes, Date.now());
      void saveMeta('timer', t);
      setTimer(t);
      setPreset(minutes);
      setReachedZero(false);
      setPhase('running');
      setNow(Date.now());
    },
    [taskId],
  );

  /** Logs the session and clears the persisted timer. */
  const finish = useCallback((t: TimerState, zero: boolean) => {
    logSession(t, Date.now());
    void deleteMeta('timer');
    setTimer(null);
    setReachedZero(zero);
    setPhase('ended');
    void releaseWakeLock();
  }, []);

  // Restore a persisted timer (reload, app killed) or start from ?minutes=.
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void (async () => {
      let saved = (await getMeta<TimerState>('timer')) ?? null;
      if (saved && saved.taskId !== taskId) {
        logSession(saved, Date.now());
        await deleteMeta('timer');
        saved = null;
      }
      if (saved) {
        setTimer(saved);
        setPreset(saved.plannedMinutes);
        if (remainingMs(saved, Date.now()) <= 0) finish(saved, true);
        else setPhase(saved.pausedAt ? 'paused' : 'running');
        return;
      }
      const minutes = Number(params.get('minutes'));
      if (minutes > 0) start(minutes);
      else setPhase('setup');
    })();
  }, [taskId, params, start, finish]);

  // Tick from the wall clock; reaching zero ends the session.
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const t = timerRef.current;
      if (!t) return;
      const n = Date.now();
      setNow(n);
      if (remainingMs(t, n) <= 0) {
        finish(t, true);
        if (settings.sounds) playChime();
        void notify('Time is up', task?.title ?? 'Focus session finished');
      }
    };
    const id = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [phase, finish, settings.sounds, task?.title]);

  // Keep the screen on while running.
  useEffect(() => {
    if (phase !== 'running' || !settings.wakeLock) return;
    void acquireWakeLock();
    const onVisible = () => document.visibilityState === 'visible' && void acquireWakeLock();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void releaseWakeLock();
    };
  }, [phase, settings.wakeLock]);

  const onStart = (minutes: number) => {
    primeAudio();
    requestNotifyPermission();
    start(minutes);
  };

  const pause = () => {
    if (!timer) return;
    const t = pauseTimer(timer, Date.now());
    void saveMeta('timer', t);
    setTimer(t);
    setPhase('paused');
  };

  const resume = () => {
    if (!timer) return;
    const t = resumeTimer(timer, Date.now());
    void saveMeta('timer', t);
    setTimer(t);
    setPhase('running');
  };

  const exit = () => {
    if (timer) {
      logSession(timer, Date.now());
      void deleteMeta('timer');
    }
    void releaseWakeLock();
    leave();
  };

  if (!task || task.deleted) {
    return (
      <main className="focus">
        <div className="focus__bar">
          <button className="btn btn--text focus__exit" onClick={exit}>
            Exit
          </button>
        </div>
        <div className="focus__col">
          <p className="empty">This task no longer exists.</p>
        </div>
      </main>
    );
  }

  const next = nextAction(task);
  const remaining = timer ? remainingMs(timer, now) : preset * 60_000;
  const progress = timer ? Math.min(1, elapsedMs(timer, now) / (timer.plannedMinutes * 60_000)) : 0;

  return (
    <main className="focus" data-phase={phase}>
      <div className="focus__bar">
        <button className="btn btn--text focus__exit" onClick={exit}>
          Exit
        </button>
      </div>
      <div className="focus__col">
        <h1 className="focus__task">{task.title}</h1>
        {next && <p className="focus__next">Next: {next.title}</p>}

        {phase === 'ended' ? (
          <section className="focus__end" aria-live="polite">
            <p className="focus__end-title">{reachedZero ? 'Time is up.' : 'Session ended.'}</p>
            <div className="focus__end-actions">
              <button
                className="btn btn--ink btn--block"
                onClick={async () => {
                  if (await requestComplete(task.id)) leave();
                }}
              >
                Done
              </button>
              <button className="btn btn--secondary btn--block" onClick={() => onStart(preset)}>
                Keep going
              </button>
              <button className="btn btn--text btn--block" onClick={leave}>
                Take a break
              </button>
            </div>
          </section>
        ) : (
          <section className="focus__timer-block" aria-label="Timer">
            <p className="focus__timer num" role="timer" aria-live="off">
              {formatRemaining(remaining)}
            </p>
            <div className="focus__progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>

            {phase === 'setup' && (
              <>
                <div className="focus__presets" role="radiogroup" aria-label="Length">
                  {presets.map((m) => (
                    <button
                      key={m}
                      role="radio"
                      aria-checked={preset === m}
                      className="focus__preset"
                      onClick={() => setPreset(m)}
                    >
                      {presetLabel(m)}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn--primary btn--block focus__go"
                  onClick={() => onStart(preset)}
                >
                  Start
                </button>
              </>
            )}

            {(phase === 'running' || phase === 'paused') && timer && (
              <div className="focus__controls">
                {phase === 'running' ? (
                  <button className="btn btn--secondary" onClick={pause}>
                    Pause
                  </button>
                ) : (
                  <button className="btn btn--secondary" onClick={resume}>
                    Resume
                  </button>
                )}
                <button className="btn btn--secondary" onClick={() => finish(timer, false)}>
                  End
                </button>
              </div>
            )}
          </section>
        )}

        <FocusSteps task={task} />
        <details className="focus__notes">
          <summary>Notes</summary>
          <NotesField task={task} />
        </details>
      </div>
      <Toasts />
      <ConfirmDialog />
    </main>
  );
}
