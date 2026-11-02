import { escape, renderBlocks } from "./presentation";
import type { Block, Quote } from "./model";
/** Letter page metrics are shared with both the editor's print measure and the PDF job. */
export const printCss = `
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font:400 16px/1.65 var(--proposal-body,"Source Serif 4",serif);color:#25241f;overflow-wrap:anywhere}
@page{size:Letter;margin:18mm}h1{font:600 40px/1.15 var(--proposal-heading,"Source Serif 4",serif);margin:12px 0 20px;letter-spacing:-.025em}h2{font:600 25px/1.25 var(--proposal-heading,"Source Serif 4",serif);margin:28px 0 12px;letter-spacing:-.015em}h4{font:600 15px/1.35 var(--proposal-heading,"Source Serif 4",serif);margin:12px 0 8px}h3{font:600 17px/1.35 var(--proposal-heading,"Source Serif 4",serif);margin:16px 0}p{margin:10px 0}ul,ol{margin:10px 0;padding-left:24px}img{max-width:100%;max-height:320px;object-fit:contain}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border:1px solid #ddd}tr{break-inside:avoid}.field-chip{padding:0;border:0;background:none}pre{white-space:pre-wrap;overflow-wrap:anywhere}.print-cover p{font:500 12px/1.5 "Instrument Sans",sans-serif}.print-cover .byline{padding-bottom:20px;color:#6b6963}.print-cover .eyebrow{text-transform:uppercase;letter-spacing:.07em}.print-sheet{width:100%;height:calc(1056px - 36mm);overflow:hidden;break-after:page;display:flow-root}.print-sheet:last-child{break-after:auto}.print-root{width:calc(816px - 36mm)}.print-source{display:contents}.print-atom{display:flow-root}.print-atom>*:first-child{margin-top:0}.print-atom{padding-top:10px;padding-bottom:0}.print-atom h2{margin-top:18px}.print-atom img{display:block}.print-pricing-unit,.print-pricing-card,.print-choice-group,.print-signature{break-inside:avoid;page-break-inside:avoid}.print-signature{break-inside:avoid;padding-top:24px}.print-signature img{max-height:100px}.print-sheet> :first-child{padding-top:0}
`;
export function printContent(input: {
  title: string;
  company: string;
  sender: string;
  validity: string;
  content: Block[];
  quote: Quote;
  variables: Record<string, string>;
  currency: string;
  cents?: "auto" | "always";
  signatures?: string;
  logo?: string;
  workspace?: string;
  signatory?: { name: string; title: string } | null;
}) {
  const cover = `<header class="print-cover" data-print-block="cover">${input.logo ? `<img src="${escape(input.logo)}" alt="Company logo" style="max-height:60px;max-width:180px">` : ""}${input.workspace ? `<p class="print-workspace">${escape(input.workspace)}</p>` : ""}<p class="eyebrow">Proposal for ${escape(input.company)}</p><h1>${escape(input.title)}</h1><p class="byline">From ${escape(input.sender)}${input.validity ? ` · Valid until ${escape(input.validity)}` : ""}</p></header>`;
  const blocks = input.content.map((b, n) => {
    // Presentation only: older frozen content remains byte-for-byte unchanged.
    if (
      (n === 0 && b.type === "heading" && b.text === "{{proposal.title}}") ||
      (b.type === "signature_block" && input.signatures)
    )
      return "";
    const body =
      b.type === "page_break"
        ? ""
        : b.type === "signature_block"
          ? `<section class="print-signature"><h3>${b.role === "client" ? "Client" : "Company"} signature</h3><strong>${escape(b.role === "client" ? (input.variables["client.full_name"] ?? "Client") : (input.signatory?.name ?? input.variables["company.owner"] ?? input.company))}</strong>${b.role === "company" && input.signatory?.title ? `<p>${escape(input.signatory.title)}</p>` : ""}<p>Awaiting signature</p></section>`
          : renderBlocks(
              [b],
              input.quote,
              input.variables,
              input.currency,
              input.cents,
            );
    return `<section class="print-source" data-print-block="${escape(b.id ?? String(n))}"${b.type === "page_break" ? ' data-print-break="true"' : ""}>${body}</section>`;
  });
  return `<main class="print-root proposal-typography">${cover}${blocks.join("")}${input.signatures ?? ""}</main>`;
}
export type PageBoundary = {
  page: number;
  block: string;
  offset: number;
  explicit: boolean;
  unit?: string;
};
/** Runs in Chromium in BOTH the PDF job and a non-executable editor measurement frame.
 * Splits oversize text with DOM Ranges, preserving markup. Content is never evaluated.
 */
