"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { printContent, printCss, printPageCss } from "../lib/document-print";
import { applyPagePlan, plannedPrintCss } from "../lib/planned-print";
import { documentStyleCss } from "../lib/proposal-styles";
import { fontCss } from "../lib/proposal-fonts";
import { signatureHtml } from "../lib/signature-presentation";
import type { PublicProposal } from "./client-proposal";
/** Browser print uses the same immutable source positions as preview and sealing. */
export function ClientPrint({ proposal: p }: { proposal: PublicProposal }) {
  const ref = useRef<HTMLDivElement>(null),
    [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!ref.current || !p.pagination) return;
    const signatures = Object.fromEntries(
      p.signers.map((s) => [
        s.role,
        signatureHtml({
          role: s.role,
          name: s.name,
          title: s.title,
          company:
            s.company ||
            (s.role === "client" ? p.recipient.company : p.company.name),
          image: s.image,
          typedName: s.kind === "typed" ? s.typed_name || s.name : undefined,
          date: new Intl.DateTimeFormat("en-US", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: p.timezone,
          }).format(new Date(s.signed_at)),
        }),
      ]),
    );
    ref.current.innerHTML = printContent({
      title: p.title,
      company: p.recipient.company,
      sender: p.contact.name,
      validity: p.variables["proposal.valid_until"] ?? "",
      pagination: p.pagination,
      content: p.content,
      quote: p.quote as import("../lib/model").Quote,
      variables: p.variables,
      currency: p.currency,
      cents: p.money_cents,
      currentLayout: true,
      planned: true,
      styles: p.resolved_styles,
      workspace: p.company.name,
      signatory: {
        name: p.company.signatory_name ?? "",
        title: p.company.signatory_title ?? "",
      },
      signatureBlocks: signatures,
    });
    try {
      applyPagePlan(ref.current.querySelector(".print-root")!, p.pagination);
    } catch {
      // A print-only failure must never prevent reading or signing.
      ref.current.dataset.printError = "true";
    }
  }, [p, mounted]);
  if (!mounted || !p.pagination) return null;
  return createPortal(
    <div className="client-print-projection">
      <style>{`.client-print-projection{display:none}@media print{body>*:not(.client-print-projection){display:none!important}.client-print-projection{display:block}${printCss}${printPageCss(p.resolved_styles)}${plannedPrintCss}${documentStyleCss(p.resolved_styles, p.company.accent_colour)}${fontCss({ proposal_fonts: p.proposal_fonts })}}`}</style>
      <div ref={ref} />
    </div>,
    document.body,
  );
}
