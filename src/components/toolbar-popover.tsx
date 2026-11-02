"use client";
import { useManagedPopover } from "./editor-popovers";
import { useLayoutEffect, useRef, type ReactNode } from "react";
/** Native top-layer menus escape the pinned bar's lower stacking context. */
export function ToolbarPopover({
  children,
  className,
  close,
  trigger,
}: {
  children: ReactNode;
  className: string;
  close: () => void;
  trigger?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useManagedPopover(true, close);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    const place = () => {
      const anchor =
        trigger ?? el.closest(".document-formatting-bar") ?? el.parentElement;
      const bounds = anchor!.getBoundingClientRect(),
        box = el.getBoundingClientRect();
      const paper = anchor
        ?.closest(".editor-document-region,.studio-template-main")
        ?.querySelector<HTMLElement>(".editor-paper,.template-paged-paper");
      let left = 8,
        right = innerWidth - 8;
      if (paper) {
        const rect = paper.getBoundingClientRect(),
          scale = rect.width / paper.offsetWidth,
          style = getComputedStyle(paper);
        const start = rect.left + parseFloat(style.paddingLeft) * scale,
          end = rect.right - parseFloat(style.paddingRight) * scale;
        // Keep wide-screen menus inside the text column, clear of both action
        // gutters. Small screens retain the viewport-sized, scrollable menu.
        if (end - start >= box.width) {
          left = Math.max(left, start);
          right = Math.min(right, end);
        }
      }
      el.style.left = `${Math.max(left, Math.min(bounds.left, right - box.width))}px`;
      el.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - box.height - 8))}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(el);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    const outside = (e: PointerEvent) => {
      if (
        !el.contains(e.target as Node) &&
        !trigger?.contains(e.target as Node)
      )
        close();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", outside, true);
      el.hidePopover();
    };
  }, []);
  return (
    <div
      ref={ref}
      popover="manual"
      className={`toolbar-popover ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
          requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
        }
      }}
    >
      {children}
    </div>
  );
}
