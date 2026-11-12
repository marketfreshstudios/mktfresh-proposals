import type { Block, Quote } from "./model";
import { blockText } from "./editor-document";
import { resolve } from "./presentation";
import { visibleQuote } from "./quote-options";
import { selectedContent } from "./quote-model";

export type QuestionTarget = {
  block_id?: string;
  excerpt?: string;
  section?: string;
  label: string;
  kind?: string;
};
const blockKinds: Partial<Record<Block["type"], string>> = {
  heading: "heading",
  paragraph: "paragraph",
  image: "image",
  pricing_table: "quote",
};
function containsList(node?: Block["content"]): boolean {
  return (
    !!node &&
    (["bulletList", "orderedList", "bullet_list", "ordered_list"].includes(
      node.type,
    ) ||
      !!node.content?.some(containsList))
  );
}
export function questionExcerpt(text: string) {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Client and server resolve the same text from the currently published content. */
export function questionTargets(
  content: Block[],
  quote: Quote,
  variables: Record<string, string>,
) {
  const blocks = new Map<string, QuestionTarget>();
  const sections = new Map<string, string>([["section:cover", "Cover"]]);
  let section = "section:cover";
  let label = "Cover";
  const walk = (items: Block[], nested = false) => {
    for (const [index, block] of items.entries()) {
      const id = block.id ?? (!nested ? String(index) : undefined);
      if (!id) continue;
      const excerpt = questionExcerpt(
        resolve(
          block.type === "image" ? (block.alt ?? "") : blockText(block),
          variables,
        ),
      );
      if (!nested && block.type === "heading" && (block.level ?? 1) === 1) {
        section = `section:${id}`;
        label = excerpt || "Untitled section";
        sections.set(section, label);
      }
      if (block.type === "columns") {
        for (const column of block.columns?.items ?? [])
          walk(column.content, true);
      }
      const kind =
        block.type === "paragraph" && containsList(block.content)
          ? "list"
          : blockKinds[block.type];
      if (block.type === "contract") {
        // Each Terms clause the client can see is its own question target.
        const heading = resolve(block.text || "Terms", variables);
        for (const clause of selectedContent([block], quote)[0].clauses ?? [])
          blocks.set(clause.id, {
            block_id: clause.id,
            section,
            label: `${label} | ${resolve(clause.heading, variables) || heading}`,
            excerpt: questionExcerpt(
              resolve(`${clause.heading}: ${clause.body}`, variables),
            ),
            kind: "term",
          });
        continue;
      }
      if (!kind) continue;
      blocks.set(id, {
        block_id: id,
        section,
        label,
        excerpt,
        kind,
      });
      if (block.type === "pricing_table")
        for (const item of visibleQuote(quote)) {
          blocks.set(item.id, {
            block_id: item.id,
            section,
            label: `${label} | ${item.name}`,
            excerpt: questionExcerpt(
              [item.name, item.description].filter(Boolean).join(": "),
            ),
            kind: "quote line",
          });
        }
    }
  };
  walk(content);
  return { blocks, sections };
}
