"use client";
import { ToastSurface } from "./toast-surface";
export { ToastSurface };
import { DialogActions } from "./dialog-actions";
import { BandEditingProvider } from "./editor/band-editing";
import { PageBreakAction, PageBreakProvider } from "./page-break-action";
import {
  EditorPopoverProvider,
  useDismissEditorPopover,
  useHasEditorPopover,
} from "./editor-popovers";
import {
  ControlLayout,
  useControlLayout,
  useDesktopControls,
  BlockDragHandle,
} from "./editor/control-layout";
import { EditBar, BlockActionPresentation } from "./editor/edit-bar";
import { GutterInsert, AiReviewCheck } from "./editor/gutter-insert";
import { EditorIcon } from "./editor/editor-icon";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Icon, Button, post } from "./ui";
import type { Block, RichText, SavedBlock } from "../lib/model";
import {
  reusableBlock,
  linkedHash,
  excludedBlocksMessage,
  stampSavedBlocks,
  withoutBlockLink,
} from "../lib/linked-blocks";
import { ToolbarPopover } from "./toolbar-popover";
import { createPortal } from "react-dom";
import { duplicateBlock, type TextStyleControl } from "../lib/editor-document";
import { EditorHistoryProvider, useEditorHistory } from "./editor-history";
const Formatting = createContext<
  | {
      target: HTMLElement | null;
      owner: string | null;
      hasTextTarget: boolean;
      textStyle?: TextStyleControl;
      activate: (id: string | null) => void;
      setTarget: (el: HTMLElement | null) => void;
      register: (
        id: string,
        target: {
          block: string | null;
          rich?: boolean;
          textStyle?: () => TextStyleControl;
          insert: (path: string, end: boolean) => void;
        },
      ) => () => void;
      remember: (id: string) => void;
      insert: (path: string) => void;
    }
  | undefined
