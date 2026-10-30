import { escape } from "./presentation";
import type { Audit, Signer, Version } from "./model";
import type { WorkspaceSettings } from "./workspace";
export function certificateTime(value: string | undefined, timezone = "UTC") {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
function signatureImage(s: Signer) {
  if (s.kind === "drawn") return s.image ?? "";
  const name = s.typed_name ?? s.name;
  return (
    "data:image/svg+xml;base64," +
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="80" viewBox="0 0 640 80"><text x="10" y="55" font-family="Georgia,serif" font-style="italic" font-size="36"${name.length > 32 ? ' textLength="620" lengthAdjust="spacingAndGlyphs"' : ""}>${escape(name)}</text></svg>`,
    ).toString("base64")
  );
}
/** A client-facing projection only. Never mutates or serializes raw audit metadata. */
export function completionCertificate(
  version: Version,
  signers: Signer[],
  events: Audit[],
  brand?: {
    settings?: WorkspaceSettings;
    document?: { id: string; title: string };
  },
) {
  const timezone = brand?.settings?.timezone ?? "UTC";
  const sent = events
    .filter(
      (e) =>
        e.type === "sent" &&
        (e.metadata.version === undefined ||
          e.metadata.version === version.version_no),
    )
    .at(-1);
  const viewed = events.find(
    (e) =>
      e.type === "viewed" &&
      Date.parse(e.created_at) >=
        Date.parse(sent?.created_at ?? version.created_at),
  );
  return `<style>
@page{size:Letter;margin:0}body{margin:0;color:#222;font:12px/1.4 "Instrument Sans",Arial,sans-serif}.certificate{box-sizing:border-box;width:816px;min-height:1056px;padding:48px 54px}.certificate *{box-sizing:border-box;overflow-wrap:anywhere}.certificate h1{font:600 28px/1.15 "Source Serif 4",Georgia,serif;margin:8px 0 18px}.certificate h2{font:600 16px/1.3 "Instrument Sans",Arial,sans-serif;margin:4px 0}.certificate p{margin:5px 0}.certificate .eyebrow{text-transform:uppercase;letter-spacing:.1em;color:#52655c;font-size:10px}.certificate .document{border-block:1px solid #d9ddd9;padding:14px 0;margin:16px 0}.certificate .hash{font:10px/1.5 "IBM Plex Mono",monospace;word-break:break-all;margin-top:6px}.certificate .signer{break-inside:avoid;border:1px solid #d9ddd9;border-radius:8px;margin:12px 0;padding:14px 18px}.certificate .role{text-transform:uppercase;font-size:10px;color:#536259}.certificate .signature{display:block;object-fit:contain;object-position:left;width:100%;max-width:300px;height:56px;margin:8px 0}.certificate .dates{display:grid;grid-template-columns:1fr 1fr;gap:18px;border-top:1px solid #d9ddd9;padding-top:14px;margin-top:18px}.certificate .delegate{border-top:1px solid #e5e7e4;padding-top:6px;font-size:11px}.certificate .pending{color:#596259}.certificate footer{margin-top:18px;font-size:10px;color:#596259}
</style><article class="certificate"><p class="eyebrow">${escape(brand?.settings?.company_name ?? "Proposal")}</p><h1>${signers.length ? "Certificate of completion" : "Proposal preview"}</h1>${signers.length < 2 ? '<p class="pending">' + (signers.length ? "Client signature recorded. Company countersignature pending." : "Unsigned preview. No completion has been recorded.") + "</p>" : ""}<section class="document"><h2>${escape(brand?.document?.title ?? version.variables_resolved["proposal.title"] ?? "Proposal")}</h2><p>Proposal ID: ${escape(brand?.document?.id ?? version.variables_resolved["proposal.id"] ?? "Not available")}</p><p>Version ${version.version_no}</p><p>Signed content SHA-256</p><p class="hash">${escape(version.content_hash)}</p></section>${signers.map((s) => `<section class="signer"><p class="role">${s.role === "client" ? "Client" : "Company"} signature</p><h2>${escape(s.name)}</h2><p>${escape(s.title)}${s.company ? ` · ${escape(s.company)}` : ""}</p><p>${escape(s.email)}</p><img class="signature" alt="${escape(s.name)} signature" src="${escape(signatureImage(s))}"><p><strong>Signed:</strong> ${escape(certificateTime(s.signed_at, timezone))}</p><p><strong>IP address:</strong> ${escape(s.ip || "Not recorded")}</p>${s.applied_by && s.applied_by.user_id !== s.signatory_user_id ? `<p class="delegate">Signed on behalf of ${escape(s.name)} by ${escape(s.applied_by.name)} [${escape(s.applied_by.email)}]</p><p>${escape(s.authorization_text ?? "")}</p>` : ""}</section>`).join("")}<section class="dates"><div><strong>Sent</strong><p>${escape(certificateTime(sent?.created_at ?? version.created_at, timezone))}</p></div><div><strong>First viewed</strong><p>${escape(certificateTime(viewed?.created_at, timezone))}</p></div></section><footer>Times shown in ${escape(timezone)}. The signed content hash identifies the frozen agreement. The full audit trail is retained by the workspace.</footer></article>`;
}
