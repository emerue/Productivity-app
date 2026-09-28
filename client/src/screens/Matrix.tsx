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
  QUADRANTS,
  quadrantOf,
  type DateStr,
  type Quadrant,
  type Task,
} from '@frog/shared';
import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft } from '../components/Icons';
import { useMoveTask } from '../components/MoveSheet';
import { QuickAddInline } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { useData } from '../data/store';
import { useUI } from '../data/ui';
import { rankWithLingering } from '../lib/format';
import { useIsDesktop } from '../lib/hooks';
import { useVisibleTasks } from '../lib/keyboard';
import { useToday } from '../lib/time';

const EMPTY: Record<Quadrant, string> = {
  do: 'Nothing urgent and important right now. Good time for Schedule work.',
  schedule: 'Nothing scheduled.',
  delegate: 'Nobody to wait on.',
  drop: 'Nothing to drop.',
};

function useQuadrants(today: DateStr): Record<Quadrant, Task[]> {
  const tasks = useData((s) => s.tasks);
  const urgencyWindowDays = useData((s) => s.settings.urgencyWindowDays);
  const lingering = useUI((s) => s.lingering);
  return useMemo(() => {
    const groups: Record<Quadrant, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
    const ctx = { today, urgencyWindowDays };
    for (const t of rankWithLingering(Object.values(tasks), lingering, {
      target: today,
      settings: ctx,
    })) {
      groups[quadrantOf(t, ctx)].push(t);
    }
    return groups;
  }, [tasks, today, urgencyWindowDays, lingering]);
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
      <TaskRow task={task} today={today} edge showList />
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
      <h2 className="cell__title" id={`cell-${quadrant}`}>
        <span className="q-dot" data-q={quadrant} aria-hidden="true" />
        {QUADRANT_LABEL[quadrant]}
        <span className="cell__count num">{tasks.length}</span>
      </h2>
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

/** Mobile: 2×2 overview with name, count and top task. */
function MatrixOverview({ groups }: { groups: Record<Quadrant, Task[]> }) {
  return (
    <div className="matrix-overview">
      {QUADRANTS.map((q) => (
        <Link key={q} to={`/matrix/${q}`} className="q-cell">
          <span className="q-cell__head">
            <span className="q-dot" data-q={q} aria-hidden="true" />
            {QUADRANT_LABEL[q]}
          </span>
          <span className="q-cell__count num">{groups[q].length}</span>
          <span className="q-cell__top">{groups[q][0]?.title ?? 'Empty'}</span>
        </Link>
      ))}
    </div>
  );
}

export function MatrixScreen() {
  const isDesktop = useIsDesktop();
  const today = useToday();
  const groups = useQuadrants(today);
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
  const groups = useQuadrants(today);
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
            <TaskRow key={t.id} task={t} today={today} edge showList />
          ))}
        </div>
      )}
    </section>
  );
}
