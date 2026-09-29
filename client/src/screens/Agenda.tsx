import { addDays, diffDays, isOpen, isValidDateStr, type DateStr } from '@frog/shared';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from '../components/Icons';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { useData } from '../data/store';
import { buildAgenda, weekStart } from '../lib/agenda';
import { useVisibleTasks } from '../lib/keyboard';
import { formatDateLong, formatHeaderDate, useToday } from '../lib/time';

type View = 'day' | 'week';

function dayLabel(date: DateStr, today: DateStr): string {
  const delta = diffDays(date, today);
  const base = formatHeaderDate(date);
  if (delta === 0) return `Today · ${base}`;
  if (delta === 1) return `Tomorrow · ${base}`;
  if (delta === -1) return `Yesterday · ${base}`;
  return base;
}

function rangeLabel(view: View, start: DateStr, today: DateStr): string {
  if (view === 'day') return formatDateLong(start, today);
  const end = addDays(start, 6);
  const fmt = (d: DateStr) => formatHeaderDate(d).slice(4); // "28 Sep"
  const year = start.slice(0, 4) === today.slice(0, 4) ? '' : ` ${start.slice(0, 4)}`;
  return `${fmt(start)} – ${fmt(end)}${year}`;
}

export function AgendaScreen() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const tasks = useData((s) => s.tasks);
  const days = useData((s) => s.days);

  const view: View = params.get('view') === 'week' ? 'week' : 'day';
  const raw = params.get('date');
  const date = raw && isValidDateStr(raw) ? raw : today;
  const start = view === 'week' ? weekStart(date) : date;
  const count = view === 'week' ? 7 : 1;
  const end = addDays(start, count - 1);
  const includesToday = start <= today && today <= end;

  const agenda = useMemo(() => buildAgenda(start, count, tasks, days), [start, count, tasks, days]);
  const overdue = useMemo(
    () =>
      includesToday
        ? Object.values(tasks)
            .filter((t) => isOpen(t) && t.due !== null && t.due < today)
            .sort((a, b) => a.due!.localeCompare(b.due!) || a.title.localeCompare(b.title))
        : [],
    [tasks, today, includesToday],
  );

  const total = agenda.reduce((n, d) => n + d.tasks.filter(isOpen).length, 0);
  useVisibleTasks([
    ...overdue.map((t) => t.id),
    ...agenda.flatMap((d) => d.tasks.map((t) => t.id)),
  ]);

  /** Keeps other params (an open task) when changing the range. */
  const go = (next: { view?: View; date?: DateStr }) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('view', next.view ?? view);
      const d = next.date ?? date;
      if (d === today) q.delete('date');
      else q.set('date', d);
      return q;
    });
  const href = (v: View, d: DateStr) => `/agenda?view=${v}${d === today ? '' : `&date=${d}`}`;

  return (
    <section className="screen agenda">
      <div className="screen-top">
        <header className="screen-head">
          <h1>Agenda</h1>
        </header>

        <div className="agenda__bar">
          <nav className="segmented agenda__views" aria-label="Range">
            {(['day', 'week'] as const).map((v) => (
              <Link
                key={v}
                to={href(v, date)}
                className="segmented__item"
                aria-current={v === view ? 'page' : undefined}
              >
                {v === 'day' ? 'Day' : 'Week'}
              </Link>
            ))}
          </nav>
          <div className="agenda__nav">
            <button
              className="icon-btn"
              aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
              onClick={() => go({ date: addDays(date, -count) })}
            >
              <ChevronLeft />
            </button>
            <span className="agenda__range" aria-live="polite">
              {rangeLabel(view, start, today)}
            </span>
            <button
              className="icon-btn"
              aria-label={view === 'day' ? 'Next day' : 'Next week'}
              onClick={() => go({ date: addDays(date, count) })}
            >
              <ChevronRight />
            </button>
            {!includesToday && (
              <button className="btn btn--text btn--small" onClick={() => go({ date: today })}>
                Today
              </button>
            )}
          </div>
        </div>

        <QuickAddInline />
      </div>

      <p className="agenda__summary">
        {total === 0
          ? view === 'day'
            ? 'Nothing due or planned.'
            : 'Nothing due or planned this week.'
          : `${total} open ${total === 1 ? 'task' : 'tasks'}`}
      </p>

      {overdue.length > 0 && (
        <section className="group agenda__day" aria-labelledby="agenda-overdue">
          <h2 className="group__title agenda__overdue" id="agenda-overdue">
            Overdue <span className="num">({overdue.length})</span>
          </h2>
          <div className="rows scroll-box" role="list">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} today={today} edge showList />
            ))}
          </div>
        </section>
      )}

      {agenda.map((d) => (
        <section
          key={d.date}
          className="group agenda__day"
          data-today={d.date === today || undefined}
          aria-labelledby={`agenda-${d.date}`}
        >
          <h2 className="group__title" id={`agenda-${d.date}`}>
            {view === 'week' ? (
              <Link className="agenda__daylink" to={href('day', d.date)}>
                {dayLabel(d.date, today)}
              </Link>
            ) : (
              dayLabel(d.date, today)
            )}
            {d.tasks.length > 0 && (
              <span className="agenda__count num">{d.tasks.filter(isOpen).length}</span>
            )}
          </h2>
          {d.tasks.length > 0 ? (
            <div className={view === 'week' ? 'rows scroll-box' : 'rows'} role="list">
              {d.tasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} edge showList />
              ))}
            </div>
          ) : (
            <p className="agenda__empty">Nothing due or planned.</p>
          )}
        </section>
      ))}
    </section>
  );
}
