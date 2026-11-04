"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  clientDocumentCss,
  paginateClientDocument,
} from "./client-page-document";
import type { PublicProposal } from "./client-proposal";
/** Browser print uses the same immutable source positions as preview and sealing. */
export function ClientPrint({
  proposal: p,
  logo,
}: {
  proposal: PublicProposal;
  logo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!ref.current || !p.pagination) return;
    try {
      paginateClientDocument(ref.current, p, logo);
    } catch {
      // A print-only failure must never prevent reading or signing.
      ref.current.dataset.printError = "true";
    }
  }, [p, mounted, logo]);
  if (!mounted || !p.pagination) return null;
  return createPortal(
    <div className="client-print-projection">
      <style>{`.client-print-projection{display:none}@media print{body>*:not(.client-print-projection){display:none!important}.client-print-projection{display:block}${clientDocumentCss(p)}}`}</style>
      <div ref={ref} className="client-canonical" />
    </div>,
    document.body,
  );
}