>(undefined);
export const useBlockToolbar = () => useContext(Formatting);
const Selection = createContext({
  active: null as string | null,
  selected: null as string | null,
  hover: (_id: string | null) => {},
  ids: [] as string[],
  selectMode: false,
  selectMore: () => {},
  select: (_id: string, _mode?: "range" | "toggle") => {},
  clear: () => {},
});
type DocumentBinding = {
  content: Block[];
  prefix: string;
  source?: "proposal" | "template" | "library";
  onChange: (blocks: Block[]) => void;
  reuse: (blocks: Block[]) => void;
  remove?: (
    block: Pick<Block, "type">,
    action: () => void,
    undo: () => void,
  ) => void;
};
const DocumentBindingContext = createContext<{
  current: DocumentBinding | null;
}>({ current: null });
export function useBlockSelection() {
  return useContext(Selection);
}
export function BlockScope({ children }: { children: ReactNode }) {
  return (
    <EditorPopoverProvider>
      <PageBreakProvider>
        <BlockScopeContent>{children}</BlockScopeContent>
      </PageBreakProvider>
    </EditorPopoverProvider>
  );
}
function BlockScopeContent({ children }: { children: ReactNode }) {
  const documentBinding = useRef<DocumentBinding | null>(null);
  const [ids, setIds] = useState<string[]>([]),
    idsRef = useRef<string[]>([]),
    anchorId = useRef<string | null>(null),
    [selectMode, setSelectMode] = useState(false);
  const desktop = useDesktopControls(),
    dismiss = useDismissEditorPopover(),
    hasPopover = useHasEditorPopover();
  const [config, setConfig] = useState<{
    compact: boolean;
    compactPhone?: boolean;
    map: Record<string, string>;
    onField?: () => void;
    locked?: boolean;
  }>({ compact: false, map: {} });
  const [selected, setSelected] = useState<string | null>(null),
    [hovered, setHovered] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null),
    [owner, activate] = useState<string | null>(null);
  const [textStyle, setTextStyle] = useState<TextStyleControl>();
  const targets = useRef(
    new Map<
      string,
      {
        block: string | null;
        rich?: boolean;
        textStyle?: () => TextStyleControl;
        insert: (path: string, end: boolean) => void;
      }
    >(),
  );
  const lastText = useRef<string | null>(null),
    selectedRef = useRef<string | null>(null),
    pendingFieldTarget = useRef<string | null>(null);
  const [guidance, setGuidance] = useState(false);
  useEffect(() => {
    if (!guidance) return;
    const timer = setTimeout(() => setGuidance(false), 8000);
    return () => clearTimeout(timer);
  }, [guidance]);
  const select = (id: string, mode?: "range" | "toggle") => {
    const binding = documentBinding.current;
    const order =
      binding?.content.map((b, n) => `${binding.prefix}${b.id ?? n}`) ?? [];
    if ((mode || selectMode) && order.includes(id)) {
      if (!anchorId.current) anchorId.current = id;
      let next =
        mode === "range" && anchorId.current && order.includes(anchorId.current)
          ? order.slice(
              Math.min(order.indexOf(id), order.indexOf(anchorId.current)),
              Math.max(order.indexOf(id), order.indexOf(anchorId.current)) + 1,
            )
          : idsRef.current.includes(id)
            ? idsRef.current.filter((v) => v !== id)
            : [...idsRef.current, id];
      next = order.filter((v) => next.includes(v));
      idsRef.current = next;
      setIds(next);
      selectedRef.current = next[0] ?? (selectMode ? id : null);
      setSelected(selectedRef.current);
      dismiss();
      return;
    }
    idsRef.current = [id];
    setIds([id]);
    anchorId.current = id;
    if (selectedRef.current !== id) dismiss();
    selectedRef.current = id;
    if (![...targets.current.values()].some((target) => target.block === id))
      lastText.current = null;
    setSelected(id);
  };
  const insert = (path: string) => {
    const remembered =
      lastText.current && targets.current.get(lastText.current);
    const fallbackId = pendingFieldTarget.current ?? selectedRef.current;
    const fallback = fallbackId
      ? [...targets.current.values()].find(
          (target) => target.block === fallbackId,
        )
      : undefined;
    const target = remembered || fallback;
    pendingFieldTarget.current = null;
    if (!target) {
      setGuidance(true);
      return;
    }
    setGuidance(false);
    target.insert(path, !remembered);
  };
  const clear = () => {
    idsRef.current = [];
    setIds([]);
    setSelectMode(false);
    anchorId.current = null;
    pendingFieldTarget.current = null;
    activate(null);
    setTextStyle(undefined);
    selectedRef.current = null;
    setSelected(null);
    setHovered(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !hasPopover() &&
        !document.querySelector("dialog:modal")
      )
        clear();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [desktop]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        target.closest(
          "[data-preserve-block-selection],.phone-formatting-bar,.editor-edit-bar,.block-dialog,.block-feedback-toast,.block-owned-dialog,.block-popover,.phone-header-more,.phone-header-done,.phone-header-back,.template-history-phone,.phone-editor-menu,[aria-label='Done editing template section']",
        )
      )
        return;
      const frame = target.closest<HTMLElement>(".block-frame");
      if (frame) {
        if (target.closest("[data-editor-chrome]")) return;
        if (frame.dataset.blockId) {
          if (event.shiftKey || event.metaKey || event.ctrlKey || selectMode)
            event.preventDefault();
          select(
            frame.dataset.blockId,
            event.shiftKey
              ? "range"
              : event.metaKey || event.ctrlKey
                ? "toggle"
                : undefined,
          );
        }
        setHovered(null);
        return;
      }
      const dragFrame = target
        .closest(".block-sortable")
        ?.querySelector<HTMLElement>(":scope > .block-frame");
      if (target.closest(".drag-handle") && dragFrame) {
        if (
          dragFrame.dataset.blockId &&
          !idsRef.current.includes(dragFrame.dataset.blockId)
        )
          select(dragFrame.dataset.blockId);
        return;
      }
      pendingFieldTarget.current = target.closest(
        "[data-field-insert],.field-options",
      )
        ? (selectedRef.current ?? pendingFieldTarget.current)
        : null;
      selectedRef.current = null;
      idsRef.current = [];
      setIds([]);
      setSelectMode(false);
      setSelected(null);
      setHovered(null);
      activate(null);
      setTextStyle(undefined);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [selectMode]);
  return (
    <ControlConfig.Provider value={setConfig}>
      <ControlLayout.Provider
        value={{
          ...config,
          compactPhone: !!config.compactPhone,
          desktop: true,
          phone: !desktop,
          locked: !!config.locked,
          onField: config.onField,
        }}
      >
        <EditorHistoryProvider>
          <Formatting.Provider
            value={{
              target,
              setTarget,
              owner,
              hasTextTarget: !!lastText.current || !!textStyle,
              textStyle,
              activate: (id) => {
                activate(id);
                if (!id) setTextStyle(undefined);
              },
              insert,
              register: (id, target) => {
                targets.current.set(id, target);
                return () => {
                  targets.current.delete(id);
                  activate((current) => (current === id ? null : current));
                  if (lastText.current === id) lastText.current = null;
                };
              },
              remember: (id) => {
                lastText.current = id;
                setTextStyle(targets.current.get(id)?.textStyle?.());
                activate(targets.current.get(id)?.rich ? id : null);
              },
            }}
          >
            <DocumentBindingContext.Provider value={documentBinding}>
              <Selection.Provider
                value={{
                  active: selected ?? hovered,
                  selected,
                  ids,
                  selectMode,
                  selectMore: () => setSelectMode(true),
                  hover: setHovered,
                  select,
                  clear,
                }}
              >
                <div
                  className="block-scope"
                  onPointerDownCapture={(e) => {
                    if (
                      !(e.target as Element).closest(
                        ".field-editor,[data-editor-chrome],[role=dialog]",
                      )
                    )
                      activate(null);
                  }}
                  onFocusCapture={(e) => {
                    if (
                      !(e.target as Element).closest(
                        ".field-editor,[data-editor-chrome],[role=dialog]",
                      )
                    )
                      activate(null);
                  }}
                  onPointerLeave={() => setHovered(null)}
                  onKeyDownCapture={(e) => {
                    if (
                      desktop &&
                      e.altKey &&
                      !e.metaKey &&
                      !e.ctrlKey &&
                      /^Digit[0-3]$/.test(e.code) &&
                      (e.target as Element).closest(
                        ".block-content .tiptap,.block-content [data-document-text]",
                      ) &&
                      textStyle
                    ) {
                      e.preventDefault();
                      textStyle.change(
                        Number(e.code.slice(-1)) as 0 | 1 | 2 | 3,
                      );
                      return;
                    }
                    if (e.key === "Escape") {
                      // The first Escape belongs to the open tool, which restores its
                      // trigger. A subsequent Escape in the document deselects it.
                      if (
                        (e.target as Element).closest(
                          ".toolbar-popover,.block-popover",
                        )
                      )
                        return;
                      clear();
                      if ((e.target as Element).closest(".block-frame")) {
                        (e.target as HTMLElement).blur();
                      }
                    }
                  }}
                >
                  <BandEditingProvider
                    renderNotices={(notices, undo) =>
                      notices.length ? (
                        <ToastSurface className="band-notices">
                          {notices.map((notice) => (
                            <div key={notice.key} className="band-notice-row">
                              <span>{notice.text} · </span>
                              <button
                                type="button"
                                onClick={() => undo(notice)}
                              >
                                Undo
                              </button>
                            </div>
                          ))}
                        </ToastSurface>
                      ) : null
                    }
                  >
                    {children}
                  </BandEditingProvider>
                </div>
                {guidance &&
                  typeof document !== "undefined" &&
                  createPortal(
                    <ToastSurface>
                      Click into a paragraph first, then choose a field
                    </ToastSurface>,
                    document.body,
                  )}
              </Selection.Provider>
            </DocumentBindingContext.Provider>
          </Formatting.Provider>
        </EditorHistoryProvider>
      </ControlLayout.Provider>
    </ControlConfig.Provider>
  );
}
const ControlConfig = createContext<
  | ((v: {
      compact: boolean;
      compactPhone?: boolean;
      map: Record<string, string>;
      onField?: () => void;
      locked?: boolean;
    }) => void)
  | null
