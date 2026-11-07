import { canonical, sha256 } from "./content";
import { check, type Block, type RichText, type Template } from "./model";

const protectedTypes = new Set([
  "pricing_table",
  "signature_block",
  "contract",
  "page_break",
]);
const markerPattern = /^<!-- yeswell:block:([A-Za-z0-9_-]{1,200}) -->$/;
const escapeText = (text: string) =>
  text.replace(/([\\`*_{}\[\]<>#!|~().+-])/g, "\\$1");
function inline(node: RichText): string {
  let text =
    node.type === "variable"
      ? `{{${node.attrs?.path ?? ""}}}`
      : node.type === "hardBreak"
        ? "  \n"
        : node.text === undefined
          ? (node.content ?? []).map(inline).join("")
          : node.text
              .split(/({{\s*[\w.-]+\s*}})/g)
              .map((s) => (s.startsWith("{{") ? s : escapeText(s)))
              .join("");
  for (const mark of node.marks ?? [])
    if (mark.type === "bold") text = `**${text}**`;
    else if (mark.type === "italic") text = `_${text}_`;
  return text;
}
function rich(node: RichText, indent = ""): string {
  if (["bulletList", "orderedList"].includes(node.type))
    return (node.content ?? [])
      .map((item, n) => {
        const prefix = node.type === "orderedList" ? `${n + 1}. ` : "- ";
        return (item.content ?? [])
          .map((child, index) =>
            ["bulletList", "orderedList"].includes(child.type)
              ? rich(child, indent + "  ")
              : `${indent}${index ? "  " : prefix}${rich(child)}`,
          )
          .join("\n");
      })
      .join("\n");
  if (node.type === "doc")
    return (node.content ?? []).map((n) => rich(n, indent)).join("\n\n");
  return inline(node);
}
export function templateBlockLabel(block: Block) {
  return block.type === "signature_block"
    ? `${block.role === "company" ? "Company" : "Client"} signature`
    : block.type === "pricing_table"
      ? "Pricing table"
      : block.type === "page_break"
        ? "Page break"
        : block.type === "contract"
          ? block.text || "Contract"
          : block.type === "image"
            ? block.alt || "Image"
            : block.content?.content?.some((n) => n.type === "horizontalRule")
              ? "Divider"
              : block.type === "heading"
                ? block.text || "Heading"
                : "Text/list";
}
export function templateBlockMarkdown(block: Block) {
  if (!["heading", "paragraph"].includes(block.type)) return "";
  if (block.content?.content?.some((n) => n.type === "horizontalRule"))
    return "";
  const value = block.content
    ? rich(block.content)
    : inline({ type: "text", text: block.text ?? "" });
  return block.type === "heading"
    ? `${"#".repeat(block.level ?? 1)} ${value}`
    : value;
}
/** IDs are opaque and scoped to this exact template revision; no block JSON is encoded. */
export function templateMarkdownBlocks(template: Template) {
  const counts = new Map<string, number>();
  for (const block of template.content)
    if (block.id) counts.set(block.id, (counts.get(block.id) ?? 0) + 1);
  const used = new Set<string>();
  return template.content.map((block, index) => {
    let id =
      block.id &&
      /^[A-Za-z0-9_-]{1,200}$/.test(block.id) &&
      counts.get(block.id) === 1
        ? block.id
        : `legacy-${sha256(`${template.id}:${index}:${canonical(block)}`).slice(0, 32)}`;
    while (used.has(id)) id = `legacy-${sha256(id + ":" + index).slice(0, 32)}`;
    used.add(id);
    return {
      id,
      block,
      markdown: templateBlockMarkdown(block),
      protected: protectedTypes.has(block.type),
    };
  });
}
export const templateMarkdown = (template: Template) =>
  templateMarkdownBlocks(template)
    .map(
      (row) =>
        `<!-- yeswell:block:${row.id} -->${row.markdown ? `\n${row.markdown}` : ""}`,
    )
    .join("\n\n");

export function replaceTemplateMarkdown(
  markdown: string,
  template: Template,
  removeBlocks: string[],
  parse: (markdown: string) => Block[],
): Block[] {
  const source = markdown.replace(/\r\n/g, "\n"),
    rows = templateMarkdownBlocks(template),
    known = new Map(rows.map((row) => [row.id, row]));
  check(
    new Set(removeBlocks).size === removeBlocks.length,
    "Duplicated id in remove_blocks; list each block id once",
  );
  for (const id of removeBlocks)
    check(
      known.has(id),
      `Unknown block id in remove_blocks: ${id}. Read get_template again.`,
    );
  const markers: { id: string; start: number; end: number }[] = [],
    seen = new Set<string>();
  for (const match of source.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) {
    const marker = markerPattern.exec(match[0]),
      start = match.index!,
      end = start + match[0].length;
    check(
      marker &&
        (start === 0 || source[start - 1] === "\n") &&
        (end === source.length || source[end] === "\n"),
      "Invalid or edited preservation marker. Keep <!-- yeswell:block:ID --> exactly as returned by get_template; other HTML/comments are not accepted.",
    );
    const id = marker[1];
    check(
      known.has(id),
      `Unknown or edited preservation marker: ${id}. Read get_template again; markers must belong to this template.`,
    );
    check(
      !seen.has(id),
      `Duplicated preservation marker: ${id}. Keep each marker exactly once.`,
    );
    check(
      !removeBlocks.includes(id),
      `Block ${id} is still marked in content and listed in remove_blocks. Omit its marker to remove it.`,
    );
    seen.add(id);
    markers.push({ id, start, end });
  }
  let cursor = 0;
  for (const marker of markers) {
    check(
      !/yeswell\s*:\s*block/i.test(source.slice(cursor, marker.start)),
      "Invalid or edited preservation marker; copy the exact marker from get_template",
    );
    cursor = marker.end;
  }
  check(
    !/yeswell\s*:\s*block/i.test(source.slice(cursor)),
    "Invalid or edited preservation marker; copy the exact marker from get_template",
  );
  for (const row of rows)
    check(
      !row.protected || seen.has(row.id) || removeBlocks.includes(row.id),
      `Refusing to remove ${templateBlockLabel(row.block)} (${row.id}). Keep its marker, or explicitly list this id in remove_blocks: ["${row.id}"].`,
    );
  const out: Block[] = parse(
    source.slice(0, markers[0]?.start ?? source.length),
  );
  markers.forEach((marker, index) => {
    const row = known.get(marker.id)!,
      body = source
        .slice(marker.end, markers[index + 1]?.start ?? source.length)
        .trim();
    if (!body || body === row.markdown.trim()) {
      out.push(structuredClone(row.block));
      return;
    }
    if (
      !["paragraph", "heading"].includes(row.block.type) ||
      row.block.content?.content?.some((n) => n.type === "horizontalRule")
    ) {
      out.push(structuredClone(row.block), ...parse(body));
      return;
    }
    const replacement = parse(body);
    if (!replacement.length)
      replacement.push(
        row.block.type === "heading"
          ? {
              ...row.block,
              text: "",
              content: { type: "doc", content: [{ type: "paragraph" }] },
            }
          : {
              type: "paragraph",
              content: { type: "doc", content: [{ type: "paragraph" }] },
            },
      );
    const first = { ...row.block, ...replacement[0] };
    if (row.block.id) first.id = row.block.id;
    if (first.type === "paragraph") {
      delete first.level;
      delete first.rich_heading;
      delete first.text;
    }
    out.push(first, ...replacement.slice(1));
  });
  return out;
}
