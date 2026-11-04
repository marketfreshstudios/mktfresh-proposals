"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Editor } from "@tiptap/core";
import {
  CoverSchema,
  defaultCover,
  coverElements,
  coverText,
  coverPlainText,
  type Cover,
  type CoverElement,
} from "../lib/cover";
import { coverInlineHtml, coverLineClass } from "../lib/cover-render";
import { SelectableImage } from "./editor/selectable-image";
import { EditBar } from "./editor/edit-bar";
import { SpacingInput } from "./editor/spacing-input";
import { FieldEditor } from "./field-editor";
import { FieldOptions } from "./field-options";
import { ToolbarPopover } from "./toolbar-popover";
import { useEditorHistory } from "./editor-history";
import { useBlockSelection } from "./block-controls";
import { readableDate } from "../lib/validity";
import { bandRichText } from "./editor/band-rich-text";
import { Icon } from "./ui";
import type { RichText } from "../lib/model";
type Props = {
  title: string;
  company: string;
  sender: string;
  validUntil?: string | null;
  timezone?: string;
  onTitle?: (title: string) => void;
  workspace?: string;
  logo?: string;
  cover?: Cover;
  map?: Record<string, string>;
  onCover?: (cover: Cover) => void;
};
function Spacing({
  element,
  update,
  node,
}: {
  node?: HTMLElement | null;
  element: CoverElement;
  update: (patch: Partial<CoverElement>) => void;
}) {
  const computed = node ? getComputedStyle(node) : undefined;
  return (
    <>
      <SpacingInput
        label="Space above"
        value={
          element.space_above ??
          (computed
            ? parseFloat(computed.marginTop) || 0
            : element.kind === "title"
              ? 12
              : element.kind === "logo"
                ? 0
                : 10)
        }
        onChange={(space_above) => update({ space_above })}
      />
      <SpacingInput
        label="Space below"
        value={
          element.space_below ??
          (computed
            ? (parseFloat(computed.marginBottom) || 0) +
              (parseFloat(computed.paddingBottom) || 0)
            : element.kind === "title"
              ? 20
              : element.kind === "logo"
                ? 0
                : 10)
        }
        onChange={(space_below) => update({ space_below })}
      />
    </>
  );
}
function elementStyle(e: CoverElement): CSSProperties {
  return {
    textAlign: e.align,
    marginTop: e.space_above,
    marginBottom: e.space_below,
    ...(e.space_below === undefined ? {} : { paddingBottom: 0 }),
  };
}
export function DocumentCover({
  title,
  company,
  sender,
  validUntil,
  timezone,
  onTitle,
  workspace,
  logo,
  cover,
  map = {},
  onCover,
}: Props) {
  const value = cover ?? defaultCover(),
    elements = coverElements(value, title),
    editable = !!onCover;
  const history = useEditorHistory(),
    selection = useBlockSelection();
  const root = useRef<HTMLElement>(null),
    latest = useRef({ value, elements, onCover, onTitle });
  latest.current = { value, elements, onCover, onTitle };
  const [selected, select] = useState<string | null>(null),
    [logoMenu, setLogoMenu] = useState(false),
    [logoError, setLogoError] = useState("");
  const logoTrigger = useRef<HTMLButtonElement>(null),
    logoInput = useRef<HTMLInputElement>(null);
  const resolvedMap = {
    "workspace.name": workspace ?? "",
    "client.company": company,
    "sender.name": sender,
    "proposal.validity": validUntil
      ? `Valid until ${readableDate(validUntil, timezone)}`
      : "",
    ...map,
  };
  useEffect(() => {
    if (selection.selected) select(null);
  }, [selection.selected]);
  useEffect(() => {
    if (!selected) return;
    const outside = (event: PointerEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !(event.target as Element).closest(".cover-edit-bar,.image-edit-bar")
      )
        select(null);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [selected]);
  const choose = (id: string) => {
    selection.clear();
    select(id);
  };
  const change = (
    id: string,
    patch: Partial<CoverElement>,
    text?: RichText,
  ) => {
    const current = latest.current,
      element = current.elements.find((e) => e.id === id)!;
    const run = () => {
      const content = text ? bandRichText(text) : undefined;
      let next: Cover = {
        ...current.value,
        elements: current.elements.map((e) =>
          e.id === id
            ? {
                ...e,
                ...patch,
                ...(content ? { content } : {}),
                ...(patch.align ? { x: undefined } : {}),
              }
            : e,
        ),
      };
      if (content) {
        const plain = coverPlainText(content);
        if (element.kind === "title") {
          if (plain.length > 300) return;
          current.onTitle?.(plain.replace(/[\r\n]+/g, " "));
        } else if (element.kind !== "extra" && element.kind !== "logo")
          next = { ...next, [element.kind]: plain };
      }
      current.onCover?.(next);
    };
    history
      ? history.inScope(text ? `text:cover-${id}` : `cover:${id}`, run)
      : run();
  };
  const add = (after: string) => {
    const current = latest.current,
      id = `extra-${crypto.randomUUID()}`,
      next = [...current.elements],
      index = next.findIndex((e) => e.id === after);
    next.splice(index + 1, 0, {
      id,
      kind: "extra",
      align: "left",
      content: coverText(""),
    });
    current.onCover?.({ ...current.value, elements: next });
    choose(id);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>(`[data-cover-element="${id}"] .tiptap`)
        ?.focus(),
    );
  };
  const alignAll = (align: "left" | "center" | "right") =>
    onCover?.({
      ...value,
      elements: elements.map((e) => ({ ...e, align, x: undefined })),
    });
  const src = value.logo === null ? undefined : value.logo || logo;
  return (
    <header
      ref={root}
      className="document-cover"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          select(null);
          (document.activeElement as HTMLElement)?.blur();
        }
      }}
    >
      {elements.map((e) => {
        if (e.hidden) return null;
        if (e.kind === "logo")
          return (
            <CoverLogo
              key={e.id}
              element={e}
              value={value}
              src={src}
              editable={editable}
              selected={selected === e.id}
              select={() => choose(e.id)}
              deselect={() =>
                select((current) => (current === e.id ? null : current))
              }
              update={(patch) => change(e.id, patch)}
              onCover={onCover}
            >
              {editable && (
                <div className="cover-logo-controls" data-editor-chrome>
                  <button
                    type="button"
                    ref={logoTrigger}
                    aria-label="Edit cover logo"
                    onClick={() => setLogoMenu(!logoMenu)}
                  >
                    {src ? "Edit logo" : "Add logo"}
                  </button>
                  {logoMenu && (
                    <ToolbarPopover
                      className="cover-logo-menu"
                      avoid={root.current?.querySelector<HTMLElement>("h1")}
                      trigger={logoTrigger.current}
                      close={() => setLogoMenu(false)}
                    >
                      <button
                        type="button"
                        onClick={() => logoInput.current?.click()}
                      >
                        Upload logo
                      </button>
                      <input
                        ref={logoInput}
                        hidden
                        type="file"
                        aria-label="Replace cover logo"
                        accept="image/png,image/jpeg"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          if (file.size > 700000) {
                            setLogoError("Choose a PNG or JPEG under 700 KB");
                            return;
                          }
                          const data = await new Promise<string>((ok) => {
                            const reader = new FileReader();
                            reader.onload = () => ok(String(reader.result));
                            reader.onerror = () => ok("");
                            reader.readAsDataURL(file);
                          });
                          const parsed = CoverSchema.safeParse({
                            ...value,
                            logo: data,
                          });
                          if (!parsed.success) {
                            setLogoError("Choose a valid PNG or JPEG image");
                            return;
                          }
                          onCover?.(parsed.data);
                          setLogoMenu(false);
                          setLogoError("");
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onCover?.({ ...value, logo: null });
                          select(null);
                          setLogoMenu(false);
                        }}
                      >
                        Remove logo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...value };
                          delete next.logo;
                          onCover?.(next);
                          setLogoMenu(false);
                        }}
                      >
                        Use workspace logo
                      </button>
                      {logoError && <p role="alert">{logoError}</p>}
                    </ToolbarPopover>
                  )}
                </div>
              )}
            </CoverLogo>
          );
        const content =
          e.content ??
          coverText(
            e.kind === "title"
              ? title
              : e.kind === "extra"
                ? ""
                : (value[e.kind] ?? ""),
          );
        if (
          e.kind !== "title" &&
          e.kind !== "extra" &&
          !coverInlineHtml(content, resolvedMap, true)
            .replace(/<[^>]*>/g, "")
            .trim()
        )
          return null;
        return (
          <CoverText
            key={e.id}
            element={e}
            content={content}
            map={resolvedMap}
            editable={editable || (e.kind === "title" && !!onTitle)}
            selected={selected === e.id}
            select={() => choose(e.id)}
            update={(patch, text) => change(e.id, patch, text)}
            add={() => add(e.id)}
            alignAll={alignAll}
          />
        );
      })}
    </header>
  );
}
function CoverText({
  element: e,
  content,
  map,
  editable,
  selected,
  select,
  update,
  add,
  alignAll,
}: {
  element: CoverElement;
  content: RichText;
  map: Record<string, string>;
  editable: boolean;
  selected: boolean;
  select: () => void;
  update: (patch: Partial<CoverElement>, text?: RichText) => void;
  add: () => void;
  alignAll: (align: "left" | "center" | "right") => void;
}) {
  const frame = useRef<HTMLDivElement>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [menu, setMenu] = useState<"align" | "spacing" | "fields" | "more" | null>(
      null,
    ),
    [trigger, setTrigger] = useState<HTMLElement | null>(null),
    [, paint] = useState(0);
  useEffect(() => {
    if (selected && e.kind === "extra" && editor && !editor.isFocused)
      editor.commands.focus("end");
  }, [selected, editor]);
  const label = {
    title: "Proposal title",
    workspace: "Cover workspace name",
    prepared_for: "Cover client name",
    byline: "Cover byline",
    eyebrow: "Cover eyebrow",
    extra: "Cover extra line",
    logo: "Logo",
  }[e.kind];
  useEffect(() => {
    if (!selected) setMenu(null);
  }, [selected]);
  useEffect(() => {
    if (!editor) return;
    const refresh = () => paint((v) => v + 1);
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
    };
  }, [editor]);
  const open = (
    name: typeof menu,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    setTrigger(event.currentTarget);
    setMenu(menu === name ? null : name);
  };
  const controls =
    selected && editable ? (
      <EditBar variant="cover" frame={frame}>
        <button
          type="button"
          aria-label="Bold"
          title="Bold"
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          aria-label="Italic"
          title="Italic"
          aria-pressed={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <span className="edit-divider" />
        <button type="button" onClick={(event) => open("align", event)}>
          Align
        </button>
        <button type="button" onClick={(event) => open("spacing", event)}>
          Spacing <Icon name="chevron-down" className="disclosure-icon" />
        </button>
        <span className="edit-divider" />
        <button
          type="button"
          aria-label="Insert field"
          onClick={(event) => open("fields", event)}
        >
          {"{ } Field"}
        </button>
        <button
          type="button"
          aria-label="More cover actions"
          title="More"
          onClick={(event) => open("more", event)}
        >
          ⋯
        </button>
      </EditBar>
    ) : null;
  const Tag = e.kind === "title" ? "h1" : "div";
  return (
    <Tag
      ref={frame}
      className={`cover-element ${e.kind === "title" ? "cover-title-line" : "cover-text-line cover-field"} ${coverLineClass(e)}`}
      data-cover-element={e.id}
      data-cover-kind={e.kind}
      data-cover-selected={selected}
      data-history-block={`cover-${e.id}`}
      style={elementStyle(e)}
      onFocusCapture={
        editable
          ? (event) => {
              select();
              if (event.target === event.currentTarget)
                editor?.commands.focus("end");
            }
          : undefined
      }
      onClick={editable ? select : undefined}
      role={e.kind === "title" ? "heading" : undefined}
      aria-level={e.kind === "title" ? 1 : undefined}
      tabIndex={editable ? -1 : undefined}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") {
          event.preventDefault();
          select();
          editor?.commands.focus("end");
        }
      }}
    >
      {editable ? (
        <FieldEditor
          value={content}
          onChange={(text) => update({}, text)}
          map={map}
          showNames={false}
          label={label}
          coverEditor={setEditor}
          maxLength={
            e.kind === "title"
              ? 300
              : e.kind === "byline" || e.kind === "extra"
                ? 4000
                : 2000
          }
          domId={e.kind === "title" ? "cover-title" : undefined}
        />
      ) : (
        <span
          dangerouslySetInnerHTML={{ __html: coverInlineHtml(content, map) }}
        />
      )}
      {controls}
      {menu && selected && (
        <ToolbarPopover
          className="cover-controls-popover"
          trigger={trigger}
          close={() => setMenu(null)}
        >
          {menu === "spacing" ? (
            <Spacing element={e} update={update} node={frame.current} />
          ) : menu === "fields" ? (
            <FieldOptions
              variant="menu"
              map={map}
              onInsert={(path) => {
                editor
                  ?.chain()
                  .focus()
                  .insertContent({ type: "variable", attrs: { path } })
                  .run();
                setMenu(null);
              }}
            />
          ) : menu === "align" ? (
            (["left", "center", "right"] as const).map((align) => (
              <button
                type="button"
                key={align}
                aria-pressed={e.align === align}
                onClick={() => {
                  update({ align });
                  setMenu(null);
                }}
              >
                Align {align}
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  update({ hidden: true });
                  setMenu(null);
                }}
              >
                Remove line
              </button>
              <button
                type="button"
                onClick={() => {
                  add();
                  setMenu(null);
                }}
              >
                Add line below
              </button>
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  type="button"
                  key={align}
                  onClick={() => {
                    alignAll(align);
                    setMenu(null);
                  }}
                >
                  Align all cover items {align}
                </button>
              ))}
            </>
          )}
        </ToolbarPopover>
      )}
    </Tag>
  );
}
function CoverLogo({
  element: e,
  value,
  src,
  editable,
  selected,
  select,
  deselect,
  update,
  onCover,
  children,
}: {
  element: CoverElement;
  value: Cover;
  src?: string;
  editable: boolean;
  selected: boolean;
  select: () => void;
  deselect: () => void;
  update: (patch: Partial<CoverElement>) => void;
  onCover?: Props["onCover"];
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState<{
      x: number;
      align?: "left" | "center" | "right";
    } | null>(null),
    [spacing, setSpacing] = useState<HTMLElement | null>(null);
  const x = position?.x ?? e.x,
    align = position?.align ?? e.align;
  const style: CSSProperties = {
    marginLeft: x !== undefined ? x : align === "left" ? 0 : "auto",
    marginRight: x === undefined && align === "center" ? "auto" : 0,
    display: "block",
    width: "max-content",
    maxWidth: "100%",
  };
  const drag = (event: React.PointerEvent) => {
    if (!editable || (event.target as Element).tagName !== "IMG") return;
    const img = event.target as HTMLImageElement,
      origin = event.clientX,
      start = img.getBoundingClientRect(),
      column = root.current!.getBoundingClientRect(),
      max = Math.max(0, column.width - start.width);
    let next: { x: number; align?: "left" | "center" | "right" } | null = null;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - origin) < 4 && !next) return;
      const raw = Math.max(
        0,
        Math.min(max, start.left - column.left + ev.clientX - origin),
      );
      const snap = (
        [
          ["left", 0],
          ["center", max / 2],
          ["right", max],
        ] as const
      ).find(([, at]) => Math.abs(raw - at) <= 8);
      next = snap ? { x: snap[1], align: snap[0] } : { x: raw };
      setPosition(next);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (next)
        update(
          next.align ? { align: next.align, x: undefined } : { x: next.x },
        );
      setPosition(null);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      setPosition(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };
  return (
    <div
      ref={root}
      className="cover-logo cover-element"
      data-cover-element={e.id}
      data-cover-selected={selected}
      style={{ ...elementStyle(e), textAlign: "left" }}
      onPointerDownCapture={drag}
    >
      {src && (
        <SelectableImage
          kind="cover"
          value={{
            src: value.logo || "workspace-logo",
            alt: value.logo_alt ?? "Company logo",
            height: value.logo_height ?? 60,
            align: e.align,
          }}
          source={src}
          placementStyle={style}
          onSelectionChange={(active) => (active ? select() : deselect())}
          onAlign={
            editable ? (align) => update({ align, x: undefined }) : undefined
          }
          onChange={
            onCover
              ? (image) =>
                  onCover({
                    ...value,
                    logo:
                      image.src === "workspace-logo" ? undefined : image.src,
                    logo_height: image.height,
                    logo_alt: image.alt,
                  })
              : undefined
          }
          onDelete={
            onCover
              ? () => {
                  onCover({ ...value, logo: null });
                  deselect();
                }
              : undefined
          }
          toolbarExtra={
            <button
              type="button"
              onClick={(ev) => setSpacing(spacing ? null : ev.currentTarget)}
            >
              Spacing <Icon name="chevron-down" className="disclosure-icon" />
            </button>
          }
        />
      )}
      {position?.align && (
        <span
          data-editor-chrome
          className="cover-snap-guide"
          data-snap={position.align}
          style={{
            left:
              position.align === "center"
                ? "50%"
                : position.align === "left"
                  ? 0
                  : "100%",
          }}
        />
      )}
      {spacing && selected && (
        <ToolbarPopover
          className="cover-controls-popover"
          trigger={spacing}
          close={() => setSpacing(null)}
        >
          <Spacing element={e} update={update} node={root.current} />
        </ToolbarPopover>
      )}
      {children}
    </div>
  );
}
