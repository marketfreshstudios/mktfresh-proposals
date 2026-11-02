"use client";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  printContent,
  printCss,
  paginatePrintDocument,
  type PageBoundary,
} from "../lib/document-print";
import { curatedFonts, curatedFontFaces, fontCss } from "../lib/proposal-fonts";
import {
  resolveStyles,
  documentStyleCss,
  styleFontFaces,
} from "../lib/proposal-styles";
import { variables } from "../lib/presentation";
import type { Proposal } from "../lib/model";
import type { WorkspaceSettings } from "../lib/workspace";
export function DocumentPagination({
  proposal,
  settings,
  paper,
}: {
  proposal: Proposal;
  settings?: WorkspaceSettings | null;
  paper: RefObject<HTMLElement | null>;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    [source, setSource] = useState(""),
    [layout, setLayout] = useState<{
      pages: number;
      boundaries: PageBoundary[];
    } | null>(null),
    [markers, setMarkers] = useState<
      { page: number; y: number; explicit: boolean }[]
    >([]),
    [failure, setFailure] = useState<string | null>(null);
  const markup = useMemo(() => {
    try {
      const p = {
          ...proposal,
          workspace_settings: settings ?? proposal.workspace_settings,
        },
        map = variables(p);
      return `<!doctype html><html><head><style>${printCss}${curatedFontFaces(curatedFonts)}${fontCss(p.workspace_settings)}${styleFontFaces(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides))}${documentStyleCss(resolveStyles(p.workspace_settings, p.template_style_overrides, p.style_overrides), p.workspace_settings?.accent_colour)}</style></head><body class="proposal-typography">${printContent({ title: p.title, company: p.client.company, sender: map["sender.name"], validity: map["proposal.valid_until"], content: p.content, quote: p.quote, variables: map, currency: p.currency, workspace: p.workspace_settings?.company_name, signatory: p.workspace_settings?.company_signatory, logo: p.workspace_settings?.logo ? `/api/proposals/${p.id}/preview-logo` : undefined, cents: p.workspace_settings?.money?.cents })}</body></html>`;
    } catch {
      return "";
    }
  }, [
    proposal.title,
    proposal.content,
    proposal.quote,
    proposal.valid_until,
    settings,
    proposal.workspace_settings,
    proposal.style_overrides,
    proposal.template_style_overrides,
  ]);
  const currentMarkup = useRef(markup);
  currentMarkup.current = markup;
  useEffect(() => {
    if (!markup) {
      setSource("");
      setLayout(null);
      setMarkers([]);
      setFailure("Check unresolved fields and document content.");
      return;
    }
    const timer = setTimeout(() => setSource(markup), 450);
    return () => clearTimeout(timer);
  }, [markup]);
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
            let y = el.getBoundingClientRect().top - bounds.top;
            const unit = b.unit
              ? el.querySelector<HTMLElement>(
                  `[data-print-unit="${CSS.escape(b.unit)}"]`,
                )
              : null;
            if (unit) y = unit.getBoundingClientRect().top - bounds.top;
            else if (b.offset) {
              const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
              );
              let node: Node | null,
                remaining = b.offset;
              while ((node = walker.nextNode())) {
                if (remaining <= (node.textContent?.length ?? 0)) {
                  const r = document.createRange();
                  r.setStart(
                    node,
                    Math.min(remaining, node.textContent!.length),
                  );
                  r.setEnd(
                    node,
                    Math.min(remaining + 1, node.textContent!.length),
                  );
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
                remaining -= node.textContent?.length ?? 0;
              }
            }
            return { page: b.page, y: Math.max(0, y), explicit: b.explicit };
          })
          .filter((m): m is NonNullable<typeof m> => !!m),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [layout, proposal.content, paper]);
  return (
    <>
      <iframe
        ref={frame}
        title="PDF pagination measurement"
        className="print-measure"
        tabIndex={-1}
        aria-hidden="true"
        sandbox="allow-same-origin"
        srcDoc={source || undefined}
        onLoad={async () => {
          const doc = frame.current?.contentDocument;
          if (
            !doc?.querySelector(".print-root") ||
            source !== currentMarkup.current
          )
            return;
          try {
            await doc.fonts.ready;
            await Promise.all(
              Array.from(doc.images).map((img) => img.decode().catch(() => {})),
            );
            if (
              doc !== frame.current?.contentDocument ||
              source !== currentMarkup.current
            )
              return;
            const result = paginatePrintDocument(
              doc.querySelector<HTMLElement>(".print-root")!,
            );
            setLayout(result);
            setFailure(null);
          } catch (error) {
            setLayout(null);
            setMarkers([]);
            setFailure(
              error instanceof Error && error.message.includes("too tall")
                ? error.message
                : "Check fields and document content, then try again.",
            );
          }
        }}
      />
      <div className="page-guides" aria-hidden="true">
        {markers.map((m) => (
          <div
            key={m.page}
            className={`page-guide ${m.explicit ? "explicit" : ""}`}
            style={{ top: m.y }}
          >
            <span>
              {m.explicit ? "Page break · " : ""}Page {m.page}
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
            ? `${layout.pages} document ${layout.pages === 1 ? "page" : "pages"} + completion certificate after signing`
            : "Measuring PDF pages…"}
      </output>
    </>
  );
}
