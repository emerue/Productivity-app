import { isValidDateStr, parseQuickAdd, removeToken, type QuickAddToken } from '@frog/shared';
import { forwardRef, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { matchPath, useLocation, useSearchParams } from 'react-router-dom';
import { createFromQuickAdd, liveLists, type QuickAddDefaults } from '../data/actions';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { formatDateLong, useToday } from '../lib/time';
import { PlusIcon } from './Icons';

function chipLabel(t: QuickAddToken, today: string): string {
  switch (t.kind) {
    case 'urgent':
      return 'Urgent';
    case 'notImportant':
      return 'Not important';
    case 'important':
      return 'Important';
    case 'list':
      return t.name;
    case 'newList':
      return `New list: ${t.name}`;
    case 'due':
      return `Due ${formatDateLong(t.date, today)}`;
    case 'myDay':
      return 'My Day';
    case 'waiting':
      return `Waiting on ${t.name}`;
  }
}

/**
 * Where a new task goes when the input doesn't say: the list being viewed,
 * My Day when adding from My Day, the day being viewed in the Agenda.
 */
function useQuickAddDefaults(): QuickAddDefaults {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const today = useToday();
  const listMatch = matchPath('/lists/:listId', pathname);
  if (listMatch) return { listId: listMatch.params.listId ?? null };
  if (pathname === '/') return { myDay: true };
  if (pathname === '/agenda' && params.get('view') !== 'week') {
    const date = params.get('date');
    return { due: date && isValidDateStr(date) ? date : today };
  }
  return {};
}

interface FieldProps {
  id?: string;
  onEscape?: () => void;
  hidden?: boolean;
}

/** Input + live token chips. Enter adds and keeps focus for the next task. */
const QuickAddField = forwardRef<HTMLInputElement, FieldProps>(function QuickAddField(
  { id, onEscape, hidden },
  ref,
) {
  const [text, setText] = useState('');
  const lists = useData((s) => s.lists);
  const defaultListId = useData((s) => s.settings.defaultListId);
  const today = useToday();
  const defaults = useQuickAddDefaults();
  const parsed = useMemo(
    () => parseQuickAdd(text, { lists: Object.values(lists), today }),
    [text, lists, today],
  );

  // The list and My Day choice follow the screen until the user changes them.
  const screenList = defaults.listId ?? null;
  const screenMyDay = !!defaults.myDay;
  const [listPick, setListPick] = useState<string | null>(null);
  const [myDayPick, setMyDayPick] = useState<boolean | null>(null);
  useEffect(() => {
    setListPick(null);
    setMyDayPick(null);
  }, [screenList, screenMyDay]);

  const live = liveLists(lists);
  const fallbackList = live.find((l) => l.id === defaultListId) ?? live[0];
  const chosenList =
    live.find((l) => l.id === (listPick ?? screenList))?.id ?? fallbackList?.id ?? '';
  const myDay = myDayPick ?? screenMyDay;
  const listFromToken = parsed.tokens.some((t) => t.kind === 'list' || t.kind === 'newList');
  const dueFromScreen = !parsed.due && defaults.due ? defaults.due : null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (createFromQuickAdd(parsed, { listId: chosenList, due: defaults.due, myDay })) setText('');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
      onEscape?.();
    }
  };

  return (
    <div className="quick-add__field">
      <label className="visually-hidden" htmlFor={id}>
        Add a task
      </label>
      <input
        ref={ref}
        id={id}
        className="quick-add__input"
        placeholder="Add a task"
        autoComplete="off"
        autoCapitalize="sentences"
        enterKeyHint="done"
        value={text}
        tabIndex={hidden ? -1 : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="quick-add__meta">
        {!listFromToken && (
          <label className="quick-add__list">
            <span>List</span>
            <select
              className="quick-add__select"
              value={chosenList}
              tabIndex={hidden ? -1 : undefined}
              onChange={(e) => setListPick(e.target.value)}
            >
              {live.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(screenMyDay || myDayPick !== null) && !parsed.addToMyDay && (
          <button
            type="button"
            className="quick-add__toggle"
            aria-pressed={myDay}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => setMyDayPick(!myDay)}
          >
            {myDay ? '✓ My Day' : 'My Day'}
          </button>
        )}
        {dueFromScreen && (
          <span className="quick-add__hint">Due {formatDateLong(dueFromScreen, today)}</span>
        )}
      </div>
      {parsed.tokens.length > 0 && (
        <ul className="chips" aria-label="Parsed details">
          {parsed.tokens.map((t) => (
            <li key={`${t.start}-${t.raw}`}>
              <button
                className="chip"
                tabIndex={hidden ? -1 : undefined}
                aria-label={`Remove ${chipLabel(t, today)}`}
                onClick={() => setText(removeToken(text, t))}
              >
                {chipLabel(t, today)}
                <span aria-hidden="true" className="chip__x">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** Desktop: always-visible input at the top of the main column. `N` focuses it. */
export function QuickAddInline() {
  return (
    <div className="quick-add quick-add--inline">
      <QuickAddField id="quick-add-input" />
    </div>
  );
}

/**
 * Mobile: + button opens a bottom input with the keyboard up. The input stays
 * mounted so it can be focused inside the tap (iOS only raises the keyboard then).
 */
export function QuickAddMobile() {
  const open = useUI((s) => s.quickAddOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // iOS keeps fixed elements behind the keyboard; lift the panel by the keyboard height.
  useEffect(() => {
    const vv = window.visualViewport;
    const sheet = sheetRef.current;
    if (!open || !vv || !sheet) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheet.style.setProperty('--kb', `${kb}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      sheet.style.removeProperty('--kb');
    };
  }, [open]);

  const close = () => {
    useUI.setState({ quickAddOpen: false });
    inputRef.current?.blur();
  };

  return (
    <>
      <button
        className="fab"
        aria-label="Add a task"
        onClick={() => {
          useUI.setState({ quickAddOpen: true });
          inputRef.current?.focus();
        }}
      >
        <PlusIcon />
      </button>
      <div
        ref={sheetRef}
        className={open ? 'quick-sheet is-open' : 'quick-sheet'}
        aria-hidden={!open}
      >
        <div className="quick-sheet__scrim" onClick={close} />
        <div className="quick-sheet__panel" role="dialog" aria-label="Add a task">
          <QuickAddField ref={inputRef} id="quick-add-mobile" onEscape={close} hidden={!open} />
          <button
            className="btn btn--text quick-sheet__done"
            tabIndex={open ? 0 : -1}
            onClick={close}
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
