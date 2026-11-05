import type { Block } from "./model";
import { withSignatureHeadings } from "./signature-headings";
/** A single history operation. Insertion never changes supported signer counts. */
export function insertAuthoringBlocks(
  content: Block[],
  incoming: Block[],
  at: number,
  replace = false,
): Block[] {
  const next = [...content];
  if (replace) next.splice(at, 1);
  for (const block of incoming) {
    if (
      block.type === "signature_block" &&
      [...next, ...incoming.filter((b) => b !== block)].some(
        (b) => b.type === "signature_block" && b.role === block.role,
      )
    )
      throw new Error(
        `Only one ${block.role} signature block is supported. Remove the existing block first.`,
      );
    if (
      block.type === "pricing_table" &&
      next.some((b) => b.type === "pricing_table")
    )
      throw new Error("Only one pricing table is supported.");
  }
  const blocks = incoming.map((b) => ({
    ...structuredClone(b),
    id: crypto.randomUUID(),
  }));
  next.splice(at, 0, ...blocks);
  return blocks
    .filter((b) => b.type === "signature_block")
    .reduce((result, b) => withSignatureHeadings(result, b.id), next);
}
