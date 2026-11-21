import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";

import { STATUSES, type Application, type Status } from "../api/types";
import { STAGES, STAGE_LABEL, groupByStatus } from "../lib/stages";
import { CardContent } from "./Card";
import { Column } from "./Column";

interface Props {
  items: Application[];
  onOpen: (id: number) => void;
  onMove: (item: Application, status: Status) => void;
}

function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/**
 * Arrow keys jump a picked-up card to the neighbouring column instead of nudging it by a few
 * pixels, which is what dnd-kit does by default and is useless for a column board.
 */
const jumpBetweenColumns: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, droppableRects, collisionRect } = context;
  if (!active || !collisionRect) return undefined;

  const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (step === 0) return undefined;
  event.preventDefault();

  const centerX = collisionRect.left + collisionRect.width / 2;
  const current = STAGES.findIndex((stage) => {
    const rect = droppableRects.get(stage.status);
    return rect !== undefined && centerX >= rect.left && centerX <= rect.right;
  });
  const target = STAGES[Math.min(STAGES.length - 1, Math.max(0, current + step))];
  const rect = target && droppableRects.get(target.status);
  return rect ? { x: rect.left + 8, y: rect.top + 56 } : undefined;
};

export function Board({ items, onOpen, onMove }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const groups = useMemo(() => groupByStatus(items), [items]);
  const active = items.find((item) => item.id === activeId) ?? null;

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a plain click still opens the card.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // A short press-and-hold on touch screens, so scrolling the board with a finger still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
      coordinateGetter: jumpBetweenColumns,
    }),
  );

  const nameOf = (id: unknown) => items.find((item) => item.id === id)?.company ?? "application";

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      isStatus(over?.id) ? `${nameOf(active.id)} is over ${STAGE_LABEL[over.id]}.` : undefined,
    onDragEnd: ({ active, over }) =>
      isStatus(over?.id)
        ? `${nameOf(active.id)} dropped in ${STAGE_LABEL[over.id]}.`
        : `${nameOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `Move cancelled. ${nameOf(active.id)} was put back.`,
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const item = items.find((candidate) => candidate.id === active.id);
    if (item && isStatus(over?.id) && over.id !== item.status) onMove(item, over.id);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To move an application, press space to pick it up, use the left and right arrow keys to choose a stage, then press space again to drop it. Press enter to open it instead.",
        },
      }}
    >
      <div className="board">
        {STAGES.map((stage) => (
          <Column key={stage.status} stage={stage} items={groups[stage.status]} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="card card-overlay">
            <CardContent item={active} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
