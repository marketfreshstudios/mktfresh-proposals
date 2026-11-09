"use client";
import { Fragment, type ReactNode } from "react";
import { resolvedEditorText } from "../../lib/editor-fields";
import { bandPages, resolvedBandPages } from "../../lib/band-overrides";
import type { HeaderFooterSettings } from "../../lib/page-bands";
import { documentBlocks } from "../../lib/columns";
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
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { columnStyleKey } from "./style-clipboard";
import { Reorder, Sortable, sectionDropEdge } from "../sortable";
import { SortableContext } from "@dnd-kit/sortable";
import { useBlockFeedback, useBlockSelection } from "../block-controls";
function SectionRow({
  label,
  onClick,
  current,
  pending,
  subheading,
  className = "",
  title = label,
}: {
  label: string;
  onClick: () => void;
  current?: boolean;
  pending?: boolean;
  subheading?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`section-row ${subheading ? "outline-subheading" : "outline-section"} ${className}`}
      aria-current={current ? "location" : undefined}
      title={title}
      onClick={onClick}
    >
      <span className="section-label">{label}</span>
      {pending && <small className="review-dot" aria-label="Needs AI review" />}
    </button>
  );
}
function blockLabel(block: Block) {
  return block.type === "pricing_table"
    ? block.text || "Investment"
    : block.type === "contract"
      ? block.text || "Statement of Work & Contract"
      : "Signatures";
}
function findDropPage(pages: ReturnType<typeof computedPages>, target: string) {
  return pages.find(
    (p) =>
      target === `page:${p.id}` ||
      target === `page-end:${p.id}` ||
      p.sections.some((s) => target === `section:${s.id}`),
  );
}
export function SectionsNav({
  content,
  map = {},
  pagination,
  onChange,
  onMove,
  onFocus,
  measure,
  onPage,
  currentSectionId,
  headerFooter,
}: {
  currentSectionId?: string | null;
  headerFooter?: HeaderFooterSettings;
  map?: Record<string, string>;
  content: Block[];
  pagination?: BrowserPages | null;
  onChange: (v: Block[]) => void;
  onMove: (op: (v: Block[]) => Block[]) => void;
  onFocus: (id: string) => void;
  measure?: (content: Block[]) => BrowserPages;
  onPage?: (page: number) => void;
}) {
  const display = (value: string) => resolvedEditorText(value, map);
  const pages = computedPages(content, pagination),
    feedback = useBlockFeedback();
  const selected = useBlockSelection().selected;
  const selectedIndex = content.findIndex(
    (b) =>
      documentBlocks([b]).some(
        (child) =>
          selected === `block-${child.id}` ||
          selected === `template-${child.id}`,
      ) ||
      b.columns?.items.some(
        (column) => columnStyleKey(column.id) === selected,
      ) ||
      b.clauses?.some(
        (c) =>
          selected === `clause-${c.id}` ||
          selected === `template-clause-${c.id}`,
      ),
  );
  const selectedRange = documentSectionRanges(content).find(
    (s) => s.start <= selectedIndex && selectedIndex < s.end,
  );
  const activeSection =
    selectedIndex < 0
      ? currentSectionId
      : (content
          .slice(selectedRange?.start ?? selectedIndex, selectedIndex + 1)
          .filter((b) => b.type === "heading")
          .at(-1)?.id ?? selectedRange?.id);
  const activePage =
    selectedIndex < 0
      ? undefined
      : pagination?.assignments.find(
          (a) => a.block === content[selectedIndex].id,
        )?.page;
  const bandStatus = headerFooter
    ? resolvedBandPages(
        headerFooter,
        bandPages(content, pagination?.plan, pagination?.assignments),
      )
    : [];
  const assignments = new Map(
    pagination?.assignments.map((a) => [a.block, a.page]),
  );
  // Display-only rows: never create section ranges or change page/drop calculations.
  const pageBlocks = (number: number) => {
    let signatures = false;
    return content.filter((b) => {
      if (assignments.get(b.id!) !== number) return false;
      if (b.type === "signature_block") {
        if (signatures) return false;
        signatures = true;
        return true;
      }
      return b.type === "pricing_table" || b.type === "contract";
    });
  };
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
        sectionDragLabel={(id) => {
          const section = pages
            .flatMap((p) => p.sections)
            .find((s) => `section:${s.id}` === id);
          return section ? display(section.title) : "";
        }}
        onMove={(from, to, edge) => {
          const target = findDropPage(pages, to);
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
                to.startsWith("page-end:") ||
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
                  ? following?.explicit
                    ? following.id
                    : following?.first
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
              feedback.error(e instanceof Error ? e.message : "Move canceled");
            }
          }
        }}
      >
        <SectionDragLayout pages={pages}>
          {(drag) =>
            pages.map((p) => {
              const source = p.sections.findIndex((s) => s.id === drag?.source);
              const shrink = drag && source >= 0 ? drag.height : 0;
              const grows = drag?.page === p.id;
              const grow = grows ? drag.height : 0;
              const insertion = grows ? drag.index : -1;
              // Transforms animate the rows. The page margin accounts for
              // their net movement in the surrounding sidebar layout.
              const gap = grows && (
                <SectionInsertionGap
                  drag={drag}
                  page={p.number}
                  offset={source >= 0 && insertion > source ? -shrink : 0}
                />
              );
              return (
                <Sortable
                  key={p.id}
                  id={`page:${p.id}`}
                  label={`page ${p.number}`}
                  draggable={p.explicit}
                  style={{ marginBlockEnd: grow - shrink || undefined }}
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
                        <span className="section-label page-label">
                          Page {p.number}
                        </span>
                        {bandStatus[p.number - 1] && (
                          <BandPageMarker page={bandStatus[p.number - 1]} />
                        )}
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
                    {p.number === 1 && (
                      <SectionRow
                        label="Cover"
                        current={currentSectionId === "cover"}
                        onClick={() => onFocus("cover")}
                      />
                    )}
                    <SortableContext
                      items={p.sections.map((s) => `section:${s.id}`)}
                      strategy={noSectionSorting}
                    >
                      {p.sections.map((s, index) => (
                        <Fragment key={s.id}>
                          {insertion === index && gap}
                          <Sortable
                            id={`section:${s.id}`}
                            label={`section ${display(s.title)}`}
                            style={
                              index === source
                                ? { opacity: 0, pointerEvents: "none" }
                                : {
                                    transform: sectionTranslate(
                                      (index > source ? -shrink : 0) +
                                        (insertion >= 0 && index >= insertion
                                          ? grow
                                          : 0),
                                    ),
                                  }
                            }
                          >
                            <SectionRow
                              label={
                                [
                                  "pricing_table",
                                  "signature_block",
                                  "contract",
                                ].includes(s.blocks[0]?.type)
                                  ? display(blockLabel(s.blocks[0]))
                                  : display(s.title)
                              }
                              current={
                                activeSection === s.id &&
                                (!activePage || activePage === p.number)
                              }
                              pending={s.pending}
                              title={display(s.title)}
                              onClick={() => onFocus(s.id)}
                            />
                            {s.blocks
                              .filter(
                                (b) =>
                                  b.type === "heading" && (b.level ?? 1) > 1,
                              )
                              .map((b) => (
                                <SectionRow
                                  key={b.id}
                                  subheading
                                  label={display(
                                    b.text || "Untitled subheading",
                                  )}
                                  current={
                                    activeSection === b.id &&
                                    (!activePage || activePage === p.number)
                                  }
                                  onClick={() => onFocus(b.id!)}
                                />
                              ))}
                          </Sortable>
                        </Fragment>
                      ))}
                    </SortableContext>
                    {insertion === p.sections.length && !drag?.atPageEnd && gap}
                    <div
                      className="outline-page-tail"
                      style={{
                        transform: sectionTranslate(
                          drag?.atPageEnd ? -shrink : grow - shrink,
                        ),
                      }}
                    >
                      {!p.sections.some(
                        (s) => s.blocks[0]?.type === "heading",
                      ) &&
                        pageBlocks(p.number)
                          .filter((b) => !p.sections.some((s) => s.id === b.id))
                          .map((b) => (
                            <SectionRow
                              className="outline-block"
                              key={b.id}
                              label={display(blockLabel(b))}
                              current={
                                selected === `block-${b.id}` ||
                                selected === `template-${b.id}`
                              }
                              onClick={() => onFocus(b.id!)}
                            />
                          ))}
                      {!p.sections.length &&
                        !pageBlocks(p.number).length &&
                        p.continuing && (
                          <SectionRow
                            className="outline-continuing"
                            label={`${display(p.continuing.title)} (continued)`}
                            onClick={() => onPage?.(p.number)}
                          />
                        )}
                      {p.number > 1 &&
                        !p.sections.length &&
                        !pageBlocks(p.number).length &&
                        !p.continuing && (
                          <SectionRow
                            label="Empty page"
                            onClick={() => onPage?.(p.number)}
                          />
                        )}
                    </div>
                    {grows && drag.atPageEnd && gap}
                    <PageEndDropHint
                      id={p.id}
                      page={p.number}
                      offset={grow - shrink}
                      projected={grows && drag.atPageEnd}
                    />
                  </div>
                </Sortable>
              );
            })
          }
        </SectionDragLayout>
      </Reorder>
      {!content.length && <p className="muted">No sections yet</p>}
      <button type="button" className="sections-add-page" onClick={() => add()}>
        Add page
      </button>
    </nav>
  );
}

