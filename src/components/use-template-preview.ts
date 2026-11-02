"use client";
import { printView, viewKey } from "../lib/print-view";
import { useEffect, useState } from "react";
import type { Template, Item } from "../lib/model";
import { templateDefaultQuote } from "../lib/template-quote";
import type { PdfPreview } from "../lib/pdf-preview";
export function useTemplatePreview(
  template: Template | null,
  catalog: Item[],
  enabled: boolean,
) {
  const input = template
    ? {
        id: template.id,
        content: template.content,
        quote: templateDefaultQuote(template, catalog).quote,
        style_overrides: template.style_overrides ?? {},
      }
    : null;
  const key = viewKey(
      input ? { ...input, ...printView(input.content, input.quote) } : null,
    ),
    [loaded, setLoaded] = useState<{ key: string; data: PdfPreview } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled || !input) return;
    const abort = new AbortController(),
      timer = setTimeout(() => {
        fetch("/api/document-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: abort.signal,
        })
          .then(async (r) => {
            const data = await r.json();
            if (!r.ok)
              throw new Error(data.error ?? "Template layout unavailable");
            if (!data.layout) throw new Error("Template layout unavailable");
            if (!abort.signal.aborted) {
              setLoaded({ key, data });
              setError("");
            }
          })
          .catch((e) => {
            if (!abort.signal.aborted) setError(e.message);
          });
      }, 1200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [key, enabled]);
  return {
    data: loaded?.data,
    visualKey: key,
    approximate: loaded?.key !== key,
    error,
    quote: input?.quote ?? [],
  };
}
