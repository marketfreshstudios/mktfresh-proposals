"use client";
import { PanelDialogContext, PanelHeading } from "./panel-heading";
import {
  Braces,
  CircleDollarSign,
  Ellipsis,
  LayoutGrid,
  Send,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PanelChevron } from "../editor-header";
import { Disclosure } from "../ui";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
/** Shared disclosure for the R23 tools cards. Callers retain their own state. */
export function PanelCard({
  title,
  children,
  count,
  open,
  onToggle,
  className = "",
  bodyClassName = "",
  collapsible = true,
  actions,
  nested = false,
}: {
  title: ReactNode;
  children: ReactNode;
  count?: ReactNode;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  collapsible?: boolean;
  actions?: ReactNode;
  nested?: boolean;
}) {
  const [expanded, setExpanded] = useState(!!open);
  useEffect(() => setExpanded(!!open), [open]);
  const heading = (
    <PanelHeading nested={nested} className="panel-card-title">
      {title}
    </PanelHeading>
  );
  const body = (
    <div className={`panel-card-body ${bodyClassName}`}>{children}</div>
  );
  if (!collapsible)
    return (
      <section className={`editor-panel-card ${className}`} data-open="true">
        <header className="panel-card-header">
          {heading}
          {actions}
        </header>
        {body}
      </section>
    );
  return (
    <details
      className={`editor-panel-card ${className}`}
      open={open}
      onToggle={(event) => {
        setExpanded(event.currentTarget.open);
        onToggle?.(event.currentTarget.open);
      }}
    >
      <Disclosure className="panel-card-header" aria-expanded={expanded}>
        {heading}
        {count !== undefined && (
          <span className="panel-card-count">{count}</span>
        )}
      </Disclosure>
      {body}
    </details>
  );
}
export const editorTabs = [
  "Quote",
  "Fields",
  "Blocks",
  "Styles",
  "Send",
] as const;
export type EditorTab = (typeof editorTabs)[number];
const glyphs = {
  Quote: CircleDollarSign,
  Fields: Braces,
  Blocks: LayoutGrid,
  Styles: SlidersHorizontal,
  Send: Send,
};
function TabGlyph({ tab }: { tab: string }) {
  const Glyph = glyphs[tab as EditorTab] ?? Ellipsis;
  return <Glyph aria-hidden="true" size={16} />;
}
export function PanelRail<T extends string = EditorTab>({
  onTab,
  onToggle,
  totals,
  tabs = editorTabs as unknown as readonly T[],
}: {
  onTab: (tab: T) => void;
  onToggle: () => void;
  totals: string;
  tabs?: readonly T[];
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
          <PanelChevron direction="left" />
        </button>
      </div>
      {tabs.map((tab) => (
        <button
          type="button"
          key={tab}
          className="panel-rail-tab"
          data-preserve-block-selection={
            ["Blocks", "Styles"].includes(tab) ? "" : undefined
          }
          aria-label={`Open ${tab}`}
          title={tab}
          onClick={() => onTab(tab)}
        >
          <span aria-hidden="true">
            <TabGlyph tab={tab} />
          </span>
          <small>{tab}</small>
        </button>
      ))}
      {totals && (
        <p className="panel-rail-totals">
          <span className="sr-only">Quote totals: </span>
          {totals}
        </p>
      )}
    </>
  );
}
export function PanelTabs<T extends string = EditorTab>({
  tab,
  onTab,
  tabs = editorTabs as unknown as readonly T[],
  label = "Proposal tools",
}: {
  tab: T;
  onTab: (tab: T) => void;
  tabs?: readonly T[];
  label?: string;
}) {
  return (
    <div
      className="editor-tabs"
      data-tab-style="segment"
      role="tablist"
      aria-label={label}
      onKeyDown={(event) => moveTabFocus(event, tabs, tab, onTab)}
    >
      {tabs.map((value) => (
        <button
          type="button"
          data-preserve-block-selection={
            ["Blocks", "Styles"].includes(value) ? "" : undefined
          }
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

function moveTabFocus<T extends string>(
  event: KeyboardEvent<HTMLElement>,
  tabs: readonly T[],
  tab: T,
  onTab: (tab: T) => void,
) {
  const delta =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!delta && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (tabs.indexOf(tab) + delta + tabs.length) % tabs.length;
  onTab(tabs[index]);
  event.currentTarget
    .querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [index]?.focus({ preventScroll: true });
}

export function ToolsPanel<T extends string = EditorTab>({
  tab,
  open,
  mode,
  totals,
  onTab,
  onToggle,
  onCloseComplete,
  children,
  tabs = editorTabs as unknown as readonly T[],
  label = "Proposal tools",
  phoneDock = true,
  keepPhoneDock = false,
  actions,
  sheetTitle,
}: {
  tab: T;
  open: boolean;
  mode: "docked" | "drawer" | "sheet";
  totals: string;
  onTab: (tab: T) => void;
  tabs?: readonly T[];
  label?: string;
  phoneDock?: boolean;
  keepPhoneDock?: boolean;
  actions?: ReactNode;
  sheetTitle?: string;
  onToggle: () => void;
  onCloseComplete?: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const handledClose = useRef(false);
  const dock = useRef<HTMLElement>(null);
  const openedFromDock = useRef<T | null>(null);
  const persistentDock = mode === "sheet" && phoneDock && keepPhoneDock;
  const openedCallbacks = useRef({ onToggle, onCloseComplete });
  useEffect(() => {
    if (mode === "docked" || !open) return;
    const el = dialog.current;
    handledClose.current = false;
    openedCallbacks.current = { onToggle, onCloseComplete };
    el?.showModal();
    if (mode === "sheet" && (sheetTitle || persistentDock))
      el?.querySelector("h2")?.focus({ preventScroll: true });
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
    const opener = openedFromDock.current;
    openedFromDock.current = null;
    requestAnimationFrame(() => {
      if (persistentDock && opener)
        dock.current
          ?.querySelector<HTMLButtonElement>(`[data-phone-tool="${opener}"]`)
          ?.focus({ preventScroll: true });
      onCloseComplete?.();
    });
  };
  function phoneButtons(inside: boolean) {
    return (
      <nav
        ref={inside ? undefined : dock}
        className="editor-phone-dock"
        role={inside ? "tablist" : undefined}
        aria-label={label}
        data-persistent-tools={persistentDock || undefined}
        data-preserve-block-selection={persistentDock ? "" : undefined}
        onKeyDown={
          inside ? (event) => moveTabFocus(event, tabs, tab, onTab) : undefined
        }
      >
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            data-phone-tool={value}
            role={inside ? "tab" : undefined}
            aria-selected={inside ? tab === value : undefined}
            aria-controls={inside ? "editor-active-panel" : undefined}
            aria-haspopup={persistentDock && !inside ? "dialog" : undefined}
            tabIndex={inside && tab !== value ? -1 : undefined}
            onMouseDown={(event) => {
              // Stop the compatibility mouse event from moving focus before
              // click. Canceling pointerdown also suppresses taps in WebKit.
              if (persistentDock) event.preventDefault();
            }}
            onClick={(event) => {
              if (inside && tab === value) close();
              else {
                if (persistentDock) {
                  // A native dialog remembers the focused element. Leave the
                  // text editor before opening so close cannot scroll back to it.
                  event.currentTarget.focus({ preventScroll: true });
                  if (!inside) openedFromDock.current = value;
                }
                onTab(value);
              }
            }}
            aria-label={`${inside ? "" : "Open "}${value}${value === "Quote" ? ` ${totals}` : ""}`}
          >
            {value !== "Quote" && (
              <span aria-hidden="true">
                <TabGlyph tab={value} />
              </span>
            )}
            <small>{value}</small>
            {value === "Quote" && <span aria-hidden="true">{totals}</span>}
          </button>
        ))}
      </nav>
    );
  }
  const content = (
    <>
      {mode === "sheet" && (
        <div className="editor-sheet-grabber" aria-hidden="true" />
      )}
      <div
        className="editor-tools-header"
        data-preserve-block-selection={tab === "Styles" ? "" : undefined}
      >
        {mode === "sheet" && (sheetTitle || persistentDock) ? (
          <h2 tabIndex={-1}>{sheetTitle ?? tab}</h2>
        ) : (
          <>
            {mode !== "docked" && <h2 className="sr-only">{label}</h2>}
            <PanelTabs tab={tab} onTab={onTab} tabs={tabs} label={label} />
          </>
        )}
        {persistentDock ? (
          <button
            type="button"
            className="editor-phone-tool-close"
            aria-label={`Close ${tab}`}
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
          </button>
        ) : (
          mode === "sheet" && (
            <button
              type="button"
              onClick={close}
              className={sheetTitle ? "column-text-action" : undefined}
            >
              <span>Done</span>
            </button>
          )
        )}
        {mode !== "sheet" && (
          <button
            type="button"
            className="sidebar-arrow panel-collapse"
            aria-label="Collapse tools sidebar"
            title="Collapse panel (⌘\\ / Ctrl+\\)"
            onClick={close}
          >
            <PanelChevron direction="right" />
          </button>
        )}
      </div>
      <div
        role="tabpanel"
        id="editor-active-panel"
        aria-label={tab}
        className="editor-tab-content"
      >
        <PanelDialogContext value={mode !== "docked"}>
          {children}
          {actions}
        </PanelDialogContext>
      </div>
    </>
  );
  return (
    <>
      {mode === "sheet" ? (
        phoneDock && (!persistentDock || !open) && phoneButtons(false)
      ) : (
        <aside
          className={`editor-sidepanel editor-v2-panel ${mode === "docked" && open ? "" : "sidebar-rail"}`}
          aria-label={label}
          aria-hidden={mode !== "docked" && open ? true : undefined}
        >
          {mode === "docked" && open ? (
            content
          ) : (
            <PanelRail
              totals={totals}
              onTab={onTab}
              onToggle={onToggle}
              tabs={tabs}
            />
          )}
        </aside>
      )}
      {mode !== "docked" && open && (
        <dialog
          ref={dialog}
          aria-label={mode === "sheet" && sheetTitle ? sheetTitle : label}
          data-phone-tools={persistentDock || undefined}
          data-style-sheet={(mode === "sheet" && !!sheetTitle) || undefined}
          className={`${mode === "sheet" ? "editor-v2-sheet" : "editor-v2-drawer"} tools-sheet`}
          onClose={(event) => {
            if (event.currentTarget.open) return;
            if (handledClose.current) {
              handledClose.current = false;
              return;
            }
            openedFromDock.current = null;
            openedCallbacks.current.onToggle();
            openedCallbacks.current.onCloseComplete?.();
          }}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.defaultPrevented) return;
            const tabbable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]',
              ),
            ).filter(
              (el) =>
                el.tabIndex >= 0 &&
                !el.matches(":disabled") &&
                el.getClientRects().length > 0 &&
                el.checkVisibility() &&
                getComputedStyle(el).visibility === "visible",
            );
            const first = tabbable[0];
            const last = tabbable.at(-1);
            if (event.shiftKey && document.activeElement === first && last) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === last &&
              first
            ) {
              event.preventDefault();
              first.focus();
            }
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
          {persistentDock && phoneButtons(true)}
        </dialog>
      )}
    </>
  );
}
