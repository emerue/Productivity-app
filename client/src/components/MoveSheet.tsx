import { QUADRANT_LABEL, QUADRANTS, quadrantOf, type Quadrant } from '@frog/shared';
import { useCallback, useState } from 'react';
import { moveTask, updateTask } from '../data/actions';
import { useData } from '../data/store';
import { showToast, useUI } from '../data/ui';
import { useTaskDetail } from '../lib/hooks';
import { formatDueInline, useToday } from '../lib/time';
import { Modal } from './Modal';

/**
 * Moves a task and handles the follow-ups: Delegate focuses "Waiting on";
 * a due-date conflict opens the date prompt (via `ui.conflict`).
 */
export function useMoveTask() {
  const { openTask } = useTaskDetail();
  return useCallback(
    (id: string, target: Quadrant) => {
      const result = moveTask(id, target);
      if (result === 'ok' && target === 'delegate') openTask(id, { focus: 'waiting' });
    },
    [openTask],
  );
}

function MoveChooser({ taskId }: { taskId: string }) {
  const task = useData((s) => s.tasks[taskId]);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const today = useToday();
  const move = useMoveTask();
  const close = useCallback(() => useUI.setState({ moveTaskId: null }), []);
  if (!task) return null;
  const current = quadrantOf(task, { today, urgencyWindowDays });

  return (
    <Modal label="Move to" onClose={close}>
      <h2 className="modal-title">Move to…</h2>
      <ul className="choice-list">
        {QUADRANTS.map((q) => (
          <li key={q}>
            <button
              className="choice"
              aria-current={q === current || undefined}
              onClick={() => {
                close();
                if (q !== current) move(taskId, q);
              }}
            >
              <span className="q-dot" data-q={q} aria-hidden="true" />
              <span className="choice__label">{QUADRANT_LABEL[q]}</span>
              {q === current && <span className="choice__note">Current</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function DueConflict({ taskId, target }: { taskId: string; target: 'schedule' | 'drop' }) {
  const task = useData((s) => s.tasks[taskId]);
  const today = useToday();
  const [date, setDate] = useState(task?.due ?? '');
  const close = useCallback(() => useUI.setState({ conflict: null }), []);
  if (!task?.due) return null;

  return (
    <Modal label="Due date" onClose={close}>
      <p className="modal-text">
        Due {formatDueInline(task.due, today)} makes this urgent. Change the due date?
      </p>
      <label className="visually-hidden" htmlFor="conflict-date">
        New due date
      </label>
      <input
        id="conflict-date"
        className="field num"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className="dialog__actions modal-actions">
        <button className="btn btn--text" onClick={close}>
          Keep as is
        </button>
        <button
          className="btn btn--ink"
          disabled={!date || date === task.due}
          onClick={() => {
            updateTask(taskId, { due: date });
            close();
            showToast(`Moved to ${QUADRANT_LABEL[target]}`);
          }}
        >
          Change date
        </button>
      </div>
    </Modal>
  );
}

/** "Move to…" chooser and the due-date conflict prompt. */
export function MoveSheet() {
  const moveTaskId = useUI((s) => s.moveTaskId);
  const conflict = useUI((s) => s.conflict);
  if (conflict) return <DueConflict key={conflict.taskId} {...conflict} />;
  if (moveTaskId) return <MoveChooser key={moveTaskId} taskId={moveTaskId} />;
  return null;
}
