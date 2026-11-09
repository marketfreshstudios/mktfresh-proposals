"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { PublicProposal } from "./client-proposal";
import { orderedItems, selected } from "../lib/quote-model";
import { QuoteSchema } from "../lib/model";
import { pageGeometry } from "../lib/page-bands";
import {
  clientDocumentCss,
  clientDocumentHtml,
  paginateClientDocument,
} from "./client-page-document";

type Position = { block: string; top: number };
export function captureClientPosition(root: ParentNode): Position | undefined {
  const nodes = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-print-block],[data-document-block],.document-cover",
    ),
  ];
  const visible = nodes.filter(
    (el) =>
      (el.textContent?.trim() || el.querySelector("img")) &&
      el.getBoundingClientRect().bottom > 80,
  );
  const node =
    visible.find(
      (el) =>
        el.getBoundingClientRect().top >= 80 &&
        el.getBoundingClientRect().top < innerHeight,
    ) ??
    visible.find((el) => el.getBoundingClientRect().top <= 100) ??
    visible[0];
  if (!node) return;
  return {
    block: node.dataset.printBlock ?? node.dataset.documentBlock ?? "cover",
    top: node.getBoundingClientRect().top,
  };
}
export function restoreClientPosition(root: ParentNode, position?: Position) {
  if (!position) return;
  const node = [
    ...root.querySelectorAll<HTMLElement>(
      "[data-print-block],[data-document-block],.document-cover",
    ),
  ].find(
    (el) =>
      (el.dataset.printBlock ?? el.dataset.documentBlock ?? "cover") ===
      position.block,
  );
  if (node) window.scrollBy(0, node.getBoundingClientRect().top - position.top);
}
/** A DOM-owned print projection. React never reconciles nodes split by a PagePlan. */
export function ClientPageSheets({
  proposal: p,
  logo,
  logoIcon,
  busy = false,
  frozen = false,
  onToggle,
  onAsk,
  onReady,
  onError,
}: {
  proposal: PublicProposal;
  logo?: string;
  logoIcon?: string;
  busy?: boolean;
  frozen?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
  onAsk?: (section: string) => void;
  onReady?: () => void;
  onError?: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const projection = useMemo(() => {
    const html = clientDocumentHtml(p, logo, undefined, logoIcon),
      css = clientDocumentCss(p);
    // Response revisions/status and busy changes do not change the document.
    return {
      html,
      css,
      key: JSON.stringify([
        html,
        css,
        p.header_footer,
        p.pagination,
        p.variables,
        logo,
        logoIcon,
      ]),
    };
  }, [p, logo, logoIcon]);
  const latest = useRef({
    p,
    logo,
    logoIcon,
    projection,
    busy,
    frozen,
    onToggle,
    onAsk,
    onReady,
    onError,
  });
  latest.current = {
    p,
    logo,
    logoIcon,
    projection,
    busy,
    frozen,
    onToggle,
    onAsk,
    onReady,
    onError,
  };
  useLayoutEffect(() => {
    const el = host.current!,
      shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    shadow.replaceChildren(style);
    let view: HTMLElement | undefined,
      frame = 0,
      serial = 0,
      committed = 0,
      readyFrame = 0,
      scrollFrame = 0,
      stopped = false,
      lastWidth = 0,
      focusItem: string | undefined;
    const frames: HTMLElement[] = [];
    function scale(preserve = true) {
      const width = el.clientWidth;
      if (width <= 0 || width === lastWidth) return false;
      lastWidth = width;
      const position = preserve && view && captureClientPosition(view);
      const metrics = pageGeometry(
        latest.current.p.resolved_styles,
        latest.current.p.header_footer,
        1,
      );
      const value = Math.min(1, width / metrics.width);
      el.dataset.scale = String(value);
      el.style.setProperty("--client-sheet-scale", String(value));
      for (const page of frames) {
        page.style.height = `${metrics.height * value}px`;
        const sheet = page.firstElementChild as HTMLElement;
        sheet.style.transform = `scale(${value})`;
      }
      if (position) {
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(
          () => !stopped && view && restoreClientPosition(view, position),
        );
      }
      return true;
    }
    function ready(request: number) {
      cancelAnimationFrame(readyFrame);
      readyFrame = requestAnimationFrame(() => {
        if (stopped || request !== serial || committed !== request) return;
        // Account for the scrollbar/column width before reporting a stable layout.
        if (scale(false)) {
          ready(request);
          return;
        }
        el.dataset.layoutReady = "true";
        if (latest.current.p.resolved_styles?.layout?.quote_layout === "table")
          syncControls();
        latest.current.onReady?.();
      });
    }
    const resize = new ResizeObserver(() => {
      if (scale()) {
        el.dataset.layoutReady = "false";
        if (committed === serial) ready(committed);
      }
    });
    resize.observe(el);
    const change = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.matches("input[data-client-item]") && !input.disabled)
        latest.current.onToggle?.(input.dataset.clientItem!, input.checked);
    };
    shadow.addEventListener("change", change);
    const focus = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.clientItem) focusItem = input.dataset.clientItem;
    };
    shadow.addEventListener("focusin", focus);
    const outside = (event: PointerEvent) => {
      if (!event.composedPath().includes(el)) focusItem = undefined;
    };
    document.addEventListener("pointerdown", outside, true);
    function controls(root: HTMLElement) {
      const current = latest.current;
      const items = new Map(
        orderedItems(QuoteSchema.parse(current.p.quote)).map((i) => [i.id, i]),
      );
      const cards = [
        ...root.querySelectorAll<HTMLElement>(
          ".print-pricing-card[data-client-item-id]",
        ),
      ];
      for (const unit of root.querySelectorAll<HTMLElement>(
        ".print-choice-group",
      )) {
        if (current.frozen || !current.onToggle) continue;
        // A section cannot have the radiogroup role. This wrapper is installed
        // after layout, so the shared print structure and breaks stay intact.
        const group = document.createElement("div");
        for (const attr of [...unit.attributes])
          group.setAttribute(attr.name, attr.value);
        group.setAttribute("role", "radiogroup");
        group.setAttribute("aria-label", "Choose one");
        group.append(...unit.childNodes);
        unit.replaceWith(group);
      }
      const retained = new Map(
        [
          ...(view?.querySelectorAll<HTMLInputElement>(
            "input[data-client-item]",
          ) ?? []),
        ].map((input) => [input.dataset.clientItem!, input]),
      );
      cards.forEach((card) => {
        const item = items.get(card.dataset.clientItemId ?? "");
        if (!item?.optional || current.frozen || !current.onToggle) return;
        const tableRow = card.tagName === "TR";
        const label = tableRow ? card : document.createElement("label");
        for (const attr of [...card.attributes])
          label.setAttribute(attr.name, attr.value);
        label.classList.add("client-interactive-card");
        if (!tableRow) {
          label.append(...card.childNodes);
          card.replaceWith(label);
        }
        // Keep the native node through optimistic/server responses. Replacing it
        // during a click detaches the active control before its action completes.
        const input = retained.get(item.id) ?? document.createElement("input");
        input.type = item.choice_group_id ? "radio" : "checkbox";
        input.name = item.choice_group_id ?? item.id;
        input.dataset.clientItem = item.id;
        input.className = "client-sheet-input";
        input.checked = selected(item);
        input.disabled =
          current.busy || (tableRow && el.dataset.layoutReady !== "true");
        input.setAttribute(
          "aria-label",
          `${item.name} · ${selected(item) ? "included" : "not included"}`,
        );
        const slot = label.querySelector<HTMLElement>(".quote-control-slot")!;
        const visual = slot.querySelector<HTMLElement>(".print-selection")!;
        visual.setAttribute("aria-hidden", "true");
        visual.removeAttribute("role");
        visual.removeAttribute("aria-label");
        if (tableRow) {
          const hit = document.createElement("label");
          hit.className = "quote-table-hit";
          hit.append(input);
          slot.prepend(hit);
        } else slot.prepend(input);
      });
    }
    function focusControl() {
      if (
        focusItem &&
        (document.activeElement === el ||
          document.activeElement === document.body)
      )
        view
          ?.querySelector<HTMLInputElement>(
            `input[data-client-item="${CSS.escape(focusItem)}"]`,
          )
          ?.focus({ preventScroll: true });
    }
    function syncControls() {
      view
        ?.querySelectorAll<HTMLInputElement>("input[data-client-item]")
        .forEach((input) => {
          input.disabled =
            latest.current.busy ||
            latest.current.frozen ||
            (latest.current.p.resolved_styles?.layout?.quote_layout ===
              "table" &&
              el.dataset.layoutReady !== "true");
        });
      if (!latest.current.busy) focusControl();
    }
    async function paint() {
      const request = ++serial,
        current = latest.current;
      style.textContent = current.projection.css + sheetCss;
      const stage = document.createElement("div");
      stage.className = "client-canonical";
      Object.assign(stage.style, {
        position: "absolute",
        top: "0",
        left: "0",
        visibility: "hidden",
        width: `${pageGeometry(current.p.resolved_styles, current.p.header_footer, 1).width}px`,
        pointerEvents: "none",
      });
      stage.setAttribute("aria-hidden", "true");
      stage.inert = true;
      stage.innerHTML = current.projection.html;
      shadow.append(stage);
      stage.getBoundingClientRect();
      const assets = Promise.all([
        document.fonts.ready,
        ...[...stage.querySelectorAll("img")].map((img) =>
          img.decode().catch(() => {}),
        ),
      ]);
      let loaded = false;
      assets.then(() => {
        loaded = true;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        assets,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1000);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (stopped || request !== serial) {
        stage.remove();
        return;
      }
      try {
        const output = paginateClientDocument(
          stage,
          current.p,
          current.logo,
          undefined,
          current.logoIcon,
        );
        const position = view && captureClientPosition(view);
        // A pricing block may span several sheets. Keep the active control's
        // position rather than scrolling to that block's first fragment.
        const readingControl =
          focusItem &&
          (document.activeElement === el ||
            document.activeElement === document.body)
            ? view?.querySelector<HTMLInputElement>(
                `input[data-client-item="${CSS.escape(focusItem)}"]`,
              )
            : undefined;
        const controlTop = readingControl?.getBoundingClientRect().top;
        const focused =
          shadow.activeElement instanceof HTMLElement &&
          shadow.activeElement.dataset.clientItem;
        if (focused) focusItem = focused;
        controls(output.root);
        for (const source of output.root.querySelectorAll<HTMLElement>(
          "[data-print-block]",
        ))
          source.dataset.documentBlock = source.dataset.printBlock;
        // Distinguish the printed document totals from the interactive choices summary.
        output.root
          .querySelector(".document-totals")
          ?.setAttribute("aria-label", "Document totals");
        frames.length = 0;
        output.root.style.width = "100%";
        output.root.classList.add("client-pages-root");
        output.sheets.forEach((sheet, index) => {
          const g = pageGeometry(
            current.p.resolved_styles,
            current.p.header_footer,
            index + 1,
          );
          if (index) {
            const gap = document.createElement("div");
            gap.className = "client-sheet-gap";
            gap.textContent = `PAGE ${index + 1}`;
            gap.dataset.pageLabel = String(index + 1);
            output.root.insertBefore(gap, sheet);
          }
          const frame = document.createElement("section");
          frame.className = "client-page-frame";
          frame.setAttribute("aria-label", `Page ${index + 1}`);
          frame.dataset.page = String(index + 1);
          const paper = document.createElement("div");
          paper.className = "client-letter-sheet";
          Object.assign(paper.style, {
            width: `${g.width}px`,
            height: `${g.height}px`,
            padding: `${g.margins.top}px ${g.margins.right}px ${g.margins.bottom}px ${g.margins.left}px`,
          });
          sheet.replaceWith(frame);
          paper.append(sheet);
          frame.append(paper);
          frames.push(frame);
        });
        const rightMargin = pageGeometry(
          current.p.resolved_styles,
          current.p.header_footer,
          1,
        ).margins.right;
        for (const [index, block] of current.p.content.entries()) {
          const node = output.root.querySelector<HTMLElement>(
            `[data-print-block="${CSS.escape(block.id ?? String(index))}"]`,
          );
          if (!node) continue;
          node.id = `section-${index}`;
          if (
            !current.onAsk ||
            block.type !== "heading" ||
            (block.level ?? 1) !== 1 ||
            rightMargin < 54
          )
            continue;
          const paper = node.closest(".client-letter-sheet");
          const heading = node.querySelector("h2");
          if (!paper || !heading) continue;
          // This link is a page-margin action. The frozen content never measures it.
          const link = document.createElement("a");
          link.href = "#ask-question";
          link.className = "client-section-question";
          link.textContent = "Ask about this";
          link.setAttribute(
            "aria-label",
            `Ask about this: ${heading.textContent?.trim() || "Section"}`,
          );
          link.setAttribute("aria-haspopup", "dialog");
          link.style.top = `${heading.getBoundingClientRect().top - paper.getBoundingClientRect().top}px`;
          link.addEventListener("click", (event) => {
            event.preventDefault();
            latest.current.onAsk?.(`section:${block.id ?? index}`);
          });
          paper.append(link);
        }
        // Prepare every new frame before exposing it, avoiding a zero-height
        // intermediate document and scrollbar-driven width oscillation.
        lastWidth = 0;
        scale(false);
        stage.style.cssText = "";
        stage.removeAttribute("aria-hidden");
        stage.inert = false;
        view?.remove();
        view = stage;
        if (readingControl?.isConnected && controlTop !== undefined)
          window.scrollBy(
            0,
            readingControl.getBoundingClientRect().top - controlTop,
          );
        else if (position) restoreClientPosition(stage, position);
        focusControl();
        if (output.plan) el.dataset.pagePlan = JSON.stringify(output.plan);
        el.dataset.pages = String(output.sheets.length);
        committed = request;
        ready(request);
        if (!loaded && !current.p.pagination)
          assets.then(() => {
            if (!stopped && request === serial) schedule();
          });
      } catch (error) {
        stage.remove();
        el.dataset.layoutError =
          error instanceof Error ? error.message : "Unable to lay out pages";
        current.onError?.();
      }
    }
    function schedule() {
      if (!frame && !stopped) {
        el.dataset.layoutReady = "false";
        if (latest.current.p.resolved_styles?.layout?.quote_layout === "table")
          syncControls();
        cancelAnimationFrame(readyFrame);
        frame = requestAnimationFrame(() => {
          frame = 0;
          void paint();
        });
      }
    }
    const refresh = () => schedule();
    el.addEventListener("client-layout-change", refresh);
    // Frozen plans do not depend on loaded browser font metrics. Their text
    // reflows naturally; only unplanned documents need the print paginator again.
    const fontsLoaded = () => {
      if (!latest.current.p.pagination) schedule();
    };
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    el.addEventListener("client-controls-change", syncControls);
    schedule();
    return () => {
      stopped = true;
      serial++;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(readyFrame);
      cancelAnimationFrame(scrollFrame);
      resize.disconnect();
      el.removeEventListener("client-layout-change", refresh);
      document.fonts.removeEventListener("loadingdone", fontsLoaded);
      el.removeEventListener("client-controls-change", syncControls);
      shadow.removeEventListener("change", change);
      shadow.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, []);
  useLayoutEffect(() => {
    host.current?.dispatchEvent(new Event("client-layout-change"));
  }, [projection.key, frozen, !!onAsk]);
  useLayoutEffect(() => {
    host.current?.dispatchEvent(new Event("client-controls-change"));
  }, [busy, frozen]);
  return (
    <article
      ref={host}
      id="proposal-document"
      className="client-document-sheets"
      aria-label="Proposal document"
    />
  );
}
const sheetCss = `
:host{display:block;position:relative;min-width:0;width:100%}
.client-pages-root{width:100%;min-width:0}
.client-page-frame{position:relative;overflow:clip;width:100%;background:white;border-radius:4px;box-shadow:0 1px 3px rgba(20,18,14,.08),0 14px 32px rgba(20,18,14,.08)}
.client-letter-sheet{position:absolute;left:0;top:0;transform-origin:top left;background:white;box-sizing:border-box}
.client-sheet-content{display:flow-root;position:relative}
.client-sheet-gap{height:52px;display:flex;align-items:center;justify-content:center;background:var(--surface-page,#f2efe9);color:var(--ink-muted,#5f5b53);font:600 11px/16px "Instrument Sans",sans-serif;letter-spacing:.08em}
.proposal-typography.proposal-typography .flow-quote-line>.quote-control-slot{position:relative}
.proposal-typography.proposal-typography .flow-quote-line .client-sheet-input{position:absolute;left:10px;top:10px;transform:translate(-50%,-50%);width:calc(44px / var(--client-sheet-scale,1));height:calc(44px / var(--client-sheet-scale,1));min-height:calc(44px / var(--client-sheet-scale,1));margin:0;padding:0;border:0;opacity:0;z-index:1;cursor:pointer}
.proposal-typography.proposal-typography .quote-table .client-sheet-input{position:absolute;left:22px;top:22px;transform:translate(-50%,-50%);width:calc(44px / var(--client-sheet-scale,1));height:calc(44px / var(--client-sheet-scale,1));min-height:calc(44px / var(--client-sheet-scale,1));border:0;opacity:0;z-index:1;cursor:pointer}.quote-table .quote-control-slot:focus-within>.print-selection{outline:3px solid var(--client-accent-text);outline-offset:3px}
.client-interactive-card{cursor:pointer}
.client-sheet-input:focus-visible + .print-selection{outline:3px solid var(--client-accent-text);outline-offset:3px}
.client-sheet-input:disabled{cursor:wait}
.client-section-question{position:absolute;inset-inline-end:2px;display:grid;place-items:center;text-align:center;inline-size:max-content;min-height:calc(44px / var(--client-sheet-scale,1));padding:2px 4px;white-space:nowrap;border:0;border-radius:var(--radius-button,9999px);background:transparent;color:var(--client-accent-text,#365c4a);font:600 11px/1.2 var(--font-ui,"Instrument Sans"),sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.client-section-question:hover{background:var(--client-selection)}.client-section-question:focus-visible{outline:2px solid var(--client-accent-text);outline-offset:1px}
/* These rules apply only after pagination. Preserve every shared print box. */
.client-pages-root.proposal-typography.proposal-typography .print-choice-group{background:var(--paper);border-color:var(--client-frame)}
.client-pages-root.proposal-typography.proposal-typography .print-choice-group>h3{color:var(--client-accent-text)}
.client-pages-root.proposal-typography.proposal-typography .print-choice-group .flow-quote-line{border-radius:0;box-shadow:none;background:transparent}
.client-pages-root.proposal-typography.proposal-typography .print-choice-group .flow-quote-line+.flow-quote-line{position:relative}
.client-pages-root.proposal-typography.proposal-typography .print-choice-group .flow-quote-line+.flow-quote-line::before{content:"";position:absolute;inset:-4px 0 auto;height:1px;background:var(--paper-border)}
.client-pages-root.proposal-typography.proposal-typography .client-interactive-card.selected{background:var(--client-selection);box-shadow:inset 3px 0 var(--accent)}
.client-pages-root .quote-table-row:has(input:checked){background:var(--client-selection);box-shadow:inset 3px 0 var(--accent)}
.client-pages-root .print-selection[data-checked=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.client-pages-root .print-radio[data-checked=true]{background:var(--paper);color:var(--accent)}
@media print{.client-section-question{display:none}}
`;
