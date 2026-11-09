"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../ui";
import { Check } from "lucide-react";
import { ToastSurface } from "../block-controls";
export function GutterInsert({
  onAdd,
  dragHandle,
  layout = "gutter",
}: {
  onAdd?: (edge: "above" | "below", anchor: HTMLElement) => void;
  dragHandle: ReactNode;
  layout?: "gutter" | "edges";
}) {
  return (
    <div
      data-editor-chrome
      className={`editor-gutter rich-toolbar editor-insert-${layout}`}
    >
      {onAdd && (
        <button
          type="button"
          className={`editor-gutter-add${layout === "gutter" ? " round-icon" : ""}`}
          aria-label="Add a block above"
          title="Add a block above"
          data-insert-edge="above"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => onAdd("above", e.currentTarget)}
        >
          {layout === "edges" ? "Add above" : <Icon name="plus" />}
        </button>
      )}
      {layout === "gutter" && dragHandle}
      {onAdd && (
        <button
          type="button"
          className={`editor-gutter-add${layout === "gutter" ? " round-icon" : ""}`}
          aria-label="Add a block below"
          title="Add a block below"
          data-insert-edge="below"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => onAdd("below", e.currentTarget)}
        >
          {layout === "edges" ? "Add below" : <Icon name="plus" />}
        </button>
      )}
    </div>
  );
}
export function AiReviewCheck({
  busy,
  pending,
  selected,
  onReviewed,
  onUndo,
  layout = "side",
}: {
  busy: boolean;
  pending: boolean;
  selected: boolean;
  onReviewed: () => void;
  onUndo?: () => void;
  layout?: "side" | "corner";
}) {
  const [toast, setToast] = useState(false),
    [requested, setRequested] = useState(false);
  useEffect(() => {
    if (requested && !pending) {
      setRequested(false);
      setToast(true);
    }
  }, [requested, pending]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return (
    <>
      {pending && selected && (
        <button
          type="button"
          data-editor-chrome
          className={`editor-ai-check rich-toolbar editor-ai-${layout}`}
          title="Mark reviewed"
          aria-label="Mark this AI-written block reviewed"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setRequested(true);
            onReviewed();
          }}
        >
          <Check size={16} aria-hidden="true" />
        </button>
      )}
      {toast && (
        <ToastSurface className="editor-review-toast">
          Marked reviewed
          {onUndo && (
            <>
              {" "}
              ·{" "}
              <button
                onClick={() => {
                  onUndo();
                  setToast(false);
                }}
              >
                Undo
              </button>
            </>
          )}
        </ToastSurface>
      )}
    </>
  );
}
