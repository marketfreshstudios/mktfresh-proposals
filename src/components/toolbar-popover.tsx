"use client";
import { anchoredPopover } from "../lib/popover-position";
import { useManagedPopover } from "./editor-popovers";
import { useLayoutEffect, useRef, type ReactNode } from "react";
/** Native top-layer menus escape the pinned bar's lower stacking context. */
export function ToolbarPopover({
  children,
  className,
  close,
  trigger,
  avoid,
  onEscape,
  visualViewport = true,
  placementAnchor,
  preferredSide = "below",
  align,
  dock,
}: {
  /** Pin the popover over this element (fixed, top-aligned) instead of the anchor. */
  dock?: HTMLElement | null;
  placementAnchor?: HTMLElement;
  align?: "start" | "end";
  preferredSide?: "below" | "right";
  onEscape?: () => void;
  visualViewport?: boolean;
  children: ReactNode;
  className: string;
  close: () => void;
  trigger?: HTMLElement | null;
  avoid?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null),
    escapeAction = useRef(onEscape);
  escapeAction.current = onEscape;
  useManagedPopover(true, close);
  useLayoutEffect(() => {
    const el = ref.current!;
    el.showPopover();
    const viewport = visualViewport ? window.visualViewport : null;
    const place = () => {
      const top = (viewport?.offsetTop ?? 0) + 8,
        bottom =
          (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight) - 8;
      if (visualViewport) el.style.maxHeight = `${bottom - top}px`;
      // Only a rail that sits beside the page (sticky) can hold the popover.
      const docked =
        dock?.isConnected && getComputedStyle(dock).position === "sticky"
          ? dock.getBoundingClientRect()
          : null;
      if (docked && docked.width > 0) {
        const y = Math.max(top, docked.top);
        el.style.width = `${docked.width}px`;
        el.style.maxHeight = `${bottom - y}px`;
        el.style.left = `${docked.left}px`;
        el.style.top = `${y}px`;
        return;
      }
      const anchor =
        placementAnchor ??
        trigger ??
        el.closest(".phone-formatting-bar") ??
        el.parentElement;
      const bounds = anchor!.getBoundingClientRect(),
        box = el.getBoundingClientRect();
      // Floating menus follow their own trigger, even when a wide toolbar
      // extends beyond the document text column. Clamp only to the viewport.
      const left = (viewport?.offsetLeft ?? 0) + 8,
        right =
          (viewport?.offsetLeft ?? 0) + (viewport?.width ?? innerWidth) - 8;
      const toolbar = anchor?.closest(".editor-edit-bar");
      const edge = toolbar?.getBoundingClientRect() ?? bounds;
      const position = anchoredPopover(
        {
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          height: edge.height,
          top: edge.top,
          bottom: edge.bottom,
        },
        box,
        { left, right, top, bottom },
        align ?? (toolbar ? "start" : "end"),
      );
      el.style.maxHeight = `${Math.min(500, position.maxHeight)}px`;
      const height = el.getBoundingClientRect().height;
      const final = anchoredPopover(
        {
          left: bounds.left,
          right: bounds.right,
          width: bounds.width,
          height: edge.height,
          top: edge.top,
          bottom: edge.bottom,
        },
        { width: box.width, height },
        { left, right, top, bottom },
        align ?? (toolbar ? "start" : "end"),
      );
      let x = final.left,
        y = final.top;
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
      if (preferredSide === "right" && bounds.right + 16 + box.width <= right) {
        x = bounds.right + 16;
        y = Math.max(top, Math.min(bounds.top, bottom - box.height));
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(el);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
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
      (escapeAction.current ?? close)();
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
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
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
          (escapeAction.current ?? close)();
          requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
        }
      }}
    >
      {children}
    </div>
  );
}
