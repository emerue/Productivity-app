import type { Task } from '@frog/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { updateNotes } from '../data/actions';
import { linkify } from '../lib/linkify';

/**
 * Plain-text notes. Autosaves 600ms after typing stops and on blur. When not
 * editing, URLs render as links; tap the text to edit.
 */
export function NotesField({ task }: { task: Task }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.notes);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hasText = task.notes.trim().length > 0;

  useEffect(() => {
    if (!editing) setDraft(task.notes);
  }, [task.notes, editing]);

  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => updateNotes(task.id, draft), 600);
    return () => clearTimeout(t);
  }, [draft, editing, task.id]);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  const startEditing = () => {
    setEditing(true);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  return (
    <section className="notes" aria-label="Notes">
      <h3 className="visually-hidden">Notes</h3>
      {!editing && hasText ? (
        <div
          className="notes__view"
          role="button"
          tabIndex={0}
          aria-label="Edit notes"
          onClick={startEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              startEditing();
            }
          }}
        >
          {linkify(task.notes)}
        </div>
      ) : (
        <textarea
          ref={areaRef}
          className="notes__input"
          placeholder="Notes"
          aria-label="Notes"
          rows={3}
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            updateNotes(task.id, draft);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}
