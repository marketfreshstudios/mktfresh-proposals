"use client";
import { printView, viewKey } from "../lib/print-view";
import { useRef } from "react";
import { usePrintPreview } from "./use-print-preview";
import type { Proposal } from "../lib/model";
import type { PdfPreview } from "../lib/pdf-preview";
export const pdfPreviewInput = (p: Proposal) => ({
  revision: p.revision,
  pagination: p.pagination,
  cover: p.cover,
  title: p.title,
  content: p.content,
  quote: p.quote,
  valid_until: p.valid_until,
  style_overrides: p.style_overrides ?? {},
  template_style_overrides: p.template_style_overrides ?? {},
});
const visualKey = (p: Proposal) =>
  viewKey({
    ...pdfPreviewInput(p),
    ...printView(p.content, p.quote),
    revision: undefined,
    id: p.id,
    client: p.client,
    settings: p.workspace_settings,
    sender: p.sender,
    currency: p.currency,
    created_at: p.created_at,
  });
export function usePdfPreview(proposal: Proposal) {
  const latest = useRef(proposal);
  latest.current = proposal;
  const key = visualKey(proposal);
  return usePrintPreview(
    key,
    async (signal) => {
      const p = latest.current,
        input = pdfPreviewInput(p);
      const send = () =>
        fetch(`/api/proposals/${p.id}/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal,
        });
      let res = await send();
      // An autosave may finish between taking the snapshot and the revision check.
      // Revalidate the revision only; never persist or replace the local draft.
      if (res.status === 409 && !signal?.aborted) {
        const response = await fetch(`/api/proposals/${p.id}`, { signal });
        if (response.ok) {
          const saved = await response.json();
          if (!saved.signers.length && saved.revision > input.revision) {
            input.revision = saved.revision;
            res = await send();
          }
        }
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "PDF preview unavailable");
      if (!data.layout || !data.pdf_base64)
        throw new Error("PDF preview unavailable");
      return data as PdfPreview;
    },
    false,
  );
}
