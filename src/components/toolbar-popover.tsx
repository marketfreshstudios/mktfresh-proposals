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
      el.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - box.width - 8))}px`;
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
