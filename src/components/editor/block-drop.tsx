"use client";
import { useState, type DragEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
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
  insert: (blocks: Block[], at: number) => void,
  disabled = false,
) {
  const [line, setLine] = useState<{
    x: number;
    y: number;
    width: number;
    at: number;
  } | null>(null);
  const clear = () => setLine(null);
  const handlers = {
    onDragOver(event: DragEvent<HTMLElement>) {
      if (disabled || !event.dataTransfer.types.includes(mime)) return;
      const target = event.target as Element;
      if (!paper.current?.contains(target)) return;
      const frame = target.closest<HTMLElement>("[data-block-id]");
      const n = content.findIndex((b) =>
        frame?.dataset.blockId?.endsWith(b.id!),
      );
      const box = (frame ?? paper.current).getBoundingClientRect();
      const below = event.clientY > box.top + box.height / 2;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setLine({
        x: box.left,
        y: below ? box.bottom : box.top,
        width: box.width,
        at: n < 0 ? content.length : n + (below ? 1 : 0),
      });
    },
    onDragLeave(event: DragEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) clear();
    },
    onDragEnd: clear,
    onDrop(event: DragEvent<HTMLElement>) {
      if (!line || disabled || !event.dataTransfer.types.includes(mime)) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        const blocks = JSON.parse(event.dataTransfer.getData(mime));
        if (Array.isArray(blocks) && blocks.length > 0 && blocks.length <= 2)
          insert(blocks, line.at);
      } finally {
        clear();
      }
    },
  };
  return {
    handlers,
    line:
      line && typeof document !== "undefined"
        ? createPortal(
            <div
              data-editor-chrome
              className="block-drop-line"
              role="status"
              aria-label="Insert block here"
              style={{ left: line.x, top: line.y, width: line.width }}
            />,
            document.body,
          )
        : null,
  };
}
