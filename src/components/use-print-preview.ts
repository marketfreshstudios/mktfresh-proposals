"use client";
import { useEffect, useRef, useState } from "react";
import type { PdfPreview } from "../lib/pdf-preview";
/** Per-editor, session-only content cache. Keep 100 layouts, but only eight PDF byte arrays. */
export function usePrintPreview(
  key: string,
  fetchPreview: (signal?: AbortSignal) => Promise<PdfPreview>,
  enabled = true,
) {
  const cache = useRef(new Map<string, PdfPreview>()),
    hashes = useRef(new Map<string, string>()),
    flights = useRef(new Map<string, Promise<PdfPreview>>()),
    current = useRef({ key, generation: 0, fetchPreview });
  if (current.current.key !== key) current.current.generation++;
  current.current.key = key;
  current.current.fetchPreview = fetchPreview;
  const [loaded, setLoaded] = useState<{
      key: string;
      data: PdfPreview;
    } | null>(null),
    [error, setError] = useState("");
  const request = (signal?: AbortSignal) => {
    const {
      key: requested,
      generation,
      fetchPreview: fetcher,
    } = current.current;
    const existing = flights.current.get(requested);
    if (existing) return existing;
    const promise = fetcher(signal)
      .then((data) => {
        if (!data.layout || !data.pdf_base64)
          throw new Error("PDF layout unavailable");
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        hashes.current.set(requested, data.fingerprint);
        while (hashes.current.size > 200)
          hashes.current.delete(hashes.current.keys().next().value!);
        cache.current.delete(data.fingerprint);
        cache.current.set(data.fingerprint, data);
        while (cache.current.size > 100)
          cache.current.delete(cache.current.keys().next().value!);
        let pdfs = 0;
        for (const [id, entry] of [...cache.current].reverse()) {
          if (entry.pdf_base64 && ++pdfs > 8)
            cache.current.set(id, { ...entry, pdf_base64: "" });
        }
        if (
          requested === current.current.key &&
          generation === current.current.generation
        ) {
          setLoaded({ key: requested, data });
          setError("");
        }
        return data;
      })
      .finally(() => {
        if (flights.current.get(requested) === promise)
          flights.current.delete(requested);
      });
    flights.current.set(requested, promise);
    return promise;
  };
  useEffect(() => {
    if (!enabled || cache.current.has(hashes.current.get(key)!)) return;
    const abort = new AbortController();
    setError("");
    const timer = setTimeout(
      () =>
        request(abort.signal).catch((e) => {
          if (!abort.signal.aborted && current.current.key === key)
            setError(e.message);
        }),
      400,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
      flights.current.delete(key);
    };
  }, [key, enabled]);
  const cached = cache.current.get(hashes.current.get(key)!);
  return {
    data: cached ?? loaded?.data ?? null,
    visualKey: key,
    approximate: !cached,
    error,
    ensure: () => (cached?.pdf_base64 ? Promise.resolve(cached) : request()),
  };
}
