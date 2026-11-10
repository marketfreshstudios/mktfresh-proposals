import { coverLayoutStyle } from "./cover-graphics";
import { coverImageBackdrop } from "./cover-layout";
import { editableCoverHtml, coverElementsCss } from "./cover-render";
import { defaultCover } from "./cover";
import { pageGeometry, type HeaderFooterSettings } from "./page-bands";
import {
  signatureHtml,
  signaturePairStarts,
  signatureCss,
} from "./signature-presentation";
import { blockBoxCss } from "./block-style";
import { documentSpacing } from "./document-spacing";
import { finalOiotVisibility } from "./oiot";
import { documentQuote } from "./document-quote";
import { escape, renderBlocks, resolve } from "./presentation";
import type { Block, Quote } from "./model";
import {
  pageMetrics,
  quoteLayout,
  type ResolvedStyles,
} from "./proposal-styles";
export function printPageCss(
  styles?: ResolvedStyles,
  hf?: HeaderFooterSettings,
  fullPage = true,
) {
  const m = pageMetrics(styles),
    p = m.margins;
  if (hf) {
    const css = (page: number) => {
      const g = pageGeometry(styles, hf, page);
      return `--print-content-height:${g.content.height}px;--print-sheet-height:${fullPage ? g.height : g.frameHeight}px;height:${fullPage ? g.height : g.frameHeight}px;padding:${fullPage ? g.margins.top : 0}px 0 ${fullPage ? g.margins.bottom : 0}px;position:relative;overflow:visible;`;
    };
    return `@page{size:Letter;margin:${fullPage ? "0" : `${p.top}in ${p.right}in ${p.bottom}in ${p.left}in`}}.print-root{--cover-inset-top:${hf ? pageGeometry(styles, hf, 1).margins.top : p.top * 96}px;--cover-inset-bottom:${hf ? pageGeometry(styles, hf, 1).margins.bottom : p.bottom * 96}px;--cover-inset-left:${p.left * 96}px;--cover-inset-right:${p.right * 96}px;width:${m.contentWidth}px;margin-left:${fullPage ? p.left * 96 : 0}px;--print-sheet-height:${fullPage ? m.height : m.contentHeight}px}.print-sheet{${css(2)}}.print-sheet:first-child{${css(1)}}`;
  }
  return `@page{size:Letter;margin:${p.top}in ${p.right}in ${p.bottom}in ${p.left}in}.print-root{--cover-inset-top:${hf ? pageGeometry(styles, hf, 1).margins.top : p.top * 96}px;--cover-inset-bottom:${hf ? pageGeometry(styles, hf, 1).margins.bottom : p.bottom * 96}px;--cover-inset-left:${p.left * 96}px;--cover-inset-right:${p.right * 96}px;width:${m.contentWidth}px;--print-content-height:${m.contentHeight}px}.print-sheet{height:${m.contentHeight}px}`;
}
/** Letter page metrics are shared with both the editor's print measure and the PDF job. */
export const printCss = `
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font:400 16px/1.65 var(--proposal-body,"Source Serif 4",serif);color:#25241f;overflow-wrap:anywhere}
@page{size:Letter;margin:18mm}h1{font:600 40px/1.15 var(--proposal-heading,"Source Serif 4",serif);margin:12px 0 20px;letter-spacing:-.025em}h2{font:600 25px/1.25 var(--proposal-heading,"Source Serif 4",serif);margin:28px 0 12px;letter-spacing:-.015em}h4{font:600 15px/1.35 var(--proposal-heading,"Source Serif 4",serif);margin:12px 0 8px}h3{font:600 17px/1.35 var(--proposal-heading,"Source Serif 4",serif);margin:16px 0}p{margin:10px 0}ul,ol{margin:10px 0;padding-left:24px}img{max-width:100%;max-height:320px;object-fit:contain}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border:1px solid #ddd}tr{break-inside:avoid}.field-chip{padding:0;border:0;background:none}pre{white-space:pre-wrap;overflow-wrap:anywhere}.print-cover p{font:500 12px/1.5 "Instrument Sans",sans-serif}.print-cover .byline{padding-bottom:20px;color:#6b6963}.print-cover .eyebrow{text-transform:uppercase;letter-spacing:.07em}.print-sheet{width:100%;height:calc(1056px - 36mm);overflow:hidden;break-after:page;display:flow-root}.print-sheet:last-child{break-after:auto}.print-root{width:calc(816px - 36mm)}.print-source{display:contents}.print-atom{display:flow-root}.print-atom>*:first-child{margin-top:0}.print-atom{padding-top:10px;padding-bottom:0}.print-atom h2{margin-top:18px}.print-atom img{display:block}.print-pricing-unit,.print-pricing-card,.print-choice-group,.print-signature{break-inside:avoid;page-break-inside:avoid}.print-signature{break-inside:avoid;padding-top:24px}.print-signature img{max-height:100px}.print-sheet> :first-child{padding-top:0}
${signatureCss}
${coverElementsCss}
`;
export function printContent(input: {
  cover?: import("./cover").Cover;
  legacyCover?: boolean;
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
  signatureBlocks?: Partial<Record<"client" | "company", string>>;
  logo?: string;
  logoIcon?: string;
  accent?: string;
  workspace?: string;
  signatory?: { name: string; title: string } | null;
  currentLayout?: boolean;
  styles?: ResolvedStyles;
  planned?: boolean;
  pagination?: import("./page-plan").PagePlan;
}) {
  const presentation = input.cover ?? defaultCover();
  const map = {
    "workspace.name": input.workspace ?? "",
    "client.company": input.company,
    "sender.name": input.sender,
    "proposal.validity": input.validity ? `Valid until ${input.validity}` : "",
    ...input.variables,
  };
  const line = (
    key: "workspace" | "eyebrow" | "prepared_for" | "byline",
    className: string,
  ) => {
    if (
      key === "workspace" &&
      presentation[key] === "{{workspace.name}}" &&
      !map["workspace.name"]
    )
      return "";
    const text = resolve(presentation[key] ?? "", map);
    return text.trim() ? `<p class="${className}">${escape(text)}</p>` : "";
  };
  const src =
    presentation.logo === null ? undefined : presentation.logo || input.logo;
  const oldCover = `<header class="print-cover" data-print-block="cover">${input.logo ? `<img src="${escape(input.logo)}" alt="Company logo" style="max-height:60px;max-width:180px">` : ""}${input.workspace ? `<p class="print-workspace">${escape(input.workspace)}</p>` : ""}<p class="eyebrow">Proposal for ${escape(input.company)}</p><h1>${escape(input.title)}</h1><p class="byline">From ${escape(input.sender)}${input.validity ? ` · Valid until ${escape(input.validity)}` : ""}</p></header>`;
  const cover = input.legacyCover
    ? oldCover
    : presentation.elements || presentation.logo_mode === "brand"
      ? `<header class="print-cover" data-print-block="cover" data-cover-layout="${presentation.layout ?? "custom"}" data-cover-finished="${!!presentation.background?.finished}" ${coverImageBackdrop(presentation) ? 'data-cover-backdrop="true"' : ""} style="${coverLayoutStyle(presentation, input.accent)}--cover-content-height:var(--print-content-height,912px)">${editableCoverHtml(presentation, input.title, map, input.logo, input.logoIcon, input.accent)}</header>`
      : `<header class="print-cover" data-print-block="cover">${src ? `<img src="${escape(src)}" alt="${escape(presentation.logo_alt ?? "Company logo")}" data-image-height="${presentation.logo_height ?? 60}" style="height:${presentation.logo_height ?? 60}px;max-height:none;max-width:100%;width:auto">` : ""}${line("workspace", "print-workspace")}${line("eyebrow", "eyebrow")}<h1>${escape(input.title)}</h1>${line("prepared_for", "prepared-for")}${line("byline", "byline")}</header>`;
  const spaces = input.styles
    ? documentSpacing(input.content, input.styles)
    : {};
  const blocks = input.content.map((b, n) => {
    // Presentation only: older frozen content remains byte-for-byte unchanged.
    if (
      (!input.planned &&
        n === 0 &&
        b.type === "heading" &&
        b.text === "{{proposal.title}}") ||
      (b.type === "signature_block" && input.signatures && !input.currentLayout)
    )
      return "";
    let body =
      b.type === "page_break"
        ? ""
        : b.type === "pricing_table" && input.currentLayout
          ? documentQuote(
              input.quote,
              input.currency,
              input.cents,
              quoteLayout(input.styles),
            )
          : b.type === "signature_block" &&
              input.currentLayout &&
              input.signatureBlocks?.[b.role!]
            ? input.signatureBlocks[b.role!]!
            : b.type === "signature_block"
              ? signatureHtml({
                  role: b.role ?? "client",
                  name:
                    b.role === "company"
                      ? (input.signatory?.name ??
                        input.variables["company.owner"] ??
                        input.company)
                      : (input.variables["client.full_name"] ?? "Client"),
                  company:
                    b.role === "company"
                      ? input.workspace || ""
                      : input.company,
                  title:
                    b.role === "company"
                      ? input.signatory?.title
                      : input.variables["client.title"],
                })
              : renderBlocks(
                  [b],
                  input.quote,
                  input.variables,
                  input.currency,
                  input.cents,
                  input.styles,
                );
    if (input.planned && b.type === "contract")
      body = body.replaceAll("<br>", "<br>\n");
    const box = blockBoxCss(b.style);
    const styled = !!b.style || b.type === "columns";
    return `<section class="print-source print-atom"${box ? ' data-block-box="true"' : ""}${styled ? ' data-block-layout="true"' : ""} style="--block-space-before:${spaces[b.id ?? String(n)] ?? 0}px${styled ? ";display:flow-root;" : ""}${box}" data-print-block="${escape(b.id ?? String(n))}" data-print-kind="${b.type}"${b.type === "page_break" ? ' data-print-break="true"' : ""}>${body}</section>`;
  });
  const pairs = signaturePairStarts(input.content, input.pagination);
  const rendered: string[] = [];
  for (let n = 0; n < blocks.length; n++)
    if (pairs.has(n))
      rendered.push(
        `<div class="signature-pair" style="--block-space-before:${spaces[input.content[n].id ?? String(n)] ?? 16}px">${blocks[n]}${blocks[++n]}</div>`,
      );
    else rendered.push(blocks[n]);
  return `<main class="print-root proposal-typography"${finalOiotVisibility(input.content, input.quote) ? ' data-final-oiot="true"' : ""}${input.currentLayout ? ' data-current-layout="true"' : ""}>${cover}${rendered.join("")}${input.currentLayout ? "" : (input.signatures ?? "")}</main>`;
}
export type PageFragment = {
  block: string;
  offset: number;
  part?: string;
  part_offset?: number;
  unit?: string;
  y: number;
  height: number;
  bottom?: number;
  box_top?: number;
  box_bottom?: number;
};
export type PrintLayout = {
  geometry?: ReturnType<typeof pageGeometry>[];
  pages: number;
  boundaries: PageBoundary[];
  sheets?: {
    html: string;
    fragments: PageFragment[];
    content_area?: { top: number; height: number };
  }[];
  pricing_pages?: number;
  overflow_pages?: number[];
  overflow_columns?: { block: string; excess: number }[];
};
export type PageBoundary = {
  page: number;
  block: string;
  offset: number;
  explicit: boolean;
  unit?: string;
  part?: string;
  part_offset?: number;
  start_text?: string;
};
/** Runs in the same script-free Chromium page as pagination. No captured server state. */
export function collectPrintSheets(sheets: HTMLElement[]) {
  return sheets.map((sheet) => {
    const top = sheet.getBoundingClientRect().top;
    const lineTop = (el: HTMLElement) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walk.nextNode()))
        if (node.textContent?.trim()) {
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, Math.min(1, node.textContent.length));
          return range.getBoundingClientRect().top;
        }
      return el.getBoundingClientRect().top;
    };
    return {
      html: sheet.innerHTML,
      content_area: {
        top: parseFloat(getComputedStyle(sheet).paddingTop) || 0,
        height:
          sheet.clientHeight -
          (parseFloat(getComputedStyle(sheet).paddingTop) || 0) -
          (parseFloat(getComputedStyle(sheet).paddingBottom) || 0),
      },
      fragments: Array.from(
        sheet.querySelectorAll<HTMLElement>(".print-atom"),
      ).flatMap((atom) => {
        const common = {
          block: atom.dataset.sourceBlock!,
          offset: Number(atom.dataset.sourceOffset),
          ...(atom.dataset.sourcePart
            ? {
                part: atom.dataset.sourcePart,
                part_offset: Number(atom.dataset.sourcePartOffset),
              }
            : {}),
          ...(atom.dataset.sourceUnit ? { unit: atom.dataset.sourceUnit } : {}),
        };
        const targets = atom.querySelectorAll<HTMLElement>("[data-print-unit]");
        return [
          {
            ...common,
            y: lineTop(atom) - top,
            height: atom.getBoundingClientRect().height,
            bottom: atom.getBoundingClientRect().bottom - top,
            box_top:
              (atom.firstElementChild ?? atom).getBoundingClientRect().top -
              top,
            box_bottom:
              (atom.firstElementChild ?? atom).getBoundingClientRect().bottom -
              top,
          },
          ...Array.from(targets)
            .filter((el) => el !== atom.firstElementChild)
            .map((el) => ({
              ...common,
              unit: el.dataset.printUnit,
              y: lineTop(el) - top,
              height: el.getBoundingClientRect().height,
              bottom: el.getBoundingClientRect().bottom - top,
            })),
        ];
      }),
    };
  });
}
/** Runs in Chromium for both the sealing job and the read-only preview/layout endpoint.
 * Splits oversize text with DOM Ranges, preserving markup. Content is never evaluated.
 */
