"use client";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import { PageSheet, type SheetBox } from "./editor/page-sheet";
import { projectPageSheets } from "./editor/project-page-sheets";
import { useBlockSelection } from "./block-controls";
import type { Block } from "../lib/model";
import { pageMetrics, type ResolvedStyles } from "../lib/proposal-styles";
import { paginateBrowser, type BrowserPages } from "./browser-pagination";
export type { BrowserPages } from "./browser-pagination";
/** Browser pagination owns both the sheets and the saved print break points. */
export function PagedPaper({
  paper,
  content,
  styles,
  enabled = true,
  sheets = false,
  contentKey,
  onPagination,
}: {
  paper: RefObject<HTMLElement | null>;
  content: Block[];
  styles: ResolvedStyles;
  enabled?: boolean;
  sheets?: boolean;
  contentKey: string;
  onPagination: (value: BrowserPages) => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const selection = useBlockSelection();
  const [boxes, setBoxes] = useState<SheetBox[]>([{ top: 0, height: 320 }]);
  const metrics = pageMetrics(styles),
    [pages, setPages] = useState(1);
  const [measuredKey, setMeasuredKey] = useState("");
  const [sources, setSources] = useState<BrowserPages | null>(null);
  const latest = useRef({
    content,
    styles,
    onPagination,
    enabled,
    sheets,
    contentKey,
  });
  latest.current = {
    content,
    styles,
    onPagination,
    enabled,
    sheets,
    contentKey,
  };
  useLayoutEffect(() => {
    const root = surface.current?.parentElement;
    if (!root) return;
    let frame = 0,
      stopped = false,
      running = false;
    let width = root.clientWidth;
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element ? r.target : r.target.parentElement
            )?.closest(
              "[data-editor-chrome],.editor-page-sheets,.document-page-count",
            ),
        )
      )
        schedule();
    });
    const observe = () =>
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    function update() {
      if (stopped || running) return;
      cancelAnimationFrame(frame);
      frame = 0;
      running = true;
      observer.disconnect();
      try {
        const v = latest.current;
        if (
          Array.from(root!.querySelectorAll(".field-editor")).some(
            (el) => !el.querySelector(".tiptap"),
          )
        ) {
          setMeasuredKey("");
          schedule();
          return;
        }
        if (!v.enabled) {
          root!
            .querySelectorAll<HTMLElement>("[data-layout-space]")
            .forEach((el) => {
              el.style.removeProperty("margin-top");
              delete el.dataset.layoutSpace;
            });
          root!
            .querySelectorAll<HTMLElement>(".field-editor,[data-source-text]")
            .forEach((el) =>
              el.dispatchEvent(
                new CustomEvent("editor-source-spacers", { detail: [] }),
              ),
            );
          root!.style.removeProperty("--page-sheets-height");
        }
        // The existing engine still chooses every source break. Its old painting
        // is used on phone; desktop projects that same plan into responsive sheets.
        const value = paginateBrowser(
          root!,
          v.content,
          v.styles,
          v.enabled && !v.sheets,
        );
        if (v.enabled && v.sheets)
          setBoxes(projectPageSheets(root!, v.content, value.plan));
        setPages(value.plan.pages);
        setMeasuredKey(v.contentKey);
        setSources(value);
        root!.dataset.pagination = JSON.stringify(value.plan);
        root!.dataset.pageAssignments = JSON.stringify(value.assignments);
        v.onPagination(value);
      } finally {
        running = false;
        observe();
      }
    }
    function schedule() {
      if (!stopped && !frame)
        frame = requestAnimationFrame(() => flushSync(update));
    }
    const flush = () => flushSync(update);
    root.addEventListener("pagination-flush", flush);
    root.addEventListener("pagination-layout-change", schedule);
    root.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    const resize = new ResizeObserver(() => {
      if (latest.current.sheets && root.clientWidth !== width) {
        width = root.clientWidth;
        schedule();
      }
    });
    resize.observe(root);
    observe();
    queueMicrotask(() => {
      if (!stopped) flushSync(update);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener("pagination-flush", flush);
      root.removeEventListener("pagination-layout-change", schedule);
      root.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [enabled, sheets]);
  useLayoutEffect(() => {
    surface.current?.parentElement?.dispatchEvent(
      new Event("pagination-layout-change"),
    );
  }, [contentKey, JSON.stringify(styles)]);
  if (!enabled) return <div ref={surface} hidden />;
  return (
    <div
      ref={surface}
      className="editor-page-sheets"
      aria-label="Document pages"
      data-sheet-view={sheets}
      data-layout-settled={measuredKey === contentKey}
      data-approximate="false"
      data-layout-mode="browser"
      data-layout-max-error="0"
      style={{
        height: sheets
          ? (boxes.at(-1)?.top ?? 0) + (boxes.at(-1)?.height ?? 320)
          : pages * (metrics.height + 24) - 24,
      }}
    >
      {sheets
        ? boxes.map((box, n) => (
            <PageSheet
              key={n}
              number={n + 1}
              box={box}
              fragments={[
                ...(sources?.assignments ?? []).filter((v) => v.page === n + 1),
                ...(sources?.plan.starts ?? []).filter((v) => v.page === n + 1),
              ]}
              showLabel={n > 0}
              onBackgroundClick={selection.clear}
            />
          ))
        : Array.from({ length: pages }, (_, n) => (
            <section
              key={n}
              className="editor-page-sheet page-sheet"
              data-editor-page={n + 1}
              data-source-fragments={JSON.stringify([
                ...(sources?.assignments ?? []).filter((v) => v.page === n + 1),
                ...(sources?.plan.starts ?? []).filter((v) => v.page === n + 1),
              ])}
              style={{
                top: n * (metrics.height + 24),
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
