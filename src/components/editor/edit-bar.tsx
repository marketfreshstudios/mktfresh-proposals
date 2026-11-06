"use client";
import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { Block } from "../../lib/model";
import { useBlockToolbar } from "../block-controls";
import { FormattingControls } from "../formatting-controls";
import { PageBreakAction, usePageBreakAvailable } from "../page-break-action";
import { ToolbarPopover } from "../toolbar-popover";
import { FieldOptions } from "../field-options";
import { EditorIcon } from "./editor-icon";
import { useControlLayout } from "./control-layout";
import { placeEditorToolbar } from "./toolbar-placement";
import { useImageToolbar, PhoneToolbar } from "./use-image-toolbar";
export const BlockActionPresentation = createContext<"bar" | "menu" | null>(
  null,
);
function actions(nodes: ReactNode): ReactElement<any>[] {
  const result: ReactElement<any>[] = [];
  Children.forEach(nodes, (node) => {
    if (!isValidElement<any>(node)) return;
    if (node.type === Fragment)
      result.push(...actions((node.props as any).children));
    else result.push(node);
  });
  return result;
}
function label(node: ReactElement<any>) {
  return String(node.props["aria-label"] ?? node.props.children ?? "");
}
export function EditBar(
  props:
    | {
        variant: "cover";
        children: ReactNode;
        frame: RefObject<HTMLElement | null>;
      }
    | {
        variant: "band";
        children: ReactNode;
        frame: RefObject<HTMLElement | null>;
        kind: "header" | "footer";
        inside: boolean;
        device?: "desktop" | "tablet" | "phone";
        sourceLabel?: string;
        portal?: HTMLElement | null;
      }
    | {
        id: string;
        frame: RefObject<HTMLDivElement | null>;
        tools: ReactNode;
        blockType: Block["type"];
        objectAction?: ReactNode;
        variant?: "block";
        plainText?: boolean;
      },
) {
  if (props.variant === "cover") return <CoverEditBar {...props} />;
  if (props.variant === "band") return <BandEditBar {...props} />;
  return <BlockEditBar {...props} />;
}
function CoverEditBar({
  children,
  frame,
}: Extract<Parameters<typeof EditBar>[0], { variant: "cover" }>) {
  const bar = useRef<HTMLSpanElement>(null);
  useImageToolbar(frame, bar, true);
  useEffect(() => {
    const viewport = window.visualViewport;
    const place = () =>
      bar.current?.style.setProperty(
        "--editor-keyboard-inset",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, []);
  return (
    <PhoneToolbar>
      <span
        ref={bar}
        data-editor-chrome
        className="editor-edit-bar image-edit-bar cover-edit-bar"
        role="toolbar"
        aria-label="Cover text formatting"
        onMouseDown={(e) => {
          if ((e.target as Element).closest("button")) e.preventDefault();
        }}
      >
        {children}
      </span>
    </PhoneToolbar>
  );
}
function BandEditBar(
  props: Extract<Parameters<typeof EditBar>[0], { variant: "band" }>,
) {
  const root = useRef<HTMLDivElement>(null);
  useImageToolbar(props.frame, root, props.device !== "phone", {
    below: props.kind === "footer" ? !props.inside : props.inside,
    gap: 14,
  });
  useEffect(() => {
    if (props.device !== "phone") return;
    const viewport = window.visualViewport;
    const update = () =>
      root.current?.style.setProperty(
        "--editor-keyboard-inset",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [props.device]);
  const bar = (
    <div
      ref={root}
      data-editor-chrome
      data-device={props.device ?? "desktop"}
      data-band-dock={props.device === "phone" ? "keyboard" : "margin"}
      className="editor-edit-bar band-edit-bar"
      data-band-kind={props.kind}
      data-inside={props.inside}
      role="toolbar"
      aria-label={`${props.sourceLabel ?? "Shared"} ${props.kind} formatting`}
      onMouseDown={(e) => {
        if ((e.target as Element).closest("button")) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        const buttons = Array.from(
          e.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (index < 0) return;
        e.preventDefault();
        buttons[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length
        ]?.focus();
        (document.activeElement as HTMLElement)?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }}
    >
      <div className="band-edit-scroll">{props.children}</div>
    </div>
  );
  return props.device === "phone"
    ? createPortal(bar, props.portal ?? document.body)
    : bar;
}
function BlockEditBar({
  id,
  frame,
  tools,
  blockType,
  objectAction,
  plainText = false,
}: {
  plainText?: boolean;
  id: string;
  frame: RefObject<HTMLDivElement | null>;
  tools: ReactNode;
  blockType: Block["type"];
  objectAction?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    fields = useBlockToolbar(),
    layout = useControlLayout(),
    [more, setMore] = useState(false),
    [picker, setPicker] = useState(false),
    [fieldTrigger, setFieldTrigger] = useState<HTMLElement | null>(null),
    menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (more)
      menu.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [more]);
  useEffect(() => {
    if (!layout.phone) return;
    const viewport = window.visualViewport;
    const update = () =>
      root.current?.style.setProperty(
        "--editor-keyboard-inset",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [layout.phone]);
  const text = ["paragraph", "heading"].includes(blockType),
    phoneActions = layout.phone && layout.compactPhone,
    all = actions(tools),
    up = all.find((n) => /move.*up/i.test(label(n))),
    down = all.find((n) => /move.*down/i.test(label(n))),
    duplicate = all.find((n) => /duplicate/i.test(label(n))),
    save = all.find((n) => /save.*reuse/i.test(label(n))),
    remove = all.find((n) => /delete|remove/i.test(label(n))),
    settings = all.find((n) => /settings/i.test(label(n))),
    extras = all.filter((n) => /add clause/i.test(label(n))),
    page = usePageBreakAvailable(id),
    prohibited = ["pricing_table", "signature_block"].includes(blockType);
  const objectLabel =
    blockType === "pricing_table"
      ? "Pricing table"
      : blockType === "signature_block"
        ? "Signatures"
        : blockType === "image"
          ? "Image"
          : /clause/i.test(frame.current?.getAttribute("aria-label") ?? "")
            ? "Clause"
            : "Contract";
  useLayoutEffect(() => {
    const bar = root.current,
      owner = frame.current;
    const main =
      owner?.closest<HTMLElement>(
        ".editor-document-region,.studio-template-main",
      ) ??
      owner?.closest<HTMLElement>("dialog") ??
      document.documentElement;
    if (!bar || !owner) return;
    const place = () => {
      placeEditorToolbar(owner, bar);
      bar.dataset.scrolling = String(bar.scrollWidth > bar.clientWidth + 1);
      const buttons = Array.from(
        bar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const active =
        buttons.find((b) => b === document.activeElement) ??
        buttons.find((b) => b.dataset.roving === "true") ??
        buttons[0];
      buttons.forEach((b) => {
        b.tabIndex = b === active ? 0 : -1;
        b.dataset.roving = String(b === active);
      });
    };
    const focus = (event: FocusEvent) => {
      const button = (event.target as Element).closest("button");
      if (button)
        bar.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
          b.tabIndex = b === button ? 0 : -1;
          b.dataset.roving = String(b === button);
        });
    };
    const keys = (event: KeyboardEvent) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
        return;
      const buttons = Array.from(
        bar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
      const n = buttons.indexOf(event.target as HTMLButtonElement),
        at =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (n + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length;
      event.preventDefault();
      event.stopPropagation();
      buttons[at]?.focus();
      buttons[at]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    bar.addEventListener("keydown", keys, true);
    bar.addEventListener("focusin", focus);
    place();
    const resize = new ResizeObserver(place);
    resize.observe(main);
    resize.observe(owner);
    resize.observe(bar);
    const mutation = new MutationObserver(place);
    mutation.observe(bar, { childList: true, subtree: true });
    window.addEventListener("resize", place);
    window.addEventListener("input", place, true);
    const scroll = (event: Event) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest(".editor-edit-bar,.toolbar-popover")
      ))
        place();
    };
    window.addEventListener("scroll", scroll, true);
    return () => {
      bar.removeEventListener("keydown", keys, true);
      bar.removeEventListener("focusin", focus);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("input", place, true);
      window.removeEventListener("scroll", scroll, true);
    };
  });
  return (
    <BlockActionPresentation.Provider value="bar">
      <div
        ref={root}
        data-editor-chrome
        className="editor-edit-bar rich-toolbar"
        role="toolbar"
        aria-label={text ? "Text tools" : `${objectLabel} tools`}
        data-compact={layout.compact && !layout.compactPhone}
        data-dock={layout.phone ? "keyboard" : "float"}
        data-compact-phone={phoneActions || undefined}
        onMouseDown={(e) => {
          if ((e.target as Element).closest("button")) e.preventDefault();
        }}
        onFocusCapture={(e) => {
          const button = (e.target as Element).closest("button");
          if (button)
            root.current
              ?.querySelectorAll<HTMLButtonElement>("button")
              .forEach((b) => {
                b.tabIndex = b === button ? 0 : -1;
                b.dataset.roving = String(b === button);
              });
        }}
        onKeyDown={(e) => {
          if (
            ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key) &&
            !(e.target as Element).closest(".toolbar-popover")
          ) {
            const buttons = Array.from(
              root.current!.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const n = buttons.indexOf(e.target as HTMLButtonElement),
              at =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? buttons.length - 1
                    : (n + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                      buttons.length;
            e.preventDefault();
            buttons[at]?.focus();
            buttons[at]?.scrollIntoView({
              block: "nearest",
              inline: "nearest",
            });
          }
        }}
      >
        {plainText ? (
          <>
            <button
              type="button"
              aria-label="Insert field"
              title="Insert field"
              onClick={(e) => {
                setFieldTrigger(e.currentTarget);
                if (layout.onField) layout.onField();
                else setPicker(true);
              }}
            >
              <span className="edit-field-label">{"{ } Field"}</span>
            </button>
            {settings && <span className="edit-divider" />}
            {settings}
          </>
        ) : text ? (
          <>
            <div className="edit-format-target" ref={fields?.setTarget} />
            {!fields?.owner && (
              <FormattingControls
                edit
                compact={layout.compact && !layout.compactPhone}
                textStyle={fields?.textStyle ?? null}
                onField={(el) => {
                  setFieldTrigger(el);
                  if (layout.onField) layout.onField();
                  else setPicker(true);
                }}
              />
            )}
          </>
        ) : (
          <>
            <span className="edit-object-label">{objectLabel}</span>
            {objectAction ?? settings ?? (
              <button type="button" disabled title="No settings available">
                Settings
              </button>
            )}
            <span className="edit-divider" />
          </>
        )}
        {!phoneActions && up}
        {!phoneActions && down}
        {!phoneActions && (
          <>
            {prohibited || !duplicate ? (
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label="Duplicate block"
                title={
                  blockType === "pricing_table"
                    ? "Only one pricing table per proposal"
                    : blockType === "signature_block"
                      ? "Only one signatures block per proposal"
                      : "This block cannot be duplicated"
                }
              >
                <EditorIcon name="duplicate" />
              </button>
            ) : (
              duplicate
            )}
            {save}
          </>
        )}
        {(phoneActions || page || extras.length > 0) && (
          <button
            type="button"
            aria-label="More block actions"
            title="More"
            ref={trigger}
            aria-haspopup="menu"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            ⋯
          </button>
        )}
        {!phoneActions && remove}
      </div>
      {more && (
        <ToolbarPopover
          trigger={trigger.current}
          className="edit-dark-menu edit-more-menu"
          close={() => setMore(false)}
        >
          <div
            ref={menu}
            onKeyDown={(e) => {
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                const buttons = Array.from(
                  menu.current!.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const n = buttons.indexOf(e.target as HTMLButtonElement),
                  at =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? buttons.length - 1
                        : (n +
                            (e.key === "ArrowDown" ? 1 : -1) +
                            buttons.length) %
                          buttons.length;
                e.preventDefault();
                buttons[at]?.focus();
              }
            }}
            role="menu"
            aria-label="More block actions"
            onClick={(e) => {
              if ((e.target as Element).closest("button:not(:disabled)"))
                setMore(false);
            }}
          >
            <BlockActionPresentation.Provider value="menu">
              {phoneActions && (
                <>
                  {up}
                  {down}
                  {prohibited ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled
                      aria-disabled="true"
                      aria-label="Duplicate block"
                      title={
                        blockType === "pricing_table"
                          ? "Only one pricing table per proposal"
                          : "Only one signatures block per proposal"
                      }
                    >
                      Duplicate block
                    </button>
                  ) : (
                    duplicate
                  )}
                  {save}
                  {remove}
                </>
              )}
              <PageBreakAction block={id} menu />
              {extras}
            </BlockActionPresentation.Provider>
          </div>
        </ToolbarPopover>
      )}
      {picker && (
        <ToolbarPopover
          trigger={fieldTrigger}
          className="field-picker"
          close={() => setPicker(false)}
        >
          <FieldOptions
            variant="menu"
            map={layout.map}
            onInsert={(path) => {
              fields?.insert(path);
              setPicker(false);
            }}
          />
        </ToolbarPopover>
      )}
    </BlockActionPresentation.Provider>
  );
}
