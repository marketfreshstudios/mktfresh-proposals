import type { Block } from "./model";
export { moveSectionRange as moveSection } from "./editor-moves";
export function duplicateBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = crypto.randomUUID();
  if (copy.saved_block_id) copy.saved_block_instance = crypto.randomUUID();
  if (copy.clauses)
    copy.clauses = copy.clauses.map((c) => ({ ...c, id: crypto.randomUUID() }));
  return copy;
}
/** Draft/template authoring only. Never apply to a stored sent/signed version. */
export function withoutTitleHeading(content: Block[]) {
  const first = content[0]?.type === "page_break" ? 1 : 0;
  return content[first]?.type === "heading" &&
    (content[first].level ?? 1) === 1 &&
    content[first].text === "{{proposal.title}}"
    ? content.filter((_, index) => index !== first)
    : content;
}
/** Authoring-only insertion when a text block was selected without a cursor. */
export function appendField(block: Block, path: string): Block {
  const next = structuredClone(block),
    token = `{{${path}}}`;
  if (["heading", "paragraph"].includes(next.type) && !next.content)
    return { ...next, text: (next.text ?? "") + token };
  if (!["heading", "paragraph"].includes(next.type)) return next;
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
  if (next.type === "heading") {
    next.rich_heading = true;
    next.text = blockText(next);
  }
  return next;
}

export type TextLevel = 0 | 1 | 2 | 3;
export type TextStyleControl = {
  value: TextLevel;
  change: (level: TextLevel, afterFocus?: () => void) => void;
};
export function blockText(block: Block): string {
  const walk = (node: NonNullable<Block["content"]>): string =>
    node.type === "variable"
      ? `{{${node.attrs?.path ?? ""}}}`
      : (node.text ??
        (node.content ?? []).map(walk).join(node.type === "doc" ? "\n" : ""));
  return block.content ? walk(block.content) : (block.text ?? "");
}
/** Preserve the block ID/review state; no conversion ever touches stored versions. */
export function convertTextStyle(
  block: Block,
  level: TextLevel,
  text = blockText(block),
): Block {
  if (!["heading", "paragraph"].includes(block.type)) return block;
  return level === 0
    ? {
        ...block,
        type: "paragraph",
        level: undefined,
        text,
        content:
          block.content && text === blockText(block)
            ? structuredClone(block.content)
            : undefined,
      }
    : {
        ...block,
        type: "heading",
        rich_heading: !!block.content || block.rich_heading,
        level,
        text: text.replace(/[\r\n]+/g, " "),
        content:
          block.content && text === blockText(block)
            ? structuredClone(block.content)
            : undefined,
      };
}
