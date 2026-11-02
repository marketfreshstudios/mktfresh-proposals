"use client";
import { useEffect, useState } from "react";
import { useEditorState } from "@tiptap/react";
import type { TextStyleControl } from "../lib/editor-document";
import type { Editor } from "@tiptap/core";
import { Icon } from "./ui";
import { textHistoryScope, useHistoryStatus } from "./editor-history";
import type icons from "./icons.json";
export function FormattingControls({
  editor = null,
  onLink,
  onField,
  allowLinks = true,
  independent = false,
  textStyle,
}: {
  editor?: Editor | null;
  onLink?: () => void;
  onField?: () => void;
  allowLinks?: boolean;
  independent?: boolean;
  textStyle?: TextStyleControl | null;
}) {
  const status = useHistoryStatus();
  const { canUndo, canRedo } = status;
  const controller = independent ? null : status.controller;
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const marks = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  });
  const command = (redo: boolean) => {
    const active = document.activeElement;
    const scope = active?.closest(".field-editor,[data-document-text]")
      ? textHistoryScope(active)
      : undefined;
    if (controller) (redo ? controller.redo : controller.undo)(scope);
    else if (editor)
      (redo
        ? editor.chain().focus().redo()
        : editor.chain().focus().undo()
      ).run();
  };
  const button = (
    label: string,
    icon: keyof typeof icons,
    action: () => void,
    disabled = !editor,
    pressed?: boolean,
    title = label,
  ) => (
    <button
      type="button"
      className="formatting-button"
      aria-label={label}
      title={title}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={action}
    >
      <Icon name={icon} />
      <span className="formatting-label">{label}</span>
      {label === "Insert field" && (
        <span className="format-chevron" aria-hidden="true" />
      )}
    </button>
  );
  return (
    <div className="rich-toolbar formatting-controls">
      <div className="formatting-group" role="group" aria-label="History">
        {button(
          "Undo",
          "rotate-left",
          () => command(false),
          controller
            ? !canUndo
            : !(editor?.commands.undo && editor.can().undo()),
          undefined,
          mac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)",
        )}
        {button(
          "Redo",
          "rotate-right",
          () => command(true),
          controller
            ? !canRedo
            : !(editor?.commands.redo && editor.can().redo()),
          undefined,
          mac ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Shift+Z or Ctrl+Y)",
        )}
      </div>
      {textStyle !== undefined && (
        <div className="formatting-group format-style-control">
          <Icon name="heading" />
          <label className="sr-only" htmlFor="document-text-style">
            Text style
          </label>
          <select
            id="document-text-style"
            aria-label="Text style"
            title={`Text style · ${["Paragraph", "Heading 1", "Heading 2", "Heading 3"][textStyle?.value ?? 0]}`}
            disabled={!textStyle}
            value={textStyle?.value ?? 0}
            onChange={(e) =>
              textStyle?.change(Number(e.target.value) as 0 | 1 | 2 | 3)
            }
          >
            {["Paragraph", "Heading 1", "Heading 2", "Heading 3"].map(
              (name, n) => (
                <option key={n} value={n}>
                  {name}
                </option>
              ),
            )}
          </select>
        </div>
      )}
      <div className="formatting-group" role="group" aria-label="Text style">
        {button(
          "Bold",
          "bold",
          () => editor?.chain().focus().toggleBold().run(),
          !editor,
          marks?.bold,
          mac ? "Bold (⌘B)" : "Bold (Ctrl+B)",
        )}
        {button(
          "Italic",
          "italic",
          () => editor?.chain().focus().toggleItalic().run(),
          !editor,
          marks?.italic,
          mac ? "Italic (⌘I)" : "Italic (Ctrl+I)",
        )}
      </div>
      <div className="formatting-group" role="group" aria-label="Lists">
        {button(
          "List",
          "list-ul",
          () => editor?.chain().focus().toggleBulletList().run(),
          !editor,
          marks?.bullet,
        )}
        {button(
          "Numbered list",
          "list-ol",
          () => editor?.chain().focus().toggleOrderedList().run(),
          !editor,
          marks?.ordered,
        )}
      </div>
      {allowLinks && (
        <div className="formatting-group" role="group" aria-label="Links">
          {button("Link", "link", () => onLink?.(), !editor, marks?.link)}
        </div>
      )}
      <div className="formatting-group" role="group" aria-label="Fields">
        {button("Insert field", "code", () => onField?.())}
      </div>
    </div>
  );
}
