"use client";
import type { Block } from "../../lib/model";
import type { BrowserPages } from "../browser-pagination";
import {
  authoringPages,
  addPage,
  deletePage,
  movePage,
} from "../../lib/editor-pages";
import { assertBlockMove, documentSectionRanges } from "../../lib/editor-moves";
import { computedPages, moveComputedSection } from "../../lib/computed-pages";
import { Reorder, Sortable } from "../sortable";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useBlockFeedback } from "../block-controls";
export function SectionsNav({
  content,
  pagination,
  onChange,
  onMove,
  onFocus,
  measure,
  onPage,
  currentSectionId,
}: {
  currentSectionId?: string | null;
  content: Block[];
  pagination?: BrowserPages | null;
  onChange: (v: Block[]) => void;
  onMove: (op: (v: Block[]) => Block[]) => void;
  onFocus: (id: string) => void;
  measure?: (content: Block[]) => BrowserPages;
  onPage?: (page: number) => void;
}) {
  const pages = computedPages(content, pagination),
    feedback = useBlockFeedback();
  const add = (after?: string) => {
    const next = addPage(content, after);
    onChange(next.content);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => onFocus(next.heading)),
    );
  };
  const ids = pages.flatMap((p) => [
    `page:${p.id}`,
    ...p.sections.map((s) => `section:${s.id}`),
  ]);
  return (
    <nav className="pages-outline sections-nav" aria-label="Sections">
      {feedback.feedback}
      <Reorder
        ids={ids}
        pages
        onMove={(from, to, edge) => {
          const target = pages.find(
            (p) =>
              `page:${p.id}` === to ||
              p.sections.some((s) => `section:${s.id}` === to),
          );
          if (!target) return;
          if (from.startsWith("page:")) {
            const source = pages.find((p) => `page:${p.id}` === from);
            if (source?.explicit && target.explicit)
              onMove((blocks) => movePage(blocks, source.id, target.id));
          } else {
            try {
              const fromId = from.slice(8),
                targetSection = to.startsWith("section:")
                  ? to.slice(8)
                  : undefined;
              const following = pages[target.number];
              const after =
                edge === "after" ||
                (edge === undefined &&
                  !!targetSection &&
                  ids.indexOf(from) < ids.indexOf(to));
              const before = targetSection
                ? after
                  ? content[
                      documentSectionRanges(content).find(
                        (s) => s.id === targetSection,
                      )!.end
                    ]?.id
                  : targetSection
                : after
                  ? following?.first
                  : target.first;
              let next = moveComputedSection(
                content,
                fromId,
                before,
                target.explicit,
              );
              const inserted = new Set(
                next
                  .filter((b) => !content.some((old) => old.id === b.id))
                  .map((b) => b.id),
              );
              if (measure) {
                const actual =
                  measure(next).assignments.find((v) => v.block === fromId)
                    ?.page ?? target.number;
                const deficit = target.number - actual;
                if (deficit > 0) {
                  const at = next.findIndex((b) => b.id === fromId);
                  const breaks = Array.from({ length: deficit }, () => ({
                    id: crypto.randomUUID(),
                    type: "page_break" as const,
                  }));
                  breaks.forEach((b) => inserted.add(b.id));
                  next = [...next.slice(0, at), ...breaks, ...next.slice(at)];
                }
              }
              assertBlockMove(
                content,
                next.filter((b) => !inserted.has(b.id)),
              );
              onChange(next);
            } catch (e) {
              feedback.error(e instanceof Error ? e.message : "Move cancelled");
            }
          }
        }}
      >
        {pages.map((p) => (
          <Sortable
            key={p.id}
            id={`page:${p.id}`}
            label={`page ${p.number}`}
            draggable={p.explicit}
          >
            <div className="outline-page" data-outline-page={p.number}>
              <div className="outline-page-title">
                <button
                  type="button"
                  onClick={() => {
                    if (onPage) onPage(p.number);
                    else
                      document
                        .querySelector(`[data-editor-page="${p.number}"]`)
                        ?.scrollIntoView({ block: "start" });
                  }}
                >
                  Page {p.number}
                </button>
                {
                  <>
                    <button
                      disabled={!p.explicit}
                      title={
                        p.explicit
                          ? `Delete page ${p.number}`
                          : "Automatic overflow page — edit its content to remove it"
                      }
                      type="button"
                      aria-label={`Delete page ${p.number}`}
                      onClick={() =>
                        feedback.removePage(() =>
                          onChange(deletePage(content, p.id)),
                        )
                      }
                    >
                      ×
                    </button>
                  </>
                }
              </div>
              {p.number === 1 && content.length > 0 && (
                <button
                  type="button"
                  className="outline-section"
                  aria-current={
                    currentSectionId === "cover" ? "location" : undefined
                  }
                  onClick={() => onFocus("cover")}
                >
                  <span className="section-label">Cover</span>
                </button>
              )}
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
                      aria-current={
                        currentSectionId === s.id ? "location" : undefined
                      }
                      title={s.title}
                      onClick={() => onFocus(s.id)}
                    >
                      <span className="section-label">{s.title}</span>
                      {s.pending && (
                        <small
                          className="review-dot"
                          aria-label="Needs AI review"
                        />
                      )}
                    </button>
                    {s.blocks
                      .filter((b) => b.type === "heading" && (b.level ?? 1) > 1)
                      .map((b) => (
                        <button
                          key={b.id}
                          className="outline-subheading"
                          aria-current={
                            currentSectionId === b.id ? "location" : undefined
                          }
                          title={b.text || "Untitled subheading"}
                          onClick={() => onFocus(b.id!)}
                        >
                          <span className="section-label">
                            {b.text || "Untitled subheading"}
                          </span>
                        </button>
                      ))}
                  </Sortable>
                ))}
              </SortableContext>
              <button
                type="button"
                className="outline-page-end"
                aria-label={`End of page ${p.number}`}
                onClick={() =>
                  onFocus(p.sections.at(-1)?.id ?? p.first ?? "cover")
                }
              >
                <span>End of page {p.number}</span>
              </button>
            </div>
          </Sortable>
        ))}
      </Reorder>
      {!content.length && <p className="muted">No sections yet</p>}
      <button type="button" className="sections-add-page" onClick={() => add()}>
        + Add page
      </button>
    </nav>
  );
}
