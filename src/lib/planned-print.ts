import type { PagePlan } from "./page-plan";
/** Trusted DOM-only renderer. Split at the editor's source positions; never evaluate content. */
export function applyPagePlan(root: HTMLElement, plan: PagePlan) {
  const doc = root.ownerDocument;
  // Keep source wrappers so a Range can preserve inline marks and list structure across pages.
  root.dataset.planned = "true";
  const remaining = doc.createElement("div");
  remaining.append(...Array.from(root.childNodes));
  root.append(remaining);
  const consumed = new Map<string, number>();
  const consumedParagraphs = new Map<string, number>();
  const sheets: HTMLElement[] = [];
  function sheet(fragment: DocumentFragment | HTMLElement) {
    const el = doc.createElement("div");
    el.className = "print-sheet planned-sheet";
    el.append(fragment);
    root.insertBefore(el, remaining);
    sheets.push(el);
    el.querySelectorAll("[data-print-break]").forEach((n) => n.remove());
    // An empty source wrapper before the split must not add a phantom gap.
    el.querySelectorAll(".print-source").forEach((n) => {
      if (!n.textContent?.trim() && !n.querySelector("img,br,p")) n.remove();
    });
    const first = el.firstElementChild as HTMLElement | null;
    if (first) first.style.marginTop = "0px";
  }
  for (const start of plan.starts) {
    const block = remaining.querySelector<HTMLElement>(
      `[data-print-block="${CSS.escape(start.block)}"]`,
    );
    if (!block) throw new Error(`Missing page source: ${start.block}`);
    let target = block,
      absentPart = false;
    if (start.unit) {
      const unit = block.querySelector<HTMLElement>(
        `[data-print-unit="${CSS.escape(start.unit)}"]`,
      );
      if (!unit) throw new Error(`Missing page unit: ${start.unit}`);
      target = unit;
    } else if (start.part) {
      const part = block.querySelector<HTMLElement>(
        `[data-print-part="${CSS.escape(start.part)}"]`,
      );
      // A conditional clause may be removed by the client's choices before
      // signing. Its frozen break retains an empty slot at the contract edge.
      if (!part) absentPart = true;
      else target = part.parentElement!;
    }
    const range = doc.createRange();
    range.setStart(remaining, 0);
    const key = [start.block, start.part ?? "", start.unit ?? ""].join(":");
    const offset = absentPart ? 0 : start.offset - (consumed.get(key) ?? 0);
    if (offset === 0 && start.paragraph === undefined)
      range.setEndBefore(target);
    else {
      const walker = doc.createTreeWalker(target, 4);
      let node: Node | null,
        at = offset,
        found = false;
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length ?? 0;
        if (at < length) {
          range.setEnd(node, at);
          found = true;
          break;
        }
        at -= length;
      }
      if (start.paragraph !== undefined) {
        const p =
          target.querySelectorAll("p,li")[
            start.paragraph - (consumedParagraphs.get(key) ?? 0)
          ];
        if (p) {
          range.setEndBefore(p);
          found = true;
        }
      }
      if (!found)
        throw new Error(
          `Invalid page source offset: ${start.block}:${start.offset}`,
        );
    }
    // A line at the start of a paragraph/list item belongs wholly to the next
    // sheet. Ending a Range at text offset zero would clone an empty line (or
    // an empty numbered item) onto the previous page and manufacture overflow.
    if (range.endContainer.nodeType === 3 && range.endOffset === 0) {
      const point = range.endContainer,
        paragraph = point.parentElement?.closest("p");
      if (paragraph) {
        const prefix = doc.createRange();
        prefix.selectNodeContents(paragraph);
        prefix.setEnd(point, 0);
        if (!prefix.toString()) {
          const item = paragraph.closest("li");
          range.setEndBefore(
            item && item.firstElementChild === paragraph ? item : paragraph,
          );
        }
      }
    }
    const point = range.endContainer,
      at = range.endOffset;
    const li = point.parentElement?.closest("li");
    let list: HTMLOListElement | null = null,
      index = 0,
      continued = false;
    if (li) {
      const prefix = doc.createRange();
      prefix.selectNodeContents(li);
      prefix.setEnd(point, at);
      continued = !!prefix.toString();
      if (li.parentElement?.tagName === "OL") {
        list = li.parentElement as HTMLOListElement;
        index = Array.from(list.children).indexOf(li) + (list.start || 1);
      }
    }
    sheet(range.extractContents());
    if (start.paragraph !== undefined)
      consumedParagraphs.set(key, start.paragraph);
    if (list) list.start = index;
    if (continued && li) li.setAttribute("data-list-continuation", "true");
    consumed.set(key, start.offset);
  }
  const last = doc.createDocumentFragment();
  last.append(...Array.from(remaining.childNodes));
  sheet(last);
  remaining.remove();
  const overflow_pages = sheets.flatMap((el, n) =>
    el.getBoundingClientRect().height >
    (parseFloat(
      getComputedStyle(el).getPropertyValue("--print-sheet-height"),
    ) ||
      parseFloat(
        getComputedStyle(root).getPropertyValue("--print-content-height"),
      )) +
      1
      ? [n + 1]
      : [],
  );
  return {
    pages: sheets.length,
    boundaries: plan.starts.map((s) => ({ ...s })),
    overflow_pages,
  };
}
export const plannedPrintCss = `
.print-root[data-planned] .print-sheet{height:auto;min-height:var(--print-sheet-height,var(--print-content-height));overflow:visible;break-after:page;display:flow-root}
.print-root[data-planned] .print-sheet:last-child{break-after:auto}
.print-root[data-planned] .print-source{display:flow-root;margin-top:var(--block-space-before,0px);padding:0}
.print-root[data-planned] .print-source>*:first-child{margin-top:0}
.print-root[data-planned] .print-source[data-print-kind=heading]{break-after:avoid}
.print-root[data-planned] .print-source[data-print-kind=signature_block]{break-inside:avoid}
.print-root[data-planned] [data-list-continuation]{list-style:none}
.print-root[data-planned] p:empty::before{content:"​"}
`;
