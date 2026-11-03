import type { Block } from "./model";
import type { PagePlan } from "./page-plan";
import { authoringPages } from "./editor-pages";
import {
  documentSectionRanges,
  moveBlockRange,
  assertBlockMove,
} from "./editor-moves";
import { contentSections } from "./ai-review";
export function computedPages(
  content: Block[],
  pagination?: {
    plan: PagePlan;
    assignments: { block: string; page: number }[];
  } | null,
) {
  const explicit = authoringPages(content),
    count = pagination?.plan.pages ?? explicit.length;
  const assigned = new Map(
    pagination?.assignments.map((v) => [v.block, v.page]) ??
      explicit.flatMap((p, n) => p.blocks.map((b) => [b.id!, n + 1] as const)),
  );
  const sections = documentSectionRanges(content).map((range) => {
    const blocks = content.slice(range.start, range.end),
      section = contentSections(blocks)[0];
    return {
      ...section,
      ...range,
      blocks,
      page: assigned.get(blocks[0]?.id!) ?? 1,
    };
  });
  return Array.from({ length: count }, (_, n) => {
    const number = n + 1,
      start = pagination?.plan.starts[n - 1];
    const owner = explicit.find((p) =>
      n === 0
        ? p.id === "start"
        : p.id !== "start" &&
          start?.explicit &&
          (start.marker
            ? p.id === start.marker
            : p.blocks.some((b) => b.id === start.block)),
    );
    const first =
      start?.block ?? content.find((b) => assigned.get(b.id!) === number)?.id;
    const continuing = sections.find(
      (s) =>
        start && s.blocks.some((b) => b.id === start.block) && s.page < number,
    );
    return {
      number,
      id: owner?.id ?? `computed-${number}`,
      explicit: !!owner,
      first,
      sections: sections.filter((s) => s.page === number),
      continuing,
    };
  });
}
/** Browser overflow pages become explicit destinations when a section is dropped onto them.
 * Validate the complete permutation before adding the one intentional page separator. */
export function moveComputedSection(
  content: Block[],
  sectionId: string,
  before: string | undefined,
  explicitDestination: boolean,
) {
  const range = documentSectionRanges(content).find((s) => s.id === sectionId);
  if (!range || before === sectionId) return content;
  const at = before
    ? content.findIndex((b) => b.id === before)
    : content.length;
  if (at < 0) return content;
  const moved = moveBlockRange(content, range.start, range.end, at);
  if (explicitDestination) return moved;
  const next = [...moved],
    index = next.findIndex((b) => b.id === sectionId);
  if (index > 0 && next[index - 1].type !== "page_break") {
    const marker: Block = { id: crypto.randomUUID(), type: "page_break" };
    next.splice(index, 0, marker);
    assertBlockMove(
      content,
      next.filter((b) => b !== marker),
    );
  }
  return next;
}
