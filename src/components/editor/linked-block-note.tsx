"use client";
import type { Block, SavedBlock } from "../../lib/model";
import {
  linkedInstances,
  replaceLinkedBlocks,
  withoutBlockLink,
} from "../../lib/linked-blocks";
export function LinkedBlockNote({
  block,
  content,
  library,
  onChange,
}: {
  block: Block;
  content: Block[];
  library: SavedBlock[];
  onChange: (content: Block[]) => void;
}) {
  if (!block.saved_block_id) return null;
  const row = library.find((r) => r.id === block.saved_block_id),
    instance = linkedInstances(content, block.saved_block_id).find((i) =>
      i.blocks.includes(block),
    );
  if (!row || !instance || instance.blocks[0] !== block) return null;
  return (
    <div
      data-editor-chrome
      data-preserve-block-selection
      className="linked-block-note"
    >
      <span>{instance.edited ? "Edited here" : `Linked · ${row.name}`}</span>
      {instance.edited && (
        <button
          type="button"
          onClick={() =>
            onChange(replaceLinkedBlocks(content, row, true, instance.key))
          }
        >
          Restore linked version
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          onChange(
            content.map((b) =>
              instance.blocks.includes(b) ? withoutBlockLink(b) : b,
            ),
          )
        }
      >
        Unlink
      </button>
    </div>
  );
}