export function paginatePrintDocument(root: HTMLElement): {
  pages: number;
  boundaries: PageBoundary[];
} {
  const doc = root.ownerDocument,
    boundaries: PageBoundary[] = [];
  const sources = Array.from(root.children) as HTMLElement[];
  root.replaceChildren();
  let page!: HTMLElement,
    count = 0,
    currentBlock = "cover",
    offset = 0,
    pendingBreak = false,
    currentUnit: string | undefined;
  function newPage(explicit = false) {
    page = doc.createElement("div");
    page.className = "print-sheet";
    root.append(page);
    count++;
    if (count > 1)
      boundaries.push({
        page: count,
        block: currentBlock,
        offset,
        explicit,
        ...(currentUnit ? { unit: currentUnit } : {}),
      });
  }
  newPage();
  const height = page.getBoundingClientRect().height;
  function fits() {
    return page.scrollHeight <= height + 0.5;
  }
  function textCount(node: Node) {
    return node.textContent?.length ?? 0;
  }
  function rangeAt(el: HTMLElement, position: number) {
    const walker = doc.createTreeWalker(el, 4);
    let n: Node | null,
      remaining = position;
    while ((n = walker.nextNode())) {
      if (remaining <= textCount(n)) return { node: n, offset: remaining };
      remaining -= textCount(n);
    }
    return { node: el, offset: el.childNodes.length };
  }
  function add(node: HTMLElement) {
    const previousUnit = currentUnit;
    currentUnit = node.dataset.printUnit ?? currentUnit;
    try {
      addContent(node);
    } finally {
      currentUnit = previousUnit;
    }
  }
  function addContent(node: HTMLElement) {
    const wrapper = doc.createElement("div");
    wrapper.className = "print-atom";
    wrapper.append(node);
    page.append(wrapper);
    if (fits()) {
      offset += textCount(node);
      return;
    }
    const unbrokenHeight = wrapper.getBoundingClientRect().height;
    wrapper.remove();
    // Atomic images/tables or short blocks move together to the next page.
    const indivisible = node.matches(
      ".print-pricing-unit,.print-pricing-card,.print-choice-group,.print-signature",
    );
    if (indivisible && unbrokenHeight > height)
      throw new Error(
        "A pricing card, choice group or signature is too tall for one PDF page. Shorten its content before sending.",
      );
    const atomic =
      indivisible ||
      node.matches("img,table,.print-signature") ||
      !!node.querySelector("img,table");
    if (atomic) {
      // Decompose an over-page container BEFORE starting a new page. Moving an
      // impossible-to-fit group first would strand its heading on an empty page.
      if (
        !indivisible &&
        unbrokenHeight > height &&
        !node.matches("img,table") &&
        node.children.length
      ) {
        for (const child of Array.from(node.children))
          add(child as HTMLElement);
        return;
      }
      if (
        unbrokenHeight > height &&
        node.matches("table") &&
        node.querySelectorAll("tbody tr").length > 1
      ) {
        for (const row of Array.from(node.querySelectorAll("tbody tr"))) {
          const table = node.cloneNode(false) as HTMLElement;
          const head = node.querySelector("thead");
          if (head) table.append(head.cloneNode(true));
          const body = doc.createElement("tbody");
          body.append(row);
          table.append(body);
          add(table);
        }
        return;
      }
      if (unbrokenHeight > height)
        throw new Error("This image or table row is too tall for a PDF page");
      if (page.children.length) newPage();
      page.append(wrapper);
      if (!fits())
        throw new Error("This image or table row is too tall for a PDF page");
      offset += textCount(node);
      return;
    }
    page.append(wrapper);
    // Keep normal short paragraphs intact. Oversize text is split only when needed.
    const h = wrapper.getBoundingClientRect().height;
    wrapper.remove();
    if (h < height && page.children.length) {
      newPage();
      page.append(wrapper);
      offset += textCount(node);
      return;
    }
    const total = textCount(node);
    if (!total) {
      if (page.children.length) newPage();
      page.append(wrapper);
      return;
    }
    let low = 0,
      high = total;
    const original = node.cloneNode(true) as HTMLElement;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2),
        end = rangeAt(original, mid),
        range = doc.createRange();
      range.setStart(original, 0);
      range.setEnd(end.node, end.offset);
      node.replaceChildren(range.cloneContents());
      page.append(wrapper);
      if (fits()) low = mid;
      else high = mid - 1;
      wrapper.remove();
    }
    if (!low) {
      if (page.children.length) {
        newPage();
        add(original);
        return;
      }
      throw new Error("A print line cannot fit on a page");
    }
    // Prefer word boundaries; do not cut a word between pages.
    const plain = original.textContent ?? "",
      space = plain.lastIndexOf(" ", low);
    if (space > Math.max(0, low - 60)) low = space + 1;
    const end = rangeAt(original, low),
      before = doc.createRange(),
      after = doc.createRange();
    before.setStart(original, 0);
    before.setEnd(end.node, end.offset);
    after.setStart(end.node, end.offset);
    after.setEnd(original, original.childNodes.length);
    node.replaceChildren(before.cloneContents());
    page.append(wrapper);
    offset += low;
    const rest = original.cloneNode(false) as HTMLElement;
    rest.append(after.cloneContents());
    newPage();
    add(rest);
  }
  function flatten(el: HTMLElement): HTMLElement[] {
    // Preserve semantic paragraphs and list items as breakable units; headings stay readable.
    if (
      el.matches("div,section") &&
      !el.matches(
        ".print-signature,.print-pricing-unit,.print-pricing-card,.print-choice-group",
      ) &&
      el.children.length &&
      !el.querySelector("table,img")
    )
      return Array.from(el.children).flatMap((child) =>
        flatten(child as HTMLElement),
      );
    return [el];
  }
  for (const source of sources) {
    currentBlock = source.dataset.printBlock ?? currentBlock;
    offset = 0;
    if (source.dataset.printBreak) {
      pendingBreak = true;
      continue;
    }
    if (pendingBreak) {
      newPage(true);
      pendingBreak = false;
    }
    const nodes = source.classList.contains("print-source")
      ? Array.from(source.children).flatMap((n) => flatten(n as HTMLElement))
      : [source];
    for (let n = 0; n < nodes.length; n++) {
      // Keep headings with the following paragraph when that pair fits on a page.
      if (
        nodes[n].matches("h2,h3,h4") &&
        nodes[n + 1] &&
        !nodes[n + 1].matches(
          ".print-signature,.print-pricing-unit,.print-choice-group",
        )
      ) {
        const group = doc.createElement("section");
        group.append(nodes[n], nodes[++n]);
        add(group);
      } else add(nodes[n]);
    }
  }
  return { pages: count, boundaries };
}
