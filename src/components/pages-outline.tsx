"use client";
import { useRef } from "react";
import type { Block } from "../lib/model";
import type { PrintLayout } from "../lib/document-print";
import {
  authoringPages,
  addPage,
  deletePage,
  movePage,
  movePageSection,
} from "../lib/editor-pages";
import { Reorder, Sortable } from "./sortable";
import { Button } from "./ui";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useBlockFeedback } from "./block-controls";
export function PagesOutline({
  content,
  layout,
  onChange,
  onFocus,
}: {
  content: Block[];
  layout?: PrintLayout | null;
  onChange: (v: Block[]) => void;
  onFocus: (id: string) => void;
}) {
  const pages = authoringPages(content),
    focus = useRef(onFocus);
  const feedback = useBlockFeedback();
  focus.current = onFocus;
  const add = (after?: string) => {
    const next = addPage(content, after);
    onChange(next.content);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => focus.current(next.heading)),
    );
  };
  const ids = pages.flatMap((p) => [
    `page:${p.id}`,
    ...p.sections.map((s) => `section:${s.id}`),
  ]);
  return (
    <nav className="pages-outline" aria-label="Pages">
      {feedback.feedback}
      <Reorder
        ids={ids}
        pages
        onMove={(from, to) => {
          if (from.startsWith("page:")) {
            const target = pages.find(
              (p) =>
                `page:${p.id}` === to ||
                p.sections.some((s) => `section:${s.id}` === to),
            );
            if (target) onChange(movePage(content, from.slice(5), target.id));
          } else {
            const target = pages.find(
              (p) =>
                `page:${p.id}` === to ||
                p.sections.some((s) => `section:${s.id}` === to),
            );
            if (target)
              onChange(
                movePageSection(
                  content,
                  from.slice(8),
                  target.id,
                  to.startsWith("section:")
                    ? ids.indexOf(from) < ids.indexOf(to)
                      ? target.sections[
                          target.sections.findIndex(
                            (s) => s.id === to.slice(8),
                          ) + 1
                        ]?.id
                      : to.slice(8)
                    : undefined,
                ),
              );
          }
        }}
      >
        {pages.map((p, n) => {
          const number =
            n === 0
              ? 1
              : (layout?.boundaries.find(
                  (b) =>
                    b.explicit &&
                    p.blocks.some((block) => block.id === b.block),
                )?.page ?? n + 1);
          return (
            <Sortable key={p.id} id={`page:${p.id}`} label={`page ${number}`}>
              <div className="outline-page">
                <div className="outline-page-title">
                  <button
                    type="button"
                    onClick={() => onFocus(p.blocks[0]?.id ?? "cover")}
                  >
                    Page {number}
                    {n === 0 ? " · Cover" : ""}
                  </button>
                  <button
                    type="button"
                    aria-label={`Add page after page ${number}`}
                    title="Add page after this page"
                    onClick={() => add(p.id)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete page ${number}`}
                    title="Delete page"
                    onClick={() => {
                      feedback.removePage(() =>
                        onChange(deletePage(content, p.id)),
                      );
                    }}
                  >
                    ×
                  </button>
                </div>
                <SortableContext
                  items={p.sections.map((s) => `section:${s.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {p.sections.map((s) => (
                    <Sortable
                      key={s.id}
                      id={`section:${s.id}`}
                      label={`section ${s.title}`}
                    >
                      <button
                        type="button"
                        className="outline-section"
                        onClick={() => onFocus(s.id)}
                      >
                        {s.title}
                        {s.pending && (
                          <small
                            className="review-dot"
                            aria-label="Needs AI review"
                          />
                        )}
                      </button>
                      {s.indices
                        .filter(
                          (i) =>
                            p.blocks[i].type === "heading" &&
                            (p.blocks[i].level ?? 1) > 1,
                        )
                        .map((i) => (
                          <button
                            key={p.blocks[i].id}
                            className="outline-subheading"
                            onClick={() => onFocus(p.blocks[i].id!)}
                          >
                            {p.blocks[i].text || "Untitled subheading"}
                          </button>
                        ))}
                    </Sortable>
                  ))}
                </SortableContext>
                {(layout?.boundaries ?? [])
                  .filter(
                    (b) =>
                      !b.explicit &&
                      p.blocks.some((block) => block.id === b.block),
                  )
                  .map((b) => (
                    <button
                      key={b.page}
                      type="button"
                      className="outline-continued"
                      onClick={() =>
                        document
                          .querySelector(`[data-editor-page="${b.page}"]`)
                          ?.scrollIntoView({ block: "start" })
                      }
                    >
                      Page {b.page} (continued)
                    </button>
                  ))}
              </div>
            </Sortable>
          );
        })}
      </Reorder>
      <Button onClick={() => add()}>+ Add page</Button>
    </nav>
  );
}
