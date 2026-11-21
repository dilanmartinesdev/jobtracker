import { useDraggable } from "@dnd-kit/core";
import type { KeyboardEvent } from "react";

import type { Application } from "../api/types";
import { formatAge } from "../lib/format";

export function CardContent({ item }: { item: Application }) {
  return (
    <>
      <span className="card-company">{item.company}</span>
      <span className="card-position">{item.position}</span>
      <span className="card-meta">
        <span>{formatAge(item.applied_date)}</span>
        {item.location && <span>{item.location}</span>}
        {item.notes && (
          <svg className="card-notes" viewBox="0 0 16 16" role="img" aria-label="Has notes">
            <path d="M3 3.5h10M3 8h10M3 12.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </span>
    </>
  );
}

interface Props {
  item: Application;
  onOpen: (id: number) => void;
}

export function DraggableCard({ item, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Space picks the card up (handled by dnd-kit). Enter opens it.
    listeners?.onKeyDown?.(event);
    if (event.key === "Enter" && !event.defaultPrevented) {
      // Without this, the same Enter press "clicks" the dialog's Close button, which has just
      // received focus, and the dialog shuts the instant it opens.
      event.preventDefault();
      onOpen(item.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      className="card"
      data-dragging={isDragging}
      {...attributes}
      {...listeners}
      onKeyDown={handleKeyDown}
      onClick={() => onOpen(item.id)}
    >
      <CardContent item={item} />
    </div>
  );
}
