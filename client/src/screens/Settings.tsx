import { isValidTimeZone, type Settings } from '@frog/shared';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft } from '../components/Icons';
import { api, ApiError } from '../data/api';
import { liveLists, updateSettings } from '../data/actions';
import { useData } from '../data/store';
import { reloadFromServer, signOut, syncNow } from '../data/sync';
import { askConfirm, showToast } from '../data/ui';
import { readLocal, writeLocal } from '../lib/storage';

function Row({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting__text">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="setting__label">
            {label}
          </label>
        ) : (
          <span className="setting__label">{label}</span>
        )}
        {hint && <span className="setting__hint">{hint}</span>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

/** Number input that saves a clamped integer on blur. */
function NumberField({
  id,
  value,
  min,
  max,
  onSave,
  label,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  onSave: (v: number) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const save = () => {
    const n = Math.round(Number(draft));
    const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setDraft(String(v));
    if (v !== value) onSave(v);
  };
  return (
    <input
      id={id}
      aria-label={label}
      className="field setting__number num"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

function isIosBrowser(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const settings = useData((s) => s.settings);
  const lists = useData((s) => s.lists);
  const online = useData((s) => s.sync.online);
  const outboxSize = useData((s) => Object.keys(s.outbox).length);
  const [iosTip, setIosTip] = useState(
    () => isIosBrowser() && readLocal('iosTipDismissed') !== '1',
  );
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return all.includes(settings.timezone) ? all : [settings.timezone, ...all];
  }, [settings.timezone]);

  const set = (patch: Partial<Omit<Settings, 'updatedAt' | 'rev'>>) => updateSettings(patch);

  const onImportFile = async (file: File) => {
    setImportError(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setImportError('That file is not valid JSON. Nothing was changed.');
      return;
    }
    const ok = await askConfirm(
      'Replace all data with this file? The current data is backed up on the server first.',
      'Replace',
    );
    if (!ok) return;
    try {
      await syncNow();
      await api('/import', { body: data });
      await reloadFromServer();
      showToast('Imported');
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed. Nothing was changed.');
    }
  };

  const onSignOut = async () => {
    const warning =
      outboxSize > 0
        ? `${outboxSize} ${outboxSize === 1 ? 'change has' : 'changes have'} not synced yet and will be lost. Sign out anyway?`
        : 'Sign out of Frog on this device?';
    if (!(await askConfirm(warning, 'Sign out'))) return;
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <section className="screen settings">
      <header className="screen-head">
        <Link to="/" className="icon-btn back-link settings__back" aria-label="Back to My Day">
          <ChevronLeft />
        </Link>
        <h1>Settings</h1>
      </header>

      {iosTip && (
        <div className="ios-tip" role="note">
          <p>Add Frog to your Home Screen to install it. Reminders on iPhone need this.</p>
          <button
            className="btn btn--text btn--small"
            onClick={() => {
              writeLocal('iosTipDismissed', '1');
              setIosTip(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <h2 className="settings__group">Day</h2>
      <Row label="Plan tomorrow from" htmlFor="plan-time">
        <input
          id="plan-time"
          className="field setting__time num"
          type="time"
          value={settings.planTime}
          onChange={(e) =>
            /^\d{2}:\d{2}$/.test(e.target.value) && set({ planTime: e.target.value })
          }
        />
      </Row>
      <Row
        label="Day starts at"
        htmlFor="day-start"
        hint="Work after midnight still counts as the day before."
      >
        <select
          id="day-start"
          className="field setting__select num"
          value={settings.dayStartHour}
          onChange={(e) => set({ dayStartHour: Number(e.target.value) })}
        >
          {Array.from({ length: 13 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}:00
            </option>
          ))}
        </select>
      </Row>
      <Row label="Timezone" htmlFor="timezone">
        <select
          id="timezone"
          className="field setting__select"
          value={settings.timezone}
          onChange={(e) => isValidTimeZone(e.target.value) && set({ timezone: e.target.value })}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Row>

      <h2 className="settings__group">Tasks</h2>
      <Row label="Default list" htmlFor="default-list" hint="Used when quick add has no @list.">
        <select
          id="default-list"
          className="field setting__select"
          value={settings.defaultListId}
          onChange={(e) => set({ defaultListId: e.target.value })}
        >
          {liveLists(lists).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Urgent when due within" htmlFor="urgency" hint="Days. Overdue always counts.">
        <NumberField
          id="urgency"
          value={settings.urgencyWindowDays}
          min={0}
          max={60}
          onSave={(v) => set({ urgencyWindowDays: v })}
        />
      </Row>
      <Row label="Archive Drop tasks after" htmlFor="drop-days" hint="Days without an update.">
        <NumberField
          id="drop-days"
          value={settings.dropArchiveDays}
          min={1}
          max={365}
          onSave={(v) => set({ dropArchiveDays: v })}
        />
      </Row>

      <h2 className="settings__group">Focus</h2>
      <Row label="Timer lengths" hint="Minutes.">
        <div className="setting__presets">
          {settings.timerPresets.map((m, i) => (
            <NumberField
              key={`${i}-${m}`}
              label={`Timer length ${i + 1}`}
              value={m}
              min={1}
              max={240}
              onSave={(v) => {
                const next = [...settings.timerPresets];
                next[i] = v;
                set({ timerPresets: next });
              }}
            />
          ))}
        </div>
      </Row>
      <Row label="Keep the screen on">
        <Switch
          label="Keep the screen on"
          checked={settings.wakeLock}
          onChange={(v) => set({ wakeLock: v })}
        />
      </Row>
      <Row label="Sounds">
        <Switch label="Sounds" checked={settings.sounds} onChange={(v) => set({ sounds: v })} />
      </Row>

      <h2 className="settings__group">Appearance</h2>
      <Row label="Theme">
        <div className="segmented segmented--inline" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={settings.theme === t}
              className="segmented__item"
              onClick={() => set({ theme: t })}
            >
              {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </Row>

      <h2 className="settings__group">Data</h2>
      <Row label="Export" hint="Download everything as one JSON file.">
        {online ? (
          <a className="btn btn--secondary btn--small" href="/api/export" download>
            Export
          </a>
        ) : (
          <span className="setting__hint">Needs a connection.</span>
        )}
      </Row>
      <Row label="Import" hint="Replaces all data. The current data is backed up first.">
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onImportFile(file);
          }}
        />
        <button
          className="btn btn--secondary btn--small"
          disabled={!online}
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
      </Row>
      {importError && (
        <p className="settings__error" role="alert">
          {importError}
        </p>
      )}

      <div className="settings__signout">
        <button className="btn btn--text settings__signout-btn" onClick={() => void onSignOut()}>
          Sign out
        </button>
      </div>
    </section>
  );
}
