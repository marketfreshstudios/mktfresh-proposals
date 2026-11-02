import type { Block } from "./model";
import { contentSections } from "./ai-review";
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
  return flatten(pages);
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
  const section = source.sections.find((s) => s.id === sectionId)!;
  const moved = section.indices.map((n) => source.blocks[n]),
    ids = new Set(moved.map((b) => b.id));
  source.blocks = source.blocks.filter((b) => !ids.has(b.id));
  const at = before
    ? target.blocks.findIndex((b) => b.id === before)
    : target.blocks.length;
  target.blocks.splice(at < 0 ? target.blocks.length : at, 0, ...moved);
  return flatten(pages);
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
