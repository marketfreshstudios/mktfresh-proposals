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
import { placeEditorToolbar } from "./toolbar-placement";
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
  options: { below?: boolean; gap?: number } = {},
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
        delete bar.dataset.toolbarPlaced;
        for (const key of ["left", "top", "bottom"])
          bar.style.removeProperty(key);
        return;
      }
      placeEditorToolbar(root, bar, {
        gap:
          root.dataset.imageKind === "band"
            ? 46
            : root.dataset.imageKind
              ? 24
              : 14,
        ...options,
      });
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
    const paperObserver = new MutationObserver(schedule);
    const paper = root.closest(".editor-paper,.template-paged-paper");
    if (paper)
      paperObserver.observe(paper, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    document.fonts.addEventListener("loadingdone", schedule);
    window.addEventListener("resize", schedule);
    const scroll = (event: Event) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest(".editor-edit-bar,.toolbar-popover")
      ))
        schedule();
    };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("input", schedule, true);
    window.addEventListener("click", schedule, true);
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      position.disconnect();
      paperObserver.disconnect();
      document.fonts.removeEventListener("loadingdone", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("input", schedule, true);
      window.removeEventListener("click", schedule, true);
    };
  }, [selected, options.below, options.gap]);
}
