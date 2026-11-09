import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { documentBlocks, transformBlocks } from "./columns";
import { duplicateBlock } from "./editor-document";
import type { Block, SavedBlock } from "./model";

/** Canonical author content only: identities, review state and link stamps aren't edits. */
export function linkedContent(block: Block): unknown {
  const clean = (x: any): any =>
    Array.isArray(x)
      ? x.map(clean)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .filter(
                (k) =>
                  x[k] !== undefined &&
                  k !== "id" &&
                  k !== "ai_review" &&
                  !k.startsWith("saved_block_"),
              )
              .map((k) => [k, clean(x[k])]),
          )
        : x;
  return clean({
    ...block,
    ...(block.type === "heading" ? { level: block.level ?? 1 } : {}),
  });
}
/** The same SHA-256 fingerprint in the browser and on the server. */
export const linkedHash = (block: Block) =>
  bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(linkedContent(block)))),
  );
export const savedBlocks = (row: SavedBlock): Block[] =>
  row.type === "group" ? (row.blocks ?? []) : [row.block];
export const reusableBlock = (b: Block) =>
  !["pricing_table", "signature_block", "contract"].includes(b.type);
export function excludedBlocksMessage(blocks: Block[], source = "proposal") {
  const labels = [
    ["pricing_table", "pricing table"],
    ["signature_block", "signatures"],
    ["contract", "contract"],
  ]
    .filter(([type]) => blocks.some((b) => b.type === type))
    .map(([, label]) => label);
  if (!labels.length) return "";
  const subject =
    labels.length < 3
      ? labels.join(" and ")
      : `${labels[0]}, ${labels[1]} and ${labels[2]}`;
  return `The ${subject} ${labels.length === 1 && labels[0] !== "signatures" ? "stays" : "stay"} in the ${source}.`;
}
export function withoutBlockLink(b: Block): Block {
  return Object.fromEntries(
    Object.entries(b).filter(([k]) => !k.startsWith("saved_block_")),
  ) as Block;
}
export function stampSavedBlocks(
  row: SavedBlock,
  instance = crypto.randomUUID(),
  ids?: string[],
) {
  const blocks = savedBlocks(row);
  return blocks.map((block, position) => ({
    ...(block.columns
      ? duplicateBlock(withoutBlockLink(block))
      : structuredClone(withoutBlockLink(block))),
    id: ids?.[position] ?? crypto.randomUUID(),
    saved_block_id: row.id,
    saved_block_version: row.version ?? 1,
    saved_block_instance: instance,
    saved_block_position: position,
    saved_block_length: blocks.length,
    saved_block_hash: linkedHash(block),
  }));
}
export function linkedInstances(content: Block[], id: string) {
  const instances = new Map<string, Block[]>();
  const containing = new Map<string, string>();
  for (const block of content)
    for (const column of block.columns?.items ?? [])
      for (const child of column.content) containing.set(child.id!, column.id);
  for (const b of documentBlocks(content))
    if (b.saved_block_id === id) {
      const key = b.saved_block_instance ?? b.id!;
      instances.set(key, [...(instances.get(key) ?? []), b]);
    }
  return [...instances.entries()].map(([key, blocks]) => ({
    key,
    blocks,
    edited:
      new Set(blocks.map((b) => containing.get(b.id!))).size > 1 ||
      blocks.length !== (blocks[0].saved_block_length ?? 1) ||
      blocks.some(
        (b, i) =>
          b.saved_block_position !== i ||
          !b.saved_block_hash ||
          linkedHash(b) !== b.saved_block_hash,
      ),
  }));
}
/** One occurrence is replaced whole, retaining existing IDs where possible. */
export function replaceLinkedBlocks(
  content: Block[],
  row: SavedBlock,
  force = false,
  onlyInstance?: string,
) {
  let next = [...content];
  for (const instance of linkedInstances(content, row.id)) {
    if (
      (onlyInstance && instance.key !== onlyInstance) ||
      (!force && instance.edited)
    )
      continue;
    const replacement = stampSavedBlocks(
      row,
      instance.key,
      instance.blocks.map((b) => b.id!),
    );
    const ids = instance.blocks.map((block) => block.id);
    // An edited linked group can be dispersed across containers. Explicitly
    // restoring it keeps the first container and restores its source order.
    const parents = new Map<string, string>();
    for (const block of next)
      for (const column of block.columns?.items ?? [])
        for (const child of column.content) parents.set(child.id!, column.id);
    const dispersed = new Set(ids.map((id) => parents.get(id!))).size > 1;
    if (
      parents.get(ids[0]!) &&
      replacement.some(
        (block) =>
          !["heading", "paragraph", "image", "variable"].includes(block.type),
      )
    ) {
      if (force)
        throw new Error(
          "The latest saved block contains content that can't go inside a column. Move the linked block outside columns first.",
        );
      continue;
    }
    next = transformBlocks(next, (b) => {
      const at = ids.indexOf(b.id);
      if (at < 0) return [b];
      if (dispersed) return at === 0 ? replacement : [];
      return at === ids.length - 1
        ? replacement.slice(at)
        : replacement[at]
          ? [replacement[at]]
          : [];
    });
  }
  return next;
}
