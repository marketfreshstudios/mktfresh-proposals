import { documentBlocks } from "./columns";
import type { Proposal, RichText } from "./model";

/** Authored text only: URLs, field chips and image metadata are not guidance. */
function text(node?: RichText): string {
  if (
    !node ||
    node.type === "variable" ||
    node.type === "image" ||
    node.marks?.some((m) => m.type === "link")
  )
    return "";
  return (node.text ?? "") + (node.content ?? []).map(text).join("\n");
}
function guidance(value: string) {
  const plain = value
    .replace(/{{[^{}]*}}/g, "")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "");
  return [...plain.matchAll(/\[([^\[\]]*)\]/g)].some(
    (m) =>
      !/^\s*(?:[$€£¥]\s*[\d,.]+(?:\s*(?:\/mo|\/yr))?|[\d,.]+\s*(?:\/mo|\/yr|USD|CAD|EUR|GBP))\s*$/i.test(
        m[1],
      ),
  );
}
export function authoringErrors(p: Proposal): string[] {
  const sections = new Set<string>();
  const check = (value: string, section: string) => {
    if (guidance(value)) sections.add(section);
  };
  let section = "Document";
  check(p.title, "Cover");
  for (const line of p.cover?.elements ?? [])
    if (!line.hidden) check(text(line.content), "Cover");
  if (!p.cover?.elements)
    for (const value of [
      p.cover?.workspace,
      p.cover?.eyebrow,
      p.cover?.prepared_for,
      p.cover?.byline,
    ])
      check(value ?? "", "Cover");
  for (const block of p.content) {
    if (block.type === "heading" && (block.level ?? 1) === 1)
      section = block.text || text(block.content) || "Untitled section";
    for (const authored of documentBlocks([block]))
      check(
        authored.content ? text(authored.content) : (authored.text ?? ""),
        section,
      );
    for (const clause of block.clauses ?? []) {
      check(clause.heading, block.text || "Terms");
      check(clause.body, block.text || "Terms");
    }
    if (block.type === "pricing_table")
      for (const item of p.quote) {
        check(item.name, section);
        check(item.description, section);
        for (const line of item.sublines) check(line.label ?? "", section);
      }
  }
  // Bands can also contain authored guidance, but their page-field tokens aren't general variables.
  for (const kind of ["header", "footer"] as const) {
    const band = p.header_footer?.shared[kind];
    for (const slot of band?.slots ?? [])
      check(text(slot), kind === "header" ? "Header" : "Footer");
    for (const override of Object.values(p.header_footer?.overrides ?? {})) {
      const band = override[kind];
      if (band && band !== "hidden")
        for (const slot of band.slots)
          check(text(slot), kind === "header" ? "Header" : "Footer");
    }
  }
  return [
    ...(sections.size
      ? [`Replace bracketed guidance in: ${[...sections].join(", ")}`]
      : []),
  ];
}
