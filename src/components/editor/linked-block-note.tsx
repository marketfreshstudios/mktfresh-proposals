"use client";
import { useState } from "react";
import { transformBlocks } from "../../lib/columns";
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
  const [error, setError] = useState("");
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
      {error && (
        <span role="alert" className="danger">
          {error}
        </span>
      )}
      {instance.edited && (
        <button
          type="button"
          onClick={() => {
            setError("");
            try {
              onChange(replaceLinkedBlocks(content, row, true, instance.key));
            } catch (error) {
              setError((error as Error).message);
            }
          }}
        >
          Restore linked version
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          onChange(
            transformBlocks(content, (b) => [
              instance.blocks.some((old) => old.id === b.id)
                ? withoutBlockLink(b)
                : b,
            ]),
          )
        }
      >
        Unlink
      </button>
    </div>
  );
}
