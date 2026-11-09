"use client";
import { clauseTextParts } from "../lib/oiot";
import { editorFieldParts } from "../lib/editor-fields";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useLayoutEffect, useRef, useState } from "react";
export type SourceSpacer = {
  offset: number;
  height: number;
  paragraph?: number;
};
export const pageSpacerKey = new PluginKey<SourceSpacer[]>("pdf-page-spacers");
export function pageSpacers(values: () => Record<string, string>) {
  return Extension.create({
    name: "pdfPageSpacers",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pageSpacerKey,
          state: {
            init: () => [],
            apply: (tr, old) => tr.getMeta(pageSpacerKey) ?? old,
          },
          props: {
            decorations(state) {
              const spacers = pageSpacerKey.getState(state) ?? [];
              return DecorationSet.create(
                state.doc,
                spacers.map((space) => {
                  let consumed = 0,
                    at = state.doc.content.size,
                    paragraph = 0;
                  let whole: { from: number; to: number } | undefined;
                  state.doc.descendants((node, pos) => {
                    if (space.paragraph !== undefined) {
                      if (
                        node.type.name === "paragraph" ||
                        node.type.name === "listItem"
                      ) {
                        if (paragraph++ === space.paragraph) {
                          at = pos + 1;
                          if (node.textContent.trim())
                            whole = { from: pos, to: pos + node.nodeSize };
                        }
                      }
                      return true;
                    }
                    if (consumed > space.offset) return false;
                    const length = node.isText
                      ? (node.text?.length ?? 0)
                      : node.type.name === "variable"
                        ? (values()[node.attrs.path]?.replace(
                            node.attrs.path === "client.address"
                              ? /\n/g
                              : /$^/g,
                            "",
                          ).length ?? 0)
                        : 0;
                    if (
                      length &&
                      consumed <= space.offset &&
                      consumed + length > space.offset
                    ) {
                      at = pos + (node.isText ? space.offset - consumed : 0);
                      consumed = space.offset + 1;
                      return false;
                    }
                    consumed += length;
                  });
                  if (whole)
                    return Decoration.node(whole.from, whole.to, {
                      style: `margin-top:${Math.max(0, space.height)}px!important`,
                      "data-layout-space": "true",
                    });
                  return Decoration.widget(
                    at,
                    () => {
                      const span = document.createElement("span");
                      span.className = "pdf-source-spacer";
                      span.dataset.paginationSpacer = "true";
                      span.contentEditable = "false";
                      span.setAttribute("aria-hidden", "true");
                      span.style.height = `${Math.max(0, space.height)}px`;
                      return span;
                    },
                    {
                      side: -1,
                      key: `${space.offset}:${space.paragraph}:${space.height}`,
                    },
                  );
                }),
              );
            },
          },
        }),
      ];
    },
  });
}
/** Plain clause text shares visual-only spacers with rich text; stored strings never gain nodes. */
export function SourceParagraph({
  text,
  map,
  boldRunIns,
}: {
  text: string;
  map?: Record<string, string>;
  boldRunIns?: boolean;
}) {
  const fields = clauseTextParts(text, boldRunIns).flatMap((part) =>
    (map ? editorFieldParts(part.text, map) : [{ value: part.text }]).map(
      (field) => ({ ...field, bold: part.bold }),
    ),
  );
  const resolved = fields.map((part) => part.value).join("");
  const paint = (from: number, to: number) => {
    let offset = 0;
    return fields.map((part, n) => {
      const begin = offset;
      offset += part.value.length;
      const value = part.value.slice(
        Math.max(0, from - begin),
        Math.max(0, to - begin),
      );
      return !value ? null : "path" in part ? (
        <span
          key={`${from}-${n}`}
          className="field-chip"
          data-field={part.path}
        >
          {value}
        </span>
      ) : part.bold ? (
        <strong key={`${from}-${n}`}>{value}</strong>
      ) : (
        value
      );
    });
  };
  const root = useRef<HTMLParagraphElement>(null),
    [spacers, setSpacers] = useState<SourceSpacer[]>([]);
  // Parent pagination commits cached spacers in its layout effect. Register
  // before that commit when undo remounts the clause, without waiting for paint.
  useLayoutEffect(() => {
    const el = root.current!;
    const receive = (e: Event) =>
      setSpacers((e as CustomEvent<SourceSpacer[]>).detail);
    el.addEventListener("editor-source-spacers", receive);
    return () => el.removeEventListener("editor-source-spacers", receive);
  }, []);
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (const space of [...spacers].sort((a, b) => a.offset - b.offset)) {
    const at = space.offset;
    parts.push(
      paint(start, at),
      <span
        key={space.offset}
        className="pdf-source-spacer"
        data-pagination-spacer
        aria-hidden="true"
        style={{ height: Math.max(0, space.height) }}
      />,
    );
    start = at;
  }
  parts.push(paint(start, resolved.length));
  return (
    <p ref={root} data-source-text style={{ whiteSpace: "pre-wrap" }}>
      {parts}
    </p>
  );
}
