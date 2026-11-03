"use client";
import { PanelChevron } from "../editor-header";
import { useEffect, useRef, type ReactNode } from "react";
export function SectionsPanel({
  open,
  mode,
  onToggle,
  children,
  onCloseComplete,
}: {
  open: boolean;
  mode: "docked" | "drawer";
  onToggle: () => void;
  onCloseComplete?: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (mode !== "drawer" || !open) return;
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, [mode, open]);
  const heading = (
    <div className="editor-sidebar-header">
      <strong>Sections</strong>
      <button
        type="button"
        className="sidebar-arrow"
        aria-label="Collapse Sections sidebar"
        title="Hide Sections (⇧⌘\\ / Ctrl+Shift+\\)"
        onClick={() =>
          mode === "drawer" ? dialog.current?.close() : onToggle()
        }
      >
        <PanelChevron direction="left" double />
      </button>
    </div>
  );
  return (
    <>
      <aside
        className={`editor-outline editor-v2-sections ${open && mode === "docked" ? "" : "sidebar-rail"}`}
        aria-label="Sections panel"
      >
        {open && mode === "docked" ? (
          <>
            {heading}
            <div className="editor-sidebar-scroll">{children}</div>
          </>
        ) : (
          <div className="editor-sidebar-header">
            <button
              type="button"
              className="sidebar-arrow"
              aria-label="Expand Sections sidebar"
              title="Show Sections (⇧⌘\\ / Ctrl+Shift+\\)"
              onClick={onToggle}
            >
              <PanelChevron direction="right" double />
            </button>
          </div>
        )}
      </aside>
      {open && mode === "drawer" && (
        <dialog
          ref={dialog}
          aria-label="Sections"
          className="editor-v2-sections-drawer sections-overlay"
          onCancel={(e) => {
            e.preventDefault();
            dialog.current?.close();
          }}
          onClose={(e) => {
            if (!e.currentTarget.open) {
              onToggle();
              onCloseComplete?.();
            }
          }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const box = e.currentTarget.getBoundingClientRect();
            if (
              e.clientX < box.left ||
              e.clientX > box.right ||
              e.clientY < box.top ||
              e.clientY > box.bottom
            )
              dialog.current?.close();
          }}
        >
          {heading}
          <div className="editor-sidebar-scroll">{children}</div>
        </dialog>
      )}
    </>
  );
}
