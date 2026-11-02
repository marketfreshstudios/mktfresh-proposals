"use client";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
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
  const empty = target.querySelector("p:empty,p:has(>br:only-child)");
  if (empty) {
    const range = document.createRange();
    range.selectNode(empty);
    return { range, host: null, local: 0, target, block, part, unit };
  }
}
/** Measure on an inert clone, then commit all source decorations before the browser paints.
 * Dirty content retains the previous server breaks; no browser pagination is substituted.
 */
export function PagedPaper({
  paper,
  layout,
  styles,
  approximate,
  enabled = true,
  contentKey,
  fingerprint,
}: {
  paper: RefObject<HTMLElement | null>;
  layout?: PrintLayout | null;
  styles: ResolvedStyles;
  approximate: boolean;
  enabled?: boolean;
  contentKey: string;
  fingerprint?: string;
}) {
  const metrics = pageMetrics(styles),
    [displayLayout, setDisplayLayout] = useState<PrintLayout | null>(null),
    [settled, setSettled] = useState(false),
    [maxError, setMaxError] = useState(0),
    [fontVersion, setFontVersion] = useState(0);
  const clear = (root: HTMLElement) => {
    root.querySelectorAll<HTMLElement>("[data-layout-space]").forEach((el) => {
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
  useEffect(() => {
    const fonts = () => setFontVersion((n) => n + 1);
    document.fonts.addEventListener("loadingdone", fonts);
    return () => document.fonts.removeEventListener("loadingdone", fonts);
  }, []);
  useLayoutEffect(() => {
    const root = paper.current;
    if (!root) return;
    if (!enabled) {
      clear(root);
      setDisplayLayout(null);
      setSettled(false);
      return;
    }
    if (approximate || !layout?.sheets) return;
    let waiting = false,
      stopped = false,
      frame = 0;
    const update = () => {
      if (stopped) return;
      waiting = false;
      const clone = root.cloneNode(true) as HTMLElement;
      const originals = [root, ...root.querySelectorAll<HTMLElement>("*")];
      const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
      const original = new WeakMap<HTMLElement, HTMLElement>(
        copies.map((el, n) => [el, originals[n]]),
      );
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      clone.dataset.pageMeasurement = "true";
      Object.assign(clone.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        transform: "none",
        visibility: "hidden",
        pointerEvents: "none",
        minHeight: "0px",
        zIndex: "-100",
      });
      clone.style.setProperty("width", `${metrics.width}px`, "important");
      clone
        .querySelectorAll(
          "style,[data-pagination-spacer],.editor-page-sheets,.document-page-count",
        )
        .forEach((el) => el.remove());
      clone
        .querySelectorAll<HTMLElement>("[data-layout-space]")
        .forEach((el) => {
          el.style.removeProperty("margin-top");
          delete el.dataset.layoutSpace;
        });
      clone.querySelectorAll<HTMLElement>(".quote-sortable").forEach((el) => {
        el.style.transform = "none";
        el.style.transition = "none";
      });
      root.parentElement!.append(clone);
      const gaps = new Map<HTMLElement, SourceSpacer[]>(),
        gapNodes = new Map<HTMLElement, Map<number, HTMLElement>>();
      let largest = 0;
      const errors: unknown[] = [];
      try {
        for (let pass = 0; pass < 8; pass++) {
          largest = 0;
          errors.length = 0;
          const top = clone.getBoundingClientRect().top;
          for (const [page, sheet] of layout.sheets!.entries())
            for (const f of sheet.fragments) {
              const a = source(clone, f);
              if (!a || !a.range.getBoundingClientRect().height) {
                // Empty authoring blocks have no printable glyph; their editing placeholder
                // does not introduce a fabricated print boundary.
                if (
                  a?.target.textContent?.trim() === "" ||
                  (f.box_bottom !== undefined &&
                    f.box_top !== undefined &&
                    f.box_bottom - f.box_top < 0.1)
                )
                  continue;
                largest = 1000000;
                errors.push({ missing: true, ...f, page: page + 1 });
                continue;
              }
              const current = a.range.getBoundingClientRect().top - top,
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
                const previous =
                  parseFloat(getComputedStyle(container).marginTop) || 0;
                container.dataset.layoutSpace = "true";
                container.style.setProperty(
                  "margin-top",
                  `${previous + delta}px`,
                  "important",
                );
              } else if (a.host) {
                const spaces = gaps.get(a.host) ?? [],
                  old = spaces.find((s) => s.offset === a.local);
                const height = Math.max(0, (old?.height ?? 0) + delta);
                if (old) old.height = height;
                else spaces.push({ offset: a.local, height });
                gaps.set(a.host, spaces);
                const nodes =
                  gapNodes.get(a.host) ?? new Map<number, HTMLElement>();
                let span = nodes.get(a.local);
                if (!span) {
                  span = document.createElement("span");
                  span.className = "pdf-source-spacer";
                  span.dataset.paginationSpacer = "true";
                  span.contentEditable = "false";
                  const at = a.range.cloneRange();
                  at.collapse(true);
                  at.insertNode(span);
                  nodes.set(a.local, span);
                  gapNodes.set(a.host, nodes);
                }
                span.style.height = `${height}px`;
              }
            }
          if (largest <= 0.5) break;
        }
        root.dataset.layoutErrors = JSON.stringify(errors);
        setMaxError(largest);
        if (largest > 1) {
          waiting = errors.some((error: any) => error.missing);
          return;
        }
        // Layout effects and metadata-only ProseMirror transactions finish before paint.
        // Plain clause spacer state updates are batched in this same layout commit.
        clear(root);
        clone
          .querySelectorAll<HTMLElement>("[data-layout-space]")
          .forEach((el) => {
            const live = original.get(el);
            if (live) {
              live.dataset.layoutSpace = "true";
              live.style.setProperty(
                "margin-top",
                el.style.marginTop,
                "important",
              );
            }
          });
        for (const [host, spaces] of gaps)
          original
            .get(host)
            ?.dispatchEvent(
              new CustomEvent("editor-source-spacers", { detail: spaces }),
            );
        root.dataset.layoutFingerprint = fingerprint ?? "";
        setDisplayLayout(layout);
        setSettled(true);
      } finally {
        clone.remove();
      }
    };
    const observer = new MutationObserver(() => {
      if (waiting && !stopped) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => flushSync(update));
      }
    });
    // Restored/new rich-text editors mount after the parent's layout effect.
    // Retry only missing source anchors, without a new request or an estimate.
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    // PagedPaper precedes the editable blocks in DOM order. Let all sibling
    // layout effects register their spacer listeners, then commit before paint.
    queueMicrotask(() => {
      if (!stopped) flushSync(update);
    });
    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [
    layout,
    approximate,
    contentKey,
    enabled,
    fontVersion,
    JSON.stringify(styles.layout),
  ]);
  const pages = displayLayout?.pages ?? 1;
  if (!enabled) return null;
  return (
    <div
      className="editor-page-sheets"
      aria-label="Document pages"
      data-layout-settled={settled}
      data-approximate={approximate || !settled || maxError > 1}
      data-layout-max-error={maxError}
      data-layout-updating={approximate}
      style={{ height: pages * 1080 - 24 }}
    >
      {Array.from({ length: pages }, (_, n) => (
        <section
          key={n}
          className="editor-page-sheet page-sheet"
          data-editor-page={n + 1}
          data-source-fragments={JSON.stringify(
            displayLayout?.sheets?.[n]?.fragments ?? [],
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
          </small>
        </section>
      ))}
    </div>
  );
}
