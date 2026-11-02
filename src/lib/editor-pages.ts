import type { Block } from "./model";
import { contentSections } from "./ai-review";
import {
  assertBlockMove,
  documentSectionRanges,
  moveBlockRange,
} from "./editor-moves";
export function authoringPages(content: Block[]) {
  const pages: { id: string; marker: Block | null; blocks: Block[] }[] = [
    { id: "start", marker: null, blocks: [] },
  ];
  for (const block of content) {
    if (block.type === "page_break")
      pages.push({ id: block.id!, marker: block, blocks: [] });
    else pages.at(-1)!.blocks.push(block);
  }
  return pages.map((p) => ({ ...p, sections: contentSections(p.blocks) }));
}
function flatten(pages: ReturnType<typeof authoringPages>): Block[] {
  return pages.flatMap((p, n) => [
    ...(n
      ? [p.marker ?? { id: crypto.randomUUID(), type: "page_break" as const }]
      : []),
    ...p.blocks,
  ]);
}
export function movePage(content: Block[], from: string, to: string) {
  const pages = authoringPages(content),
    a = pages.findIndex((p) => p.id === from),
    b = pages.findIndex((p) => p.id === to);
  if (a < 0 || b < 0 || a === b) return content;
  const [p] = pages.splice(a, 1);
  pages.splice(b, 0, p);
  // Separators belong to page slots. Reuse each original marker exactly once,
  // including when the original first page becomes a later page.
  const markers = content.filter((block) => block.type === "page_break");
  return assertBlockMove(
    content,
    pages.flatMap((page, n) => [
      ...(n ? [markers[n - 1]] : []),
      ...page.blocks,
    ]),
  );
}
export function movePageSection(
  content: Block[],
  sectionId: string,
  pageId: string,
  before?: string,
) {
  const pages = authoringPages(content),
    source = pages.find((p) => p.sections.some((s) => s.id === sectionId)),
    target = pages.find((p) => p.id === pageId);
  if (!source || !target || before === sectionId) return content;
  const range = documentSectionRanges(content).find((s) => s.id === sectionId)!;
  const pageIndex = pages.indexOf(target),
    nextPage = pages[pageIndex + 1];
  const at = before
    ? content.findIndex((b) => b.id === before)
    : nextPage
      ? content.findIndex((b) => b === nextPage.marker)
      : content.length;
  if (at < 0 || (before && !target.blocks.some((b) => b.id === before)))
    return content;
  return moveBlockRange(content, range.start, range.end, at);
}
export function addPage(content: Block[], after?: string) {
  const pages = authoringPages(content),
    heading: Block = {
      id: crypto.randomUUID(),
      type: "heading",
      level: 1,
      text: "",
    };
  const at = after ? pages.findIndex((p) => p.id === after) + 1 : pages.length;
  pages.splice(at, 0, {
    id: crypto.randomUUID(),
    marker: { id: crypto.randomUUID(), type: "page_break" },
    blocks: [heading],
    sections: [],
  });
  return { content: flatten(pages), heading: heading.id! };
}
export function deletePage(content: Block[], id: string) {
  return flatten(authoringPages(content).filter((p) => p.id !== id));
}
