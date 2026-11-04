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
  mode: "docked" | "drawer" | "sheet";
  totals: string;
  onTab: (tab: EditorTab) => void;
  onToggle: () => void;
  onCloseComplete?: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const handledClose = useRef(false);
  const openedCallbacks = useRef({ onToggle, onCloseComplete });
  useEffect(() => {
    if (mode === "docked" || !open) return;
    const el = dialog.current;
    handledClose.current = false;
    openedCallbacks.current = { onToggle, onCloseComplete };
    el?.showModal();
    return () => el?.close();
  }, [mode, open]);
  const close = () => {
    if (mode === "docked") {
      onToggle();
      return;
    }
    const el = dialog.current;
    if (!el?.open) return;
    handledClose.current = true;
    el.close();
    // Commit the originating panel state now. A queued native close event can
    // arrive after a resize and must not toggle a different breakpoint's panel.
    onToggle();
    requestAnimationFrame(() => onCloseComplete?.());
  };
  const content = (
    <>
      {mode === "sheet" && (
        <div className="editor-sheet-grabber" aria-hidden="true" />
      )}
      <div className="editor-tools-header">
        <PanelTabs tab={tab} onTab={onTab} />
        {mode === "sheet" && (
          <button type="button" onClick={close}>
            Done
          </button>
        )}
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
      {mode === "sheet" ? (
        <nav className="editor-phone-dock" aria-label="Proposal tools">
          {editorTabs.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTab(value)}
              aria-label={`Open ${value}`}
            >
              <span aria-hidden="true">
                {value === "Quote" ? totals : glyphs[value]}
              </span>
              <small>{value}</small>
            </button>
          ))}
        </nav>
      ) : (
        <aside
          className={`editor-sidepanel editor-v2-panel ${mode === "docked" && open ? "" : "sidebar-rail"}`}
          aria-label="Proposal tools"
          aria-hidden={mode !== "docked" && open ? true : undefined}
        >
          {mode === "docked" && open ? (
            content
          ) : (
            <PanelRail totals={totals} onTab={onTab} onToggle={onToggle} />
          )}
        </aside>
      )}
      {mode !== "docked" && open && (
        <dialog
          ref={dialog}
          aria-label="Proposal tools"
          className={`${mode === "sheet" ? "editor-v2-sheet" : "editor-v2-drawer"} tools-sheet`}
          onClose={(event) => {
            if (event.currentTarget.open) return;
            if (handledClose.current) {
              handledClose.current = false;
              return;
            }
            openedCallbacks.current.onToggle();
            openedCallbacks.current.onCloseComplete?.();
          }}
          onCancel={(event) => {
            event.preventDefault();
            close();
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
                close();
            }
          }}
        >
          {content}
        </dialog>
      )}
    </>
  );
}
