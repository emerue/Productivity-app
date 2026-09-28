import {
  hasNotes,
  isOverdue,
  quadrantOf,
  stepProgress,
  type DateStr,
  type Task,
} from '@frog/shared';
import { memo, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { addToMyDay, reopen } from '../data/actions';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { requestComplete } from '../lib/complete';
import { taskSubtitle } from '../lib/format';
import { useTaskDetail } from '../lib/hooks';
import { formatDue } from '../lib/time';
import { CheckCircle } from './CheckCircle';
import { MoreIcon, NoteIcon, PlayIcon } from './Icons';

interface TaskRowProps {
  task: Task;
  today: DateStr;
  dimmed?: boolean;
  /** 3px quadrant edge (Matrix and Lists). */
  edge?: boolean;
  /** Hide the "My Day" swipe action (already in My Day). */
  inMyDay?: boolean;
  /** Show the task's list name (Agenda, where rows from every list mix). */
  showList?: boolean;
}

const REVEAL_WIDTH = 216;
const COMPLETE_AT = 96;

export const TaskRow = memo(function TaskRow({
  task,
  today,
  dimmed,
  edge,
  inMyDay,
  showList,
}: TaskRowProps) {
  const navigate = useNavigate();
  const { openTask } = useTaskDetail();
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const selected = useUI((s) => s.selectedTaskId === task.id);
  const lingering = useUI((s) => task.id in s.lingering);
  const listName = useData((s) => (showList ? s.lists[task.listId]?.name : undefined));
  const quadrant = quadrantOf(task, { today, urgencyWindowDays });
  const subtitle = taskSubtitle(task, quadrant, today);
  const steps = stepProgress(task);
  const done = task.status === 'done';
  const overdue = !done && isOverdue(task, today);

  // Swipe (touch only): right completes, left reveals actions.
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    base: number;
    decided: boolean;
    horizontal: boolean;
  } | null>(null);
  const swiped = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!revealed) return;
    const close = (e: Event) => {
      if (!rowRef.current?.contains(e.target as Node)) {
        setRevealed(false);
        setDx(0);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [revealed]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      base: revealed ? -REVEAL_WIDTH : 0,
      decided: false,
      horizontal: false,
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (!g.decided) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      g.decided = true;
      g.horizontal = Math.abs(mx) > Math.abs(my) * 1.2;
      if (!g.horizontal) {
        gesture.current = null;
        return;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    setDx(Math.max(-REVEAL_WIDTH - 24, Math.min(done ? 0 : 140, g.base + mx)));
  };
  const endGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal) return;
    swiped.current = true;
    setTimeout(() => (swiped.current = false), 50);
    setDragging(false);
    if (dx >= COMPLETE_AT) {
      setDx(0);
      setRevealed(false);
      void requestComplete(task.id);
    } else if (dx <= -56) {
      setDx(-REVEAL_WIDTH);
      setRevealed(true);
    } else {
      setDx(0);
      setRevealed(false);
    }
  };

  const closeReveal = () => {
    setRevealed(false);
    setDx(0);
  };
  const start = () => navigate(`/focus/${task.id}`);
  const inDayNow = useData((s) => {
    const d = s.days[today];
    return !!d && (d.frog === task.id || d.myDay.includes(task.id));
  });
  const inDay = inMyDay ?? inDayNow;

  return (
    <div
      ref={rowRef}
      className="row"
      role="listitem"
      data-task-id={task.id}
      data-q={edge ? quadrant : undefined}
      data-dimmed={dimmed || undefined}
      data-selected={selected || undefined}
      data-done={done || undefined}
      data-lingering={lingering || undefined}
    >
      <div className="row__actions" aria-hidden={!revealed}>
        <button className="row__action" tabIndex={revealed ? 0 : -1} onClick={start}>
          Start
        </button>
        <button
          className="row__action"
          tabIndex={revealed ? 0 : -1}
          disabled={inDay || done}
          onClick={() => {
            closeReveal();
            addToMyDay(task.id);
          }}
        >
          My Day
        </button>
        <button
          className="row__action"
          tabIndex={revealed ? 0 : -1}
          onClick={() => {
            closeReveal();
            useUI.setState({ actionsTaskId: task.id });
          }}
        >
          More
        </button>
      </div>
      <div
        className="row__inner"
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <CheckCircle
          checked={done}
          label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          onToggle={() => (done ? reopen(task.id) : void requestComplete(task.id))}
        />
        <button
          className="row__main"
          onClick={() => {
            if (revealed) closeReveal();
            else openTask(task.id);
          }}
        >
          <span className="row__title">{task.title || 'Untitled'}</span>
          {subtitle && <span className="row__sub">{subtitle}</span>}
        </button>
        <span className="row__meta">
          {listName && <span className="row__list">{listName}</span>}
          {task.due && !done && (
            <span className={overdue ? 'row__due is-overdue' : 'row__due'}>
              {formatDue(task.due, today)}
            </span>
          )}
          {steps.total > 0 && (
            <span className="num" aria-label={`${steps.done} of ${steps.total} steps`}>
              {steps.done}/{steps.total}
            </span>
          )}
          {hasNotes(task) && <NoteIcon className="row__note" />}
        </span>
        {!done && (
          <button
            className="icon-btn row__start"
            aria-label={`Start ${task.title}`}
            onClick={start}
          >
            <PlayIcon />
          </button>
        )}
        <button
          className="icon-btn row__more"
          aria-label={`More actions for ${task.title || 'task'}`}
          aria-haspopup="dialog"
          onClick={() => {
            if (revealed) closeReveal();
            useUI.setState({ actionsTaskId: task.id });
          }}
        >
          <MoreIcon size={20} />
        </button>
      </div>
    </div>
  );
});
