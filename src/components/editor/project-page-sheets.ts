import type { Block } from "../../lib/model";
import type { PagePlan, PageStart } from "../../lib/page-plan";
import {
  sourceOffset,
  sourceTextNodes,
  sourceLines,
} from "../../lib/pagination-dom";
import type { SourceSpacer } from "../page-spacers";
import type { SheetBox } from "./page-sheet";
/** Projects existing source boundaries into the responsive display. Never chooses a break. */
export function projectPageSheets(
  root: HTMLElement,
  content: Block[],
  plan: PagePlan,
): SheetBox[] {
  const originals = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const clone = root.cloneNode(true) as HTMLElement;
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const live = new WeakMap(copies.map((el, n) => [el, originals[n]]));
  clone.inert = true;
  clone
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((input) => input.removeAttribute("name"));
  clone.setAttribute("aria-hidden", "true");
  clone.dataset.sheetProjection = "true";
  const computed = getComputedStyle(root);
  Object.assign(clone.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    visibility: "hidden",
    pointerEvents: "none",
    transform: "none",
    zIndex: "-1",
  });
  for (const [key, value] of Object.entries({
    width: `${root.offsetWidth}px`,
    maxWidth: "none",
    minWidth: "0px",
    minHeight: "0px",
    height: "auto",
    padding: computed.padding,
  }))
    clone.style.setProperty(
      key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      value,
      "important",
    );
  clone
    .querySelectorAll(
      "style,[data-pagination-spacer],.editor-page-sheets,.document-page-count",
    )
    .forEach((el) => el.remove());
  clone.querySelectorAll<HTMLElement>("[data-layout-space]").forEach((el) => {
    el.style.removeProperty("margin-top");
    delete el.dataset.layoutSpace;
  });
  clone.querySelectorAll<HTMLElement>(".quote-sortable").forEach((el) => {
    el.style.transform = "none";
    el.style.transition = "none";
  });
  root.parentElement!.append(clone);
  const origin = clone.getBoundingClientRect().top;
  const topPadding = parseFloat(computed.paddingTop),
    bottomPadding = parseFloat(computed.paddingBottom);
  const gap = parseFloat(computed.getPropertyValue("--sheet-gap")) || 52;
  const boxes: SheetBox[] = [];
  const spaces = new Map<HTMLElement, SourceSpacer[]>();
  let pageTop = 0,
    previousFrame: HTMLElement | null = null;
  const y = (el: Element) => el.getBoundingClientRect().top - origin;
  const frameFor = (s: PageStart) =>
    clone.querySelector<HTMLElement>(
      `[data-block-id="block-${CSS.escape(s.block)}"],[data-block-id="template-${CSS.escape(s.block)}"]`,
    );
  const endOfContent = () =>
    Math.max(
      topPadding,
      ...Array.from(
        clone.querySelectorAll<HTMLElement>(".document-cover,.block-content"),
      )
        .filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect().bottom - origin),
    );
  const finish = (bottom: number) => {
    // Round the painted sheet outward. CSS quantizes each fractional top/margin
    // independently, so a rounded-down sheet can cut into its last unit by a
    // fraction of a pixel even when the source boundary is exact.
    const height = Math.ceil(Math.max(320, bottom - pageTop + bottomPadding));
    boxes.push({ top: pageTop, height, gap });
    pageTop += height + gap;
  };
  try {
    for (const start of plan.starts) {
      const frame = frameFor(start);
      if (
        !frame ||
        content.find((b) => b.id === start.block)?.type === "page_break"
      ) {
        finish(endOfContent());
        previousFrame = null;
        continue;
      }
      let target =
        frame.querySelector<HTMLElement>(":scope > .block-content") ?? frame;
      if (start.part)
        target =
          frame.querySelector<HTMLElement>(
            `[data-block-id="clause-${CSS.escape(start.part)}"],[data-block-id="template-clause-${CSS.escape(start.part)}"]`,
          ) ?? target;
      if (start.unit)
        target =
          frame.querySelector<HTMLElement>(
            `[data-print-unit="${CSS.escape(start.unit)}"]`,
          ) ?? target;
      let point: { node: Node; at: number } | undefined;
      if (start.paragraph !== undefined) {
        const paragraph = target.querySelectorAll("p,li")[start.paragraph];
        if (paragraph) point = { node: paragraph, at: 0 };
      } else if (start.offset > 0) {
        let consumed = 0;
        for (const node of sourceTextNodes(target)) {
          const address = !!node.parentElement?.closest(
            '[data-field="client.address"]',
          );
          const length = address
            ? node.data.replace(/\n/g, "").length
            : node.length;
          if (consumed + length > start.offset) {
            let at = start.offset - consumed;
            if (address) {
              let seen = 0;
              at = 0;
              while (at < node.length && seen < start.offset - consumed) {
                if (node.data[at] !== "\n") seen++;
                at++;
              }
            }
            point = { node, at };
            break;
          }
          consumed += length;
        }
      }
      // Projection uses the visible browser line, never a different saved source break.
      if (point?.node.nodeType === Node.TEXT_NODE) {
        const source = sourceOffset(target, point.node, point.at);
        const row = sourceLines(target)
          .filter((r) => sourceOffset(target, r.node, r.at) <= source)
          .at(-1);
        if (row) point = { node: row.node, at: row.at };
      }
      if (
        point?.node instanceof HTMLElement &&
        point.node.matches("p,li") &&
        point.node.textContent?.trim()
      ) {
        const moved = point.node;
        const margin = parseFloat(getComputedStyle(moved).marginTop) || 0;
        finish(y(moved) - margin);
        const height = margin + pageTop + topPadding - y(moved);
        moved.dataset.layoutSpace = "true";
        moved.style.setProperty("margin-top", `${height}px`, "important");
        const host = moved.closest<HTMLElement>(".field-editor");
        if (host)
          spaces.set(host, [
            ...(spaces.get(host) ?? []),
            {
              offset: sourceOffset(host, moved, 0),
              paragraph: Array.from(host.querySelectorAll("p,li")).indexOf(
                moved,
              ),
              height,
            },
          ]);
        previousFrame = moved;
        continue;
      }
      const host =
        point &&
        (point.node.nodeType === 1
          ? (point.node as Element)
          : point.node.parentElement
        )?.closest<HTMLElement>(".field-editor,[data-source-text]");
      if (point && host) {
        const offset = sourceOffset(host, point.node, point.at);
        const span = document.createElement("span");
        span.dataset.paginationSpacer = "true";
        span.className = "pdf-source-spacer";
        span.style.height = "0px";
        const range = document.createRange();
        range.setStart(point.node, point.at);
        range.collapse(true);
        range.insertNode(span);
        const after = document.createRange();
        after.setStartAfter(span);
        after.collapse(true);
        const rect = after.getBoundingClientRect();
        const nextTop = rect.height
          ? rect.top - origin
          : span.getBoundingClientRect().bottom - origin;
        finish(y(span));
        const height = Math.max(0, pageTop + topPadding - nextTop);
        span.style.height = `${height}px`;
        spaces.set(host, [
          ...(spaces.get(host) ?? []),
          {
            offset,
            height,
            ...(start.paragraph !== undefined
              ? { paragraph: start.paragraph }
              : {}),
          },
        ]);
        previousFrame = null;
      } else {
        const sortable =
          target.closest<HTMLElement>(".quote-sortable") ?? target;
        const pair = sortable.closest<HTMLElement>(".signature-pair");
        const moved =
          start.unit || start.part
            ? target
            : pair?.querySelector(".block-sortable") === sortable
              ? pair
              : sortable;
        const margin = parseFloat(getComputedStyle(moved).marginTop) || 0;
        finish(
          previousFrame === moved ? pageTop + topPadding : y(moved) - margin,
        );
        const value = margin + pageTop + topPadding - y(moved);
        moved.dataset.layoutSpace = "true";
        moved.style.setProperty("margin-top", `${value}px`, "important");
        previousFrame = moved;
      }
    }
    finish(endOfContent());
    // There is no trailing gap. These decorations are excluded from source measurement.
    root.querySelectorAll<HTMLElement>("[data-layout-space]").forEach((el) => {
      el.style.removeProperty("margin-top");
      delete el.dataset.layoutSpace;
    });
    clone.querySelectorAll<HTMLElement>("[data-layout-space]").forEach((el) => {
      const target = live.get(el);
      if (target) {
        target.dataset.layoutSpace = "true";
        target.style.setProperty("margin-top", el.style.marginTop, "important");
      }
    });
    for (const host of clone.querySelectorAll<HTMLElement>(
      ".field-editor,[data-source-text]",
    ))
      live.get(host)?.dispatchEvent(
        new CustomEvent("editor-source-spacers", {
          detail: spaces.get(host) ?? [],
        }),
      );
    root.style.setProperty(
      "--projected-sheets-height",
      `${boxes.at(-1)!.top + boxes.at(-1)!.height}px`,
    );
    return boxes;
  } finally {
    clone.remove();
  }
}
