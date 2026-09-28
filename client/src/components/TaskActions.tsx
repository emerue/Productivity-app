import { QUADRANT_LABEL, quadrantOf } from '@frog/shared';
import { useCallback, useEffect } from 'react';
import {
  addToMyDay,
  liveLists,
  moveToList,
  removeFromMyDay,
  removeTask,
  reopen,
  unarchive,
  updateTask,
} from '../data/actions';
import { useData } from '../data/store';
import { dismissToast, useUI } from '../data/ui';
import { useTaskDetail } from '../lib/hooks';
import { useToday } from '../lib/time';
import { Modal } from './Modal';

function ActionsFor({ taskId }: { taskId: string }) {
  const task = useData((s) => s.tasks[taskId]);
  const lists = useData((s) => s.lists);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const today = useToday();
  const day = useData((s) => s.days[today]);
  const { openTask } = useTaskDetail();
  const close = useCallback(() => useUI.setState({ actionsTaskId: null }), []);
  if (!task || task.deleted) return null;

  const done = task.status === 'done';
  const archived = task.status === 'archived';
  const inMyDay = !!day && (day.frog === task.id || day.myDay.includes(task.id));
  const quadrant = quadrantOf(task, { today, urgencyWindowDays });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <Modal label={`Actions for ${task.title || 'task'}`} onClose={close}>
      <h2 className="modal-title actions__title">{task.title || 'Untitled'}</h2>
      <ul className="choice-list">
        <li>
          <button className="choice" onClick={run(() => openTask(task.id))}>
            <span className="choice__label">Edit details</span>
            <span className="choice__note">Title, steps, notes</span>
          </button>
        </li>
        {!done && !archived && (
          <li>
            <button
              className="choice"
              onClick={run(() => (inMyDay ? removeFromMyDay(task.id) : addToMyDay(task.id)))}
            >
              <span className="choice__label">
                {inMyDay ? 'Remove from My Day' : 'Add to My Day'}
              </span>
            </button>
          </li>
        )}
        {done && (
          <li>
            <button className="choice" onClick={run(() => reopen(task.id))}>
              <span className="choice__label">Reopen</span>
            </button>
          </li>
        )}
        {archived && (
          <li>
            <button className="choice" onClick={run(() => unarchive(task.id))}>
              <span className="choice__label">Restore</span>
            </button>
          </li>
        )}
        {!archived && (
          <li>
            <button
              className="choice"
              onClick={() => useUI.setState({ actionsTaskId: null, moveTaskId: task.id })}
            >
              <span className="q-dot" data-q={quadrant} aria-hidden="true" />
              <span className="choice__label">Change quadrant</span>
              <span className="choice__note">{QUADRANT_LABEL[quadrant]}</span>
            </button>
          </li>
        )}
        <li className="actions__due">
          <label className="choice__label" htmlFor="actions-due">
            Due date
          </label>
          <input
            id="actions-due"
            className="meta-input num"
            type="date"
            value={task.due ?? ''}
            onChange={(e) => updateTask(task.id, { due: e.target.value || null })}
          />
          {task.due && (
            <button
              className="btn btn--text btn--small"
              onClick={() => updateTask(task.id, { due: null })}
            >
              Clear
            </button>
          )}
        </li>
      </ul>

      <h3 className="actions__section">Move to list</h3>
      <ul className="choice-list actions__lists">
        {liveLists(lists).map((l) => (
          <li key={l.id}>
            <button
              className="choice"
              aria-current={l.id === task.listId || undefined}
              onClick={run(() => moveToList(task.id, l.id))}
            >
              <span className="choice__label">{l.name}</span>
              {l.id === task.listId && <span className="choice__note">Current</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="dialog__actions modal-actions actions__footer">
        <button className="btn btn--danger" onClick={run(() => removeTask(task.id))}>
          Delete task
        </button>
        <button className="btn btn--text" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** Everything you can do to a task from its row: edit, due, list, quadrant, My Day, delete. */
export function TaskActions() {
  const taskId = useUI((s) => s.actionsTaskId);
  // A sticky "Undo" toast would sit on top of the sheet.
  useEffect(() => {
    if (taskId) dismissToast();
  }, [taskId]);
  return taskId ? <ActionsFor key={taskId} taskId={taskId} /> : null;
}
