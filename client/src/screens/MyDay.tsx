import { addDays, isOpen, rankTasks, type DateStr, type Task } from '@frog/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FrogSlot } from '../components/FrogCard';
import { ChevronRight, FrogGlyph } from '../components/Icons';
import { Menu } from '../components/Menu';
import { PlanBanner } from '../components/PlanBanner';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { addToMyDay, dayOf, makeFrog } from '../data/actions';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { useTaskDetail } from '../lib/hooks';
import { useVisibleTasks } from '../lib/keyboard';
import { formatDue, formatHeaderDate, useToday } from '../lib/time';

/** How far back "From earlier days" looks for unfinished My Day tasks. */
const LEFTOVER_DAYS = 14;

function PickFrog({ candidates }: { candidates: Task[] }) {
  return (
    <section className="pick-frog" aria-labelledby="pick-frog-title">
      <p className="frog__label" id="pick-frog-title">
        <FrogGlyph size={20} />
        Pick today's Frog
      </p>
      <ul className="pick-frog__list">
        {candidates.map((t) => (
          <li key={t.id}>
            <button className="pick-frog__option" onClick={() => makeFrog(t.id)}>
              {t.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DueUnplanned({ tasks, today }: { tasks: Task[]; today: DateStr }) {
  const [open, setOpen] = useState(false);
  const { openTask } = useTaskDetail();
  return (
    <section className="due-unplanned">
      <button
        className="due-unplanned__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          Due today, not planned <span className="num">({tasks.length})</span>
        </span>
        <ChevronRight className="due-unplanned__chevron" />
      </button>
      {open && (
        <ul className="due-unplanned__list">
          {tasks.map((t) => (
            <li key={t.id} className="due-unplanned__row">
              <button className="due-unplanned__main" onClick={() => openTask(t.id)}>
                <span className="row__title">{t.title}</span>
                <span className={t.due! < today ? 'row__due is-overdue' : 'row__due'}>
                  {formatDue(t.due!, today)}
                </span>
              </button>
              <button className="btn btn--text btn--small" onClick={() => addToMyDay(t.id)}>
                Add to My Day
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FromEarlier({ tasks, today }: { tasks: Task[]; today: DateStr }) {
  const [open, setOpen] = useState(false);
  const { openTask } = useTaskDetail();
  return (
    <section className="due-unplanned">
      <button
        className="due-unplanned__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          From earlier days <span className="num">({tasks.length})</span>
        </span>
        <ChevronRight className="due-unplanned__chevron" />
      </button>
      {open && (
        <>
          <ul className="due-unplanned__list">
            {tasks.map((t) => (
              <li key={t.id} className="due-unplanned__row">
                <button className="due-unplanned__main" onClick={() => openTask(t.id)}>
                  <span className="row__title">{t.title}</span>
                  {t.due && (
                    <span className={t.due < today ? 'row__due is-overdue' : 'row__due'}>
                      {formatDue(t.due, today)}
                    </span>
                  )}
                </button>
                <button className="btn btn--text btn--small" onClick={() => addToMyDay(t.id)}>
                  Add to My Day
                </button>
              </li>
            ))}
          </ul>
          {tasks.length > 1 && (
            <button
              className="btn btn--text btn--small due-unplanned__all"
              onClick={() => tasks.forEach((t) => addToMyDay(t.id))}
            >
              Add all to My Day
            </button>
          )}
        </>
      )}
    </section>
  );
}

function CompletedToday({ tasks, today }: { tasks: Task[]; today: DateStr }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="group group--done">
      <button className="group__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          Completed <span className="num">({tasks.length})</span>
        </span>
        <ChevronRight className="group__chevron" />
      </button>
      {open && (
        <div className="rows" role="list" aria-label="Completed today">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} inMyDay showList />
          ))}
        </div>
      )}
    </section>
  );
}

export function MyDayScreen() {
  const navigate = useNavigate();
  const today = useToday();
  const tasks = useData((s) => s.tasks);
  const days = useData((s) => s.days);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const lingering = useUI((s) => s.lingering);
  const fullDayHint = useUI((s) => s.fullDayHint);
  const day = dayOf(today, days);

  const view = useMemo(() => {
    const live = (id: string | null) => {
      const t = id ? tasks[id] : undefined;
      return t && !t.deleted && t.status !== 'archived' ? t : null;
    };
    const frog = live(day.frog);
    const planned = day.myDay.map(live).filter((t): t is Task => t !== null && t.id !== day.frog);
    const rows = planned.filter((t) => t.status === 'open' || t.id in lingering);
    const inDay = new Set([day.frog, ...day.myDay]);
    const dueUnplanned = Object.values(tasks)
      .filter((t) => isOpen(t) && t.due !== null && t.due <= today && !inDay.has(t.id))
      .sort((a, b) => a.due!.localeCompare(b.due!) || a.createdAt.localeCompare(b.createdAt));
    const completed = planned.filter((t) => t.status === 'done' && !(t.id in lingering));
    const due = new Set(dueUnplanned.map((t) => t.id));
    const from = addDays(today, -LEFTOVER_DAYS);
    const earlierIds: string[] = [];
    for (const d of Object.values(days).sort((a, b) => b.date.localeCompare(a.date))) {
      if (d.date >= today || d.date < from) continue;
      for (const id of [d.frog, ...d.myDay])
        if (id && !earlierIds.includes(id)) earlierIds.push(id);
    }
    const earlier = earlierIds
      .map((id) => tasks[id])
      .filter((t): t is Task => !!t && isOpen(t) && !inDay.has(t.id) && !due.has(t.id));
    const hasAnything = frog !== null || planned.length > 0;
    const allDone =
      hasAnything && (!frog || frog.status === 'done') && planned.every((t) => t.status !== 'open');
    const candidates = frog
      ? []
      : rankTasks(Object.values(tasks), { target: today, settings: { urgencyWindowDays } })
          .filter((t) => t.important)
          .sort((a, b) => Number(inDay.has(b.id)) - Number(inDay.has(a.id)))
          .slice(0, 3);
    return { frog, rows, dueUnplanned, earlier, completed, hasAnything, allDone, candidates };
  }, [tasks, day, days, today, lingering, urgencyWindowDays]);

  const { frog, rows, dueUnplanned, earlier, completed, hasAnything, allDone, candidates } = view;
  const frogOpen = frog?.status === 'open';
  useVisibleTasks([...(frogOpen ? [frog.id] : []), ...rows.map((t) => t.id)]);

  return (
    <section className="screen my-day">
      <header className="screen-head">
        <h1>My Day</h1>
        <span className="screen-head__date">{formatHeaderDate(today)}</span>
        <Menu
          label="My Day options"
          items={[
            { label: 'Plan tomorrow', onSelect: () => navigate('/plan') },
            !day.planned && { label: 'Plan today', onSelect: () => navigate('/plan?day=today') },
            { label: 'Settings', onSelect: () => navigate('/settings') },
          ]}
        />
      </header>
      <QuickAddInline />
      <PlanBanner today={today} />

      {!hasAnything && (
        <div className="empty-state">
          <p>Nothing planned for today.</p>
          <Link className="btn btn--secondary" to="/plan?day=today">
            Plan today
          </Link>
        </div>
      )}

      {frog && <FrogSlot task={frog} today={today} />}
      {!frog && hasAnything && candidates.length > 0 && <PickFrog candidates={candidates} />}

      {rows.length > 0 && (
        <div className="rows" role="list" aria-label="My Day">
          {rows.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              inMyDay
              showList
              dimmed={frogOpen && !(t.due !== null && t.due <= today)}
            />
          ))}
        </div>
      )}

      {fullDayHint && (
        <p className="hint my-day__hint">
          That's a full day. Anything that can move to tomorrow?
          <button
            className="btn btn--text btn--small"
            onClick={() => useUI.setState({ fullDayHint: false })}
          >
            OK
          </button>
        </p>
      )}

      {allDone && (
        <p className="empty">
          Today's plan is done. Plan tomorrow, or pick something from Schedule.
        </p>
      )}

      {dueUnplanned.length > 0 && <DueUnplanned tasks={dueUnplanned} today={today} />}
      {earlier.length > 0 && <FromEarlier tasks={earlier} today={today} />}
      {completed.length > 0 && <CompletedToday tasks={completed} today={today} />}
    </section>
  );
}
