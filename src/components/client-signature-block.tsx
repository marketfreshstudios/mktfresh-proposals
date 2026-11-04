"use client";
import { signatureHtml } from "../lib/signature-presentation";
import { readableDate } from "../lib/validity";
import type { PublicProposal } from "./client-proposal";
export function ClientSignatureBlock({
  proposal: p,
  role,
}: {
  proposal: PublicProposal;
  role: "client" | "company";
}) {
  const signer = p.signers.find((s) => s.role === role),
    name =
      signer?.name ??
      (role === "client"
        ? p.recipient.name
        : p.company.signatory_name ||
          p.variables["company.owner"] ||
          p.company.name);
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: signatureHtml({
          role,
          name,
          company:
            role === "client"
              ? p.variables["client.company"] || ""
              : signer?.company || p.company.name,
          title:
            signer?.title ||
            (role === "client" ? p.recipient.title : p.company.signatory_title),
          date: signer ? readableDate(signer.signed_at, p.timezone) : undefined,
          image: signer?.kind === "drawn" ? signer.image : undefined,
          typedName:
            signer?.kind === "typed"
              ? signer.typed_name || signer.name
              : undefined,
        }),
      }}
    />
  );
}
