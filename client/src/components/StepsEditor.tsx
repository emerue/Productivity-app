import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  liveSubtasks,
  STEP_HINT_THRESHOLD,
  stepProgress,
  type Subtask,
  type Task,
} from '@frog/shared';
import { useEffect, useRef, useState } from 'react';
import {
  addStep,
  deleteStep,
  promoteStep,
  renameStep,
  reorderSteps,
  toggleStep,
} from '../data/actions';
import { requestComplete } from '../lib/complete';
import { CheckCircle } from './CheckCircle';
import { GripIcon } from './Icons';
import { Menu } from './Menu';

function StepRow({
  taskId,
  step,
  onAllDone,
}: {
  taskId: string;
  step: Subtask;
  onAllDone: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const [title, setTitle] = useState(step.title);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setTitle(step.title);
  }, [step.title]);

  const save = () => {
    editing.current = false;
    const trimmed = title.trim();
    if (!trimmed) deleteStep(taskId, step.id);
    else renameStep(taskId, step.id, trimmed);
  };

  return (
    <li
      ref={setNodeRef}
      className="step"
      data-done={step.done || undefined}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="step__grip"
        aria-label={`Reorder ${step.title}`}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </button>
      <CheckCircle
        size="step"
        checked={step.done}
        label={step.done ? `Mark ${step.title} not done` : `Mark ${step.title} done`}
        onToggle={() => {
          if (toggleStep(taskId, step.id)) onAllDone();
        }}
      />
      <input
        className="step__title"
        value={title}
        aria-label="Step"
        onFocus={() => (editing.current = true)}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setTitle(step.title);
            editing.current = false;
            e.currentTarget.blur();
          }
        }}
      />
      <Menu
        label={`Step options for ${step.title}`}
        items={[
          { label: 'Promote to task', onSelect: () => promoteStep(taskId, step.id) },
          { label: 'Delete step', onSelect: () => deleteStep(taskId, step.id), danger: true },
        ]}
      />
    </li>
  );
}

interface StepsEditorProps {
  task: Task;
  /** Open in "Slice it" mode: focus a new empty step with helper text. */
  slice?: boolean;
  /** Hide the heading row (used inline in planning). */
  compact?: boolean;
}

export function StepsEditor({ task, slice = false, compact = false }: StepsEditorProps) {
  const steps = liveSubtasks(task);
  const progress = stepProgress(task);
  const [slicing, setSlicing] = useState(slice);
  const [allDone, setAllDone] = useState(false);
  const [draft, setDraft] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (slice) {
      setSlicing(true);
      addRef.current?.focus();
    }
  }, [slice, task.id]);

  useEffect(() => {
    if (progress.done < progress.total) setAllDone(false);
  }, [progress.done, progress.total]);

  const startSlicing = () => {
    setSlicing(true);
    addRef.current?.focus();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = steps.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    reorderSteps(task.id, arrayMove(ids, from, to));
  };

  return (
    <section className="steps" aria-label="Steps">
      {!compact && (
        <div className="steps__head">
          <h3 className="steps__title">Steps</h3>
          {progress.total > 0 && (
            <span className="steps__count num">
              {progress.done}/{progress.total}
            </span>
          )}
          <button className="btn btn--text btn--small steps__slice" onClick={startSlicing}>
            Slice it
          </button>
        </div>
      )}

      {allDone && task.status === 'open' && (
        <div className="inline-prompt" role="status">
          <span>All steps done. Complete task?</span>
          <span className="inline-prompt__actions">
            <button
              className="btn btn--ink btn--small"
              onClick={() => void requestComplete(task.id)}
            >
              Complete
            </button>
            <button className="btn btn--text btn--small" onClick={() => setAllDone(false)}>
              Not yet
            </button>
          </span>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="steps__list">
            {steps.map((s) => (
              <StepRow key={s.id} taskId={task.id} step={s} onAllDone={() => setAllDone(true)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="steps__add">
        <span className="steps__add-mark" aria-hidden="true" />
        <input
          ref={addRef}
          className="steps__add-input"
          placeholder={
            slicing && steps.length === 0 ? 'First step, starting with a verb' : 'Add step'
          }
          aria-label="Add step"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (addStep(task.id, draft)) setDraft('');
            }
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          onBlur={() => {
            if (draft.trim() && addStep(task.id, draft)) setDraft('');
          }}
        />
      </div>
      {slicing && (
        <p className="hint steps__hint">
          Break this into 3–5 concrete steps. Start each with a verb.
        </p>
      )}
      {progress.total > STEP_HINT_THRESHOLD && (
        <p className="hint steps__hint">Big task. Consider splitting it into separate tasks.</p>
      )}
    </section>
  );
}
