"use client";
import { FontSizePicker } from "./inline-font-size";
import { EditorIcon } from "./editor/editor-icon";
import { PageBreakAction } from "./page-break-action";
import { TextStylePicker } from "./text-style-picker";
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
  edit = false,
  compact = false,
  mode,
}: {
  mode?: "email" | "extras";
  editor?: Editor | null;
  onLink?: (trigger: HTMLElement) => void;
  onField?: (trigger: HTMLElement) => void;
  allowLinks?: boolean;
  independent?: boolean;
  textStyle?: TextStyleControl | null;
  edit?: boolean;
  compact?: boolean;
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
    action: (trigger: HTMLElement) => void,
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
      onClick={(e) => action(e.currentTarget)}
    >
      <Icon name={icon} />
      <span className="formatting-label">{label}</span>
      {label === "Insert field" && (
        <span className="format-chevron" aria-hidden="true" />
      )}
    </button>
  );
  if (mode === "extras")
    return (
      <div className="email-extra-formatting">
        <button
          type="button"
          disabled={controller ? !canUndo : !editor?.can().undo()}
          onClick={() => command(false)}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={controller ? !canRedo : !editor?.can().redo()}
          onClick={() => command(true)}
        >
          Redo
        </button>
        <FontSizePicker editor={editor} inline />
      </div>
    );
  if (edit) {
    const item = (
      label: string,
      action: (el: HTMLElement) => void,
      content: React.ReactNode,
      disabled = !editor,
      pressed?: boolean,
      title = label,
    ) => (
      <button
        type="button"
        aria-label={label}
        title={title}
        disabled={disabled}
        aria-pressed={pressed}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => action(e.currentTarget)}
      >
        {content}
      </button>
    );
    return (
      <div data-editor-chrome className="edit-formatting rich-toolbar">
        {mode !== "email" && (
          <>
            <TextStylePicker
              value={textStyle ?? null}
              edit
              compact={compact}
              listKind={
                marks?.bullet
                  ? "bullet"
                  : marks?.ordered
                    ? "numbered"
                    : undefined
              }
            />
            <FontSizePicker editor={editor} />
            <span className="edit-divider" />
          </>
        )}
        {item(
          "Bold",
          () => editor?.chain().focus().toggleBold().run(),
          <b>B</b>,
          !editor,
          marks?.bold,
          mac ? "Bold (⌘B)" : "Bold (Ctrl+B)",
        )}
        {item(
          "Italic",
          () => editor?.chain().focus().toggleItalic().run(),
          <i>I</i>,
          !editor,
          marks?.italic,
          mac ? "Italic (⌘I)" : "Italic (Ctrl+I)",
        )}
        {item(
          "Bulleted list",
          () => editor?.chain().focus().toggleBulletList().run(),
          <EditorIcon name="list-bulleted" />,
          !editor,
          marks?.bullet,
        )}
        {item(
          "Numbered list",
          () => editor?.chain().focus().toggleOrderedList().run(),
          <EditorIcon name="list-numbered" />,
          !editor,
          marks?.ordered,
        )}
        {item(
          "Link",
          (el) => onLink?.(el),
          <EditorIcon name="link" />,
          !editor,
          marks?.link,
          "Link (⌘K)",
        )}
        {item(
          "Insert field",
          (el) => onField?.(el),
          <span className="edit-field-label">
            {"{ }"}
            {!compact && " Field"}
          </span>,
          !onField,
        )}
        <span className="edit-divider" />
      </div>
    );
  }
  return (
    <div data-editor-chrome className="rich-toolbar formatting-controls">
      <PageBreakAction />
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
      <FontSizePicker editor={editor} />
      {textStyle !== undefined && <TextStylePicker value={textStyle} />}
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
          {button(
            "Link",
            "link",
            (trigger) => onLink?.(trigger),
            !editor,
            marks?.link,
          )}
        </div>
      )}
      <div className="formatting-group" role="group" aria-label="Fields">
        {button("Insert field", "code", (trigger) => onField?.(trigger))}
      </div>
    </div>
  );
}
