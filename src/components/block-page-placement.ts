import type { PrintLayout } from "../lib/document-print";
export type SheetBox = { top: number; height: number };
export const letterSheets = (pages: number): SheetBox[] =>
  Array.from({ length: pages }, (_, n) => ({ top: n * 1080, height: 1056 }));
type Atom = {
  element: HTMLElement;
  page: number;
  children: HTMLElement[];
  frame?: HTMLElement;
};
/** Matching a first glyph is insufficient if a browser's taller block spills
 * beyond a sheet. Split paragraphs are handled by source spacers; indivisible
 * blocks/cards must also fit inside their single server page. */
export function singlePageOverflow(root: HTMLElement, layout: PrintLayout) {
  let overflow = 0;
  const top = root.getBoundingClientRect().top;
  for (const element of root.querySelectorAll<HTMLElement>(
    '.document-cover,.draft-block,.studio-block-card,[data-print-unit],[data-block-id^="clause-"],[data-block-id^="template-clause-"]',
  )) {
    const frame = element.closest<HTMLElement>(
        ".draft-block,.studio-block-card",
      ),
      block =
        frame?.dataset.blockId?.replace(/^(block-|template-)/, "") ??
        (element.matches(".document-cover") ? "cover" : ""),
      part = element.dataset.blockId?.match(
        /^(?:clause-|template-clause-)(.+)$/,
      )?.[1],
      unit = element.dataset.printUnit;
    const pages = (layout.sheets ?? []).flatMap((sheet, n) =>
      sheet.fragments.some(
        (f) =>
          f.block === block &&
          (unit ? f.unit === unit : part ? f.part === part : true),
      )
        ? [n]
        : [],
    );
    if (pages.length !== 1) continue;
    const rect = element.getBoundingClientRect(),
      start = pages[0] * 1080;
    overflow = Math.max(
      overflow,
      start - (rect.top - top),
      rect.bottom - top - start - 1056,
    );
  }
  // Compare content boxes, not decoration/padding: exact signature padding and
  // card borders can legitimately share spacing without any text overlapping.
  for (const selector of [".flow-quote-line > .quote-item-body"]) {
    let previous: HTMLElement | undefined;
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      if (
        !element.getClientRects().length ||
        element.querySelector("[data-explicit-break]")
      )
        continue;
      if (previous && !previous.contains(element))
        overflow = Math.max(
          overflow,
          previous.getBoundingClientRect().bottom -
            element.getBoundingClientRect().top,
        );
      previous = element;
    }
  }
  return overflow;
}
/** Browser-only projection. Never split text or change stored blocks in fallback. */
export function placeBlockPages(
  root: HTMLElement,
  layout: PrintLayout,
  margins: { top: number; bottom: number },
) {
  const pages = Math.max(1, layout.pages),
    boxes = letterSheets(pages),
    atoms: Atom[] = [];
  const pageFor = (block: string, unit?: string, part?: string) => {
    const at = layout.sheets?.findIndex((sheet) =>
      sheet.fragments.some(
        (f) =>
          f.block === block &&
          (unit
            ? f.unit === unit
            : part
              ? f.part === part
              : !f.unit && !f.part),
      ),
    );
    return at !== undefined && at >= 0 ? at : undefined;
  };
  let previous = 0;
  const cover = root.querySelector<HTMLElement>(".document-cover");
  if (cover) atoms.push({ element: cover, page: 0, children: [] });
  for (const frame of root.querySelectorAll<HTMLElement>(
    ".draft-block,.studio-block-card",
  )) {
    const block = frame.dataset.blockId!.replace(/^(block-|template-)/, ""),
      container = frame.closest<HTMLElement>(".quote-sortable") ?? frame;
    const children = Array.from(
      frame.querySelectorAll<HTMLElement>(
        '[data-print-unit],[data-block-id^="clause-"],[data-block-id^="template-clause-"]',
      ),
    ).filter(
      (el) =>
        !el.parentElement?.closest(
          '[data-print-unit],[data-block-id^="clause-"],[data-block-id^="template-clause-"]',
        ),
    );
    previous = Math.max(previous, pageFor(block) ?? previous);
    atoms.push({ element: container, page: previous, children, frame });
    for (const child of children) {
      const part = child.dataset.blockId?.replace(
          /^(clause-|template-clause-)/,
          "",
        ),
        element = part
          ? (child.closest<HTMLElement>(".quote-sortable") ?? child)
          : child;
      previous = Math.max(
        previous,
        pageFor(block, child.dataset.printUnit, part) ?? previous,
      );
      atoms.push({ element, page: previous, children: [] });
    }
  }
  const top = root.getBoundingClientRect().top,
    assignments: { element: HTMLElement; page: number }[] = [];
  let current = -1;
  for (const atom of atoms) {
    const page = Math.min(pages - 1, atom.page);
    if (page !== current) {
      for (let n = 1; n < pages; n++)
        boxes[n].top = boxes[n - 1].top + boxes[n - 1].height + 24;
      const desired = boxes[page].top + margins.top * 96,
        delta = desired - (atom.element.getBoundingClientRect().top - top),
        margin = parseFloat(getComputedStyle(atom.element).marginTop) || 0;
      atom.element.dataset.layoutSpace = "true";
      atom.element.style.setProperty(
        "margin-top",
        `${margin + delta}px`,
        "important",
      );
      current = page;
    }
    let bottom = atom.element.getBoundingClientRect().bottom - top;
    if (atom.children.length) {
      // The outer pricing/contract box spans its units. Only its own heading
      // and introductory copy belong to the header's sheet.
      bottom = atom.element.getBoundingClientRect().top - top;
      const walk = document.createTreeWalker(atom.frame!, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walk.nextNode())) {
        const parent = node.parentElement;
        if (
          !node.textContent?.trim() ||
          !parent?.getClientRects().length ||
          parent.closest(
            ".block-tools,.drag-handle,.block-insert,.sr-only,.document-edit-item",
          ) ||
          atom.children.some((child) => child.contains(node))
        )
          continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        bottom = Math.max(bottom, range.getBoundingClientRect().bottom - top);
      }
    }
    boxes[page].height = Math.max(
      boxes[page].height,
      bottom - boxes[page].top + margins.bottom * 96,
    );
    assignments.push({ element: atom.element, page: page + 1 });
  }
  for (let n = 1; n < pages; n++)
    boxes[n].top = boxes[n - 1].top + boxes[n - 1].height + 24;
  return { boxes, assignments };
}
