"use client";
import { useLayoutEffect, type RefObject } from "react";
/** Intrinsic toolbar geometry is independent of the selected image's width. */
export function useImageToolbar(
  image: RefObject<HTMLSpanElement | null>,
  toolbar: RefObject<HTMLSpanElement | null>,
  selected: boolean,
) {
  useLayoutEffect(() => {
    const root = image.current,
      bar = toolbar.current;
    if (!selected || !root || !bar) return;
    let frame = 0;
    const place = () => {
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
      const above = b.top - t.height - 14 >= minimum;
      const y = above
        ? b.top - t.height - 14
        : Math.min(b.bottom + 14, innerHeight - t.height - 8);
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
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [selected]);
}
