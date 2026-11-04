"use client";
import { useManagedPopover } from "./editor-popovers";
import { useLayoutEffect, useRef, type ReactNode } from "react";
/** Native top-layer menus escape the pinned bar's lower stacking context. */
export function ToolbarPopover({
  children,
  className,
  close,
  trigger,
  avoid,
}: {
  children: ReactNode;
  className: string;
  close: () => void;
  trigger?: HTMLElement | null;
  avoid?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useManagedPopover(true, close);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    const place = () => {
      const anchor =
        trigger ?? el.closest(".phone-formatting-bar") ?? el.parentElement;
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
      let x = Math.max(left, Math.min(bounds.left, right - box.width)),
        y = Math.max(
          8,
          Math.min(bounds.bottom + 4, innerHeight - box.height - 8),
        );
      if (avoid) {
        const text = avoid.getBoundingClientRect();
        const clear = (x: number, y: number) =>
          x + box.width <= text.left ||
          x >= text.right ||
          y + box.height <= text.top ||
          y >= text.bottom;
        if (!clear(x, y)) {
          // Cover actions can use space above or beside the logo instead of
          // covering its title. Other toolbar menus retain their placement.
          const spot = [
            { x, y: bounds.top - box.height - 4 },
            { x: bounds.right + 8, y: bounds.top },
            { x: bounds.left - box.width - 8, y: bounds.top },
          ].find(
            (p) =>
              p.x >= 8 &&
              p.y >= 8 &&
              p.x + box.width <= innerWidth - 8 &&
              p.y + box.height <= innerHeight - 8 &&
              clear(p.x, p.y),
          );
          if (spot) ({ x, y } = spot);
        }
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
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
    // A toolbar action can keep focus on its trigger. In that case the first
    // Escape still belongs to the open menu, before the document deselects and
    // removes its portal/trigger. Never steal focus from a subsequent click.
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        (!trigger?.closest(".editor-edit-bar") &&
          !trigger?.contains(event.target as Node))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const active = document.activeElement;
      close();
      requestAnimationFrame(() => {
        if (
          trigger?.isConnected &&
          (document.activeElement === active ||
            document.activeElement === document.body)
        )
          trigger.focus({ preventScroll: true });
      });
    };
    window.addEventListener("keydown", escape, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
      el.hidePopover();
    };
  }, []);
  return (
    <div
      ref={ref}
      data-editor-chrome
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
