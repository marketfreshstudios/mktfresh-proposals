"use client";
import { bandRichText } from "./editor/band-rich-text";
import { pageSpacers, pageSpacerKey } from "./page-spacers";
import { createPortal } from "react-dom";
import { FormattingControls } from "./formatting-controls";
import { ToolbarPopover } from "./toolbar-popover";
import { useControlLayout } from "./editor/control-layout";
import { useBlockToolbar } from "./block-controls";
import { FieldOptions } from "./field-options";
import { useVisibleEditorAction } from "./use-visible-editor-action";
import { useEditorHistory, textHistoryScope } from "./editor-history";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { blockText, type TextLevel } from "../lib/editor-document";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import type { RichText } from "../lib/model";
import { Button } from "./ui";
/** Draft-only editing adapter. Historical content is never passed through this. */
export function fieldNodes(node: RichText): RichText {
  return {
    ...node,
    ...(node.content
      ? {
          content: node.content.flatMap((n) => {
            if (n.type !== "text") return [fieldNodes(n)];
            const out: RichText[] = [];
            let last = 0;
            for (const m of (n.text ?? "").matchAll(
              /\{\{\s*([\w.-]+)\s*\}\}/g,
            )) {
              if (m.index! > last)
                out.push({ ...n, text: n.text!.slice(last, m.index) });
              out.push({
                type: "variable",
                attrs: { path: m[1] },
                ...(n.marks ? { marks: n.marks } : {}),
              });
              last = m.index! + m[0].length;
            }
            if (last < (n.text ?? "").length)
              out.push({ ...n, text: n.text!.slice(last) });
            return out;
          }),
        }
      : {}),
  };
}
export function FieldEditor({
  value,
  onChange,
  map,
  showNames,
  allowLinks = false,
  label,
  onSlash,
  standalone = false,
  inlineControls = false,
  autoFocus = false,
  onBeforeInsert,
  onTextStyle,
  bandEditor,
}: {
  bandEditor?: (editor: import("@tiptap/core").Editor | null) => void;
  value: RichText;
  onChange: (v: RichText) => void;
  map: Record<string, string>;
  showNames: boolean;
  allowLinks?: boolean;
  label?: string;
  onSlash?: (anchor?: HTMLElement) => void;
  standalone?: boolean;
  inlineControls?: boolean;
  autoFocus?: boolean;
  onBeforeInsert?: () => void;
  onTextStyle?: (level: TextLevel, text?: string) => void;
}) {
  const scope = useBlockToolbar();
  const layout = useControlLayout();
  const history = useEditorHistory();
  const afterVisible = useVisibleEditorAction();
  const toolbar = standalone ? undefined : scope;
  const root = useRef<HTMLDivElement>(null);
  const cursor = useRef<{ from: number; to: number } | null>(null);
  const styleChange = useRef(onTextStyle);
  styleChange.current = onTextStyle;
  const reveal = useRef(onBeforeInsert);
  reveal.current = onBeforeInsert;
  const editorId = useId();
  allowLinks = allowLinks || !!toolbar;
  const change = useRef(onChange),
    values = useRef(map),
    names = useRef(showNames),
    painters = useRef(new Set<() => void>());
  change.current = onChange;
  values.current = map;
  names.current = showNames;
  const [linkPicker, setLinkPicker] = useState(false),
    [href, setHref] = useState(""),
    [linkError, setLinkError] = useState("");
  const [picker, setPicker] = useState(false),
    [popoverTrigger, setPopoverTrigger] = useState<HTMLElement | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: label
        ? { role: "textbox", "aria-label": label, "aria-multiline": "true" }
        : {},
    },
    extensions: [
      pageSpacers(() => values.current),
      StarterKit.configure({
        trailingNode: false,
        undoRedo: history && !standalone ? false : undefined,
        heading: false,
        code: allowLinks ? false : undefined,
        strike: allowLinks ? false : undefined,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link: allowLinks
          ? {
              openOnClick: false,
              autolink: false,
              protocols: ["https", "mailto"],
            }
          : false,
      }),
      Node.create({
        name: "variable",
        group: "inline",
        inline: true,
        atom: true,
        addAttributes: () => ({ path: { default: "client.first_name" } }),
        parseHTML: () => [{ tag: "span[data-field]" }],
        addNodeView() {
          return ({ node }) => {
            let current = node;
            const dom = document.createElement("span");
            dom.className = "field-chip";
            dom.contentEditable = "false";
            const paint = () => {
              const path = String(current.attrs.path);
              dom.dataset.field = path;
              dom.textContent = names.current
                ? `{{${path}}}`
                : values.current[path] || `{{${path}}}`;
            };
            painters.current.add(paint);
            paint();
            return {
              dom,
              update(next: typeof node) {
                if (next.type !== node.type) return false;
                current = next;
                paint();
                return true;
              },
              ignoreMutation: (mutation: { type: string }) =>
                mutation.type !== "selection",
              destroy: () => {
                painters.current.delete(paint);
              },
            };
          };
        },
        renderHTML: ({ node, HTMLAttributes }) => [
          "span",
          mergeAttributes(HTMLAttributes, {
            "data-field": node.attrs.path,
            class: "field-chip",
          }),
          names.current
            ? `{{${node.attrs.path}}}`
            : values.current[node.attrs.path] || `{{${node.attrs.path}}}`,
        ],
      }),
    ],
    content: fieldNodes(value),
    onSelectionUpdate: ({ editor }) => {
      cursor.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
    },
    onUpdate: ({ editor }) => {
      const update = () =>
        change.current(
          bandEditor
            ? bandRichText(editor.getJSON() as RichText)
            : (editor.getJSON() as RichText),
        );
      if (history && !standalone)
        history.inScope(textHistoryScope(root.current), update);
      else update();
      if (
        editor.state.doc.textBetween(
          Math.max(0, editor.state.selection.from - 2),
          editor.state.selection.from,
        ) === "{{"
      )
        setPicker(true);
    },
  });
  const bandOwner = useRef(bandEditor);
  bandOwner.current = bandEditor;
  useEffect(() => {
    bandOwner.current?.(editor);
    return () => bandOwner.current?.(null);
  }, [editor]);
  function insertField(path: string, atEnd = false) {
    if (!editor) return;
    const size = editor.state.doc.content.size;
    let { from, to } = atEnd
      ? { from: Math.max(1, size - 1), to: Math.max(1, size - 1) }
      : (cursor.current ?? editor.state.selection);
    from = Math.max(1, Math.min(from, size - 1));
    to = Math.max(from, Math.min(to, size - 1));
    if (editor.state.doc.textBetween(Math.max(0, from - 2), from) === "{{")
      from -= 2;
    const apply = () => {
      if (editor.isDestroyed) return;
      editor
        .chain()
        .setTextSelection({ from, to })
        .insertContent({ type: "variable", attrs: { path } })
        .run();
      // The modal is closed and the owning section has committed. Avoid the
      // focus command's additional RAF, which can race another focus owner.
      editor.view.focus();
      editor.commands.scrollIntoView();
      cursor.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      };
      toolbar?.remember(editorId);
    };
    setPicker(false);
    reveal.current?.();
    afterVisible(editor.view.dom, apply);
  }
  useEffect(() => {
    if (!editor || !toolbar) return;
    const block =
      root.current?.closest<HTMLElement>(".block-frame")?.dataset.blockId ??
      null;
    return toolbar.register(editorId, {
      block,
      rich: true,
      textStyle: () => ({
        value: 0,
        change: (level) => styleChange.current?.(level),
      }),
      insert: insertField,
    });
  }, [editor, editorId, !!toolbar]);
  useEffect(() => {
    const next = fieldNodes(value);
    if (
      editor &&
      JSON.stringify(
        bandEditor
          ? bandRichText(editor.getJSON() as RichText)
          : editor.getJSON(),
      ) !== JSON.stringify(bandEditor ? bandRichText(next) : next)
    )
      editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);
  // Display values are decorations, not document edits. Refresh node views without
  // replacing equal JSON (which ProseMirror correctly treats as unchanged).
  useEffect(() => {
    for (const paint of painters.current) paint();
  }, [showNames, JSON.stringify(map), editor]);
  useLayoutEffect(() => {
    if (!editor || !root.current) return;
    const el = root.current;
    const receive = (e: Event) => {
      if (editor.isDestroyed) return;
      const spaces = (e as CustomEvent).detail;
      editor.view.dispatch(
        editor.state.tr
          .setMeta(pageSpacerKey, spaces)
          .setMeta("addToHistory", false),
      );
    };
    el.addEventListener("editor-source-spacers", receive);
    return () => el.removeEventListener("editor-source-spacers", receive);
  }, [editor]);
  const formatting = (
    <FormattingControls
      edit={!!toolbar && layout.desktop && !inlineControls}
      compact={layout.compact}
      independent={standalone}
      textStyle={
        onTextStyle
          ? { value: 0, change: (level) => onTextStyle(level) }
          : toolbar
            ? null
            : undefined
      }
      editor={editor}
      allowLinks={allowLinks}
      onLink={(trigger) => {
        setPopoverTrigger(trigger);
        setLinkPicker(!linkPicker);
      }}
      onField={(trigger) => {
        if (toolbar && layout.desktop && !inlineControls && layout.onField) {
          layout.onField();
          return;
        }
        setPopoverTrigger(trigger);
        setPicker(!picker);
      }}
    />
  );
  const controls = (
    <>
      {formatting}
      {linkPicker && (
        <ToolbarPopover
          trigger={popoverTrigger}
          className="email-link-picker"
          close={() => setLinkPicker(false)}
        >
          <label className="field">
            Link URL
            <input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <Button
            onClick={() => {
              try {
                const url = new URL(href);
                if (!["https:", "mailto:"].includes(url.protocol))
                  throw new Error("Use HTTPS or mailto");
                editor?.chain().focus().setLink({ href }).run();
                setLinkError("");
                setLinkPicker(false);
              } catch {
                setLinkError("Enter an HTTPS or mailto link");
              }
            }}
          >
            Apply link
          </Button>
          <Button
            onClick={() => {
              editor?.chain().focus().unsetLink().run();
              setLinkPicker(false);
            }}
          >
            Remove link
          </Button>
          {linkError && <p role="alert">{linkError}</p>}
        </ToolbarPopover>
      )}
      {picker && (
        <ToolbarPopover
          trigger={popoverTrigger}
          className="field-picker"
          close={() => setPicker(false)}
        >
          <FieldOptions
            variant="menu"
            map={map}
            onInsert={(path) => insertField(path)}
          />
        </ToolbarPopover>
      )}
    </>
  );
  return (
    <div
      className={`field-editor ${toolbar === undefined ? "field-editor-inline" : "field-editor-external"}`}
      data-history-independent={standalone || undefined}
      ref={root}
      onFocusCapture={() => toolbar?.remember(editorId)}
      onPointerDownCapture={() => toolbar?.remember(editorId)}
      onKeyDown={(e) => {
        if (
          toolbar &&
          layout.desktop &&
          (e.metaKey || e.ctrlKey) &&
          e.key.toLowerCase() === "k"
        ) {
          e.preventDefault();
          setPopoverTrigger(
            root.current
              ?.closest(".block-frame")
              ?.querySelector<HTMLElement>(
                '.editor-edit-bar [aria-label="Link"]',
              ) ?? null,
          );
          setLinkPicker(true);
          return;
        }
        const prefix = editor?.state.selection.$from.parent.textBetween(
          0,
          editor.state.selection.$from.parentOffset,
        );
        if (
          e.key === " " &&
          onTextStyle &&
          editor &&
          editor.state.selection.empty &&
          /^#{1,3}$/.test(prefix ?? "") &&
          editor.state.selection.$from.parent.type.name === "paragraph" &&
          editor.state.doc.childCount === 1
        ) {
          e.preventDefault();
          onTextStyle(
            prefix!.length as 1 | 2 | 3,
            blockText({
              type: "paragraph",
              content: editor.getJSON() as RichText,
            }).slice(prefix!.length),
          );
          return;
        }
        if (e.key === "/" && onSlash && editor?.isEmpty) {
          e.preventDefault();
          onSlash(e.currentTarget);
        }
        if (e.key === "Escape") {
          setPicker(false);
          setLinkPicker(false);
        }
      }}
    >
      {bandEditor ? null : toolbar === undefined || inlineControls ? (
        <div
          data-editor-chrome
          className="inline-formatting-row"
          role="toolbar"
          aria-label="Text formatting"
          onMouseDown={(e) => {
            if ((e.target as Element).closest("button")) e.preventDefault();
          }}
        >
          {controls}
        </div>
      ) : toolbar.target && toolbar.owner === editorId ? (
        createPortal(controls, toolbar.target)
      ) : null}
      <EditorContent className="field-editor-content" editor={editor} />
    </div>
  );
}
