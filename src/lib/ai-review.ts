import type { Block, Proposal } from "./model";
export function reviewBlocks(content: Block[], ai: boolean) {
  const seen = new Set<string>();
  return content.map((b, index) => {
    let id = b.id ?? `block-${index}`;
    while (seen.has(id)) id += `-${index}`;
    seen.add(id);
    return {
      ...b,
      id,
      ...(ai && !["contract", "signature_block", "page_break"].includes(b.type)
        ? { ai_review: { source: "assistant", reviewed: false } }
        : {}),
    };
  });
}
export function contentSections(content: Block[]) {
  const sections: {
    id: string;
    title: string;
    indices: number[];
    pending: boolean;
  }[] = [];
  for (const [n, b] of content.entries()) {
    const starts =
      b.type === "heading" ||
      ["pricing_table", "contract", "signature_block"].includes(b.type) ||
      !sections.length;
    if (starts)
      sections.push({
        id: b.id ?? `block-${n}`,
        title:
          b.type === "heading"
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
    if (b.ai_review && !b.ai_review.reviewed) section.pending = true;
  }
  return sections;
}
export function pendingSections(p: Proposal) {
  const sections = contentSections(p.content);
  if (!p.content.some((b) => b.ai_review) && p.ai_unreviewed)
    return sections
      .filter((s) => !s.title.endsWith("signature"))
      .map((s) => s.title);
  return sections.filter((s) => s.pending).map((s) => s.title);
}