export function paginatePrintDocument(
  root: HTMLElement,
  respectContentArea = false,
): {
  pages: number;
  boundaries: PageBoundary[];
} {
  const doc = root.ownerDocument,
    boundaries: PageBoundary[] = [];
  const sources = Array.from(root.children) as HTMLElement[];
  const flow =
    getComputedStyle(root).getPropertyValue("--document-flow").trim() === "max";
  const checkContentEdge =
    respectContentArea || root.dataset.finalOiot === "true";
  root.replaceChildren();
  let page!: HTMLElement,
    count = 0,
    currentBlock = "cover",
    offset = 0,
    pendingBreak = false,
    currentUnit: string | undefined,
    currentPart: { id: string; start: number } | undefined,
    previousAfter = 0,
    height = 0,
    frameHeight = 0;
  function newPage(explicit = false) {
    previousAfter = 0;
    page = doc.createElement("div");
    page.className = "print-sheet";
    root.append(page);
    count++;
    const style = getComputedStyle(page);
    height =
      parseFloat(style.getPropertyValue("--print-content-height")) ||
      page.getBoundingClientRect().height;
    frameHeight =
      parseFloat(style.getPropertyValue("--print-sheet-height")) ||
      page.getBoundingClientRect().height;
    if (count > 1)
      boundaries.push({
        page: count,
        block: currentBlock,
        offset,
        explicit,
        ...(currentUnit ? { unit: currentUnit } : {}),
        ...(currentPart
          ? { part: currentPart.id, part_offset: offset - currentPart.start }
          : {}),
      });
  }
  newPage();
  function fits() {
    if (page.scrollHeight > frameHeight + 0.5) return false;
    if (!checkContentEdge || !page.lastElementChild) return true;
    // A full PDF sheet includes the footer's padding in its scrollHeight.
    // Keep the clause within the same usable content box as client sheets.
    const paddingTop = parseFloat(getComputedStyle(page).paddingTop) || 0;
    const end = page.getBoundingClientRect().top + paddingTop + height;
    return page.lastElementChild.getBoundingClientRect().bottom <= end + 0.5;
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
    const previousUnit = currentUnit,
      previousPart = currentPart;
    if (node.dataset.printPart && currentPart?.id !== node.dataset.printPart)
      currentPart = { id: node.dataset.printPart, start: offset };
    currentUnit = node.dataset.printUnit ?? currentUnit;
    try {
      addContent(node);
    } finally {
      currentUnit = previousUnit;
      currentPart = previousPart;
    }
  }
  function addContent(node: HTMLElement) {
    const semantic = "h1,h2,h3,h4,p,ul,ol";
    const read = (el: Element, side: "before" | "after") =>
      parseFloat(getComputedStyle(el).getPropertyValue(`--flow-${side}`)) || 0;
    const semanticNodes = node.matches(semantic)
      ? [node]
      : Array.from(node.querySelectorAll(semantic));
    const cover = node.classList.contains("print-cover"),
      unit = node.matches(".print-pricing-unit,.print-choice-group");
    if (flow) {
      node.style.marginTop = "0px";
      node.style.marginBottom = "0px";
    }
    const wrapper = doc.createElement("div");
    wrapper.className = "print-atom";
    wrapper.dataset.sourceBlock = currentBlock;
    wrapper.dataset.sourceOffset = String(offset);
    if (currentUnit) wrapper.dataset.sourceUnit = currentUnit;
    if (currentPart) {
      wrapper.dataset.sourcePart = currentPart.id;
      wrapper.dataset.sourcePartOffset = String(offset - currentPart.start);
    }
    wrapper.append(node);
    page.append(wrapper);
    // Source nodes were detached for pagination. Resolve their style variables
    // only after reconnecting them under the print root.
    const above = unit
        ? 8
        : read(cover ? node : (semanticNodes[0] ?? node), "before"),
      spacingAfter = unit
        ? 0
        : read(cover ? node : (semanticNodes.at(-1) ?? node), "after");
    if (flow)
      wrapper.style.paddingTop = `${page.children.length > 1 ? (node.dataset.blockLayout ? parseFloat(getComputedStyle(node).getPropertyValue("--block-space-before")) || 0 : Math.max(previousAfter, above)) : 0}px`;
    // Covers already occupy their own frame. Do not split their positioned
    // artwork or metadata when the browser reports decorative overflow.
    if (
      (checkContentEdge &&
        cover &&
        wrapper.getBoundingClientRect().height <= height + 0.5) ||
      fits()
    ) {
      previousAfter = spacingAfter;
      offset += textCount(node);
      return;
    }
    const unbrokenHeight =
      wrapper.getBoundingClientRect().height -
      (flow ? parseFloat(wrapper.style.paddingTop) || 0 : 0);
    wrapper.remove();
    // Atomic images/tables or short blocks move together to the next page.
    if (node.dataset.printKind === "columns") {
      if (page.children.length) newPage();
      if (flow) wrapper.style.paddingTop = "0px";
      page.append(wrapper);
      previousAfter = spacingAfter;
      offset += textCount(node);
      return;
    }
    const indivisible = node.matches(
      ".print-pricing-intro,.print-pricing-unit,.print-pricing-card,.print-choice-group,.print-signature,.signature-pair,.document-signature",
    );
    if (indivisible && unbrokenHeight > height)
      throw new Error(
        "A pricing card, choice group or signature is too tall for one PDF page. Shorten its content before sending.",
      );
    const atomic =
      indivisible ||
      node.matches(
        "img,table,.print-signature,.signature-pair,.document-signature",
      ) ||
      node.matches(".print-pricing-table") ||
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
          let body = doc.createElement("tbody");
          body.append(row);
          table.append(body);
          add(table);
        }
        return;
      }
      if (unbrokenHeight > height)
        throw new Error("This image or table row is too tall for a PDF page");
      if (page.children.length) newPage();
      if (flow) wrapper.style.paddingTop = "0px";
      page.append(wrapper);
      if (!fits())
        throw new Error("This image or table row is too tall for a PDF page");
      offset += textCount(node);
      previousAfter = spacingAfter;
      return;
    }
    page.append(wrapper);
    // Keep normal short paragraphs intact. Oversize text is split only when needed.
    const h = flow ? unbrokenHeight : wrapper.getBoundingClientRect().height;
    wrapper.remove();
    if (h < height && page.children.length) {
      newPage();
      if (flow) wrapper.style.paddingTop = "0px";
      page.append(wrapper);
      offset += textCount(node);
      previousAfter = spacingAfter;
      return;
    }
    const total = textCount(node);
    if (!total) {
      if (page.children.length) newPage();
      if (flow) wrapper.style.paddingTop = "0px";
      page.append(wrapper);
      previousAfter = spacingAfter;
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
        ".print-signature,.document-signature,.signature-pair,.print-pricing-table,.print-pricing-unit,.print-pricing-card,.print-choice-group",
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
      if (pendingBreak && root.dataset.currentLayout) newPage(true);
      pendingBreak = true;
      continue;
    }
    if (pendingBreak) {
      newPage(true);
      pendingBreak = false;
    }
    const nodes =
      source.classList.contains("print-source") && !source.dataset.blockLayout
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
        if (nodes[n].dataset.printPart)
          group.dataset.printPart = nodes[n].dataset.printPart;
        group.append(nodes[n], nodes[++n]);
        add(group);
      } else add(nodes[n]);
    }
  }
  if (pendingBreak && root.dataset.currentLayout) newPage(true);
  return { pages: count, boundaries };
}
