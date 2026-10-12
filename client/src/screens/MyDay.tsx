import { dayOf, todayPlan, type DateStr, type Task } from '@frog/shared';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FrogSlot } from '../components/FrogCard';
import { ChevronRight, FrogGlyph } from '../components/Icons';
import { Menu } from '../components/Menu';
import { PlanBanner } from '../components/PlanBanner';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { addToMyDay, makeFrog } from '../data/actions';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { useTaskDetail } from '../lib/hooks';
import { useVisibleTasks } from '../lib/keyboard';
import { dueLabel } from '../lib/format';
import { formatHeaderDate, useToday } from '../lib/time';

function PickFrog({ candidates }: { candidates: Task[] }) {
  return (
    <section className="pick-frog" aria-labelledby="pick-frog-title">
      <p className="frog__label" id="pick-frog-title">
        <FrogGlyph size={20} />
        Pick today's Frog
      </p>
      <p className="pick-frog__lead">The important task you'll do first.</p>
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

/** How many rows a "Needs a decision" group shows before "Show all". */
const PREVIEW = 3;

function DecideGroup({ title, tasks, today }: { title: string; tasks: Task[]; today: DateStr }) {
  const [all, setAll] = useState(false);
  const { openTask } = useTaskDetail();
  const id = useId();
  if (tasks.length === 0) return null;
  const shown = all ? tasks : tasks.slice(0, PREVIEW);
  return (
    <div className="decide__group">
      <h3 className="decide__subtitle" id={id}>
        {title} <span className="num">({tasks.length})</span>
      </h3>
      <ul className={all ? 'decide__list scroll-box' : 'decide__list'} aria-labelledby={id}>
        {shown.map((t) => (
          <li key={t.id} className="decide__row">
            <button className="decide__main" onClick={() => openTask(t.id)}>
              <span className="row__title">{t.title}</span>
              {t.due && (
                <span className={t.due < today ? 'decide__due is-overdue' : 'decide__due'}>
                  {dueLabel(t.due, today)}
                </span>
              )}
            </button>
            <button className="btn btn--secondary btn--small" onClick={() => addToMyDay(t.id)}>
              Add to My Day
            </button>
          </li>
        ))}
      </ul>
      <div className="decide__more">
        {tasks.length > PREVIEW && (
          <button className="btn btn--text btn--small" onClick={() => setAll((a) => !a)}>
            {all ? 'Show fewer' : `Show all ${tasks.length}`}
          </button>
        )}
        {tasks.length > 1 && (
          <button
            className="btn btn--text btn--small"
            onClick={() => tasks.forEach((t) => addToMyDay(t.id))}
          >
            Add all {tasks.length} to My Day
          </button>
        )}
      </div>
    </div>
  );
}

/** Open work that isn't in today's plan: overdue or due today, and leftovers. */
function NeedsDecision({ due, earlier, today }: { due: Task[]; earlier: Task[]; today: DateStr }) {
  if (due.length === 0 && earlier.length === 0) return null;
  return (
    <section className="decide" aria-labelledby="decide-title">
      <h2 className="decide__title" id="decide-title">
        Needs a decision
      </h2>
      <p className="decide__lead">Not in today's plan yet. Add what you'll do today.</p>
      <DecideGroup title="Due today or overdue" tasks={due} today={today} />
      <DecideGroup title="Left over from earlier days" tasks={earlier} today={today} />
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
        <div className="rows scroll-box" role="list" aria-label="Completed today">
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

  const view = useMemo(
    () => todayPlan(today, days, tasks, { urgencyWindowDays, lingering }),
    [tasks, days, today, lingering, urgencyWindowDays],
  );

  const { frog, rows, dueUnplanned, earlier, completed, hasAnything, allDone, candidates } = view;
  const frogOpen = frog?.status === 'open';
  const planLabel = day.planned ? 'Plan tomorrow' : 'Plan today';
  const planHref = day.planned ? '/plan' : '/plan?day=today';
  useVisibleTasks([...(frogOpen ? [frog.id] : []), ...rows.map((t) => t.id)]);

  return (
    <section className="screen my-day">
      <div className="screen-top">
        <header className="screen-head">
          <h1>My Day</h1>
          <span className="screen-head__date">{formatHeaderDate(today)}</span>
          {hasAnything && (
            <Link className="btn btn--secondary btn--small" to={planHref}>
              {planLabel}
            </Link>
          )}
          <Menu
            label="My Day options"
            items={[
              (!day.planned || !hasAnything) && {
                label: 'Plan tomorrow',
                onSelect: () => navigate('/plan'),
              },
              { label: 'Settings', onSelect: () => navigate('/settings') },
            ]}
          />
        </header>
        <QuickAddInline />
      </div>
      <PlanBanner today={today} />

      {!hasAnything && (
        <div className="empty-state">
          <p>
            Nothing planned for today.
            {(dueUnplanned.length > 0 || earlier.length > 0) &&
              ' Pick from what needs a decision below, or plan the whole day.'}
          </p>
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
            <TaskRow key={t.id} task={t} today={today} inMyDay showList />
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

      <NeedsDecision due={dueUnplanned} earlier={earlier} today={today} />
      {completed.length > 0 && <CompletedToday tasks={completed} today={today} />}
    </section>
  );
}
