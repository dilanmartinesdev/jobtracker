import { DndContext } from "@dnd-kit/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeApplication } from "../test/fixtures";
import { DraggableCard } from "./Card";

function renderCard(onOpen = vi.fn()) {
  render(
    <DndContext>
      <DraggableCard item={makeApplication({ company: "Northwind Labs" })} onOpen={onOpen} />
    </DndContext>,
  );
  return { onOpen, card: screen.getByText("Northwind Labs").closest(".card") as HTMLElement };
}

describe("DraggableCard", () => {
  it("opens on click", () => {
    const { onOpen, card } = renderCard();
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it("opens on Enter and cancels the key's default action", () => {
    // Regression: without preventDefault, the same Enter press activated the dialog's Close
    // button (which receives focus on open) and the dialog closed the instant it appeared.
    const { onOpen, card } = renderCard();
    const notCancelled = fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(notCancelled).toBe(false); // fireEvent returns false when preventDefault was called
  });

  it("does not open on other keys", () => {
    const { onOpen, card } = renderCard();
    fireEvent.keyDown(card, { key: "a" });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
