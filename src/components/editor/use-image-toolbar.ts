"use client";
import {
  createElement,
  useLayoutEffect,
  useState,
  useRef,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
/** A fixed toolbar must escape transformed sheets and their lower stacking layer. */
export function PhoneToolbar({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [host] = useState(() =>
    typeof document !== "undefined" ? document.createElement("span") : null,
  );
  useLayoutEffect(() => {
    if (!host) return;
    host.style.display = "contents";
    host.dataset.editorChrome = "";
    const media = matchMedia("(max-width:699px)");
    const place = () => {
      const parent = media.matches ? document.body : anchor.current;
      if (!parent || host.parentElement === parent) return;
      const focused = host.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      // Move the same portal container. Changing the portal target remounts
      // every action and briefly removes focused/clickable buttons on resize.
      parent.appendChild(host);
      focused?.focus({ preventScroll: true });
    };
    place();
    media.addEventListener("change", place);
    return () => {
      media.removeEventListener("change", place);
      host.remove();
    };
  }, [host]);
  return createElement(
    "span",
    { ref: anchor, "data-editor-chrome": "", style: { display: "contents" } },
    host ? createPortal(children, host) : null,
  );
}
/** Intrinsic toolbar geometry is independent of the selected image's width. */
export function useImageToolbar(
  image: RefObject<HTMLElement | null>,
  toolbar: RefObject<HTMLSpanElement | null>,
  selected: boolean,
) {
  useLayoutEffect(() => {
    const root = image.current,
      bar = toolbar.current;
    if (!selected || !root || !bar) return;
    let frame = 0;
    const place = () => {
      // Crossing the phone breakpoint reparents the toolbar into a portal.
      // Always use its current node, rather than the one initially observed.
      const bar = toolbar.current;
      if (!bar?.isConnected) return;
      if (innerWidth < 700) {
        for (const key of ["left", "top", "bottom"])
          bar.style.removeProperty(key);
        return;
      }
      const b = root.getBoundingClientRect(),
        t = bar.getBoundingClientRect();
      const paper =
        root.closest(".editor-paper,.template-paged-paper") ??
        root.parentElement!;
      const page = [...paper.querySelectorAll(".page-sheet")].find((el) => {
        const rect = el.getBoundingClientRect();
        return b.top >= rect.top && b.top < rect.bottom;
      });
      const sheet = (page ?? paper).getBoundingClientRect();
      const region = root
        .closest(".editor-document-region,.studio-template-main")
        ?.getBoundingClientRect();
      const left = Math.max(8, sheet.left + 8),
        right = Math.min(innerWidth - 8, sheet.right - 8);
      const x = Math.max(left, Math.min(b.left, right - t.width));
      const minimum = Math.max(8, region?.top ?? 0, sheet.top + 8);
      const gap =
        root.dataset.imageKind === "band"
          ? 46
          : root.dataset.imageKind
            ? 24
            : 14;
      const above = b.top - t.height - gap >= minimum;
      const y = above
        ? b.top - t.height - gap
        : Math.min(b.bottom + gap, innerHeight - t.height - 8);
      const scale = b.width / (root.offsetWidth || b.width || 1);
      Object.assign(bar.style, {
        left: `${(x - b.left) / scale}px`,
        top: `${(y - b.top) / scale}px`,
        bottom: "auto",
      });
      bar.dataset.placement = above ? "above" : "below";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(bar);
    const position = new MutationObserver(schedule);
    position.observe(root, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("input", schedule, true);
    window.addEventListener("click", schedule, true);
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      position.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("input", schedule, true);
      window.removeEventListener("click", schedule, true);
    };
  }, [selected]);
}
