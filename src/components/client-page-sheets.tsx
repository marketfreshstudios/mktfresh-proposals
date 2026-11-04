"use client";
import { useLayoutEffect, useRef } from "react";
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
  busy = false,
  frozen = false,
  onToggle,
  onReady,
  onError,
}: {
  proposal: PublicProposal;
  logo?: string;
  busy?: boolean;
  frozen?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
  onReady?: () => void;
  onError?: () => void;
}) {
  const host = useRef<HTMLElement>(null);
  const latest = useRef({ p, logo, busy, frozen, onToggle, onReady, onError });
  latest.current = { p, logo, busy, frozen, onToggle, onReady, onError };
  useLayoutEffect(() => {
    const el = host.current!,
      shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    shadow.replaceChildren(style);
    let view: HTMLElement | undefined,
      frame = 0,
      serial = 0,
      stopped = false,
      lastWidth = 0,
      focusItem: string | undefined;
    const frames: HTMLElement[] = [];
    function scale(preserve = true) {
      const width = el.clientWidth;
      if (width === lastWidth) return;
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
      if (position)
        requestAnimationFrame(
          () => !stopped && view && restoreClientPosition(view, position),
        );
    }
    const resize = new ResizeObserver(() => scale());
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
        unit.setAttribute("role", "radiogroup");
        unit.setAttribute("aria-label", "Choose one");
      }
      cards.forEach((card) => {
        const item = items.get(card.dataset.clientItemId ?? "");
        if (!item?.optional || current.frozen || !current.onToggle) return;
        const label = document.createElement("label");
        for (const attr of [...card.attributes])
          label.setAttribute(attr.name, attr.value);
        label.classList.add("client-interactive-card");
        label.append(...card.childNodes);
        card.replaceWith(label);
        const input = document.createElement("input");
        input.type = item.choice_group_id ? "radio" : "checkbox";
        input.name = item.choice_group_id ?? item.id;
        input.dataset.clientItem = item.id;
        input.className = "client-sheet-input";
        input.checked = selected(item);
        input.disabled = current.busy;
        input.setAttribute(
          "aria-label",
          `${item.name} · ${selected(item) ? "included" : "not included"}`,
        );
        const slot = label.querySelector<HTMLElement>(".quote-control-slot")!;
        const visual = slot.querySelector<HTMLElement>(".print-selection")!;
        visual.setAttribute("aria-hidden", "true");
        visual.removeAttribute("role");
        visual.removeAttribute("aria-label");
        slot.prepend(input);
      });
    }
    async function paint() {
      const request = ++serial,
        current = latest.current;
      style.textContent = clientDocumentCss(current.p) + sheetCss;
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
      stage.innerHTML = clientDocumentHtml(current.p, current.logo);
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
        const output = paginateClientDocument(stage, current.p, current.logo);
        const position = view && captureClientPosition(view);
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
        for (const [index, block] of current.p.content.entries()) {
          const node = output.root.querySelector<HTMLElement>(
            `[data-print-block="${CSS.escape(block.id ?? String(index))}"]`,
          );
          if (node) node.id = `section-${index}`;
        }
        stage.style.cssText = "";
        stage.removeAttribute("aria-hidden");
        stage.inert = false;
        view?.remove();
        view = stage;
        lastWidth = 0;
        scale(false);
        if (position) restoreClientPosition(stage, position);
        if (
          focusItem &&
          (document.activeElement === el ||
            document.activeElement === document.body)
        )
          stage
            .querySelector<HTMLInputElement>(
              `input[data-client-item="${CSS.escape(focusItem)}"]`,
            )
            ?.focus({ preventScroll: true });
        if (output.plan) el.dataset.pagePlan = JSON.stringify(output.plan);
        el.dataset.pages = String(output.sheets.length);
        el.dataset.layoutReady = "true";
        current.onReady?.();
        if (!loaded)
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
      if (!frame && !stopped)
        frame = requestAnimationFrame(() => {
          frame = 0;
          void paint();
        });
    }
    const refresh = () => schedule();
    el.addEventListener("client-layout-change", refresh);
    document.fonts.addEventListener("loadingdone", refresh);
    schedule();
    return () => {
      stopped = true;
      serial++;
      cancelAnimationFrame(frame);
      resize.disconnect();
      el.removeEventListener("client-layout-change", refresh);
      document.fonts.removeEventListener("loadingdone", refresh);
      shadow.removeEventListener("change", change);
      shadow.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, []);
  useLayoutEffect(() => {
    host.current?.dispatchEvent(new Event("client-layout-change"));
  }, [p, logo, busy, frozen]);
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
.client-interactive-card{cursor:pointer}
.client-sheet-input:focus-visible + .print-selection{outline:3px solid #365c4a;outline-offset:3px}
.client-sheet-input:disabled{cursor:wait}
`;
