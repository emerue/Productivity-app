import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  QUADRANT_LABEL,
  QUADRANT_MEANING,
  QUADRANTS,
  type DateStr,
  type Quadrant,
  type Task,
} from '@frog/shared';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from '../components/Icons';
import { useMoveTask } from '../components/MoveSheet';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { useIsDesktop } from '../lib/hooks';
import { useVisibleTasks } from '../lib/keyboard';
import { rankByQuadrant, useUrgency } from '../lib/queries';
import { useToday } from '../lib/time';

const EMPTY: Record<Quadrant, string> = {
  do: 'Nothing urgent and important right now. Good time for Schedule work.',
  schedule: 'Nothing scheduled.',
  delegate: 'Nobody to wait on.',
  drop: 'Nothing to drop.',
};

function useQuadrants(): Record<Quadrant, Task[]> {
  const tasks = useData((s) => s.tasks);
  const ctx = useUrgency();
  const lingering = useUI((s) => s.lingering);
  return useMemo(
    () => rankByQuadrant(Object.values(tasks), lingering, ctx).groups,
    [tasks, ctx, lingering],
  );
}

function DraggableRow({ task, today }: { task: Task; today: DateStr }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      className="draggable"
      data-dragging={isDragging || undefined}
      {...listeners}
    >
      <TaskRow task={task} today={today} showList />
    </div>
  );
}

function Cell({ quadrant, tasks, today }: { quadrant: Quadrant; tasks: Task[]; today: DateStr }) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrant });
  return (
    <section
      ref={setNodeRef}
      className="cell"
      data-q={quadrant}
      data-over={isOver || undefined}
      aria-labelledby={`cell-${quadrant}`}
    >
      <div className="cell__head">
        <h2 className="cell__title" id={`cell-${quadrant}`}>
          <span className="q-dot" data-q={quadrant} aria-hidden="true" />
          {QUADRANT_LABEL[quadrant]}
          <span className="cell__count num">{tasks.length}</span>
        </h2>
        <p className="cell__meaning">{QUADRANT_MEANING[quadrant]}</p>
      </div>
      <div className="cell__scroll">
        {tasks.length === 0 ? (
          <p className="cell__empty">{EMPTY[quadrant]}</p>
        ) : (
          <div className="rows" role="list">
            {tasks.map((t) => (
              <DraggableRow key={t.id} task={t} today={today} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** Desktop: equal 2×2 cells, each scrolling on its own; drag rows between cells. */
function MatrixGrid({ groups, today }: { groups: Record<Quadrant, Task[]>; today: DateStr }) {
  const move = useMoveTask();
  const tasks = useData((s) => s.tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = activeId ? tasks[activeId] : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const target = over.id as Quadrant;
    const from = QUADRANTS.find((q) => groups[q].some((t) => t.id === a.id));
    if (from !== target) move(String(a.id), target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="matrix-grid">
        {QUADRANTS.map((q) => (
          <Cell key={q} quadrant={q} tasks={groups[q]} today={today} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="drag-ghost">{active.title}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

/** How many task titles each quadrant previews on the phone. */
const OVERVIEW_TOP = 3;

/** Mobile: each quadrant with what it means and its top tasks; tap for all. */
function MatrixOverview({ groups }: { groups: Record<Quadrant, Task[]> }) {
  return (
    <div className="matrix-overview">
      {QUADRANTS.map((q) => {
        const tasks = groups[q];
        const rest = tasks.length - OVERVIEW_TOP;
        return (
          <Link key={q} to={`/matrix/${q}`} className="q-cell" data-q={q}>
            <span className="q-cell__head">
              <span className="q-dot" aria-hidden="true" />
              {QUADRANT_LABEL[q]}
              <span className="q-cell__count num">{tasks.length}</span>
              <ChevronRight className="q-cell__chevron" />
            </span>
            <span className="q-cell__meaning">{QUADRANT_MEANING[q]}</span>
            {tasks.length === 0 ? (
              <span className="q-cell__empty">{EMPTY[q]}</span>
            ) : (
              <span className="q-cell__tasks">
                {tasks.slice(0, OVERVIEW_TOP).map((t) => (
                  <span key={t.id} className="q-cell__task">
                    {t.title || 'Untitled'}
                  </span>
                ))}
                {rest > 0 && <span className="q-cell__rest">and {rest} more</span>}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function MatrixScreen() {
  const isDesktop = useIsDesktop();
  const today = useToday();
  const groups = useQuadrants();
  useVisibleTasks(isDesktop ? QUADRANTS.flatMap((q) => groups[q].map((t) => t.id)) : []);

  return (
    <section className="screen matrix">
      <header className="screen-head">
        <h1>Matrix</h1>
      </header>
      <QuickAddInline />
      {isDesktop ? (
        <MatrixGrid groups={groups} today={today} />
      ) : (
        <MatrixOverview groups={groups} />
      )}
    </section>
  );
}

/** Mobile view of one quadrant, with a segmented control to switch. */
export function QuadrantScreen() {
  const { quadrant } = useParams();
  const isDesktop = useIsDesktop();
  const today = useToday();
  const groups = useQuadrants();
  const q = quadrant as Quadrant;
  const tasks = QUADRANTS.includes(q) ? groups[q] : [];
  useVisibleTasks(tasks.map((t) => t.id));

  if (!QUADRANTS.includes(q) || isDesktop) return <Navigate to="/matrix" replace />;

  return (
    <section className="screen quadrant">
      <header className="screen-head">
        <Link to="/matrix" className="icon-btn back-link" aria-label="Back to Matrix">
          <ChevronLeft />
        </Link>
        <h1>{QUADRANT_LABEL[q]}</h1>
        <span className="screen-head__date">{QUADRANT_MEANING[q]}</span>
      </header>
      <nav className="segmented" aria-label="Quadrant">
        {QUADRANTS.map((x) => (
          <Link
            key={x}
            to={`/matrix/${x}`}
            replace
            className="segmented__item"
            aria-current={x === q ? 'page' : undefined}
          >
            {QUADRANT_LABEL[x]}
            <span className="num segmented__count">{groups[x].length}</span>
          </Link>
        ))}
      </nav>
      {tasks.length === 0 ? (
        <p className="empty">{EMPTY[q]}</p>
      ) : (
        <div className="rows" role="list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} today={today} showList />
          ))}
        </div>
      )}
    </section>
  );
}
