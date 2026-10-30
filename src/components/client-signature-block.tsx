"use client";
import { date } from "./ui";
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
    <section
      className="client-signature"
      aria-label={`${role === "client" ? "Client" : "Company"} signature`}
    >
      <h3>{role === "client" ? "Client" : "Company"} signature</h3>
      <strong>{name}</strong>
      {(signer?.title || (role === "company" && p.company.signatory_title)) && (
        <p>
          {signer?.title || p.company.signatory_title}
          {role === "company" ? ` · ${signer?.company || p.company.name}` : ""}
        </p>
      )}
      {signer ? (
        <>
          {signer.kind === "drawn" && signer.image ? (
            <img src={signer.image} alt={`${name}’s signature`} />
          ) : (
            <p className="typed-signature">
              {signer.typed_name ?? signer.name}
            </p>
          )}
          <small>Signed {date(signer.signed_at)}</small>
        </>
      ) : (
        <p className="muted">Awaiting signature</p>
      )}
    </section>
  );
}
