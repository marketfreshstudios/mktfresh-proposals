"use client";
import { useEffect, useState, type RefObject } from "react";
import type { PrintLayout, PageFragment } from "../lib/document-print";
import { pageMetrics, type ResolvedStyles } from "../lib/proposal-styles";
import type { SourceSpacer } from "./page-spacers";
/** Source anchors are emitted by the PDF engine, never inferred from browser page heights. */
function source(root: HTMLElement, f: PageFragment) {
  const block =
    f.block === "cover"
      ? root.querySelector<HTMLElement>(".document-cover")
      : root.querySelector<HTMLElement>(
          `[data-block-id="block-${CSS.escape(f.block)}"] > .block-content,[data-block-id="template-${CSS.escape(f.block)}"] > .block-content`,
        );
  if (!block) return;
  const part = f.part
    ? block.querySelector<HTMLElement>(
        `[data-block-id="clause-${CSS.escape(f.part)}"] > .block-content,[data-block-id="template-clause-${CSS.escape(f.part)}"] > .block-content`,
      )
    : null;
  const unit = f.unit
    ? block.querySelector<HTMLElement>(
        `[data-print-unit="${CSS.escape(f.unit)}"]`,
      )
    : null;
  const target = unit ?? part ?? block;
  let offset = unit ? 0 : part ? (f.part_offset ?? 0) : f.offset;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      !node.parentElement?.getClientRects().length ||
      node.parentElement?.closest(
        ".block-tools,.drag-handle,textarea,[data-pagination-spacer],.sr-only,.document-edit-item",
      )
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const raw = node.textContent ?? "",
      strip =
        !!part ||
        !!node.parentElement?.closest('[data-field="client.address"]'),
      length = strip ? raw.replace(/\n/g, "").length : raw.length;
    if (!length) continue;
    if (offset < length || offset === 0) {
      let at = offset;
      if (strip) {
        at = 0;
        let count = 0;
        while (at < raw.length && count < offset) {
          if (raw[at] !== "\n") count++;
          at++;
        }
      }
      const r = document.createRange();
      r.setStart(node, Math.min(at, raw.length));
      r.setEnd(node, Math.min(at + 1, raw.length));
      const host = node.parentElement?.closest<HTMLElement>(
        ".field-editor,[data-source-text]",
      );
      let local = 0;
      if (host) {
        const range = document.createRange();
        range.selectNodeContents(host);
        range.setEnd(node, at);
        const fragment = range.cloneContents();
        fragment
          .querySelectorAll(
            ".rich-toolbar,[data-pagination-spacer],.toolbar-popover",
          )
          .forEach((el) => el.remove());
        local = (fragment.textContent ?? "").replace(/\n/g, "").length;
      }
      return { range: r, host, local, target, block, part, unit };
    }
    offset -= length;
  }
  const image = target.querySelector("img");
  if (image) {
    const range = document.createRange();
    range.selectNode(image);
    return { range, host: null, local: 0, target, block, part, unit };
  }
}
export function PagedPaper({
  paper,
  layout,
  styles,
  approximate,
  enabled = true,
  contentKey,
}: {
  paper: RefObject<HTMLElement | null>;
  layout?: PrintLayout | null;
  styles: ResolvedStyles;
  approximate: boolean;
  enabled?: boolean;
  contentKey: string;
}) {
  const metrics = pageMetrics(styles),
    [settled, setSettled] = useState(false),
    [maxError, setMaxError] = useState(0);
  useEffect(() => {
    const root = paper.current;
    if (!root) return;
    const clear = () => {
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
    };
    clear();
    setSettled(false);
    if (!enabled || approximate || !layout?.sheets) return;
    let stopped = false,
      frame = 0,
      pass = 0;
    const gaps = new Map<HTMLElement, SourceSpacer[]>();
    const update = () => {
      if (stopped) return;
      const scale = root.getBoundingClientRect().width / root.offsetWidth,
        top = root.getBoundingClientRect().top;
      let largest = 0;
      const errors: unknown[] = [];
      for (const [page, sheet] of layout.sheets!.entries())
        for (const f of sheet.fragments) {
          const a = source(root, f);
          if (!a || !a.range.getBoundingClientRect().height) {
            largest = 1000000;
            errors.push({ missing: true, ...f, page: page + 1 });
            continue;
          }
          const current = (a.range.getBoundingClientRect().top - top) / scale,
            desired = page * 1080 + metrics.margins.top * 96 + f.y,
            delta = desired - current;
          if (Math.abs(delta) < 0.4) continue;
          largest = Math.max(largest, Math.abs(delta));
          errors.push({ ...f, page: page + 1, current, desired, delta });
          if (
            (f.offset === 0 && !f.part && !f.unit) ||
            f.unit ||
            (f.part && (f.part_offset ?? 0) === 0)
          ) {
            const el = f.unit ? a.unit! : f.part ? a.part! : a.block;
            const container = f.unit
              ? el
              : (el.closest<HTMLElement>(".quote-sortable") ?? el);
            const previous = parseFloat(container.style.marginTop) || 0;
            container.dataset.layoutSpace = "true";
            container.style.setProperty(
              "margin-top",
              `${previous + delta}px`,
              "important",
            );
          } else if (a.host) {
            const spaces = gaps.get(a.host) ?? [],
              old = spaces.find((s) => s.offset === a.local);
            if (old) old.height = Math.max(0, old.height + delta);
            else spaces.push({ offset: a.local, height: Math.max(0, delta) });
            gaps.set(a.host, spaces);
            a.host.dispatchEvent(
              new CustomEvent("editor-source-spacers", { detail: [...spaces] }),
            );
          }
        }
      if (++pass < 8 && largest > 0.5) frame = requestAnimationFrame(update);
      else {
        root.dataset.layoutErrors = JSON.stringify(errors);
        setMaxError(largest);
        setSettled(true);
      }
    };
    const fonts = () => {
      if (!stopped) {
        pass = 0;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      }
    };
    document.fonts.addEventListener("loadingdone", fonts);
    frame = requestAnimationFrame(() => requestAnimationFrame(update));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", fonts);
      if (root.isConnected) clear();
    };
  }, [
    layout,
    approximate,
    contentKey,
    enabled,
    styles.layout?.density,
    JSON.stringify(styles.layout?.margins),
  ]);
  const pages = layout?.pages ?? 1;
  if (!enabled) return null;
  return (
    <div
      className="editor-page-sheets"
      aria-label="Document pages"
      data-layout-settled={settled}
      data-approximate={approximate || maxError > 1}
      data-layout-max-error={maxError}
      style={{ height: pages * 1080 - 24 }}
    >
      {Array.from({ length: pages }, (_, n) => (
        <section
          key={n}
          className="editor-page-sheet"
          data-editor-page={n + 1}
          data-source-fragments={JSON.stringify(
            layout?.sheets?.[n]?.fragments ?? [],
          )}
          style={{
            top: n * 1080,
            width: metrics.width,
            height: metrics.height,
          }}
          aria-label={`Page ${n + 1}${n === 0 ? " · Cover" : ""}`}
        >
          <small>
            Page {n + 1}
            {n === 0 ? " · Cover" : ""}
            {approximate || maxError > 1 ? " · approximate" : ""}
          </small>
        </section>
      ))}
    </div>
  );
}
