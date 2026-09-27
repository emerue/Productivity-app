import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { liveLists, makeFrog } from '../data/actions';
import { useData } from '../data/store';
import { showToast, useUI } from '../data/ui';
import { requestComplete } from '../lib/complete';
import { useIsDesktop, useTaskDetail } from '../lib/hooks';
import { isTypingTarget, moveSelection } from '../lib/keyboard';
import { GridIcon, ListIcon, SunIcon } from './Icons';
import { MoveSheet } from './MoveSheet';
import { QuickAddMobile } from './QuickAdd';
import { SyncNote } from './SyncNote';
import { TaskDetail } from './TaskDetail';
import { ConfirmDialog, Toasts } from './Toasts';

const NAV = [
  { to: '/', label: 'My Day', icon: SunIcon, end: true },
  { to: '/matrix', label: 'Matrix', icon: GridIcon, end: false },
  { to: '/lists', label: 'Lists', icon: ListIcon, end: false },
];

function Sidebar() {
  const lists = useData((s) => s.lists);
  return (
    <nav className="sidebar" aria-label="Main">
      <ul className="sidebar__nav">
        {NAV.map(({ to, label, end }) => (
          <li key={to}>
            <NavLink to={to} end={end} className="sidebar__link">
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <ul className="sidebar__lists" aria-label="Lists">
        {liveLists(lists).map((l) => (
          <li key={l.id}>
            <NavLink to={`/lists/${l.id}`} className="sidebar__link sidebar__link--list">
              {l.name}
            </NavLink>
          </li>
        ))}
      </ul>
      <NavLink to="/settings" className="sidebar__link sidebar__settings">
        Settings
      </NavLink>
    </nav>
  );
}

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="tabbar__tab">
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Desktop keys: N quick add, J/K select, X complete, S start, F make Frog, Enter open, Esc close. */
function useShortcuts() {
  const navigate = useNavigate();
  const { taskId, openTask } = useTaskDetail();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target))
        return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const selected = useUI.getState().selectedTaskId;
      switch (e.key) {
        case 'n':
        case 'N': {
          const input = document.getElementById('quick-add-input');
          if (input && input.offsetParent !== null) {
            e.preventDefault();
            input.focus();
          }
          break;
        }
        case 'j':
        case 'J':
          e.preventDefault();
          moveSelection(1);
          break;
        case 'k':
        case 'K':
          e.preventDefault();
          moveSelection(-1);
          break;
        case 'x':
        case 'X':
          if (selected) void requestComplete(selected);
          break;
        case 's':
        case 'S':
          if (selected) navigate(`/focus/${selected}`);
          break;
        case 'f':
        case 'F':
          if (selected) {
            const task = useData.getState().tasks[selected];
            if (task?.important) {
              makeFrog(selected);
              showToast("Made today's Frog");
            } else {
              showToast('The Frog must be an important task.');
            }
          }
          break;
        case 'Enter':
          if (selected && e.target === document.body) {
            e.preventDefault();
            openTask(selected);
          }
          break;
        case 'Escape':
          if (!taskId) useUI.setState({ selectedTaskId: null });
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, openTask, taskId]);
}

export function Shell() {
  const isDesktop = useIsDesktop();
  const { taskId } = useTaskDetail();
  const detailOpen = useData((s) => !!taskId && !!s.tasks[taskId] && !s.tasks[taskId]?.deleted);
  useShortcuts();

  return (
    <div className={detailOpen && isDesktop ? 'app app--detail' : 'app'}>
      <Sidebar />
      <main className="main">
        <SyncNote />
        <Outlet />
      </main>
      <TaskDetail />
      {!isDesktop && <QuickAddMobile />}
      <TabBar />
      <MoveSheet />
      <Toasts />
      <ConfirmDialog />
    </div>
  );
}
