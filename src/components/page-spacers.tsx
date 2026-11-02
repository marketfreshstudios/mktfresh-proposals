"use client";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useEffect, useRef, useState } from "react";
export type SourceSpacer = { offset: number; height: number };
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
                    at = state.doc.content.size;
                  state.doc.descendants((node, pos) => {
                    if (consumed > space.offset) return false;
                    const length = node.isText
                      ? (node.text?.length ?? 0)
                      : node.type.name === "variable"
                        ? (values()[node.attrs.path]?.length ?? 0)
                        : 0;
                    if (
                      length &&
                      consumed <= space.offset &&
                      consumed + length >= space.offset
                    ) {
                      at = pos + (node.isText ? space.offset - consumed : 0);
                      consumed = space.offset + 1;
                      return false;
                    }
                    consumed += length;
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
                    { side: -1, key: `${space.offset}:${space.height}` },
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
export function SourceParagraph({ text }: { text: string }) {
  const root = useRef<HTMLParagraphElement>(null),
    [spacers, setSpacers] = useState<SourceSpacer[]>([]);
  useEffect(() => {
    const el = root.current!;
    const receive = (e: Event) =>
      setSpacers((e as CustomEvent<SourceSpacer[]>).detail);
    el.addEventListener("editor-source-spacers", receive);
    return () => el.removeEventListener("editor-source-spacers", receive);
  }, []);
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (const space of [...spacers].sort((a, b) => a.offset - b.offset)) {
    let at = 0,
      count = 0;
    while (at < text.length && count < space.offset) {
      if (text[at] !== "\n") count++;
      at++;
    }
    parts.push(
      text.slice(start, at),
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
  parts.push(text.slice(start));
  return (
    <p ref={root} data-source-text style={{ whiteSpace: "pre-wrap" }}>
      {parts}
    </p>
  );
}
