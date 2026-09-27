import {
  addDays,
  isOpen,
  liveSubtasks,
  nextAction,
  postponeCount,
  quadrantOf,
  rankTasks,
  suggestFrog,
  type DateStr,
  type Task,
} from '@frog/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from '../components/CheckCircle';
import { CloseIcon, FrogGlyph } from '../components/Icons';
import { StepsEditor } from '../components/StepsEditor';
import { carryForward, dayOf, dropFromPlan, finishPlan, reschedule } from '../data/actions';
import { useData } from '../data/store';
import { formatDue, useToday } from '../lib/time';

type Decision = { kind: 'tomorrow' } | { kind: 'date'; date: DateStr } | { kind: 'drop' };
type Step = 'review' | 'choose' | 'frog' | 'done';

const open = (t: Task | undefined): t is Task => !!t && isOpen(t);

// ---------------------------------------------------------------------------
// Step 1: review today

function ReviewItem({
  task,
  today,
  decision,
  onDecide,
  autoFocus,
}: {
  task: Task;
  today: DateStr;
  decision: Decision | undefined;
  onDecide: (d: Decision | undefined) => void;
  autoFocus: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const tomorrowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) tomorrowRef.current?.focus();
  }, [autoFocus]);

  const pressed = (kind: Decision['kind']) => decision?.kind === kind;
  return (
    <li className="review" data-decided={decision ? decision.kind : undefined}>
      <p className="review__title">{task.title}</p>
      <div className="review__actions" role="group" aria-label={`What to do with ${task.title}`}>
        <button
          ref={tomorrowRef}
          className="review__btn"
          aria-pressed={pressed('tomorrow')}
          onClick={() => onDecide(pressed('tomorrow') ? undefined : { kind: 'tomorrow' })}
        >
          Tomorrow
        </button>
        <button
          className="review__btn"
          aria-pressed={pressed('date')}
          onClick={() => setPicking((p) => !p)}
        >
          {decision?.kind === 'date' ? formatDue(decision.date, today) : 'Pick a date'}
        </button>
        <button
          className="review__btn"
          aria-pressed={pressed('drop')}
          onClick={() => onDecide(pressed('drop') ? undefined : { kind: 'drop' })}
        >
          Drop
        </button>
      </div>
      {picking && (
        <input
          className="field num review__date"
          type="date"
          aria-label={`New date for ${task.title}`}
          min={addDays(today, 1)}
          autoFocus
          onChange={(e) => {
            if (e.target.value) {
              onDecide({ kind: 'date', date: e.target.value });
              setPicking(false);
            }
          }}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function PlanScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('day') === 'today' ? 'today' : 'tomorrow';
  const today = useToday();
  const target = mode === 'today' ? today : addDays(today, 1);
  const tasks = useData((s) => s.tasks);
  const days = useData((s) => s.days);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);

  // Snapshot the inputs once, so the lists don't shift while planning.
  const [initial] = useState(() => {
    const source = mode === 'today' ? addDays(today, -1) : today;
    const src = dayOf(source, days);
    const leftover = [src.frog, ...src.myDay].filter((id): id is string => !!id && open(tasks[id]));
    const existing = dayOf(target, days);
    return {
      leftover: [...new Set(leftover)],
      existing: [existing.frog, ...existing.myDay].filter(Boolean) as string[],
    };
  });

  const [step, setStep] = useState<Step>(mode === 'today' ? 'choose' : 'review');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [frog, setFrog] = useState<string | null>(null);
  const [carried, setCarried] = useState<Set<string>>(new Set());
  const [slicing, setSlicing] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  const steps: Step[] = mode === 'today' ? ['choose', 'frog'] : ['review', 'choose', 'frog'];
  const stepNo = steps.indexOf(step) + 1;
  const reviewTasks = initial.leftover.map((id) => tasks[id]).filter(open);

  const scoreCtx = useMemo(
    () => ({ target, settings: { urgencyWindowDays }, carriedForward: carried }),
    [target, urgencyWindowDays, carried],
  );

  const enterChoose = (carriedIds: Set<string>) => {
    const dueTarget = Object.values(tasks)
      .filter((t) => open(t) && t.due === target)
      .map((t) => t.id);
    const pre = [...carriedIds, ...initial.existing, ...dueTarget];
    setSelected([...new Set(pre)].filter((id) => open(tasks[id])));
    setCarried(carriedIds);
    setStep('choose');
  };

  // Plan today starts at step 2 with yesterday's unfinished tasks pre-selected.
  const started = useRef(false);
  useEffect(() => {
    if (mode === 'today' && !started.current) {
      started.current = true;
      enterChoose(new Set(initial.leftover));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyReview = () => {
    const carriedIds = new Set<string>();
    for (const t of reviewTasks) {
      const d = decisions[t.id];
      if (!d) continue;
      if (d.kind === 'tomorrow') {
        carryForward(t.id, today, target);
        carriedIds.add(t.id);
      } else if (d.kind === 'date') {
        reschedule(t.id, d.date);
        if (d.date === target) carriedIds.add(t.id);
      } else {
        dropFromPlan(t.id);
      }
    }
    enterChoose(carriedIds);
  };

  const suggestions = useMemo(() => {
    if (step !== 'choose') return [];
    const ctx = { today: target, urgencyWindowDays };
    return rankTasks(Object.values(tasks), scoreCtx)
      .filter((t) => {
        if (selected.includes(t.id)) return false;
        const q = quadrantOf(t, ctx);
        // Delegate is someone else's work until the follow-up is due.
        return (
          q === 'do' ||
          q === 'schedule' ||
          (q === 'delegate' && t.followUp !== null && t.followUp <= target)
        );
      })
      .slice(0, 10);
    // Suggestions are computed when entering the step and on toggles.
  }, [step, tasks, scoreCtx, selected, target, urgencyWindowDays]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const frogCandidates = selected
    .map((id) => tasks[id])
    .filter((t): t is Task => open(t) && t.important);

  const enterFrog = () => {
    const current = dayOf(target, days).frog;
    const suggested =
      current && frogCandidates.some((t) => t.id === current)
        ? current
        : (suggestFrog(frogCandidates, scoreCtx)?.id ?? null);
    setFrog(suggested);
    setSlicing(false);
    setStep('frog');
  };

  const finish = () => {
    finishPlan(target, frog, selected);
    setStep('done');
  };

  const frogTask = frog ? tasks[frog] : undefined;
  const slipping =
    !!frogTask && liveSubtasks(frogTask).length === 0 && postponeCount(frogTask) >= 2;

  const close = () => navigate('/', { replace: true });
  const title = mode === 'today' ? 'Plan today' : 'Plan tomorrow';

  if (step === 'done') {
    return (
      <main className="plan plan--done">
        <div className="plan__col">
          <p className="plan__done-glyph">
            <FrogGlyph size={32} />
          </p>
          <h1 className="plan__done">{mode === 'today' ? 'Today is set.' : 'Tomorrow is set.'}</h1>
          <button className="btn btn--ink btn--block" autoFocus onClick={close}>
            Done
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="plan">
      <header className="plan__bar">
        <button className="icon-btn" aria-label="Close planning" onClick={close}>
          <CloseIcon />
        </button>
        <span className="plan__progress num" aria-live="polite">
          {title} · {stepNo} of {steps.length}
        </span>
      </header>

      <div className="plan__col">
        {step === 'review' && (
          <section aria-labelledby="plan-review">
            <h1 className="plan__title" id="plan-review">
              Review today
            </h1>
            {reviewTasks.length === 0 ? (
              <p className="plan__lead">Nothing left over from today.</p>
            ) : (
              <>
                <p className="plan__lead">What happens to what's left?</p>
                <ul className="review-list">
                  {reviewTasks.map((t, i) => (
                    <ReviewItem
                      key={t.id}
                      task={t}
                      today={today}
                      decision={decisions[t.id]}
                      autoFocus={i === focusIndex}
                      onDecide={(d) => {
                        setDecisions((prev) => {
                          const next = { ...prev };
                          if (d) next[t.id] = d;
                          else delete next[t.id];
                          return next;
                        });
                        if (d) {
                          if (i + 1 < reviewTasks.length) setFocusIndex(i + 1);
                          else requestAnimationFrame(() => nextRef.current?.focus());
                        }
                      }}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {step === 'choose' && (
          <section aria-labelledby="plan-choose">
            <h1 className="plan__title" id="plan-choose">
              {mode === 'today' ? "Choose today's tasks" : "Choose tomorrow's tasks"}
            </h1>
            <p className="plan__lead num" aria-live="polite">
              {selected.length} selected
            </p>
            <ul className="pick-list">
              {selected
                .map((id) => tasks[id])
                .filter(open)
                .map((t) => (
                  <PickRow
                    key={t.id}
                    task={t}
                    today={today}
                    checked
                    onToggle={() => toggle(t.id)}
                  />
                ))}
            </ul>
            {suggestions.length > 0 && (
              <>
                <h2 className="plan__subtitle">Suggestions</h2>
                <ul className="pick-list">
                  {suggestions.map((t) => (
                    <PickRow
                      key={t.id}
                      task={t}
                      today={today}
                      checked={false}
                      onToggle={() => toggle(t.id)}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {step === 'frog' && (
          <section aria-labelledby="plan-frog">
            <h1 className="plan__title" id="plan-frog">
              Pick the Frog
            </h1>
            {frogCandidates.length === 0 ? (
              <p className="plan__lead">
                None of the selected tasks is important, so there is no Frog.
              </p>
            ) : (
              <>
                <p className="plan__lead">The important thing to do first.</p>
                <div className="frog-pick" role="radiogroup" aria-label="Frog">
                  {frogCandidates.map((t) => (
                    <button
                      key={t.id}
                      role="radio"
                      aria-checked={frog === t.id}
                      className="frog-pick__option"
                      onClick={() => {
                        setFrog(t.id);
                        setSlicing(false);
                      }}
                    >
                      <span className="frog-pick__mark" aria-hidden="true" />
                      <span className="frog-pick__title">{t.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {frogTask && slipping && !slicing && (
              <div className="inline-prompt plan__slip">
                <span>This one keeps slipping. Slice it into steps?</span>
                <button className="btn btn--text btn--small" onClick={() => setSlicing(true)}>
                  Slice it
                </button>
              </div>
            )}
            {frogTask && slicing && (
              <div className="plan__slice">
                <StepsEditor task={frogTask} slice compact />
              </div>
            )}
          </section>
        )}
      </div>

      <footer className="plan__footer">
        <div className="plan__footer-inner">
          {step === 'frog' && (
            <button className="btn btn--text" onClick={() => setStep(steps[stepNo - 2] as Step)}>
              Back
            </button>
          )}
          {step === 'review' && (
            <button ref={nextRef} className="btn btn--ink plan__next" onClick={applyReview}>
              Next
            </button>
          )}
          {step === 'choose' && (
            <button className="btn btn--ink plan__next" onClick={enterFrog}>
              Next
            </button>
          )}
          {step === 'frog' && (
            <button className="btn btn--ink plan__next" onClick={finish}>
              Finish
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}

function PickRow({
  task,
  today,
  checked,
  onToggle,
}: {
  task: Task;
  today: DateStr;
  checked: boolean;
  onToggle: () => void;
}) {
  const next = nextAction(task);
  return (
    <li className="pick-row">
      <CheckCircle
        checked={checked}
        label={checked ? `Remove ${task.title}` : `Add ${task.title}`}
        onToggle={onToggle}
      />
      <button className="pick-row__main" onClick={onToggle} tabIndex={-1}>
        <span className="row__title">{task.title}</span>
        {next && <span className="row__sub">Next: {next.title}</span>}
      </button>
      {task.due && (
        <span className={task.due < today ? 'pick-row__due is-overdue' : 'pick-row__due'}>
          {formatDue(task.due, today)}
        </span>
      )}
    </li>
  );
}
