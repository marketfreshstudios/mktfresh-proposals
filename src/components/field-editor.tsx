"use client";
import { createPortal } from "react-dom";
import { useBlockToolbar } from "./block-controls";
import { Node, mergeAttributes } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
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
}: {
  value: RichText;
  onChange: (v: RichText) => void;
  map: Record<string, string>;
  showNames: boolean;
  allowLinks?: boolean;
  label?: string;
}) {
  const toolbar = useBlockToolbar();
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
    [field, setField] = useState("client.first_name");
  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: label
        ? { role: "textbox", "aria-label": label, "aria-multiline": "true" }
        : {},
    },
    extensions: [
      StarterKit.configure({
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
    onUpdate: ({ editor }) => {
      change.current(editor.getJSON() as RichText);
      if (
        editor.state.doc.textBetween(
          Math.max(0, editor.state.selection.from - 2),
          editor.state.selection.from,
        ) === "{{"
      )
        setPicker(true);
    },
  });
  useEffect(() => {
    const next = fieldNodes(value);
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(next))
      editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);
  // Display values are decorations, not document edits. Refresh node views without
  // replacing equal JSON (which ProseMirror correctly treats as unchanged).
  useEffect(() => {
    for (const paint of painters.current) paint();
  }, [showNames, JSON.stringify(map), editor]);
  const formatting = (
    <div className="rich-toolbar">
      <Button
        variant="ghost"
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        Bold
      </Button>
      <Button
        variant="ghost"
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        Italic
      </Button>
      <Button
        variant="ghost"
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        List
      </Button>
      {allowLinks && (
        <>
          <Button
            variant="ghost"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            Numbered list
          </Button>
          <Button variant="ghost" onClick={() => setLinkPicker(!linkPicker)}>
            Link
          </Button>
        </>
      )}
      <Button variant="ghost" onClick={() => setPicker(!picker)}>
        Insert field
      </Button>
    </div>
  );
  return (
    <div
      className="field-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setPicker(false);
          setLinkPicker(false);
        }
      }}
    >
      {toolbar === undefined
        ? formatting
        : toolbar
          ? createPortal(formatting, toolbar)
          : null}
      {linkPicker && (
        <div className="email-link-picker">
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
        </div>
      )}
      <EditorContent editor={editor} />
      {picker && (
        <div className="field-picker">
          <label className="field">
            Field
            <select value={field} onChange={(e) => setField(e.target.value)}>
              {Object.keys(map).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => {
              if (editor) {
                const pos = editor.state.selection.from;
                if (
                  editor.state.doc.textBetween(Math.max(0, pos - 2), pos) ===
                  "{{"
                )
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: pos - 2, to: pos })
                    .run();
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "variable", attrs: { path: field } })
                  .run();
              }
              setPicker(false);
            }}
          >
            Insert
          </Button>
        </div>
      )}
    </div>
  );
}
