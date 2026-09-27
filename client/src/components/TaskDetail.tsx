import { QUADRANT_LABEL, quadrantOf, type Task } from '@frog/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addToMyDay,
  liveLists,
  makeFrog,
  removeFromMyDay,
  removeTask,
  reopen,
  unarchive,
  updateTask,
} from '../data/actions';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { requestComplete } from '../lib/complete';
import { useIsDesktop, useTaskDetail } from '../lib/hooks';
import { useToday } from '../lib/time';
import { CheckCircle } from './CheckCircle';
import { CloseIcon } from './Icons';
import { Menu } from './Menu';
import { NotesField } from './NotesField';
import { Sheet } from './Sheet';
import { StepsEditor } from './StepsEditor';

function TitleField({ task }: { task: Task }) {
  const [title, setTitle] = useState(task.title);
  const editing = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing.current) setTitle(task.title);
  }, [task.title]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  return (
    <textarea
      ref={ref}
      className="detail__title"
      aria-label="Title"
      rows={1}
      value={title}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        editing.current = false;
        const trimmed = title.trim();
        if (trimmed) updateTask(task.id, { title: trimmed });
        else setTitle(task.title);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function DetailBody({
  task,
  close,
  showClose,
}: {
  task: Task;
  close: () => void;
  showClose: boolean;
}) {
  const navigate = useNavigate();
  const { params } = useTaskDetail();
  const today = useToday();
  const settings = useData((s) => s.settings);
  const lists = useData((s) => s.lists);
  const day = useData((s) => s.days[today]);
  const quadrant = quadrantOf(task, { today, urgencyWindowDays: settings.urgencyWindowDays });
  const inMyDay = !!day && (day.myDay.includes(task.id) || day.frog === task.id);
  const isFrog = day?.frog === task.id;
  const waitingRef = useRef<HTMLInputElement>(null);
  const focusField = params.get('focus');
  const done = task.status === 'done';
  const archived = task.status === 'archived';

  useEffect(() => {
    if (focusField === 'waiting') waitingRef.current?.focus();
  }, [focusField, task.id]);

  const list = lists[task.listId];
  const listOptions = liveLists(lists);
  if (list && list.deleted) listOptions.push(list);

  return (
    <div className="detail">
      <div className="detail__scroll">
        <div className="detail__head">
          <CheckCircle
            checked={done}
            label={done ? 'Reopen task' : 'Complete task'}
            onToggle={() => (done ? reopen(task.id) : void requestComplete(task.id))}
          />
          <TitleField task={task} />
          <Menu
            label="Task options"
            items={[
              !done &&
                !archived &&
                !inMyDay && { label: 'Add to My Day', onSelect: () => addToMyDay(task.id) },
              !done &&
                inMyDay && {
                  label: 'Remove from My Day',
                  onSelect: () => removeFromMyDay(task.id),
                },
              !done &&
                !archived &&
                task.important &&
                !isFrog && {
                  label: "Make today's Frog",
                  onSelect: () => makeFrog(task.id),
                },
              archived && { label: 'Restore', onSelect: () => unarchive(task.id) },
              {
                label: 'Delete',
                danger: true,
                onSelect: () => {
                  close();
                  removeTask(task.id);
                },
              },
            ]}
          />
          {showClose && (
            <button className="icon-btn" aria-label="Close" onClick={close}>
              <CloseIcon />
            </button>
          )}
        </div>

        <dl className="detail__meta">
          <div className="meta-field">
            <dt>
              <label htmlFor="detail-due">Due</label>
            </dt>
            <dd>
              <input
                id="detail-due"
                className="meta-input num"
                type="date"
                value={task.due ?? ''}
                onChange={(e) => updateTask(task.id, { due: e.target.value || null })}
              />
            </dd>
          </div>
          <div className="meta-field">
            <dt>Quadrant</dt>
            <dd>
              <button
                className="meta-button"
                onClick={() => useUI.setState({ moveTaskId: task.id })}
              >
                <span className="q-dot" data-q={quadrant} aria-hidden="true" />
                {QUADRANT_LABEL[quadrant]}
              </button>
            </dd>
          </div>
          <div className="meta-field">
            <dt>
              <label htmlFor="detail-list">List</label>
            </dt>
            <dd>
              <select
                id="detail-list"
                className="meta-input"
                value={task.listId}
                onChange={(e) => updateTask(task.id, { listId: e.target.value })}
              >
                {listOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </dd>
          </div>
          {quadrant === 'delegate' && (
            <>
              <div className="meta-field">
                <dt>
                  <label htmlFor="detail-waiting">Waiting on</label>
                </dt>
                <dd>
                  <input
                    id="detail-waiting"
                    ref={waitingRef}
                    className="meta-input"
                    placeholder="Name"
                    defaultValue={task.waitingOn ?? ''}
                    key={task.waitingOn ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== task.waitingOn) updateTask(task.id, { waitingOn: v });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </dd>
              </div>
              <div className="meta-field">
                <dt>
                  <label htmlFor="detail-follow">Follow up</label>
                </dt>
                <dd>
                  <input
                    id="detail-follow"
                    className="meta-input num"
                    type="date"
                    value={task.followUp ?? ''}
                    onChange={(e) => updateTask(task.id, { followUp: e.target.value || null })}
                  />
                </dd>
              </div>
            </>
          )}
        </dl>

        <StepsEditor task={task} slice={params.get('slice') === '1'} />
        <NotesField task={task} />
      </div>

      {!done && !archived && (
        <div className="detail__footer">
          <button
            className="btn btn--primary btn--block"
            onClick={() => navigate(`/focus/${task.id}`)}
          >
            Start
          </button>
        </div>
      )}
    </div>
  );
}

/** Bottom sheet on mobile; right panel (420px) beside the list on desktop. */
export function TaskDetail() {
  const { taskId, closeTask } = useTaskDetail();
  const task = useData((s) => (taskId ? s.tasks[taskId] : undefined));
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!isDesktop || !task) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !(e.target instanceof HTMLTextAreaElement))
        closeTask();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, task, closeTask]);

  if (!task || task.deleted) return null;

  if (isDesktop) {
    return (
      <aside className="panel" aria-label="Task details" key={task.id}>
        <DetailBody task={task} close={closeTask} showClose />
      </aside>
    );
  }
  return (
    <Sheet label="Task details" onClose={closeTask} key={task.id}>
      <DetailBody task={task} close={closeTask} showClose={false} />
    </Sheet>
  );
}
