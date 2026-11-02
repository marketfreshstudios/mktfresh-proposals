"use client";
import { EditorPopoverProvider } from "./editor-popovers";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Icon, Button, post } from "./ui";
import type { Block, RichText } from "../lib/model";
import { createPortal } from "react-dom";
import type { TextStyleControl } from "../lib/editor-document";
import { FormattingControls } from "./formatting-controls";
import { EditorHistoryProvider, useEditorHistory } from "./editor-history";
const Formatting = createContext<
  | {
      target: HTMLElement | null;
      owner: string | null;
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
/** One bar per document, with a stable footprint even when selection isn't rich text. */
export function DocumentFormattingBar() {
  const state = useBlockToolbar();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header =
      ref.current?.closest("dialog")?.querySelector(":scope > header") ??
      document.querySelector(".quote-editor-top");
    if (!ref.current) return;
    if (!header) {
      ref.current.style.setProperty("--formatting-top", "0px");
      return;
    }
    const update = () => {
      const height = Math.max(0, header.getBoundingClientRect().height);
      ref.current?.style.setProperty("--formatting-top", `${height}px`);
      header
        .closest<HTMLElement>(".quote-workspace")
        ?.style.setProperty("--editor-header-height", `${height}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="document-formatting-bar"
      ref={ref}
      role="toolbar"
      aria-label="Document formatting"
      onMouseDown={(e) => {
        if ((e.target as Element).closest("button")) e.preventDefault();
      }}
    >
      <div ref={state?.setTarget} className="document-formatting-target" />
      {!state?.owner && (
        <FormattingControls textStyle={state?.textStyle ?? null} />
      )}
    </div>
  );
}
const Selection = createContext({
  active: null as string | null,
  selected: null as string | null,
  hover: (_id: string | null) => {},
  select: (_id: string) => {},
  clear: () => {},
});
export function useBlockSelection() {
  return useContext(Selection);
}
function ToastSurface({
  children,
  role = "status",
  className = "",
}: {
  children: ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const sync = () => {
      const modal = Array.from(document.querySelectorAll("dialog:modal")).at(
        -1,
      );
      setHost((current) =>
        current === (modal ?? document.body)
          ? current
          : (modal ?? document.body),
      );
      // A newly opened menu/dialog must not cover an existing toast. Keeping
      // it inside the modal also prevents the browser from making Undo inert.
      const toast = ref.current;
      if (toast?.matches(":popover-open")) {
        toast.hidePopover();
        toast.showPopover();
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const toast = ref.current;
    if (!toast) return;
    toast.showPopover();
    return () => toast.hidePopover();
  }, [host]);
  return host
    ? createPortal(
        <div
          ref={ref}
          popover="manual"
          className={`block-feedback-toast ${className}`}
          role={role}
        >
          {children}
        </div>,
        host,
      )
    : null;
}
export function BlockScope({ children }: { children: ReactNode }) {
  return (
    <EditorPopoverProvider>
      <BlockScopeContent>{children}</BlockScopeContent>
    </EditorPopoverProvider>
  );
}
function BlockScopeContent({ children }: { children: ReactNode }) {
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
  const select = (id: string) => {
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
    pendingFieldTarget.current = null;
    activate(null);
    setTextStyle(undefined);
    selectedRef.current = null;
    setSelected(null);
    setHovered(null);
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        target.closest(
          ".document-formatting-bar,.block-dialog,.block-feedback-toast,.block-owned-dialog,.block-popover",
        )
      )
        return;
      const frame = target.closest<HTMLElement>(".block-frame");
      if (frame) {
        if (frame.dataset.blockId) select(frame.dataset.blockId);
        setHovered(null);
        return;
      }
      const dragFrame = target
        .closest(".block-sortable")
        ?.querySelector<HTMLElement>(":scope > .block-frame");
      if (target.closest(".drag-handle") && dragFrame) {
        if (dragFrame.dataset.blockId) select(dragFrame.dataset.blockId);
        return;
      }
      pendingFieldTarget.current = target.closest(
        "[data-field-insert],.field-options",
      )
        ? (selectedRef.current ?? pendingFieldTarget.current)
        : null;
      selectedRef.current = null;
      setSelected(null);
      setHovered(null);
      activate(null);
      setTextStyle(undefined);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  return (
    <EditorHistoryProvider>
      <Formatting.Provider
        value={{
          target,
          setTarget,
          owner,
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
        <Selection.Provider
          value={{
            active: selected ?? hovered,
            selected,
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
                  ".field-editor,.document-formatting-bar,.block-tools,.block-insert,.block-popover,[role=dialog]",
                )
              )
                activate(null);
            }}
            onFocusCapture={(e) => {
              if (
                !(e.target as Element).closest(
                  ".field-editor,.document-formatting-bar,.block-tools,.block-insert,.block-popover,[role=dialog]",
                )
              )
                activate(null);
            }}
            onPointerLeave={() => setHovered(null)}
            onKeyDownCapture={(e) => {
              if (e.key === "Escape") {
                clear();
                if ((e.target as Element).closest(".block-frame")) {
                  (e.target as HTMLElement).blur();
                }
              }
            }}
          >
            {children}
          </div>
          {guidance &&
            typeof document !== "undefined" &&
            createPortal(
              <ToastSurface>
                Click into the text where you want the field
              </ToastSurface>,
              document.body,
            )}
        </Selection.Provider>
      </Formatting.Provider>
    </EditorHistoryProvider>
  );
}
export function BlockAction({
  children,
  variant: _variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
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
      className="block-action"
      aria-label={label}
      title={props.title ?? label}
      onClick={(e) => {
        props.onClick?.(e);
      }}
    >
      {icon === "trash-can" || icon === "floppy-disk" || icon === "clone" ? (
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
}: {
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
}) {
  const frame = useRef<HTMLDivElement>(null);
  const selection = useBlockSelection();
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
        data-ai={ai}
        tabIndex={0}
        role="group"
        aria-label={label}
        onPointerOver={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.hover(id);
        }}
        onPointerDownCapture={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.select(id);
        }}
        onFocusCapture={(e) => {
          if ((e.target as Element).closest(".block-frame") === e.currentTarget)
            selection.select(id);
        }}
      >
        <div
          className="block-tools"
          role="toolbar"
          aria-label={`${label} actions`}
        >
          {(ai || reviewPending) && (
            <>
              <span className="block-ai-marker">AI-written · review</span>
              <button
                type="button"
                className="block-review-action"
                title="Mark reviewed"
                onClick={onReviewed}
              >
                <span aria-hidden="true">✓</span> Mark reviewed
              </button>
            </>
          )}
          {reviewed && (
            <>
              <span className="block-reviewed">Reviewed ✓</span>
              <button
                type="button"
                className="block-review-action"
                title="Undo review"
                onClick={onUndo}
              >
                Undo review
              </button>
            </>
          )}
          {tools}
        </div>
        {insert &&
          (["above", "below"] as const).map((edge) => (
            <button
              key={edge}
              type="button"
              className={`block-insert block-insert-${edge}`}
              aria-label={`Add block ${edge}`}
              title={`Add block ${edge}`}
              onClick={(e) => insert(edge, e.currentTarget)}
            >
              +
            </button>
          ))}
        <div className="block-content">{children}</div>
      </div>
    </>
  );
}

/** Shared proposal/template actions. Undo restores just the removed item, preserving later edits. */
export function useBlockFeedback() {
  const history = useEditorHistory();
  const [saving, setSaving] = useState(false),
    [candidate, setCandidate] = useState<Block | null>(null),
    [name, setName] = useState("");
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<null | (() => void)>(null);
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
    undo?: () => void;
    view?: boolean;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (candidate || confirmation) dialog.current?.showModal();
  }, [candidate, confirmation]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  function reuse(block: Block) {
    setCandidate(structuredClone(block));
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
  ) {
    const apply = () => {
      action();
      const controller = history?.controller,
        id = controller?.engine.lastId;
      setToast({
        message: "Block deleted",
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
    reuseButton: (block: Block, labelled = false) =>
      labelled ? (
        <Button
          icon="floppy-disk"
          busy={saving}
          title={
            saved[JSON.stringify(block)]
              ? `Saved as ${saved[JSON.stringify(block)]}`
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
            saved[JSON.stringify(block)]
              ? `Saved as ${saved[JSON.stringify(block)]}`
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
                    {candidate ? "Save for reuse" : "Delete required block?"}
                  </h2>
                  {candidate ? (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!name.trim() || saving) return;
                        setSaving(true);
                        try {
                          await post("/api/content_library", {
                            id: crypto.randomUUID(),
                            name: name.trim(),
                            block: candidate,
                          });
                          setSaved((previous) => ({
                            ...previous,
                            [JSON.stringify(candidate)]: name.trim(),
                          }));
                          setToast({
                            message: "Saved to Templates & blocks",
                            view: true,
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
                          autoFocus
                          maxLength={120}
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>
                      <Button
                        type="submit"
                        busy={saving}
                        disabled={!name.trim()}
                      >
                        Save
                      </Button>
                      <Button
                        disabled={saving}
                        onClick={() => setCandidate(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p>
                        Pricing and signature blocks are required for readiness.
                        Delete this block?
                      </p>
                      <Button variant="danger" onClick={() => confirmation?.()}>
                        Delete block
                      </Button>
                      <Button onClick={() => setConfirmation(null)}>
                        Cancel
                      </Button>
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
            document.body,
          ),
  };
}
function richWords(node: RichText): string {
  return node.text ?? node.content?.map(richWords).join(" ") ?? "";
}
