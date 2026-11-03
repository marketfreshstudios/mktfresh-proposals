import type { Block } from "./model";
import type { PagePlan } from "./page-plan";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function signaturePairStarts(content: Block[], plan?: PagePlan) {
  const starts = new Set<number>();
  for (let i = 0; i < content.length - 1; i++) {
    const a = content[i],
      b = content[i + 1];
    if (
      a.type === "signature_block" &&
      b.type === "signature_block" &&
      (a.role ?? "client") !== (b.role ?? "client") &&
      !plan?.starts.some((s) => s.block === b.id)
    ) {
      starts.add(i);
      i++;
    }
  }
  return starts;
}
export type SignaturePresentation = {
  role: "client" | "company";
  name: string;
  company: string;
  title?: string;
  date?: string;
  image?: string;
  typedName?: string;
};
export function signatureHtml(s: SignaturePresentation) {
  return `<section class="document-signature" aria-label="${s.role === "client" ? "Client" : "Company"} signature"><div class="signature-role">${s.role === "client" ? "CLIENT" : "COMPANY"}</div><div class="signature-area">${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.name)}’s signature">` : s.typedName ? `<span class="typed-signature">${esc(s.typedName)}</span>` : ""}</div><strong class="signature-name">${esc(s.name)}</strong>${s.title ? `<div class="signature-title">${esc(s.title)}</div>` : ""}<div class="signature-date">${esc(s.company)}${s.company ? " · " : ""}${esc(s.date || "Date signed")}</div></section>`;
}
export const signatureCss = `
.proposal-typography.proposal-typography .signature-pair{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;break-inside:avoid;page-break-inside:avoid;margin-top:var(--block-space-before,16px)}
.proposal-typography.proposal-typography .signature-pair>.block-sortable,.proposal-typography.proposal-typography .signature-pair>[data-document-block],.print-root[data-planned] .signature-pair>.print-source{margin-top:0;padding-top:0;min-width:0}
.proposal-typography.proposal-typography .signature-pair>:has([aria-label="Company signature"]){order:1}
.proposal-typography.proposal-typography .document-signature{padding:0;border:0;background:none;break-inside:avoid;page-break-inside:avoid}
.proposal-typography.proposal-typography .signature-role{font:600 11px/1.5 var(--font-ui,"Instrument Sans",sans-serif);letter-spacing:.08em;color:#5F5B53}
.proposal-typography.proposal-typography .signature-area{height:56px;border-bottom:1.5px solid #1C1B18;display:flex;align-items:flex-end;margin-bottom:10px}
.proposal-typography.proposal-typography .signature-area img{display:block;max-height:54px;max-width:100%;object-fit:contain;object-position:left bottom}
.proposal-typography.proposal-typography .signature-area .typed-signature{font:italic 28px/1.5 "Source Serif 4",serif;margin:0;max-width:100%}
.proposal-typography.proposal-typography .signature-name{display:block;font:600 14px/1.5 var(--font-ui,"Instrument Sans",sans-serif)}
.proposal-typography.proposal-typography .signature-title,.proposal-typography.proposal-typography .signature-date{font:400 12px/1.5 var(--font-ui,"Instrument Sans",sans-serif);color:#5F5B53}
@media screen and (max-width:559px){.client-flow .proposal-typography.proposal-typography .signature-pair{grid-template-columns:1fr}}
/* Preserve searchable words in PDF text extraction without changing screen labels. */
@media print{.proposal-typography.proposal-typography .signature-role{letter-spacing:normal}}
`;