const noSectionSorting = () => null;
const sectionTranslate = (offset: number) =>
  offset ? `translateY(${offset}px)` : undefined;

type SectionDrag = {
  source: string;
  page: string;
  index: number;
  height: number;
  target: string;
  edge: "before" | "after";
  atPageEnd: boolean;
};

function SectionDragLayout({
  pages,
  children,
}: {
  pages: ReturnType<typeof computedPages>;
  children: (drag: SectionDrag | null) => ReactNode;
}) {
  const { active, activeNodeRect, collisions } = useDndContext();
  const target = String(collisions?.[0]?.id ?? "");
  const source = String(active?.id ?? "");
  const edge = sectionDropEdge(collisions?.[0]);
  const height = activeNodeRect?.height;
  if (!source.startsWith("section:") || source === target || !height || !edge)
    return children(null);

  const atPageEnd = target.startsWith("page-end:");
  const page = findDropPage(pages, target);
  if (!page) return children(null);
  const sourceId = source.slice(8);
  const sourceIndex = page.sections.findIndex((s) => s.id === sourceId);
  const index = atPageEnd
    ? page.sections.length + 1
    : target.startsWith("page:")
      ? 0
      : page.sections.findIndex((s) => `section:${s.id}` === target) +
        (edge === "after" ? 1 : 0);
  if (
    index === sourceIndex ||
    (index === sourceIndex + 1 && !atPageEnd && sourceIndex >= 0)
  )
    return children(null);
  return children({
    source: sourceId,
    page: page.id,
    index,
    height,
    target,
    edge,
    atPageEnd,
  });
}

