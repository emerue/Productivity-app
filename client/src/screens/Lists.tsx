import { isOpen, type Task } from '@frog/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, SearchIcon } from '../components/Icons';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { createList, liveLists } from '../data/actions';
import { useData } from '../data/store';
import { useVisibleTasks } from '../lib/keyboard';
import { useToday } from '../lib/time';

function NewList() {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  if (!adding) {
    return (
      <button className="btn btn--text list-index__new" onClick={() => setAdding(true)}>
        New list
      </button>
    );
  }
  const save = () => {
    if (name.trim()) createList(name);
    setName('');
    setAdding(false);
  };
  return (
    <div className="list-index__new-field">
      <label className="visually-hidden" htmlFor="new-list">
        List name
      </label>
      <input
        id="new-list"
        className="field"
        placeholder="List name"
        autoFocus
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setName('');
            setAdding(false);
          }
        }}
      />
    </div>
  );
}

function SearchResults({ query }: { query: string }) {
  const tasks = useData((s) => s.tasks);
  const today = useToday();
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = Object.values(tasks).filter(
      (t) => !t.deleted && (t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)),
    );
    const rank = (t: Task) => (t.status === 'open' ? 0 : t.status === 'done' ? 1 : 2);
    return matches
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100);
  }, [tasks, query]);
  useVisibleTasks(results.map((t) => t.id));

  if (results.length === 0) return <p className="empty">No tasks match “{query.trim()}”.</p>;
  return (
    <div className="rows" role="list" aria-label="Search results">
      {results.map((t) => (
        <TaskRow key={t.id} task={t} today={today} edge={t.status === 'open'} />
      ))}
    </div>
  );
}

export function ListsScreen() {
  const [query, setQuery] = useState('');
  const lists = useData((s) => s.lists);
  const tasks = useData((s) => s.tasks);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let done = 0;
    let archived = 0;
    for (const t of Object.values(tasks)) {
      if (t.deleted) continue;
      if (isOpen(t)) c[t.listId] = (c[t.listId] ?? 0) + 1;
      else if (t.status === 'done') done++;
      else archived++;
    }
    return { byList: c, done, archived };
  }, [tasks]);

  return (
    <section className="screen lists">
      <header className="screen-head">
        <h1>Lists</h1>
      </header>
      <QuickAddInline />
      <div className="search">
        <SearchIcon className="search__icon" />
        <label className="visually-hidden" htmlFor="search">
          Search tasks
        </label>
        <input
          id="search"
          className="field search__input"
          type="search"
          placeholder="Search tasks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim() ? (
        <SearchResults query={query} />
      ) : (
        <>
          <ul className="list-index">
            {liveLists(lists).map((l) => (
              <li key={l.id}>
                <Link to={`/lists/${l.id}`} className="list-index__row">
                  <span className="list-index__name">{l.name}</span>
                  <span className="list-index__count num">{counts.byList[l.id] ?? 0}</span>
                  <ChevronRight className="list-index__chevron" />
                </Link>
              </li>
            ))}
          </ul>
          <NewList />
          <ul className="list-index list-index--closed">
            <li>
              <Link to="/lists/completed" className="list-index__row">
                <span className="list-index__name">Completed</span>
                <span className="list-index__count num">{counts.done}</span>
                <ChevronRight className="list-index__chevron" />
              </Link>
            </li>
            <li>
              <Link to="/lists/archived" className="list-index__row">
                <span className="list-index__name">Archived</span>
                <span className="list-index__count num">{counts.archived}</span>
                <ChevronRight className="list-index__chevron" />
              </Link>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
