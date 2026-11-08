import type { Block } from "./model";
import { contentSections } from "./ai-review";
const cancelled = () =>
  new Error(
    "Move cancelled: document blocks changed. Nothing was moved. Reload and try again.",
  );
/** A move is a permutation, including page-break IDs and nested block content. */
export function assertBlockMove(before: Block[], after: Block[]) {
  if (before.length !== after.length) throw cancelled();
  const originals = new Map(before.map((block) => [block.id, block]));
  if (originals.size !== before.length || before.some((block) => !block.id))
    throw cancelled();
  const seen = new Set<string>();
  for (const block of after) {
    if (
      !block?.id ||
      seen.has(block.id) ||
      !originals.has(block.id) ||
      JSON.stringify(originals.get(block.id)) !== JSON.stringify(block)
    )
      throw cancelled();
    seen.add(block.id);
  }
  return after;
}
/** Destination is an original-array boundary; never recompute a range after removal. */
export function moveBlockRange(
  content: Block[],
  start: number,
  end: number,
  before: number,
) {
  if (
    ![start, end, before].every(Number.isInteger) ||
    start < 0 ||
    end > content.length ||
    end <= start ||
    before < 0 ||
    before > content.length
  )
    throw cancelled();
  if (before >= start && before <= end)
    return assertBlockMove(content, content);
  const moved = content.slice(start, end),
    rest = [...content.slice(0, start), ...content.slice(end)];
  rest.splice(before > end ? before - moved.length : before, 0, ...moved);
  return assertBlockMove(content, rest);
}
/** Local sections stop at explicit page boundaries, including an unheaded Overview. */
export function documentSectionRanges(content: Block[]) {
  const result: { id: string; start: number; end: number }[] = [];
  let start = 0;
  for (let n = 0; n <= content.length; n++) {
    if (n !== content.length && content[n].type !== "page_break") continue;
    for (const section of contentSections(content.slice(start, n)))
      result.push({
        id: section.id,
        start: start + section.indices[0],
        end: start + section.indices.at(-1)! + 1,
      });
    start = n + 1;
  }
  return result;
}
export function moveSectionRange(content: Block[], from: string, to: string) {
  const sections = documentSectionRanges(content),
    source = sections.find((s) => s.id === from),
    target = sections.find((s) => s.id === to);
  if (!source || !target || source === target) return content;
  return moveBlockRange(
    content,
    source.start,
    source.end,
    source.start < target.start ? target.end : target.start,
  );
}
export function moveDocumentBlock(content: Block[], from: string, to: string) {
  const source = content.findIndex((b) => b.id === from),
    target = content.findIndex((b) => b.id === to);
  if (source < 0 || target < 0 || source === target) return content;
  const sections = documentSectionRanges(content),
    section = sections.find((s) => s.start === source),
    destination = sections.find((s) => s.start <= target && target < s.end);
  if (section && destination)
    return moveSectionRange(content, section.id, destination.id);
  return moveBlockRange(
    content,
    source,
    source + 1,
    source < target ? target + 1 : target,
  );
}
export function moveAdjacentBlock(
  content: Block[],
  id: string,
  direction: -1 | 1,
) {
  const sections = documentSectionRanges(content),
    section = sections.findIndex((s) => s.id === id);
  if (section >= 0)
    return sections[section + direction]
      ? moveSectionRange(content, id, sections[section + direction].id)
      : content;
  const index = content.findIndex((b) => b.id === id),
    target = index + direction;
  return index >= 0 && target >= 0 && target < content.length
    ? moveBlockRange(
        content,
        index,
        index + 1,
        direction === 1 ? target + 1 : target,
      )
    : content;
}
export function canMoveAdjacentBlock(
  content: Block[],
  id: string,
  direction: -1 | 1,
) {
  const sections = documentSectionRanges(content),
    section = sections.findIndex((s) => s.id === id);
  if (section >= 0) return !!sections[section + direction];
  const at = content.findIndex((b) => b.id === id);
  return at >= 0 && at + direction >= 0 && at + direction < content.length;
}
/** No history entry, dirty flag or save is produced until the permutation passes. */
export function applyDocumentMove(
  content: Block[],
  operation: (content: Block[]) => Block[],
  commit: (content: Block[]) => void,
  error: (message: string) => void,
) {
  try {
    // Isolate even a faulty operation from the live editor state.
    const next = assertBlockMove(content, operation(structuredClone(content)));
    if (JSON.stringify(next) !== JSON.stringify(content)) commit(next);
    return true;
  } catch (reason) {
    error(reason instanceof Error ? reason.message : cancelled().message);
    return false;
  }
}

/** Pointer destinations are original-array boundaries, shared with library insertion. */
export function moveDocumentBlocksAt(
  content: Block[],
  from: string,
  before: number,
  selected: string[] = [],
) {
  if (!Number.isInteger(before) || before < 0 || before > content.length)
    throw cancelled();
  const source = content.findIndex((b) => b.id === from);
  if (source < 0) return content;
  if (selected.length > 1 && selected.includes(from)) {
    const ids = new Set(selected);
    const moved = content.filter((b) => ids.has(b.id!));
    const rest = content.filter((b) => !ids.has(b.id!));
    const at =
      before - content.slice(0, before).filter((b) => ids.has(b.id!)).length;
    rest.splice(at, 0, ...moved);
    return assertBlockMove(content, rest);
  }
  const section = documentSectionRanges(content).find(
    (s) => s.start === source,
  );
  return moveBlockRange(content, source, section?.end ?? source + 1, before);
}
