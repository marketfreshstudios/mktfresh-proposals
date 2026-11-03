"use client";
import { PanelChevron } from "../editor-header";
import { useEffect, useRef, type ReactNode } from "react";
export const editorTabs = ["Quote", "Fields", "Styles", "Send"] as const;
export type EditorTab = (typeof editorTabs)[number];
const glyphs = { Quote: "$", Fields: "{ }", Styles: "Aa", Send: "➝" };
export function PanelRail({
  onTab,
  onToggle,
  totals,
}: {
  onTab: (tab: EditorTab) => void;
  onToggle: () => void;
  totals: string;
}) {
  return (
    <>
      <div className="editor-sidebar-header">
        <button
          type="button"
          className="sidebar-arrow"
          aria-label="Expand tools sidebar"
          title="Open panel (⌘\\ / Ctrl+\\)"
          onClick={onToggle}
        >
          <PanelChevron direction="left" double />
        </button>
      </div>
      {editorTabs.map((tab) => (
        <button
          type="button"
          key={tab}
          className="panel-rail-tab"
          aria-label={`Open ${tab}`}
          title={tab}
          onClick={() => onTab(tab)}
        >
          <span aria-hidden="true">{glyphs[tab]}</span>
          <small>{tab}</small>
        </button>
      ))}
      <p className="panel-rail-totals" aria-label={`Quote totals: ${totals}`}>
        {totals}
      </p>
    </>
  );
}
export function PanelTabs({
  tab,
  onTab,
}: {
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={root}
      className="editor-tabs"
      role="tablist"
      aria-label="Proposal tools"
      onKeyDown={(event) => {
        const delta =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!delta && !["Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? 3
              : (editorTabs.indexOf(tab) + delta + 4) % 4;
        onTab(editorTabs[index]);
        root.current
          ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
          [index].focus();
      }}
    >
      {editorTabs.map((value) => (
        <button
          type="button"
          role="tab"
          key={value}
          aria-selected={tab === value}
          tabIndex={tab === value ? 0 : -1}
          aria-controls="editor-active-panel"
          onClick={() => onTab(value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
export function ToolsPanel({
  tab,
  open,
  mode,
  totals,
  onTab,
  onToggle,
  onCloseComplete,
  children,
}: {
  tab: EditorTab;
  open: boolean;
  mode: "docked" | "drawer";
  totals: string;
  onTab: (tab: EditorTab) => void;
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
  const close = () =>
    mode === "drawer" ? dialog.current?.close() : onToggle();
  const content = (
    <>
      <div className="editor-tools-header">
        <PanelTabs tab={tab} onTab={onTab} />
      </div>
      <div
        role="tabpanel"
        id="editor-active-panel"
        aria-label={tab}
        className="editor-tab-content"
      >
        {children}
      </div>
      <button
        type="button"
        className="sidebar-arrow panel-collapse"
        aria-label="Collapse tools sidebar"
        title="Collapse panel (⌘\\ / Ctrl+\\)"
        onClick={close}
      >
        <PanelChevron direction="right" double />
      </button>
    </>
  );
  return (
    <>
      <aside
        className={`editor-sidepanel editor-v2-panel ${mode === "docked" && open ? "" : "sidebar-rail"}`}
        aria-label="Proposal tools"
      >
        {mode === "docked" && open ? (
          content
        ) : (
          <PanelRail totals={totals} onTab={onTab} onToggle={onToggle} />
        )}
      </aside>
      {mode === "drawer" && open && (
        <dialog
          ref={dialog}
          aria-label="Proposal tools"
          className="editor-v2-drawer tools-sheet"
          onCancel={(event) => {
            event.preventDefault();
            dialog.current?.close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const box = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < box.left ||
                event.clientX > box.right ||
                event.clientY < box.top ||
                event.clientY > box.bottom
              )
                dialog.current?.close();
            }
          }}
          onClose={(event) => {
            if (event.currentTarget.open) return;
            onToggle();
            onCloseComplete?.();
          }}
        >
          {content}
        </dialog>
      )}
    </>
  );
}
