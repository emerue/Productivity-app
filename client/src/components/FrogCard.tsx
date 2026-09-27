import { isOverdue, nextAction, stepProgress, type DateStr, type Task } from '@frog/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reopen } from '../data/actions';
import { useData } from '../data/store';
import { requestComplete } from '../lib/complete';
import { useReducedMotion, useTaskDetail } from '../lib/hooks';
import { formatClock, formatDue } from '../lib/time';
import { CheckCircle } from './CheckCircle';
import { FrogGlyph } from './Icons';

interface FrogProps {
  task: Task;
  today: DateStr;
}

function FrogCard({ task, today }: FrogProps) {
  const navigate = useNavigate();
  const { openTask } = useTaskDetail();
  const next = nextAction(task);
  const steps = stepProgress(task);
  const meta = [
    steps.total > 0 ? `${steps.done}/${steps.total}` : null,
    task.due ? formatDue(task.due, today) : null,
  ].filter(Boolean);
  const overdue = isOverdue(task, today);
  const done = task.status === 'done';

  return (
    <section className="frog" aria-labelledby="frog-title" data-task-id={task.id}>
      <p className="frog__label">
        <FrogGlyph size={20} />
        Today's Frog
      </p>
      <div className="frog__body">
        <CheckCircle
          checked={done}
          label={`Complete ${task.title}`}
          onToggle={() => (done ? reopen(task.id) : void requestComplete(task.id))}
        />
        <div className="frog__text">
          <h2 id="frog-title" className="frog__title">
            <button onClick={() => openTask(task.id)}>{task.title || 'Untitled'}</button>
          </h2>
          {next && <p className="frog__next">Next: {next.title}</p>}
          {meta.length > 0 && (
            <p className="frog__meta num">
              {steps.total > 0 && (
                <span>
                  {steps.done}/{steps.total}
                </span>
              )}
              {steps.total > 0 && task.due && <span aria-hidden="true"> · </span>}
              {task.due && (
                <span className={overdue ? 'is-overdue' : undefined}>
                  {formatDue(task.due, today)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="frog__actions">
        <button
          className="btn btn--primary frog__start"
          onClick={() => navigate(`/focus/${task.id}`)}
        >
          Start
        </button>
        <button
          className="btn btn--text frog__five"
          onClick={() => navigate(`/focus/${task.id}?minutes=5`)}
        >
          Just 5 minutes
        </button>
      </div>
    </section>
  );
}

function FrogDone({ task, entering }: { task: Task; entering?: boolean }) {
  const tz = useData((s) => s.settings.timezone);
  const { openTask } = useTaskDetail();
  return (
    <p className={entering ? 'frog-done is-entering' : 'frog-done'}>
      <button onClick={() => openTask(task.id)}>
        <FrogGlyph size={16} />
        <span>Frog done{task.completedAt ? ` at ${formatClock(task.completedAt, tz)}` : ''}</span>
      </button>
    </p>
  );
}

/**
 * The Frog card, and the one orchestrated moment: on completion the card
 * compresses (~500ms) into a single calm line.
 */
export function FrogSlot({ task, today }: FrogProps) {
  const done = task.status === 'done';
  const reduced = useReducedMotion();
  const wasDone = useRef(done);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const justCompleted = !wasDone.current && done;
    wasDone.current = done;
    if (!justCompleted || reduced) return;
    setClosing(true);
    const t = setTimeout(() => setClosing(false), 520);
    return () => clearTimeout(t);
  }, [done, reduced]);

  if (done && !closing) return <FrogDone task={task} />;
  return (
    <div className={closing ? 'frog-slot is-closing' : 'frog-slot'}>
      <div className="frog-slot__card">
        <div>
          <FrogCard task={task} today={today} />
        </div>
      </div>
      {closing && <FrogDone task={task} entering />}
    </div>
  );
}