function SectionInsertionGap({
  drag,
  page,
  offset,
}: {
  drag: SectionDrag;
  page: number;
  offset: number;
}) {
  return (
    <div className="section-gap-anchor" aria-hidden="true">
      <div
        className="section-insertion-gap"
        data-section-drop-gap={drag.target}
        data-section-drop-edge={drag.edge}
        style={{ height: drag.height, transform: sectionTranslate(offset) }}
      >
        {drag.atPageEnd && `Move to end of page ${page}`}
      </div>
    </div>
  );
}

// The slot stays mounted and never takes focus. Its ID distinguishes the
// bottom of this page from the first section after the following page break.
function PageEndDropHint({
  id,
  page,
  offset,
  projected,
}: {
  id: string;
  page: number;
  offset: number;
  projected: boolean;
}) {
  const { active } = useDndContext();
  const { isOver, setNodeRef } = useDroppable({ id: `page-end:${id}` });
  const dragging = String(active?.id ?? "").startsWith("section:");
  return (
    <div
      ref={setNodeRef}
      className="outline-page-end"
      data-dragging={dragging || undefined}
      data-drop-target={(dragging && isOver) || undefined}
      data-projected={projected || undefined}
      style={{ transform: sectionTranslate(offset) }}
    >
      {dragging ? `Move to end of page ${page}` : null}
    </div>
  );
}

function BandPageMarker({
  page,
}: {
  page: ReturnType<typeof resolvedBandPages>[number];
}) {
  const kinds = (["header", "footer"] as const).filter(
    (kind) => page[kind].source !== "shared",
  );
  if (!kinds.length) return null;
  const label = kinds
    .map((kind) =>
      page[kind].source === "hidden"
        ? `${kind === "header" ? "Header" : "Footer"} hidden`
        : `Unique ${kind}`,
    )
    .join(" · ");
  return (
    <span
      className="band-page-marker"
      role="img"
      aria-label={label}
      title={label}
    >
      {kinds.map((kind) => (
        <i
          key={kind}
          data-kind={kind}
          data-hidden={page[kind].source === "hidden"}
        />
      ))}
    </span>
  );
}
