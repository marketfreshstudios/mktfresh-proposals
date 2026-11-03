"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../ui";
import { ToastSurface } from "../block-controls";
export function GutterInsert({
  onAdd,
  dragHandle,
}: {
  onAdd?: (edge: "above" | "below", anchor: HTMLElement) => void;
  dragHandle: ReactNode;
}) {
  return (
    <div data-editor-chrome className="editor-gutter rich-toolbar">
      {onAdd && (
        <button
          type="button"
          className="editor-gutter-add"
          aria-label="Add a block above"
          title="Add a block above"
          data-insert-edge="above"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => onAdd("above", e.currentTarget)}
        >
          <Icon name="plus" />
        </button>
      )}
      {dragHandle}
      {onAdd && (
        <button
          type="button"
          className="editor-gutter-add"
          aria-label="Add a block below"
          title="Add a block below"
          data-insert-edge="below"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => onAdd("below", e.currentTarget)}
        >
          <Icon name="plus" />
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
}: {
  busy: boolean;
  pending: boolean;
  selected: boolean;
  onReviewed: () => void;
  onUndo?: () => void;
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
          className="editor-ai-check rich-toolbar"
          title="Mark reviewed"
          aria-label="Mark this AI-written block reviewed"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setRequested(true);
            onReviewed();
          }}
        >
          ✓
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
