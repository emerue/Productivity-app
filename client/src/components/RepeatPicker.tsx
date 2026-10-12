import {
  makeRepeat,
  matchPreset,
  presetRule,
  REPEAT_UNITS,
  repeatLabel,
  type RepeatPreset,
  type RepeatUnit,
  type Task,
} from '@frog/shared';
import { useState } from 'react';
import { setRepeat } from '../data/actions';
import { useToday } from '../lib/time';

const PRESETS: RepeatPreset[] = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];
const UNIT_LABEL: Record<RepeatUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
};
/** Monday-first, as the Agenda shows weeks. */
const WEEK: { day: number; short: string; name: string }[] = [
  { day: 1, short: 'M', name: 'Monday' },
  { day: 2, short: 'T', name: 'Tuesday' },
  { day: 3, short: 'W', name: 'Wednesday' },
  { day: 4, short: 'T', name: 'Thursday' },
  { day: 5, short: 'F', name: 'Friday' },
  { day: 6, short: 'S', name: 'Saturday' },
  { day: 0, short: 'S', name: 'Sunday' },
];

/**
 * "Repeat" control: a select of presets (labelled from the task's date, e.g.
 * "Monthly on the 28th") and a Custom editor for every-n and weekdays.
 */
export function RepeatPicker({ task, id }: { task: Task; id: string }) {
  const today = useToday();
  const base = task.repeat?.anchor ?? task.due ?? today;
  const current = task.repeat ? (matchPreset(task.repeat) ?? 'custom') : 'never';
  const [customOpen, setCustomOpen] = useState(current === 'custom');
  const value = customOpen ? 'custom' : current;
  const repeat = task.repeat;

  const onSelect = (v: string) => {
    if (v === 'never') {
      setCustomOpen(false);
      setRepeat(task.id, null);
    } else if (v === 'custom') {
      setCustomOpen(true);
      if (!repeat) setRepeat(task.id, { unit: 'week', every: 1 });
    } else {
      setCustomOpen(false);
      setRepeat(task.id, presetRule(v as RepeatPreset, task.due ?? today));
    }
  };

  const edit = (patch: { unit?: RepeatUnit; every?: number; weekdays?: number[] }) => {
    if (!repeat) return;
    const unit = patch.unit ?? repeat.unit;
    setRepeat(task.id, {
      unit,
      every: patch.every ?? repeat.every,
      ...(unit === 'week' ? { weekdays: patch.weekdays ?? repeat.weekdays } : {}),
    });
  };

  return (
    <div className="repeat">
      <select
        id={id}
        className="meta-input repeat__select"
        value={value}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="never">Never</option>
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {/* The current preset reads from its anchor, like the summary; picking
                another re-anchors on the due date. */}
            {p === current && repeat
              ? repeatLabel(repeat)
              : repeatLabel(makeRepeat(presetRule(p, task.due ?? base), task.due ?? base))}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>

      {customOpen && repeat && (
        <div className="repeat__custom">
          <div className="repeat__every">
            <span>Every</span>
            <input
              className="meta-input num repeat__n"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              aria-label="Repeat every"
              value={repeat.every}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 365) edit({ every: n });
              }}
            />
            <select
              className="meta-input repeat__unit"
              aria-label="Repeat unit"
              value={repeat.unit}
              onChange={(e) => edit({ unit: e.target.value as RepeatUnit })}
            >
              {REPEAT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u][repeat.every === 1 ? 0 : 1]}
                </option>
              ))}
            </select>
          </div>
          {repeat.unit === 'week' && (
            <div className="repeat__days" role="group" aria-label="On these days">
              {WEEK.map((w) => {
                const on = repeat.weekdays?.includes(w.day) ?? false;
                return (
                  <button
                    key={w.day}
                    type="button"
                    className="repeat__day"
                    aria-pressed={on}
                    aria-label={w.name}
                    onClick={() => {
                      const days = repeat.weekdays ?? [];
                      const next = on ? days.filter((d) => d !== w.day) : [...days, w.day];
                      if (next.length > 0) edit({ weekdays: next });
                    }}
                  >
                    {w.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {repeat && <p className="repeat__summary">{repeatLabel(repeat)}</p>}
    </div>
  );
}