>(null);
export function EditorControlConfig({
  compact,
  compactPhone = false,
  map,
  onField,
  locked = false,
  document: binding,
}: {
  document?: DocumentBinding;
  locked?: boolean;
  compact: boolean;
  compactPhone?: boolean;
  map: Record<string, string>;
  onField?: () => void;
}) {
  const documentBinding = useContext(DocumentBindingContext);
  useLayoutEffect(() => {
    documentBinding.current = binding ?? null;
  });
  const configure = useContext(ControlConfig),
    latest = useRef(onField);
  latest.current = onField;
  useEffect(() => {
    configure?.({
      compact,
      compactPhone,
      map,
      locked,
      onField: onField ? () => latest.current?.() : undefined,
    });
  }, [compact, compactPhone, JSON.stringify(map), !!onField, locked]);
  return null;
}
export function BlockAction({
  children,
  variant: _variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  const presentation = useContext(BlockActionPresentation);
  const rawLabel =
    props["aria-label"] ??
    (typeof children === "string" ? children.trim() : "Block action");
  const label = /remove block/i.test(rawLabel)
    ? "Delete block"
    : /remove clause/i.test(rawLabel)
      ? "Delete clause"
      : rawLabel;
  const icon = /duplicate/i.test(label)
    ? "clone"
    : /up/i.test(label)
      ? "↑"
      : /down/i.test(label)
        ? "↓"
        : /remove|delete/i.test(label)
          ? "trash-can"
          : /reviewed/i.test(label)
            ? "✓"
            : /save|reuse/i.test(label)
              ? "floppy-disk"
              : "⚙";
  return (
    <button
      {...props}
      type="button"
      data-editor-chrome
      className={`block-action ${/delete/i.test(label) ? "edit-delete" : ""} ${presentation === "bar" && /settings/i.test(label) ? "edit-settings" : ""}`}
      role={presentation === "menu" ? "menuitem" : undefined}
      onMouseDown={presentation ? (e) => e.preventDefault() : props.onMouseDown}
      aria-label={label}
      title={props.title ?? label}
      onClick={(e) => {
        props.onClick?.(e);
      }}
    >
      {presentation === "bar" && /settings/i.test(label) ? (
        <span className="edit-settings-label">Settings</span>
      ) : presentation && icon === "floppy-disk" ? (
        "Save"
      ) : presentation && (icon === "trash-can" || icon === "clone") ? (
        <EditorIcon name={icon === "trash-can" ? "trash" : "duplicate"} />
      ) : icon === "trash-can" || icon === "floppy-disk" || icon === "clone" ? (
        <Icon name={icon} />
      ) : (
        <span aria-hidden="true">{icon}</span>
      )}
      <span className="sr-only">{children}</span>
    </button>
  );
}
export function BlockFrame({
  id,
  label,
  children,
  tools,
  className = "",
  ai = false,
  onReviewed,
  reviewed = false,
  reviewPending = false,
  onUndo,
  insert,
  onInsertField,
  blockType = "contract",
  objectAction,
  reviewBusy = false,
  plainText = false,
}: {
  plainText?: boolean;
  id: string;
  label: string;
  children: ReactNode;
  tools: ReactNode;
  className?: string;
  ai?: boolean;
  onReviewed?: () => void;
  reviewed?: boolean;
  reviewPending?: boolean;
  onUndo?: () => void;
  insert?: (edge: "above" | "below", anchor: HTMLElement) => void;
  onInsertField?: (path: string) => void;
  blockType?: Block["type"];
  objectAction?: ReactNode;
  reviewBusy?: boolean;
}) {
  const layout = useControlLayout(),
    dragHandle = useContext(BlockDragHandle);
  const frame = useRef<HTMLDivElement>(null);
  const selection = useBlockSelection();
  const documentBinding = useContext(DocumentBindingContext);
  const orderedIds =
      documentBinding.current?.content.map(
        (b, n) => `${documentBinding.current!.prefix}${b.id ?? n}`,
      ) ?? [],
    selectedAt = orderedIds.indexOf(id);
  const fields = useBlockToolbar(),
    latestInsert = useRef(onInsertField);
  latestInsert.current = onInsertField;
  useEffect(() => {
    if (!onInsertField || !fields) return;
    return fields.register(`fallback-${id}`, {
      block: id,
      rich: false,
      insert: (path) => latestInsert.current?.(path),
    });
  }, [id, !!onInsertField, !!fields]);
  useEffect(() => {
    const el = frame.current,
      sortable = el?.parentElement;
    if (!el || !sortable) return;
    const update = () => {
      const first = el.querySelector<HTMLElement>(
        ":scope > .block-content h2,:scope > .block-content h3,:scope > .block-content .tiptap p,:scope > .block-content summary,:scope > .block-content .block-open strong,:scope > .block-content textarea,:scope > .block-content img",
      );
      const top = first
        ? Math.max(
            0,
            (first.getBoundingClientRect().top -
              el.getBoundingClientRect().top) /
              (el.getBoundingClientRect().width / el.offsetWidth),
          )
        : 0;
      sortable.style.setProperty("--block-first-line-offset", `${top}px`);
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const mutation = new MutationObserver(update);
    mutation.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      sortable.style.removeProperty("--block-first-line-offset");
    };
  }, [id]);
  return (
    <>
      <div
        ref={frame}
        className={`block-frame ${className}`}
        id={id}
        data-block-id={id}
        data-active={selection.active === id}
        data-selected={selection.selected === id}
        data-multi-selected={
          selection.ids.length > 1 && selection.ids.includes(id)
        }
        data-multi-first={!selection.ids.includes(orderedIds[selectedAt - 1])}
        data-multi-last={!selection.ids.includes(orderedIds[selectedAt + 1])}
        data-ai={ai}
        data-controls="v2"
        tabIndex={0}
        role="group"
        aria-label={label}
        onKeyDown={(e) => {
          if (
            e.shiftKey &&
            ["ArrowUp", "ArrowDown"].includes(e.key) &&
            e.target === e.currentTarget
          ) {
            const binding = documentBinding.current;
            const order =
              binding?.content.map((b, n) => `${binding.prefix}${b.id ?? n}`) ??
              [];
            const at = order.indexOf(id),
              direction = e.key === "ArrowDown" ? 1 : -1;
            let to = at + direction;
            while (
              order[to] &&
              !document.getElementById(order[to])?.getClientRects().length
            )
              to += direction;
            const next = order[to];
            if (next) {
              e.preventDefault();
              selection.select(next, "range");
              requestAnimationFrame(() =>
                document.getElementById(next)?.focus(),
              );
            }
          }
          if (
            layout.desktop &&
            e.key === "Enter" &&
            e.target === e.currentTarget
          ) {
            e.preventDefault();
            selection.select(id);
            frame.current
              ?.querySelector<HTMLElement>(
                ".block-content textarea,.block-content .tiptap",
              )
              ?.focus();
          }
          if (
            layout.desktop &&
            e.key === "Tab" &&
            !e.shiftKey &&
            (e.target as Element).closest(
              ".block-content .tiptap,.block-content [data-document-text]",
            )
          ) {
            const first = frame.current?.querySelector<HTMLElement>(
              ".editor-edit-bar button:not(:disabled)",
            );
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
        onPointerOver={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.hover(id);
        }}
        onFocusCapture={(e) => {
          if (
            !(e.target as Element).closest("[data-editor-chrome]") &&
            !selection.ids.includes(id) &&
            (e.target as Element).closest(".block-frame") === e.currentTarget
          )
            selection.select(id);
        }}
        onClickCapture={(e) => {
          if (
            !(e.target as Element).closest("[data-editor-chrome]") &&
            (e.shiftKey || e.ctrlKey || e.metaKey || selection.selectMode)
          ) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {selection.selectMode && !layout.locked && (
          <label data-editor-chrome className="block-selection-check">
            <input
              type="checkbox"
              aria-label={`Select ${label}`}
              checked={selection.ids.includes(id)}
              onChange={() => selection.select(id, "toggle")}
            />
          </label>
        )}
        {selection.ids.length > 1 && selection.ids.includes(id) && (
          <span
            data-editor-chrome
            aria-hidden="true"
            className="multi-block-selection-fill"
          />
        )}
        <div className="block-content">{children}</div>
        {!layout.locked &&
          (selection.ids.length > 1 || selection.selectMode) &&
          (selection.ids[0] ?? selection.selected) === id && (
            <>
              <MultiBlockBar frame={frame} />
              {layout.desktop && !layout.phone && (
                <GutterInsert dragHandle={dragHandle} />
              )}
            </>
          )}
        {layout.desktop &&
          !layout.locked &&
          selection.ids.length <= 1 &&
          !selection.selectMode &&
          selection.active === id && (
            <>
              <EditBar
                id={id}
                frame={frame}
                tools={tools}
                blockType={blockType}
                objectAction={objectAction}
                plainText={plainText}
              />
              <GutterInsert
                onAdd={insert}
                dragHandle={dragHandle}
                layout={layout.phone ? "edges" : "gutter"}
              />
            </>
          )}
        {layout.desktop && !layout.locked && onReviewed && (
          <AiReviewCheck
            layout={layout.phone ? "corner" : "side"}
            pending={ai}
            selected={selection.selected === id}
            busy={reviewBusy}
            onReviewed={onReviewed}
            onUndo={onUndo}
          />
        )}
      </div>
    </>
  );
}

function MultiBlockBar({
  frame,
}: {
  frame: import("react").RefObject<HTMLDivElement | null>;
}) {
  const selection = useBlockSelection(),
    binding = useContext(DocumentBindingContext),
    feedback = useBlockFeedback();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const actionsMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu)
      actionsMenu.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
  }, [menu]);
  const doc = binding.current;
  if (!doc) return null;
  const picked = doc.content.filter((b, n) =>
    selection.ids.includes(`${doc.prefix}${b.id ?? n}`),
  );
  const act = (action: string) => {
    setMenu(null);
    if (action === "save") {
      doc.reuse(picked);
      return;
    }
    if (action === "delete") {
      (doc.remove ?? feedback.remove)(
        {
          type: picked.some((b) =>
            ["pricing_table", "signature_block"].includes(b.type),
          )
            ? "pricing_table"
            : "paragraph",
        },
        () => {
          doc.onChange(doc.content.filter((b) => !picked.includes(b)));
          selection.clear();
        },
        () => {},
      );
      return;
    }
    const instances = new Map<string, string>();
    const copies = picked.map((b) => {
      const copy = duplicateBlock(b);
      if (b.saved_block_instance) {
        if (!instances.has(b.saved_block_instance))
          instances.set(b.saved_block_instance, crypto.randomUUID());
        copy.saved_block_instance = instances.get(b.saved_block_instance);
      }
      return copy;
    });
    if (
      copies.some((b) => ["pricing_table", "signature_block"].includes(b.type))
    ) {
      feedback.error("Pricing tables and signatures cannot be duplicated.");
      return;
    }
    const at = Math.max(...picked.map((b) => doc.content.indexOf(b))) + 1;
    doc.onChange([
      ...doc.content.slice(0, at),
      ...copies,
      ...doc.content.slice(at),
    ]);
  };
  return (
    <>
      {feedback.feedback}
      <EditBar
        variant="selection"
        frame={frame}
        selectMode={selection.selectMode}
      >
        <span className="multi-block-summary">
          {picked.length}{" "}
          {selection.selectMode ? "selected" : "blocks selected"}
        </span>
        {selection.selectMode ? (
          <>
            <button disabled={!picked.length} onClick={() => act("save")}>
              Save as block
            </button>
            <button onClick={selection.clear}>Cancel</button>
          </>
        ) : (
          <button
            aria-label="Selected blocks actions"
            aria-haspopup="menu"
            aria-expanded={!!menu}
            onClick={(e) => setMenu(e.currentTarget)}
          >
            ⋯
          </button>
        )}
      </EditBar>
      {menu && (
        <ToolbarPopover
          trigger={menu}
          close={() => setMenu(null)}
          className="edit-dark-menu"
        >
          <div
            ref={actionsMenu}
            role="menu"
            aria-label="Selected blocks actions"
            className="edit-more-menu"
            onKeyDown={(e) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "[role=menuitem]:not(:disabled)",
                ),
              );
              const at = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              items[
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (at + (e.key === "ArrowUp" ? -1 : 1) + items.length) %
                      items.length
              ]?.focus();
            }}
          >
            <button role="menuitem" onClick={() => act("save")}>
              Save as reusable block
            </button>
            <button role="menuitem" onClick={() => act("duplicate")}>
              Duplicate
            </button>
            <button role="menuitem" onClick={() => act("delete")}>
              Delete
            </button>
          </div>
        </ToolbarPopover>
      )}
    </>
  );
}

