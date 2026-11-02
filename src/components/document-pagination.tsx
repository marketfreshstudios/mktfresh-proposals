"use client";
import { useEffect, useState, type RefObject } from "react";
import type { usePdfPreview } from "./use-pdf-preview";
import type { Proposal } from "../lib/model";
import type { WorkspaceSettings } from "../lib/workspace";
export function DocumentPagination({
  proposal,
  settings,
  paper,
  preview,
}: {
  proposal: Proposal;
  settings?: WorkspaceSettings | null;
  paper: RefObject<HTMLElement | null>;
  preview: ReturnType<typeof usePdfPreview>;
}) {
  const layout = preview.data?.layout ?? null;
  const [markers, setMarkers] = useState<
    {
      page: number;
      y: number;
      explicit: boolean;
      block: string;
      offset: number;
      unit?: string;
      part?: string;
      part_offset?: number;
      start_text?: string;
    }[]
  >([]);
  const failure = preview.error;
  useEffect(() => {
    if (!layout || !paper.current) return;
    const root = paper.current;
    const update = () => {
      const bounds = root.getBoundingClientRect();
      setMarkers(
        layout.boundaries
          .map((b) => {
            const el =
              b.block === "cover"
                ? root.querySelector<HTMLElement>(".document-cover")
                : root.querySelector<HTMLElement>(
                    `[data-block-id="block-${CSS.escape(b.block)}"] .block-content`,
                  );
            if (!el || !el.getClientRects().length) return null;
            const semantic = b.part
              ? el.querySelector<HTMLElement>(
                  `[data-block-id="clause-${CSS.escape(b.part)}"] > .block-content`,
                )
              : null;
            const target = semantic ?? el;
            let y = el.getBoundingClientRect().top - bounds.top;
            const unit = b.unit
              ? el.querySelector<HTMLElement>(
                  `[data-print-unit="${CSS.escape(b.unit)}"]`,
                )
              : null;
            if (unit) y = unit.getBoundingClientRect().top - bounds.top;
            else if (b.offset || b.part) {
              const walker = document.createTreeWalker(
                target,
                NodeFilter.SHOW_TEXT,
                {
                  acceptNode: (node) =>
                    node.parentElement?.closest(
                      ".block-tools,.drag-handle,textarea",
                    )
                      ? NodeFilter.FILTER_REJECT
                      : NodeFilter.FILTER_ACCEPT,
                },
              );
              let node: Node | null,
                remaining = b.part ? (b.part_offset ?? 0) : b.offset;
              while ((node = walker.nextNode())) {
                const raw = node.textContent ?? "";
                // These renderer paths emit <br> rather than newline text nodes.
                // Map source character offsets without rewriting the document.
                const withoutBreaks =
                  !!(b.part && node.parentElement?.closest("p")) ||
                  !!node.parentElement?.closest(
                    '[data-field="client.address"]',
                  );
                const length = withoutBreaks
                  ? raw.replace(/\n/g, "").length
                  : raw.length;
                if (!length) continue;
                if (remaining <= length) {
                  let position = remaining;
                  if (withoutBreaks) {
                    let count = 0;
                    position = raw.length;
                    for (let i = 0; i < raw.length; i++) {
                      if (raw[i] === "\n") continue;
                      if (count === remaining) {
                        position = i;
                        break;
                      }
                      count++;
                    }
                  }
                  const r = document.createRange();
                  r.setStart(node, Math.min(position, raw.length));
                  r.setEnd(node, Math.min(position + 1, raw.length));
                  const rect = r.getBoundingClientRect();
                  const folded = node.parentElement
                    ?.closest("details:not([open])")
                    ?.querySelector("summary");
                  y =
                    (rect.height
                      ? rect.top
                      : (folded?.getBoundingClientRect().top ??
                        el.getBoundingClientRect().bottom)) - bounds.top;
                  break;
                }
                remaining -= length;
              }
            }
            return {
              ...b,
              y: Math.max(
                0,
                y / (root.getBoundingClientRect().width / root.offsetWidth),
              ),
            };
          })
          .filter((m): m is NonNullable<typeof m> => !!m),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [
    layout,
    proposal.content,
    proposal.quote,
    proposal.style_overrides,
    proposal.template_style_overrides,
    proposal.workspace_settings,
    paper,
  ]);
  return (
    <>
      <div className="page-guides" aria-hidden="true">
        {markers.map((m) => (
          <div
            key={m.page}
            className={`page-guide ${m.explicit ? "explicit" : ""}`}
            data-page={m.page}
            data-block={m.block}
            data-offset={m.offset}
            data-part={m.part}
            data-part-offset={m.part_offset}
            data-line-start={m.start_text}
            data-unit={m.unit}
            data-approximate={preview.approximate}
            style={{ top: m.y }}
          >
            <span>
              {m.explicit ? "Page break · " : ""}Page {m.page}
              {preview.approximate ? " · approximate" : ""}
            </span>
          </div>
        ))}
      </div>
      <output
        className="document-page-count"
        data-page-count={layout ? layout.pages + 1 : undefined}
        data-document-pages={layout?.pages}
      >
        {failure
          ? `Page preview unavailable — ${failure}`
          : layout
            ? `${layout.pages} document ${layout.pages === 1 ? "page" : "pages"}${preview.approximate ? " · approximate" : ""} + completion certificate after signing`
            : "Page markers approximate · computing PDF layout…"}
      </output>
    </>
  );
}
