import type { Block } from "./model";
import { contentSections } from "./ai-review";
export function duplicateBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = crypto.randomUUID();
  if (copy.clauses)
    copy.clauses = copy.clauses.map((c) => ({ ...c, id: crypto.randomUUID() }));
  return copy;
}
/** Draft/template authoring only. Never apply to a stored sent/signed version. */
export function withoutTitleHeading(content: Block[]) {
  return content[0]?.type === "heading" &&
    content[0].text === "{{proposal.title}}"
    ? content.slice(1)
    : content;
}
/** Section boundaries follow headings; special blocks remain useful outline entries. */
export function moveSection(content: Block[], from: string, to: string) {
  const sections = contentSections(content),
    a = sections.findIndex((s) => s.id === from),
    b = sections.findIndex((s) => s.id === to);
  if (a < 0 || b < 0 || a === b) return content;
  const [moved] = sections.splice(a, 1);
  sections.splice(b, 0, moved);
  return sections.flatMap((s) => s.indices.map((n) => content[n]));
}

/** Authoring-only insertion when a text block was selected without a cursor. */
export function appendField(block: Block, path: string): Block {
  const next = structuredClone(block),
    token = `{{${path}}}`;
  if (next.type === "heading" || (next.type === "paragraph" && !next.content))
    return { ...next, text: (next.text ?? "") + token };
  if (next.type !== "paragraph") return next;
  let last: NonNullable<Block["content"]> | undefined;
  function walk(node: NonNullable<Block["content"]>) {
    if (node.type === "paragraph") last = node;
    for (const child of node.content ?? []) walk(child);
  }
  walk(next.content!);
  if (!last) {
    last = { type: "paragraph", content: [] };
    (next.content!.content ??= []).push(last);
  }
  (last.content ??= []).push({ type: "variable", attrs: { path } });
  return next;
}
