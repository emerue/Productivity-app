import { NavLink, Outlet } from 'react-router-dom';
import { liveLists } from '../data/actions';
import { useData } from '../data/store';
import { GridIcon, ListIcon, SunIcon } from './Icons';
import { SyncNote } from './SyncNote';
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

export function Shell() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <SyncNote />
        <Outlet />
      </main>
      <TabBar />
      <Toasts />
      <ConfirmDialog />
    </div>
  );
}
