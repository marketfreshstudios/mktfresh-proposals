import type { Block } from "../lib/model";
import type { PagePlan, PageStart } from "../lib/page-plan";
import {
  sourceTextNodes,
  sourceOffset,
  sourceLines as lines,
} from "../lib/pagination-dom";
import { pageMetrics, type ResolvedStyles } from "../lib/proposal-styles";
import type { SourceSpacer } from "./page-spacers";
export type BrowserPages = {
  plan: PagePlan;
  assignments: { block: string; page: number }[];
};
/** Measures actual browser line boxes at Letter width. All inserted gaps are visual decorations. */
export function paginateBrowser(
  root: HTMLElement,
  content: Block[],
  styles: ResolvedStyles,
  decorate: boolean,
  reorder = false,
): BrowserPages {
  const metrics = pageMetrics(styles),
    stride = metrics.height + 24;
  const originals = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const clone = root.cloneNode(true) as HTMLElement;
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  const live = new WeakMap(copies.map((el, n) => [el, originals[n]]));
  clone.inert = true;
  // A measurement clone must not join (and uncheck) the live radio groups.
  clone
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')
    .forEach((input) => input.removeAttribute("name"));
  clone.setAttribute("aria-hidden", "true");
  clone.dataset.pageMeasurement = "true";
  Object.assign(clone.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    transform: "none",
    visibility: "hidden",
    pointerEvents: "none",
    display: "block",
    minHeight: "0",
    height: "auto",
    zIndex: "-1",
  });
  clone.style.setProperty("width", `${metrics.width}px`, "important");
  clone.style.setProperty("max-width", "none", "important");
  clone.style.setProperty("min-width", `${metrics.width}px`, "important");
  clone.style.setProperty(
    "padding",
    `${metrics.margins.top * 96}px ${metrics.margins.right * 96}px ${metrics.margins.bottom * 96}px ${metrics.margins.left * 96}px`,
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
  clone
    .querySelectorAll<HTMLElement>(".quote-sortable,.document-section")
    .forEach((el) => {
      el.style.transform = "none";
      el.style.transition = "none";
      el.style.setProperty("display", "block", "important");
    });
  // A tentative move is measured without touching the live document or history.
  if (reorder) {
    const holder = document.createElement("div");
    holder.className = "document-section";
    holder.style.setProperty("display", "flow-root", "important");
    for (const b of content) {
      let frame = clone.querySelector<HTMLElement>(
        `[data-block-id="block-${CSS.escape(b.id!)}"],[data-block-id="template-${CSS.escape(b.id!)}"]`,
      );
      if (!frame && b.type === "page_break") {
        frame = document.createElement("div");
        frame.dataset.blockId = `block-${b.id}`;
        frame.innerHTML = '<div class="block-content"></div>';
      }
      if (frame) holder.append(frame.closest(".block-sortable") ?? frame);
    }
    clone.querySelectorAll(".document-section").forEach((el) => el.remove());
    clone.append(holder);
  }
  clone
    .querySelectorAll<HTMLElement>(":scope > div")
    .forEach((el) => el.style.setProperty("display", "block", "important"));
  clone
    .querySelectorAll<HTMLElement>(
      ".document-cover > .print-workspace,.document-cover > img",
    )
    .forEach((el) => el.style.setProperty("display", "block", "important"));
  root.parentElement!.append(clone);
  const top = clone.getBoundingClientRect().top,
    starts: PageStart[] = [],
    assignments: BrowserPages["assignments"] = [];
  const spacers = new Map<HTMLElement, SourceSpacer[]>();
  let page = 1;
  const end = () =>
    (page - 1) * stride + metrics.height - metrics.margins.bottom * 96;
  const local = (el: Element) => el.getBoundingClientRect().top - top;
  const hostFor = (node: Node) =>
    node.parentElement?.closest<HTMLElement>(
      ".field-editor,[data-source-text]",
    );
  function newPage(
    target: HTMLElement,
    block: Block,
    point?: { node: Node; at: number },
    unit?: string,
    part?: string,
    explicit = false,
    marker?: string,
  ) {
    let offset = point ? sourceOffset(target, point.node, point.at) : 0;
    const paragraph =
      point?.node.nodeType === 1
        ? Array.from(target.querySelectorAll("p,li")).indexOf(
            point.node as Element,
          )
        : undefined;
    const start: PageStart = {
      page: ++page,
      block: block.id!,
      offset,
      explicit,
      ...(marker ? { marker } : {}),
      ...(paragraph !== undefined && paragraph >= 0 ? { paragraph } : {}),
      ...(unit ? { unit } : {}),
      ...(part ? { part } : {}),
    };
    starts.push(start);
    const desired = (page - 1) * stride + metrics.margins.top * 96;
    if (
      point?.node instanceof HTMLElement &&
      point.node.matches("p,li") &&
      point.node.textContent?.trim()
    ) {
      const element = point.node;
      const previous = parseFloat(getComputedStyle(element).marginTop) || 0;
      const height = previous + desired - local(element);
      element.dataset.layoutSpace = "true";
      element.style.setProperty("margin-top", `${height}px`, "important");
      const host = element.closest<HTMLElement>(".field-editor");
      if (host)
        spacers.set(host, [
          ...(spacers.get(host) ?? []),
          {
            offset: sourceOffset(host, element, 0),
            paragraph: Array.from(host.querySelectorAll("p,li")).indexOf(
              element,
            ),
            height,
          },
        ]);
      return;
    }
    if (point) {
      const host =
        point.node.nodeType === 1
          ? (point.node as Element).closest<HTMLElement>(
              ".field-editor,[data-source-text]",
            )
          : hostFor(point.node);
      if (host) {
        const localOffset = sourceOffset(host, point.node, point.at);
        const range = document.createRange();
        range.setStart(point.node, point.at);
        range.collapse(true);
        const span = document.createElement("span");
        span.className = "pdf-source-spacer";
        span.dataset.paginationSpacer = "true";
        span.contentEditable = "false";
        range.insertNode(span);
        // The block spacer ends the current line; measure after that change, not before it.
        span.style.height = "0px";
        const after = document.createRange();
        after.setStartAfter(span);
        after.collapse(true);
        let y = after.getBoundingClientRect().top - top;
        if (!after.getBoundingClientRect().height)
          y = span.getBoundingClientRect().bottom - top;
        const height = Math.max(0, desired - y);
        span.style.height = `${height}px`;
        const old = spacers.get(host) ?? [];
        old.push({
          offset: localOffset,
          height,
          ...(paragraph !== undefined && paragraph >= 0 ? { paragraph } : {}),
        });
        spacers.set(host, old);
        return;
      }
    }
    const frame =
      unit || part || target.classList.contains("signature-pair")
        ? target
        : (target.closest<HTMLElement>(".quote-sortable") ?? target);
    const previous = parseFloat(getComputedStyle(frame).marginTop) || 0;
    frame.dataset.layoutSpace = "true";
    frame.style.setProperty(
      "margin-top",
      `${previous + desired - local(frame)}px`,
      "important",
    );
  }
  function text(target: HTMLElement, block: Block, part?: string) {
    // Re-measure the remaining lines after each inserted spacer; line wrapping stays browser-native.
    const visited = new Set<Node>();
    let consumed = -1,
      safety = 0;
    while (safety++ < 500) {
      const rows = lines(target);
      let broke = false;
      for (const overflowing of rows) {
        let row = overflowing;
        let offset = sourceOffset(target, row.node, row.at);
        if (
          (row.node.nodeType === 3 && offset <= consumed) ||
          (row.node.nodeType === 1 && visited.has(row.node))
        )
          continue;
        if (row.bottom - top > end() + 0.5) {
          const pageTop = (page - 1) * stride + metrics.margins.top * 96;
          const unitFor = (node: Node) => {
            const element =
              node.nodeType === 1 ? (node as Element) : node.parentElement;
            return element?.closest("li") ?? element?.closest("p") ?? target;
          };
          const unit = unitFor(row.node);
          const remaining = rows.filter(
            (r) =>
              unitFor(r.node) === unit &&
              sourceOffset(target, r.node, r.at) >= consumed,
          );
          const left = remaining.indexOf(row);
          let candidate = left;
          if (
            (remaining.length <= 3 &&
              remaining.at(-1)!.bottom - remaining[0].top <=
                metrics.contentHeight) ||
            left < 2
          )
            candidate = 0;
          else if (remaining.length - left < 2)
            candidate = remaining.length - 2;
          const chosen = remaining[Math.max(0, candidate)] ?? row;
          if (sourceOffset(target, chosen.node, chosen.at) > consumed)
            row = chosen;
          offset = sourceOffset(target, row.node, row.at);
          const host =
            row.node.nodeType === 1
              ? (row.node as Element).closest(
                  ".field-editor,[data-source-text]",
                )
              : hostFor(row.node);
          if (host && overflowing.top - top > pageTop + 2) {
            const wholeUnit =
              row === remaining[0] && sourceOffset(target, unit, 0) === offset;
            const before = rows.slice(0, rows.indexOf(row));
            if (
              part &&
              wholeUnit &&
              consumed < 0 &&
              before.every(
                (r) =>
                  !(
                    r.node.nodeType === 1
                      ? (r.node as Element)
                      : r.node.parentElement
                  )?.closest("p,li"),
              )
            ) {
              newPage(target, block, undefined, undefined, part);
              consumed = 0;
              broke = true;
              break;
            }
            const chip = row.node.parentElement?.closest("[data-field]");
            const first = chip ? sourceTextNodes(chip)[0] : null;
            newPage(
              target,
              block,
              wholeUnit && unit !== target
                ? { node: unit, at: 0 }
                : { node: first ?? row.node, at: first ? 0 : row.at },
              undefined,
              part,
            );
            consumed = offset;
            visited.add(row.node);
            broke = true;
            break;
          }
        }
      }
      if (!broke) break;
    }
  }
  try {
    const blocks = content
      .map((b) => ({
        b,
        el: clone.querySelector<HTMLElement>(
          `[data-block-id="block-${CSS.escape(b.id!)}"] > .block-content,[data-block-id="template-${CSS.escape(b.id!)}"] > .block-content`,
        ),
      }))
      .filter((v) => v.el);
    const explicit: Block[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const { b, el: element } = blocks[i],
        el = element!;
      if (b.type === "page_break") {
        explicit.push(b);
        continue;
      }
      const frame = el.parentElement!;
      while (explicit.length)
        newPage(
          frame,
          b,
          undefined,
          undefined,
          undefined,
          true,
          explicit.shift()!.id,
        );
      const pair = frame.closest<HTMLElement>(".signature-pair");
      const pairFirst =
        pair?.querySelector(".block-sortable") ===
        frame.closest(".block-sortable");
      const height = pairFirst
        ? pair!.getBoundingClientRect().height
        : el.getBoundingClientRect().height;
      const full = metrics.contentHeight;
      const next = blocks
        .slice(i + 1)
        .find((v) => v.b.type !== "page_break")?.el;
      const orphan =
        b.type === "heading" && next
          ? (lines(next)[Math.min(1, lines(next).length - 1)]?.bottom ??
              next.getBoundingClientRect().top + 24) -
            el.getBoundingClientRect().bottom
          : 0;
      if (b.type === "pricing_table" && height > full) {
        const first = el.querySelector<HTMLElement>("[data-print-unit]");
        if (
          first &&
          first.getBoundingClientRect().bottom - top > end() + 0.5 &&
          local(frame) > (page - 1) * stride + metrics.margins.top * 96 + 2
        )
          newPage(frame, b);
      }
      const whole =
        ["signature_block", "image", "heading", "variable"].includes(b.type) ||
        (b.type === "pricing_table" && height <= full);
      if (
        whole &&
        (pairFirst
          ? pair!.getBoundingClientRect().bottom
          : el.getBoundingClientRect().bottom) -
          top +
          Math.max(0, orphan) >
          end() + 0.5 &&
        local(el) > (page - 1) * stride + metrics.margins.top * 96 + 2
      )
        newPage(pairFirst ? pair! : frame, b);
      assignments.push({ block: b.id!, page });
      if (b.type === "paragraph") text(el, b);
      else if (b.type === "contract") {
        for (const clause of el.querySelectorAll<HTMLElement>(
          '[data-block-id^="clause-"],[data-block-id^="template-clause-"]',
        )) {
          const part = clause.dataset.blockId!.replace(
            /^(template-)?clause-/,
            "",
          );
          text(clause, b, part);
        }
      } else if (b.type === "pricing_table" && !whole) {
        for (const unit of el.querySelectorAll<HTMLElement>(
          "[data-print-unit]",
        )) {
          if (unit.parentElement?.closest("[data-print-unit]")) continue;
          if (unit.getBoundingClientRect().bottom - top > end() + 0.5)
            newPage(unit, b, undefined, unit.dataset.printUnit);
        }
      }
    }
    while (explicit.length) {
      const marker = explicit.shift()!;
      const frame = clone.querySelector<HTMLElement>(
        `[data-block-id="block-${CSS.escape(marker.id!)}"],[data-block-id="template-${CSS.escape(marker.id!)}"]`,
      )!;
      newPage(frame, marker, undefined, undefined, undefined, true, marker.id);
    }
    if (decorate) {
      root
        .querySelectorAll<HTMLElement>("[data-layout-space]")
        .forEach((el) => {
          el.style.removeProperty("margin-top");
          delete el.dataset.layoutSpace;
        });
      root
        .querySelectorAll<HTMLElement>(".field-editor,[data-source-text]")
        .forEach((el) =>
          el.dispatchEvent(
            new CustomEvent("editor-source-spacers", { detail: [] }),
          ),
        );
      clone
        .querySelectorAll<HTMLElement>("[data-layout-space]")
        .forEach((el) => {
          const target = live.get(el);
          if (target) {
            target.dataset.layoutSpace = "true";
            target.style.setProperty(
              "margin-top",
              el.style.marginTop,
              "important",
            );
          }
        });
      for (const [host, spaces] of spacers)
        live
          .get(host)
          ?.dispatchEvent(
            new CustomEvent("editor-source-spacers", { detail: spaces }),
          );
      root.style.setProperty("--page-sheets-height", `${page * stride - 24}px`);
    }
    return { plan: { format: 1, pages: page, starts }, assignments };
  } finally {
    clone.remove();
  }
}
