"use client";
import { Mark } from "@tiptap/core";
import { flushSync } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { INLINE_FONT_SIZES, isInlineFontSize } from "../lib/inline-font-size";
import { ToolbarPopover } from "./toolbar-popover";
import { Icon } from "./ui";
function ownFontSize(editor: Editor): number | null | "Mixed" {
  const { from, to, empty, $from } = editor.state.selection;
  if (empty)
    return (
      (editor.state.storedMarks ?? $from.marks()).find(
        (m) => m.type.name === "fontSize",
      )?.attrs.size ?? null
    );
  const sizes = new Set<number | null>();
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline)
      sizes.add(
        node.marks.find((m) => m.type.name === "fontSize")?.attrs.size ?? null,
      );
  });
  return sizes.size > 1 ? "Mixed" : ([...sizes][0] ?? null);
}
const editors = new Map<
  Editor,
  () => import("../lib/editor-history").EditorHistory<any> | undefined
>();
let cross: { editor: Editor; from: number; to: number }[] = [];
function rememberCrossSelection() {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const start = (
    range.startContainer.nodeType === 1
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  )?.closest(".tiptap");
  const end = (
    range.endContainer.nodeType === 1
      ? (range.endContainer as Element)
      : range.endContainer.parentElement
  )?.closest(".tiptap");
  if (!start || !end) return;
  // Independent contenteditables may normalize a DOM range after selectionchange.
  // Keep the last cross-block range until the next real editing gesture.
  if (start === end) return;
  const scope = start.closest(".quote-workspace,.studio-template-layout");
  if (
    !scope ||
    scope !== end.closest(".quote-workspace,.studio-template-layout")
  )
    return;
  cross = [...editors.keys()]
    .filter(
      (e) =>
        !e.isDestroyed &&
        scope.contains(e.view.dom) &&
        range.intersectsNode(e.view.dom),
    )
    .map((editor) => ({
      editor,
      from: editor.view.dom.contains(range.startContainer)
        ? editor.view.posAtDOM(range.startContainer, range.startOffset)
        : 1,
      to: editor.view.dom.contains(range.endContainer)
        ? editor.view.posAtDOM(range.endContainer, range.endOffset)
        : editor.state.doc.content.size - 1,
    }));
}
function beginSelectionGesture(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  if (
    event instanceof KeyboardEvent &&
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    ["Period", "Comma"].includes(event.code)
  )
    return;
  if (
    target?.closest(".tiptap") ||
    (target?.closest("[data-editor-chrome]") &&
      !target.closest(".inline-size-control,.inline-size-popover"))
  )
    cross = [];
}
export function registerInlineEditor(
  editor: Editor,
  history: () => import("../lib/editor-history").EditorHistory<any> | undefined,
) {
  if (!editors.size) {
    document.addEventListener("selectionchange", rememberCrossSelection);
    document.addEventListener("pointerdown", beginSelectionGesture, true);
    document.addEventListener("keydown", beginSelectionGesture, true);
  }
  editors.set(editor, history);
  return () => {
    editors.delete(editor);
    cross = cross.filter((e) => e.editor !== editor);
    if (!editors.size) {
      document.removeEventListener("selectionchange", rememberCrossSelection);
      document.removeEventListener("pointerdown", beginSelectionGesture, true);
      document.removeEventListener("keydown", beginSelectionGesture, true);
    }
  };
}
export function selectedFontSize(editor: Editor): number | null | "Mixed" {
  if (!cross.some((e) => e.editor === editor)) return ownFontSize(editor);
  const values = new Set(
    cross.map(({ editor, from, to }) => {
      const sizes = new Set<number | null>();
      editor.state.doc.nodesBetween(from, to, (node) => {
        if (node.isInline)
          sizes.add(
            node.marks.find((m) => m.type.name === "fontSize")?.attrs.size ??
              null,
          );
      });
      return sizes.size > 1 ? "Mixed" : ([...sizes][0] ?? null);
    }),
  );
  return values.size > 1 || values.has("Mixed")
    ? "Mixed"
    : ([...values][0] ?? null);
}
export function applyFontSize(
  editor: Editor,
  size: number | null,
  remembered = cross,
) {
  const max = editor.extensionManager.extensions
    .find((e) => e.name === "fontSize")
    ?.options.maxSize?.();
  if (size !== null && max !== undefined && size > max) {
    editor.extensionManager.extensions
      .find((e) => e.name === "fontSize")
      ?.options.refused?.(
        `Maximum ${max} px in this band. Choose a taller band for larger text.`,
      );
    return;
  }
  const targets = remembered.some((e) => e.editor === editor)
    ? [...remembered]
    : [
        {
          editor,
          from: editor.state.selection.from,
          to: editor.state.selection.to,
        },
      ];
  const engine = editors.get(editor)?.();
  const group = "inline-size";
  engine?.beginGroup(group);
  try {
    if (targets.length === 1) {
      const chain = editor.chain().focus();
      (size === null
        ? chain.unsetMark("fontSize")
        : chain.setMark("fontSize", { size })
      ).run();
    } else
      for (const target of targets) {
        const tr = target.editor.state.tr;
        if (size === null)
          tr.removeMark(
            target.from,
            target.to,
            target.editor.schema.marks.fontSize,
          );
        else
          tr.addMark(
            target.from,
            target.to,
            target.editor.schema.marks.fontSize.create({ size }),
          );
        target.editor.view.dispatch(tr);
      }
  } finally {
    engine?.endGroup(group);
  }
}
export const InlineFontSize = Mark.create({
  name: "fontSize",
  addOptions: () => ({
    maxSize: undefined as undefined | (() => number | undefined),
    refused: undefined as undefined | ((message: string) => void),
  }),
  addAttributes: () => ({ size: { default: null } }),
  parseHTML: () => [
    {
      tag: "span[data-inline-size]",
      getAttrs: (el) => {
        const n = Number(el.getAttribute("data-inline-size"));
        return isInlineFontSize(n) ? { size: n } : false;
      },
    },
    {
      style: "font-size",
      getAttrs: (value) => {
        const match = String(value).match(/^(\d+)px$/);
        const size = match ? Number(match[1]) : null;
        return isInlineFontSize(size) ? { size } : false;
      },
    },
  ],
  renderHTML: ({ mark }) => [
    "span",
    {
      "data-inline-size": mark.attrs.size,
      style: `font-size:min(${mark.attrs.size}px,var(--inline-font-max,${mark.attrs.size}px));line-height:normal`,
    },
    0,
  ],
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleKeyDown(_view, event) {
            if (
              !(event.metaKey || event.ctrlKey) ||
              !event.shiftKey ||
              !["Period", "Comma"].includes(event.code)
            )
              return false;
            const selected = selectedFontSize(editor),
              current =
                typeof selected === "number"
                  ? selected
                  : parseFloat(getComputedStyle(editor.view.dom).fontSize) ||
                    17;
            const next =
              event.code === "Period"
                ? INLINE_FONT_SIZES.find((n) => n > current)
                : [...INLINE_FONT_SIZES].reverse().find((n) => n < current);
            event.preventDefault();
            if (next) applyFontSize(editor, next);
            return true;
          },
        },
      }),
    ];
  },
});
export function FontSizePicker({
  editor,
  maxSize,
}: {
  editor: Editor | null;
  maxSize?: number;
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null),
    range = useRef<typeof cross>([]);
  useLayoutEffect(() => {
    if (open)
      menu.current
        ?.querySelector<HTMLButtonElement>(
          '[aria-checked="true"],button:not(:disabled)',
        )
        ?.focus({ preventScroll: true });
  }, [open]);
  const [, paint] = useState(0);
  useEffect(() => {
    const sync = () => paint((v) => v + 1);
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, []);
  useEditorState({
    editor,
    selector: ({ editor }) => (editor ? selectedFontSize(editor) : null),
  });
  const value = editor ? selectedFontSize(editor) : null;
  const choose = (size: number | null) => {
    // Close the native popover before restoring the editor. Its focus return
    // must not steal the caret after a collapsed-selection mark command.
    flushSync(() => setOpen(false));
    if (editor) {
      applyFontSize(editor, size, range.current);
      cross = [];
      editor.view.focus();
    }
  };
  return (
    <span className="inline-size-control" data-editor-chrome>
      <button
        type="button"
        ref={trigger}
        disabled={!editor}
        aria-label="Size"
        title="Size"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!open) {
            rememberCrossSelection();
            range.current = [...cross];
          }
          setOpen((v) => !v);
        }}
      >
        Size <span>{value ?? "Default"}</span>
        <Icon name="chevron-down" className="disclosure-icon" />
      </button>
      {open && (
        <ToolbarPopover
          className="inline-size-popover"
          trigger={trigger.current}
          close={() => setOpen(false)}
          onEscape={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          <div
            className="inline-size-menu"
            ref={menu}
            role="menu"
            aria-label="Font size"
            onMouseDown={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              let n = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (["ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                buttons[
                  (n + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                    buttons.length
                ]?.focus();
              }
            }}
          >
            {[null, ...INLINE_FONT_SIZES].map((size) => (
              <button
                key={size ?? "default"}
                type="button"
                role="menuitemradio"
                aria-checked={value === size}
                disabled={
                  size !== null && maxSize !== undefined && size > maxSize
                }
                onClick={() => choose(size)}
              >
                {size === null ? "Default" : `${size} px`}
              </button>
            ))}
            {maxSize !== undefined && (
              <p>
                Maximum {maxSize} px in this band. Choose a taller band for
                larger text.
              </p>
            )}
          </div>
        </ToolbarPopover>
      )}
    </span>
  );
}
