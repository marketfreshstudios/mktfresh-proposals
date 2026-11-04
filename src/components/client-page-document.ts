import { fitStoredImages } from "../lib/image-size";
import {
  printContent,
  printCss,
  printPageCss,
  paginatePrintDocument,
} from "../lib/document-print";
import { applyPagePlan, plannedPrintCss } from "../lib/planned-print";
import { documentStyleCss } from "../lib/proposal-styles";
import { fontFamily } from "../lib/proposal-fonts";
import { signatureHtml } from "../lib/signature-presentation";
import { readableDate } from "../lib/validity";
import { pageBandCss, pageBandHtml } from "../lib/page-band-render";
import { pageGeometry } from "../lib/page-bands";
import { bandPages, resolvedBandPages } from "../lib/band-overrides";
import { orderedItems } from "../lib/quote-model";
import { QuoteSchema } from "../lib/model";
import type { PublicProposal } from "./client-proposal";
/** The public print source is the PDF source, without internal billing metadata. */
export function clientDocumentHtml(
  p: PublicProposal,
  logo?: string,
  plan = p.pagination,
) {
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
        image: s.kind === "drawn" ? s.image : undefined,
        typedName: s.kind === "typed" ? s.typed_name || s.name : undefined,
        date: readableDate(s.signed_at, p.timezone),
      }),
    ]),
  );
  const quote = QuoteSchema.parse(
    p.quote.map((i) => ({
      ...i,
      plan_terms: p.client_item_terms?.[i.id]
        ? { client_copy: p.client_item_terms[i.id] }
        : undefined,
    })),
  );
  return printContent({
    cover: p.cover,
    title: p.title,
    company: p.recipient.company,
    sender: p.contact.name,
    validity: p.variables["proposal.valid_until"] ?? "",
    content: p.content,
    quote,
    variables: p.variables,
    currency: p.currency,
    cents: p.money_cents,
    currentLayout: !!p.resolved_styles?.layout,
    planned: !!plan,
    styles: p.resolved_styles,
    pagination: plan,
    logo,
    workspace: p.company.name,
    signatory: {
      name: p.company.signatory_name ?? "",
      title: p.company.signatory_title ?? "",
    },
    signatureBlocks: signatures,
  });
}
export function clientDocumentCss(p: PublicProposal) {
  return `${printCss}${pageBandCss}${printPageCss(p.resolved_styles, p.header_footer, false)}${plannedPrintCss}${`.proposal-typography{--proposal-body:${fontFamily(p.proposal_fonts?.body)};--proposal-heading:${fontFamily(p.proposal_fonts?.heading)}}`}${documentStyleCss(p.resolved_styles, p.company.accent_colour)}
  .client-canonical{font:400 16px/1.65 var(--proposal-body,"Source Serif 4",serif);color:#25241f;overflow-wrap:anywhere;--font-ui:"Instrument Sans",system-ui,sans-serif;--font-mono:"IBM Plex Mono",monospace}
  .client-canonical .print-root{font:400 16px/1.65 var(--proposal-body,"Source Serif 4",serif);color:inherit}
  `;
}
export function paginateClientDocument(
  stage: HTMLElement,
  p: PublicProposal,
  logo?: string,
  plan = p.pagination,
) {
  stage.innerHTML = clientDocumentHtml(p, logo, plan);
  let root = stage.querySelector<HTMLElement>(".print-root")!;
  // No nested main landmark inside the client flow's existing main.
  const neutral = stage.ownerDocument.createElement("div");
  neutral.className = root.className;
  neutral.dataset.currentLayout = "true";
  neutral.append(...root.childNodes);
  root.replaceWith(neutral);
  root = neutral;
  // Annotate before splitting: a pricing block can continue across several pages.
  // Array indices in a continued fragment would refer to the wrong product.
  const items = orderedItems(QuoteSchema.parse(p.quote));
  for (const table of root.querySelectorAll<HTMLElement>(
    '[data-print-kind="pricing_table"]',
  ))
    [...table.querySelectorAll<HTMLElement>(".print-pricing-card")].forEach(
      (card, index) => {
        if (items[index]) card.dataset.clientItemId = items[index].id;
      },
    );
  fitStoredImages(root);
  if (plan) applyPagePlan(root, plan);
  else paginatePrintDocument(root);
  // The unplanned PDF paginator emits atoms rather than source wrappers.
  for (const atom of root.querySelectorAll<HTMLElement>("[data-source-block]"))
    if (!atom.dataset.printBlock)
      atom.dataset.printBlock = atom.dataset.sourceBlock;
  const bindings = p.header_footer
    ? resolvedBandPages(p.header_footer, bandPages(p.content, plan))
    : [];
  const sheets = [
    ...root.querySelectorAll<HTMLElement>(":scope > .print-sheet"),
  ];
  sheets.forEach((sheet, n) => {
    const g = pageGeometry(p.resolved_styles, p.header_footer, n + 1);
    sheet.dataset.clientPage = String(n + 1);
    sheet.dataset.contentHeight = String(g.content.height);
    Object.assign(sheet.style, {
      height: `${g.frameHeight}px`,
      padding: `${g.before}px 0 ${g.after}px`,
      position: "relative",
    });
    sheet.style.setProperty("--print-content-height", `${g.content.height}px`);
    sheet.style.setProperty("--print-sheet-height", `${g.frameHeight}px`);
    const body = stage.ownerDocument.createElement("div");
    body.className = "client-sheet-content";
    body.dataset.contentHeight = String(g.content.height);
    body.style.height = `${g.content.height}px`;
    body.append(...sheet.childNodes);
    sheet.append(body);
    for (const kind of ["header", "footer"] as const) {
      const html = pageBandHtml({
        hf: p.header_footer,
        kind,
        page: n + 1,
        pageCount: sheets.length,
        values: p.variables,
        styles: p.resolved_styles,
        logo,
        print: true,
        inContent: true,
        band: bindings[n]?.[kind].value,
      });
      if (html)
        sheet.insertAdjacentHTML(
          kind === "header" ? "afterbegin" : "beforeend",
          html,
        );
    }
  });
  fitStoredImages(root);
  return { root, sheets, plan };
}
