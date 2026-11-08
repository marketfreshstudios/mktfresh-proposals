"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Block } from "../../lib/model";
import type { PagePlan } from "../../lib/page-plan";
export type DropTarget = {
  at: number;
  x: number;
  y: number;
  width: number;
  page: number;
};
const contains = (r: DOMRect, x: number, y: number) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
/** Hit testing only: consume the existing plan and painted sheets; never choose a page break. */
export function documentDropTarget(
  paper: HTMLElement | null,
  content: Block[],
  x: number,
  y: number,
  excluded: string[] = [],
): DropTarget | null {
  if (!paper) return null;
  const root = paper.getBoundingClientRect();
  const region = paper
    .closest(".editor-document-region,.studio-template-main")
    ?.getBoundingClientRect();
  const viewportTop = Math.max(0, region?.top ?? 0);
  const viewportBottom = Math.min(innerHeight, region?.bottom ?? innerHeight);
  if (y < viewportTop || y > viewportBottom) return null;
  if (x < root.left || x > root.right || y < root.top || y > root.bottom)
    return null;
  const frames = [
    ...paper.querySelectorAll<HTMLElement>(".block-frame[data-block-id]"),
  ].filter(
    (el) => !el.closest("[data-page-measurement],[data-sheet-projection]"),
  );
  const frameFor = (b: Block) =>
    frames.find((el) =>
      [`block-${b.id}`, `template-${b.id}`].includes(el.dataset.blockId!),
    );
  for (const el of paper.querySelectorAll<HTMLElement>(
    "[data-band-frame],.document-cover",
  ))
    if (
      el.getClientRects().length &&
      contains(el.getBoundingClientRect(), x, y)
    )
      return null;
  for (const block of content) {
    if (
      excluded.includes(block.id!) ||
      !["pricing_table", "signature_block", "contract"].includes(block.type)
    )
      continue;
    const el = frameFor(block)?.querySelector<HTMLElement>(
      ":scope > .block-content",
    );
    if (el && contains(el.getBoundingClientRect(), x, y)) return null;
  }
  let plan: PagePlan;
  try {
    plan = JSON.parse(paper.dataset.pagination ?? "null");
    // The saved-group mini editor is intentionally unpaged; retain its drop support.
    if (!plan && paper.matches(".studio-blocks:not(.template-paged-paper)"))
      plan = { format: 1, pages: 1, starts: [] };
    if (!plan?.starts) return null;
  } catch {
    return null;
  }
  const sheetElements = [
    ...paper.querySelectorAll<HTMLElement>(
      ":scope > .editor-page-sheets > .page-sheet",
    ),
  ];
  if (
    !sheetElements.length &&
    paper.matches(".studio-blocks:not(.template-paged-paper)")
  )
    sheetElements.push(paper);
  const sheets = sheetElements
    .filter((el) => el.getClientRects().length)
    .map((el) => ({
      el,
      box: el.getBoundingClientRect(),
      page: Number(el.dataset.editorPage ?? 1),
    }));
  const index = (id?: string) => content.findIndex((b) => b.id === id);
  const boundary = (page: number) => {
    if (page <= 1) return 0;
    const start = plan.starts.find((s) => s.page === page);
    if (!start) return content.length;
    return start.marker
      ? index(start.marker) + 1
      : Math.max(0, index(start.block));
  };
  const firstEnd = plan.starts[0]?.marker
    ? index(plan.starts[0].marker)
    : plan.starts[0]
      ? index(plan.starts[0].block)
      : content.length;
  const coverOnly =
    !!paper.querySelector(".document-cover") &&
    !content.slice(0, firstEnd).some((b) => b.type !== "page_break");
  if (coverOnly && sheets[0] && contains(sheets[0].box, x, y)) return null;
  const distance = (r: DOMRect) => Math.max(r.top - y, y - r.bottom, 0);
  // A gap resolves to the closest valid sheet. Cover-only paper is never a target.
  const sheet = sheets
    .filter((s) => !coverOnly || s.page !== 1)
    .sort((a, b) => distance(a.box) - distance(b.box) || b.page - a.page)[0];
  if (!sheet) return null;
  const at = boundary(sheet.page);
  const next = plan.starts.find((s) => s.page === sheet.page + 1);
  const end = next?.marker
    ? index(next.marker)
    : next
      ? index(next.block)
      : content.length;
  const start = plan.starts.find((s) => s.page === sheet.page);
  const continuation =
    !!start &&
    !start.explicit &&
    (start.offset > 0 ||
      start.paragraph !== undefined ||
      !!start.unit ||
      !!start.part);
  const visibleBlocks = content
    .slice(at, Math.max(at + (continuation ? 1 : 0), end))
    .filter((b) => b.type !== "page_break");
  if (
    sheet.page === 1 &&
    paper.querySelector(".document-cover") &&
    !visibleBlocks.length
  )
    return null;
  const style = getComputedStyle(sheet.el);
  const scale = sheet.box.width / sheet.el.offsetWidth;
  const top = sheet.box.top + parseFloat(style.paddingTop || "0") * scale;
  const bottom =
    sheet.box.bottom - parseFloat(style.paddingBottom || "0") * scale;
  const left = sheet.box.left + parseFloat(style.paddingLeft || "0") * scale;
  const right = sheet.box.right - parseFloat(style.paddingRight || "0") * scale;
  // A continuation is not a new block boundary. Never advertise an insertion
  // before its source block at the top of a different displayed page.
  const candidates: { at: number; y: number }[] = continuation
    ? []
    : [{ at, y: top }];
  for (const block of visibleBlocks) {
    if (excluded.includes(block.id!)) continue;
    const frame = frameFor(block);
    if (!frame?.getClientRects().length) continue;
    const pair = frame.closest<HTMLElement>(".signature-pair");
    const box = (pair ?? frame).getBoundingClientRect();
    const n = index(block.id);
    const members = pair
      ? content
          .map((b, i) =>
            frameFor(b)?.closest(".signature-pair") === pair ? i : -1,
          )
          .filter((i) => i >= 0)
      : [n];
    if (box.top >= top - 1 && box.top <= bottom + 1)
      candidates.push({ at: Math.min(...members), y: box.top });
    if (box.bottom >= top - 1 && box.bottom <= bottom + 1)
      candidates.push({ at: Math.max(...members) + 1, y: box.bottom });
  }
  // Empty explicit pages have a real source boundary even without a block element.
  if (visibleBlocks.length) {
    const last = frameFor(visibleBlocks.at(-1)!);
    if (last && last.getBoundingClientRect().bottom <= bottom + 1)
      candidates.push({
        at: Math.max(at, end),
        y: Math.max(top, last.getBoundingClientRect().bottom),
      });
  }
  if (!candidates.length) return null;
  const nearest = candidates.sort(
    (a, b) => Math.abs(a.y - y) - Math.abs(b.y - y) || b.at - a.at,
  )[0];
  const visibleTop = Math.max(top, viewportTop + 8);
  const visibleBottom = Math.min(bottom, viewportBottom - 8);
  if (visibleTop > visibleBottom) return null;
  return {
    ...nearest,
    y: Math.max(visibleTop, Math.min(visibleBottom, nearest.y)),
    page: sheet.page,
    x: left,
    width: Math.max(0, right - left),
  };
}
export function useDropIndicator(
  content: Block[],
  paper: RefObject<HTMLElement | null>,
) {
  const [target, setTarget] = useState<DropTarget | null>(null);
  const point = useRef<{ x: number; y: number; excluded: string[] } | null>(
    null,
  );
  const latest = useRef(content);
  latest.current = content;
  const clear = () => {
    point.current = null;
    setTarget(null);
  };
  const resolve = (x: number, y: number, excluded: string[] = []) =>
    documentDropTarget(paper.current, latest.current, x, y, excluded);
  const show = (x: number, y: number, excluded: string[] = []) => {
    point.current = { x, y, excluded };
    const next = resolve(x, y, excluded);
    setTarget((old) =>
      JSON.stringify(old) === JSON.stringify(next) ? old : next,
    );
    return next;
  };
  useEffect(() => {
    const refresh = () => {
      const p = point.current;
      if (p) show(p.x, p.y, p.excluded);
    };
    window.addEventListener("scroll", refresh, true);
    window.addEventListener("resize", refresh);
    window.addEventListener("dragend", clear);
    return () => {
      window.removeEventListener("scroll", refresh, true);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("dragend", clear);
    };
  }, []);
  return {
    show,
    resolve,
    clear,
    line: target
      ? createPortal(
          <div
            data-editor-chrome
            className="block-drop-line"
            role="status"
            aria-label="Insert block here"
            data-drop-index={target.at}
            data-drop-page={target.page}
            style={{ left: target.x, top: target.y, width: target.width }}
          />,
          document.body,
        )
      : null,
  };
}
