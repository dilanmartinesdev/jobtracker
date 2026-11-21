import { useDroppable } from "@dnd-kit/core";

import type { Application } from "../api/types";
import type { Stage } from "../lib/stages";
import { DraggableCard } from "./Card";

interface Props {
  stage: Stage;
  items: Application[];
  onOpen: (id: number) => void;
}

export function Column({ stage, items, onOpen }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.status });

  return (
    <section
      ref={setNodeRef}
      className={`column tone-${stage.status}`}
      data-over={isOver}
      aria-labelledby={`column-${stage.status}`}
    >
      <header className="column-head">
        <h2 id={`column-${stage.status}`}>{stage.label}</h2>
        <span className="column-count" aria-label={`${items.length} applications`}>
          {items.length}
        </span>
      </header>
      <div className="column-body">
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} onOpen={onOpen} />
        ))}
        {items.length === 0 && <p className="column-empty">{stage.hint}</p>}
      </div>
    </section>
  );
}
