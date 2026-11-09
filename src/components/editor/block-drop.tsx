"use client";
import { type DragEvent, type RefObject } from "react";
import { useDropIndicator } from "./drop-target";
import type { BlockDestination } from "../../lib/columns";
import type { Block } from "../../lib/model";
const mime = "application/x-yeswell-block";
export function defaultBlockInsertion(
  paper: HTMLElement | null,
  content: Block[],
  selected: string | null,
  assignments: { block: string; page: number }[] = [],
) {
  const selectedAt = content.findIndex(
    (b) =>
      selected === `block-${b.id}` ||
      selected === `template-${b.id}` ||
      b.clauses?.some(
        (c) =>
          selected === `clause-${c.id}` ||
          selected === `template-clause-${c.id}`,
      ),
  );
  if (selectedAt >= 0) return selectedAt + 1;
  const region = paper
    ?.closest(".editor-document-region,.studio-template-main")
    ?.getBoundingClientRect();
  const frames = [
    ...(paper?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []),
  ].filter((el) => !el.closest("[data-page-measurement]"));
  const visible = frames.find((el) => {
    const r = el.getBoundingClientRect();
    return (
      r.bottom > (region?.top ?? 0) &&
      r.top < Math.min(innerHeight, region?.bottom ?? innerHeight)
    );
  });
  const start = content.findIndex((b) =>
    visible?.dataset.blockId?.endsWith(b.id!),
  );
  if (start < 0) return content.length;
  const page = assignments.find((a) => a.block === content[start].id)?.page;
  let end = start + 1;
  while (
    end < content.length &&
    content[end].type !== "page_break" &&
    content[end].type !== "heading" &&
    (!page ||
      assignments.find((a) => a.block === content[end].id)?.page === page)
  )
    end++;
  return end;
}
export function useBlockDrop(
  content: Block[],
  paper: RefObject<HTMLElement | null>,
  insert: (blocks: Block[], target: BlockDestination) => void,
  disabled = false,
) {
  const indicator = useDropIndicator(content, paper);
  const clear = indicator.clear;
  const handlers = {
    onDragOver(event: DragEvent<HTMLElement>) {
      if (disabled || !event.dataTransfer.types.includes(mime)) {
        clear();
        return;
      }
      const target = indicator.show(event.clientX, event.clientY);
      if (!target) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) clear();
    },
    onDragEnd: clear,
    onDrop(event: DragEvent<HTMLElement>) {
      if (!event.dataTransfer.types.includes(mime)) return;
      event.preventDefault();
      event.stopPropagation();
      const target = indicator.resolve(event.clientX, event.clientY);
      if (!target || disabled || !event.dataTransfer.types.includes(mime)) {
        clear();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        const blocks = JSON.parse(event.dataTransfer.getData(mime));
        if (Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 300)
          insert(blocks, target);
      } finally {
        clear();
      }
    },
  };
  return { handlers, line: indicator.line };
}
