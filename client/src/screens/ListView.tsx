import {
  QUADRANT_LABEL,
  QUADRANTS,
  quadrantOf,
  type List,
  type Quadrant,
  type Task,
} from '@frog/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from '../components/Icons';
import { Menu } from '../components/Menu';
import { Modal } from '../components/Modal';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { deleteList, liveLists, renameList, unarchive } from '../data/actions';
import { useData } from '../data/store';
import { askConfirm, useUI } from '../data/ui';
import { rankWithLingering } from '../lib/format';
import { useIsDesktop, useTaskDetail } from '../lib/hooks';
import { useVisibleTasks } from '../lib/keyboard';
import { useToday } from '../lib/time';

function BackToLists() {
  return (
    <Link to="/lists" className="icon-btn back-link" aria-label="Back to Lists">
      <ChevronLeft />
    </Link>
  );
}

function DeleteListDialog({
  list,
  taskCount,
  onClose,
}: {
  list: List;
  taskCount: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const lists = useData((s) => s.lists);
  const others = liveLists(lists).filter((l) => l.id !== list.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <Modal label="Delete list" onClose={onClose}>
      <h2 className="modal-title">Delete {list.name}?</h2>
      <p className="modal-text">
        It has {taskCount} {taskCount === 1 ? 'task' : 'tasks'}. Move{' '}
        {taskCount === 1 ? 'it' : 'them'} to:
      </p>
      <label className="visually-hidden" htmlFor="move-to-list">
        Move tasks to
      </label>
      <select
        id="move-to-list"
        className="field"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        {others.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <div className="dialog__actions modal-actions">
        <button className="btn btn--text" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn--danger"
          disabled={!target}
          onClick={() => {
            onClose();
            deleteList(list.id, target);
            navigate('/lists', { replace: true });
          }}
        >
          Move and delete
        </button>
      </div>
    </Modal>
  );
}

function ListHeader({ list, taskCount }: { list: List; taskCount: number }) {
  const navigate = useNavigate();
  const lists = useData((s) => s.lists);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(list.name);
  const [deleting, setDeleting] = useState(false);
  const closeDelete = useCallback(() => setDeleting(false), []);
  const onlyList = liveLists(lists).length <= 1;

  const save = () => {
    renameList(list.id, name);
    setRenaming(false);
  };

  return (
    <header className="screen-head">
      <BackToLists />
      {renaming ? (
        <input
          className="field screen-head__rename"
          aria-label="List name"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              setName(list.name);
              setRenaming(false);
            }
          }}
        />
      ) : (
        <h1>{list.name}</h1>
      )}
      <Menu
        label="List options"
        items={[
          {
            label: 'Rename',
            onSelect: () => {
              setName(list.name);
              setRenaming(true);
            },
          },
          {
            label: 'Delete list',
            danger: true,
            disabled: onlyList,
            onSelect: async () => {
              if (taskCount > 0) {
                setDeleting(true);
              } else if (await askConfirm(`Delete ${list.name}?`, 'Delete')) {
                deleteList(list.id, null);
                navigate('/lists', { replace: true });
              }
            },
          },
        ]}
      />
      {deleting && <DeleteListDialog list={list} taskCount={taskCount} onClose={closeDelete} />}
    </header>
  );
}

function OneList({ list }: { list: List }) {
  const today = useToday();
  const isDesktop = useIsDesktop();
  const tasks = useData((s) => s.tasks);
  const lingering = useUI((s) => s.lingering);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const [showDone, setShowDone] = useState(false);

  const { groups, done, total } = useMemo(() => {
    const ctx = { today, urgencyWindowDays };
    const inList = Object.values(tasks).filter((t) => !t.deleted && t.listId === list.id);
    const g: Record<Quadrant, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
    for (const t of rankWithLingering(inList, lingering, { target: today, settings: ctx }))
      g[quadrantOf(t, ctx)].push(t);
    const d = inList
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return { groups: g, done: d, total: inList.length };
  }, [tasks, list.id, today, urgencyWindowDays, lingering]);

  const openCount = QUADRANTS.reduce((n, q) => n + groups[q].length, 0);
  useVisibleTasks([
    ...QUADRANTS.flatMap((q) => groups[q].map((t) => t.id)),
    ...(showDone ? done.map((t) => t.id) : []),
  ]);

  return (
    <section className="screen list-view">
      <ListHeader list={list} taskCount={total} />
      <QuickAddInline />
      {openCount === 0 && (
        <p className="empty">
          {isDesktop ? 'No tasks here yet. Add one above.' : 'No tasks here yet. Add one with +.'}
        </p>
      )}
      {QUADRANTS.filter((q) => groups[q].length > 0).map((q) => (
        <section key={q} className="group" aria-labelledby={`group-${q}`}>
          <h2 className="group__title" id={`group-${q}`}>
            <span className="q-dot" data-q={q} aria-hidden="true" />
            {QUADRANT_LABEL[q]}
          </h2>
          <div className="rows" role="list">
            {groups[q].map((t) => (
              <TaskRow key={t.id} task={t} today={today} edge />
            ))}
          </div>
        </section>
      ))}
      {done.length > 0 && (
        <section className="group group--done">
          <button
            className="group__toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone((s) => !s)}
          >
            <span>
              Completed <span className="num">({done.length})</span>
            </span>
            <ChevronRight className="group__chevron" />
          </button>
          {showDone && (
            <div className="rows" role="list">
              {done.map((t) => (
                <TaskRow key={t.id} task={t} today={today} />
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function ClosedTasks({ status }: { status: 'done' | 'archived' }) {
  const today = useToday();
  const tasks = useData((s) => s.tasks);
  const lists = useData((s) => s.lists);
  const { openTask } = useTaskDetail();
  const items = useMemo(
    () =>
      Object.values(tasks)
        .filter((t) => !t.deleted && t.status === status)
        .sort((a, b) =>
          status === 'done'
            ? (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
            : b.updatedAt.localeCompare(a.updatedAt),
        ),
    [tasks, status],
  );
  useVisibleTasks(status === 'done' ? items.map((t) => t.id) : []);
  const title = status === 'done' ? 'Completed' : 'Archived';

  return (
    <section className="screen list-view">
      <header className="screen-head">
        <BackToLists />
        <h1>{title}</h1>
      </header>
      {items.length === 0 && (
        <p className="empty">
          {status === 'done' ? 'Nothing completed yet.' : 'Nothing archived.'}
        </p>
      )}
      {status === 'done' ? (
        <div className="rows" role="list">
          {items.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
        </div>
      ) : (
        <>
          <ul className="rows archived">
            {items.map((t) => (
              <li key={t.id} className="archived__row">
                <button className="archived__main" onClick={() => openTask(t.id)}>
                  <span className="row__title">{t.title}</span>
                  <span className="row__sub">{lists[t.listId]?.name}</span>
                </button>
                <button className="btn btn--text btn--small" onClick={() => unarchive(t.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ListScreen() {
  const { listId } = useParams();
  const list = useData((s) => (listId ? s.lists[listId] : undefined));
  if (listId === 'completed') return <ClosedTasks status="done" />;
  if (listId === 'archived') return <ClosedTasks status="archived" />;
  if (!list || list.deleted) return <Navigate to="/lists" replace />;
  return <OneList key={list.id} list={list} />;
}
