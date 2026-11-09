"use client";
import { fieldNodes, editorFieldValue } from "../lib/editor-fields";
import { ListMarkerSizes } from "./list-marker-sizes";
import { InlineFontSize, registerInlineEditor } from "./inline-font-size";
import {
  InlineBandImage,
  bandImageDragOver,
  bandImageDrop,
  type BandImageOptions,
} from "./editor/inline-band-image";
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
import { Node, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import { blockText, type TextLevel } from "../lib/editor-document";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import type { RichText } from "../lib/model";
import { Button } from "./ui";
export { fieldNodes } from "../lib/editor-fields";
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
  bandImage,
  coverEditor,
  domId,
  maxLength,
  textLevel = 0,
  onHeadingStartEnter,
  readOnly = false,
  plainText = false,
  multilinePlainText = false,
  fieldLabels,
  pickerMap,
  formattingMode,
  onEditor,
}: {
  readOnly?: boolean;
  plainText?: boolean;
  multilinePlainText?: boolean;
  fieldLabels?: Record<string, string>;
  pickerMap?: Record<string, string>;
  formattingMode?: "email";
  onEditor?: (editor: import("@tiptap/core").Editor | null) => void;
  textLevel?: TextLevel;
  onHeadingStartEnter?: () => void;
  maxLength?: number;
  domId?: string;
  coverEditor?: (editor: import("@tiptap/core").Editor | null) => void;
  bandImage?: BandImageOptions;
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
  onTextStyle?: (
    level: TextLevel,
    text?: string,
    afterFocus?: () => void,
  ) => void;
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
  const headingEnter = useRef(onHeadingStartEnter);
  headingEnter.current = onHeadingStartEnter;
  const levelRef = useRef(textLevel);
  levelRef.current = textLevel;
  const editorId = useId();
  const [sizeError, setSizeError] = useState("");
  const labels = useRef(fieldLabels);
  labels.current = fieldLabels;
  const inlineHistory = useRef(history);
  inlineHistory.current = history;
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
  const imageOptions = useRef(bandImage);
  const limit = useRef(maxLength);
  limit.current = maxLength;
  imageOptions.current = bandImage;
  const editor: import("@tiptap/core").Editor | null = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      handleKeyDown: (view, event) => {
        if (plainText && event.key === "Enter") {
          event.preventDefault();
          if (multilinePlainText) editor?.commands.setHardBreak();
          return true;
        }
        // Cover lines and bands are logical single-line fields. On macOS, native
        // Home/End scroll the canvas; keep these keys within the edited field.
        if (
          (imageOptions.current || coverEditor) &&
          !event.metaKey &&
          !event.ctrlKey &&
          ["Home", "End"].includes(event.key)
        ) {
          event.preventDefault();
          const pos =
            event.key === "Home"
              ? 1
              : Math.max(1, view.state.doc.content.size - 1);
          editor?.commands.setTextSelection(
            event.shiftKey
              ? { from: view.state.selection.anchor, to: pos }
              : pos,
          );
          return true;
        }
        if (
          headingEnter.current &&
          event.key === "Enter" &&
          view.state.selection.from === 1
        ) {
          event.preventDefault();
          headingEnter.current();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        dragover: (view, event) =>
          imageOptions.current && editor
            ? bandImageDragOver(editor, imageOptions.current, event)
            : false,
        drop: (_view, event) =>
          imageOptions.current && editor
            ? bandImageDrop(editor, imageOptions.current, event)
            : false,
      },
      attributes: label
        ? {
            role: "textbox",
            "aria-label": label,
            "aria-multiline": "true",
            ...(readOnly ? { "aria-readonly": "true" } : {}),
            ...(domId ? { id: domId } : {}),
          }
        : { "aria-label": "Document text" },
    },
    extensions: [
      Extension.create({
        name: "typedFieldTokens",
        addProseMirrorPlugins() {
          return [
            new Plugin({
              appendTransaction(transactions, _old, state) {
                if (!transactions.some((t) => t.docChanged)) return null;
                const matches: {
                  from: number;
                  to: number;
                  path: string;
                  marks: any;
                }[] = [];
                state.doc.descendants((node, pos) => {
                  if (node.isText)
                    for (const m of (node.text ?? "").matchAll(
                      /{{\s*([\w.-]+)\s*}}/g,
                    ))
                      matches.push({
                        from: pos + m.index!,
                        to: pos + m.index! + m[0].length,
                        path: m[1],
                        marks: node.marks,
                      });
                });
                if (!matches.length) return null;
                const tr = state.tr;
                for (const m of matches.reverse())
                  tr.replaceWith(
                    m.from,
                    m.to,
                    state.schema.nodes.variable.create(
                      { path: m.path },
                      null,
                      m.marks,
                    ),
                  );
                return tr;
              },
            }),
          ];
        },
      }),
      ListMarkerSizes,
      ...(!plainText
        ? [
            InlineFontSize.configure({
              maxSize: () =>
                imageOptions.current
                  ? Math.floor((imageOptions.current.maxHeight * 12) / 16)
                  : undefined,
              refused: setSizeError,
            }),
          ]
        : []),
      ...(maxLength
        ? [
            Extension.create({
              name: "textLengthLimit",
              addProseMirrorPlugins() {
                return [
                  new Plugin({
                    filterTransaction: (tr) =>
                      !tr.docChanged ||
                      !limit.current ||
                      blockText({
                        type: "paragraph",
                        content: tr.doc.toJSON() as RichText,
                      }).length <= limit.current,
                  }),
                ];
              },
            }),
          ]
        : []),
      ...(bandImage
        ? [
            InlineBandImage.configure({
              settings:
                imageOptions as React.MutableRefObject<BandImageOptions>,
            }),
          ]
        : []),
      pageSpacers(() => values.current),
      StarterKit.configure({
        ...(plainText
          ? {
              bold: false,
              italic: false,
              bulletList: false,
              orderedList: false,
              listItem: false,
            }
          : {}),
        trailingNode: false,
        undoRedo: history && !standalone ? false : undefined,
        heading: false,
        code: allowLinks ? false : undefined,
        strike: allowLinks ? false : undefined,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        link:
          allowLinks && !plainText
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
              dom.textContent = editorFieldValue(
                path,
                values.current,
                names.current,
                labels.current,
              );
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
          editorFieldValue(
            String(node.attrs.path),
            values.current,
            names.current,
            labels.current,
          ),
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
          bandEditor || coverEditor
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
  useEffect(
    () =>
      editor
        ? registerInlineEditor(
            editor,
            () => inlineHistory.current?.controller?.engine,
          )
        : undefined,
    [editor],
  );
  const bandOwner = useRef(bandEditor ?? coverEditor ?? onEditor);
  bandOwner.current = bandEditor ?? coverEditor ?? onEditor;
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
    if (!editor || !toolbar || readOnly) return;
    const block =
      root.current?.closest<HTMLElement>(".block-frame")?.dataset.blockId ??
      null;
    return toolbar.register(editorId, {
      block,
      rich: !plainText,
      textStyle: () => ({
        value: levelRef.current,
        change: (level, afterFocus) =>
          styleChange.current?.(level, undefined, afterFocus),
      }),
      insert: insertField,
    });
  }, [editor, editorId, !!toolbar, readOnly, plainText]);
  useEffect(() => {
    const next = fieldNodes(value);
    if (
      editor &&
      JSON.stringify(
        bandEditor || coverEditor
          ? bandRichText(editor.getJSON() as RichText)
          : editor.getJSON(),
      ) !==
        JSON.stringify(bandEditor || coverEditor ? bandRichText(next) : next)
    ) {
      let current = true;
      queueMicrotask(() => {
        if (current && !editor.isDestroyed) {
          // Server echoes and normalization must not move an active text selection.
          const { from, to } = editor.state.selection;
          editor.commands.setContent(next, { emitUpdate: false });
          const end = Math.max(1, editor.state.doc.content.size - 1);
          editor.commands.setTextSelection({
            from: Math.min(from, end),
            to: Math.min(to, end),
          });
        }
      });
      return () => {
        current = false;
      };
    }
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
  const formatting = plainText ? null : (
    <FormattingControls
      mode={formattingMode}
      edit={!!toolbar && layout.desktop && !inlineControls}
      compact={layout.compact && !layout.compactPhone}
      independent={standalone}
      textStyle={
        onTextStyle
          ? {
              value: textLevel,
              change: (level, afterFocus) =>
                onTextStyle(level, undefined, afterFocus),
            }
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
            map={pickerMap ?? map}
            labels={fieldLabels}
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
      onFocusCapture={() => !readOnly && toolbar?.remember(editorId)}
      onPointerDownCapture={() => !readOnly && toolbar?.remember(editorId)}
      onKeyDown={(e) => {
        if (
          toolbar &&
          !readOnly &&
          !plainText &&
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
      {readOnly ? null : plainText ? (
        picker ? (
          controls
        ) : null
      ) : bandEditor || coverEditor ? null : toolbar === undefined ||
        inlineControls ? (
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
      {sizeError && (
        <span role="alert" data-editor-chrome>
          {sizeError}
        </span>
      )}
      <EditorContent className="field-editor-content" editor={editor} />
    </div>
  );
}
