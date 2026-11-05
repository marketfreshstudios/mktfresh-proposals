import type { Block } from "./model";
/** Authoring default only. Call once per draft/template, or on insertion, never on frozen versions. */
export function withSignatureHeadings(blocks: Block[]): Block[] {
  const ids = new Set(blocks.map((b) => b.id));
  return blocks.flatMap((b, n) => {
    if (
      b.type !== "signature_block" ||
      ["heading", "signature_block"].includes(blocks[n - 1]?.type)
    )
      return [b];
    let id = `${b.id ?? `signature-${n}`}-heading`;
    while (ids.has(id)) id += "-1";
    ids.add(id);
    return [
      { id, type: "heading" as const, level: 1 as const, text: "Signatures" },
      b,
    ];
  });
}
