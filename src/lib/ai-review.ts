import { blockStyleSchema } from "./block-style";
import {
  columnRejection,
  columnsSchema,
  documentBlocks,
  updateBlockChildren,
} from "./columns";
import { validateInlineSizes } from "./inline-font-size";
import { check, type Block, type Proposal } from "./model";
export function reviewBlocks(content: Block[], ai: boolean) {
  validateInlineSizes(content);
  const seen = new Set<string>();
  let total = 0;
  return normalize(content);
  function normalize(blocks: Block[]): Block[] {
    return blocks.map((b, index) => {
      check(
        ++total <= 300,
        "A document can contain at most 300 blocks, including blocks in columns",
      );
      let id = b.id ?? `block-${index}`;
      while (seen.has(id)) id += `-${index}`;
      seen.add(id);
      if (b.style !== undefined) {
        const style = blockStyleSchema.parse(b.style);
        check(
          b.type !== "page_break",
          "Page breaks don't have a visible block to style",
        );
        check(
          !["signature_block", "contract"].includes(b.type) ||
            (!style.background &&
              !style.border &&
              !style.border_color &&
              !style.radius),
          "Signatures and contracts keep their fixed background and border",
        );
      }
      check(
        b.type !== "heading" ||
          b.level === undefined ||
          [1, 2, 3].includes(b.level),
        "Heading level must be 1, 2 or 3",
      );
      const columns =
        b.type === "columns" ? columnsSchema.parse(b.columns) : undefined;
      check(
        !b.columns || b.type === "columns",
        "Only a Columns block can contain columns",
      );
      if (columns)
        for (const column of columns.items) {
          const reason = columnRejection(column.content);
          check(!reason, reason ?? "");
        }
      return {
        ...b,
        ...(columns
          ? {
              columns: {
                ...columns,
                items: columns.items.map((c) => ({
                  ...c,
                  content: normalize(c.content),
                })),
              },
            }
          : {}),
        ...(b.type === "heading" ? { level: b.level ?? 1 } : {}),
        id,
        ...(ai &&
        !["contract", "signature_block", "page_break"].includes(b.type)
          ? { ai_review: { source: "assistant", reviewed: false } }
          : {}),
      };
    });
  }
}
export function setBlockReviewed(block: Block, reviewed: boolean): Block {
  const updated = block.ai_review
    ? { ...block, ai_review: { ...block.ai_review, reviewed } }
    : block;
  return updateBlockChildren(updated, (children) =>
    children.map((child) => setBlockReviewed(child, reviewed)),
  );
}
export function contentSections(content: Block[]) {
  const sections: {
    id: string;
    title: string;
    indices: number[];
    pending: boolean;
  }[] = [];
  for (const [n, b] of content.entries()) {
    // Terms is always its own section, even without a heading or page break.
    const starts =
      (b.type === "heading" && (b.level ?? 1) === 1) ||
      b.type === "contract" ||
      !sections.length;
    if (starts)
      sections.push({
        id: b.id ?? `block-${n}`,
        title:
          b.type === "heading" && (b.level ?? 1) === 1
            ? b.text || "Untitled section"
            : b.type === "pricing_table"
              ? "Your investment"
              : b.type === "contract"
                ? b.text || "Statement of Work & Contract"
                : b.type === "signature_block"
                  ? `${b.role === "client" ? "Client" : "Company"} signature`
                  : "Overview",
        indices: [],
        pending: false,
      });
    const section = sections.at(-1)!;
    section.indices.push(n);
    if (
      documentBlocks([b]).some(
        (block) => block.ai_review && !block.ai_review.reviewed,
      )
    )
      section.pending = true;
  }
  return sections;
}
export function pendingSections(p: Proposal) {
  const sections = contentSections(p.content);
  if (!documentBlocks(p.content).some((b) => b.ai_review) && p.ai_unreviewed)
    return sections
      .filter((s) => !s.title.endsWith("signature"))
      .map((s) => s.title);
  return sections.filter((s) => s.pending).map((s) => s.title);
}