/** Shared proposal/template actions. Undo restores just the removed item, preserving later edits. */
export function useBlockFeedback() {
  const history = useEditorHistory();
  const binding = useContext(DocumentBindingContext);
  const [saving, setSaving] = useState(false),
    [candidate, setCandidate] = useState<Block[] | null>(null),
    [name, setName] = useState("");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<null | (() => void)>(null);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
    undo?: () => void;
    view?: boolean;
    open?: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (candidate || confirmation) {
      dialog.current?.showModal();
      dialog.current
        ?.querySelector<HTMLButtonElement>('[data-dialog-action="back"]')
        ?.focus();
    }
  }, [candidate, confirmation]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  function reuse(input: Block | Block[]) {
    const blocks = Array.isArray(input) ? input : [input];
    if (!blocks.length) return;
    setCandidate(structuredClone(blocks));
    const block = blocks.find((b) => b.type === "heading") ?? blocks[0];
    const words =
      block.text ||
      block.clauses?.[0]?.heading ||
      (block.content ? richWords(block.content) : "") ||
      block.type.replaceAll("_", " ");
    setName(words.trim().split(/\s+/).slice(0, 8).join(" ").slice(0, 120));
  }
  function remove(
    block: Pick<Block, "type">,
    action: () => void,
    undo: () => void,
    message = "Block deleted",
  ) {
    const apply = () => {
      action();
      const controller = history?.controller,
        id = controller?.engine.lastId;
      setToast({
        message,
        undo:
          controller && id !== undefined
            ? () => controller.undo(undefined, id)
            : undo,
      });
      setConfirmation(null);
    };
    if (["pricing_table", "signature_block"].includes(block.type))
      setConfirmation(() => apply);
    else apply();
  }
  return {
    reuse,
    remove,
    error: (message: string) => setToast({ message, error: true }),
    removePage: (action: () => void) =>
      remove(
        { type: "paragraph" },
        action,
        () => history?.controller?.undo(),
        "Page deleted",
      ),
    reuseButton: (block: Block, labelled = false) =>
      labelled ? (
        <Button
          icon="floppy-disk"
          busy={saving}
          title={
            saved[linkedHash(block)]
              ? `Saved as ${saved[linkedHash(block)]}`
              : "Save for reuse"
          }
          onClick={() => reuse(block)}
        >
          Save for reuse
        </Button>
      ) : (
        <BlockAction
          disabled={saving}
          aria-busy={saving}
          title={
            saved[linkedHash(block)]
              ? `Saved as ${saved[linkedHash(block)]}`
              : "Save for reuse"
          }
          onClick={() => reuse(block)}
        >
          Save for reuse
        </BlockAction>
      ),
    feedback:
      typeof document === "undefined"
        ? null
        : createPortal(
            <>
              {(candidate || confirmation) && (
                <dialog
                  ref={dialog}
                  className="block-dialog"
                  onCancel={() => {
                    setCandidate(null);
                    setConfirmation(null);
                  }}
                  onClose={() => {
                    setCandidate(null);
                    setConfirmation(null);
                  }}
                  aria-labelledby="block-dialog-title"
                >
                  <h2 id="block-dialog-title">
                    {candidate
                      ? "Save as reusable block"
                      : "Delete required block?"}
                  </h2>
                  {candidate ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!name.trim() || saving) return;
                        setSaving(true);
                        try {
                          const eligible = candidate.filter(reusableBlock);
                          if (!eligible.length) return;
                          const savedRow: SavedBlock = await post(
                            "/api/content_library",
                            {
                              id: crypto.randomUUID(),
                              name: name.trim(),
                              block: withoutBlockLink(eligible[0]),
                              ...(candidate.length > 1
                                ? {
                                    type: "group",
                                    blocks: eligible.map(withoutBlockLink),
                                  }
                                : {}),
                            },
                          );
                          const doc = binding.current;
                          if (doc && doc.source !== "library") {
                            const stamped = stampSavedBlocks(
                              savedRow,
                              crypto.randomUUID(),
                              eligible.map((b) => b.id!),
                            );
                            const byId = new Map(stamped.map((b) => [b.id, b]));
                            doc.onChange(
                              doc.content.map((b) =>
                                b.id ? (byId.get(b.id) ?? b) : b,
                              ),
                            );
                          }
                          setSaved((previous) => ({
                            ...previous,
                            ...Object.fromEntries(
                              eligible.map((b) => [linkedHash(b), name.trim()]),
                            ),
                          }));
                          setToast({
                            message: `Saved as ${name.trim()}`,
                            open: savedRow.id,
                          });
                          setCandidate(null);
                        } catch (e) {
                          setToast({
                            message:
                              e instanceof Error
                                ? e.message
                                : "Unable to save block",
                            error: true,
                          });
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <label className="field">
                        Name
                        <input
                          maxLength={120}
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      {candidate.some((b) => !reusableBlock(b)) && (
                        <p className="muted">
                          {excludedBlocksMessage(
                            candidate,
                            binding.current?.source === "template"
                              ? "template"
                              : "proposal",
                          )}
                        </p>
                      )}
                      <DialogActions>
                        <Button
                          type="submit"
                          variant="primary"
                          busy={saving}
                          disabled={
                            !name.trim() || !candidate.some(reusableBlock)
                          }
                        >
                          Save block
                        </Button>
                        <Button
                          autoFocus
                          disabled={saving}
                          onClick={() => setCandidate(null)}
                        >
                          Cancel
                        </Button>
                      </DialogActions>
                    </form>
                  ) : (
                    <>
                      <p>
                        Pricing and signature blocks are required for readiness.
                        Delete this block?
                      </p>
                      <DialogActions>
                        <Button
                          variant="danger"
                          onClick={() => confirmation?.()}
                        >
                          Delete block
                        </Button>
                        <Button onClick={() => setConfirmation(null)}>
                          Cancel
                        </Button>
                      </DialogActions>
                    </>
                  )}
                  {toast?.error && (
                    <div className="block-feedback-toast error" role="alert">
                      {toast.message}
                    </div>
                  )}
                </dialog>
              )}
              {toast && !(candidate && toast.error) && (
                <ToastSurface
                  className={toast.error ? "error" : ""}
                  role={toast.error ? "alert" : "status"}
                >
                  {toast.message}
                  {toast.open && (
                    <a href={`/studio/blocks/${toast.open}`}>Open</a>
                  )}
                  {toast.view && (
                    <>
                      {" "}
                      · <a href="/studio/templates?view=blocks">View</a>
                    </>
                  )}
                  {toast.undo && (
                    <>
                      {" "}
                      ·{" "}
                      <button
                        onClick={() => {
                          toast.undo?.();
                          setToast(null);
                        }}
                      >
                        Undo
                      </button>
                    </>
                  )}
                </ToastSurface>
              )}
            </>,
            document.querySelector(".staff-foundation") ?? document.body,
          ),
  };
}
function richWords(node: RichText): string {
  return node.text ?? node.content?.map(richWords).join(" ") ?? "";
}
