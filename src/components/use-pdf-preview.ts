"use client";
import { useEffect, useRef, useState } from "react";
import type { Proposal } from "../lib/model";
import type { PdfPreview } from "../lib/pdf-preview";
export const pdfPreviewInput = (p: Proposal) => ({
  revision: p.revision,
  title: p.title,
  content: p.content,
  quote: p.quote,
  valid_until: p.valid_until,
  style_overrides: p.style_overrides ?? {},
  template_style_overrides: p.template_style_overrides ?? {},
});
export function usePdfPreview(proposal: Proposal) {
  const latest = useRef(proposal);
  latest.current = proposal;
  const key = JSON.stringify(pdfPreviewInput(proposal));
  const [loaded, setLoaded] = useState<{
      key: string;
      data: PdfPreview;
    } | null>(null),
    [error, setError] = useState("");
  const currentKey = useRef(key);
  currentKey.current = key;
  const request = async (p: Proposal, signal?: AbortSignal) => {
    const input = pdfPreviewInput(p),
      requested = JSON.stringify(input);
    const res = await fetch(`/api/proposals/${p.id}/preview-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requested,
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "PDF preview unavailable");
    if (!data.layout || !data.pdf_base64)
      throw new Error("PDF preview unavailable");
    if (requested === currentKey.current) {
      setLoaded({ key: requested, data });
      setError("");
    }
    return data as PdfPreview;
  };
  useEffect(() => {
    const cancel = new AbortController();
    setError("");
    const timer = setTimeout(
      () =>
        request(latest.current, cancel.signal).catch((e) => {
          if (!cancel.signal.aborted) setError(e.message);
        }),
      1200,
    );
    return () => {
      clearTimeout(timer);
      cancel.abort();
    };
  }, [key, proposal.id]);
  return {
    data: loaded?.data ?? null,
    approximate: loaded?.key !== key,
    error,
    ensure: () =>
      loaded?.key === currentKey.current
        ? Promise.resolve(loaded.data)
        : request(latest.current),
  };
}
