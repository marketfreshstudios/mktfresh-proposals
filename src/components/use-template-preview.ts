"use client";
import { staffErrorMessage } from "./staff-sign-in";
import { printView, viewKey } from "../lib/print-view";
import { usePrintPreview } from "./use-print-preview";
import type { Template, Item } from "../lib/model";
import { templateDefaultQuote } from "../lib/template-quote";
import type { PdfPreview } from "../lib/pdf-preview";
import type { WorkspaceSettings } from "../lib/workspace";
export function useTemplatePreview(
  template: Template | null,
  catalog: Item[],
  enabled: boolean,
  settings?: WorkspaceSettings | null,
) {
  const input = template
    ? {
        id: template.id,
        pagination: template.pagination,
        content: template.content,
        quote: templateDefaultQuote(template, catalog).quote,
        header_footer: template.header_footer,
        cover: template.cover,
        style_overrides: template.style_overrides ?? {},
      }
    : null;
  const key = viewKey(
    input
      ? { ...input, ...printView(input.content, input.quote), settings }
      : null,
  );
  const preview = usePrintPreview(
    key,
    async (signal) => {
      const r = await fetch("/api/document-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          staffErrorMessage(r.status, data, "Template layout unavailable"),
        );
      if (!data.layout) throw new Error("Template layout unavailable");
      return data as PdfPreview;
    },
    false,
  );
  return {
    ...preview,
    quote: input?.quote ?? [],
  };
}
