"use client";

import { useEffect, type RefObject } from "react";

/** Fit the phone editor to the visible viewport and reveal only the active caret. */
export function usePhoneEditorViewport(
  root: RefObject<HTMLDivElement | null>,
  phone: boolean,
) {
  useEffect(() => {
    const shell = root.current;
    const documentRegion = shell?.querySelector<HTMLElement>(
      ".editor-document-region",
    );
    if (!phone || !shell || !documentRegion) return;

    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const bottom = top + height;
      shell.style.setProperty("--phone-editor-visible-height", `${height}px`);
      shell.style.setProperty(
        "--phone-editor-bottom-inset",
        `${Math.max(0, window.innerHeight - bottom)}px`,
      );

      const active = document.activeElement;
      if (
        !(active instanceof HTMLElement) ||
        !documentRegion.contains(active) ||
        !active.matches("[contenteditable='true'], input, textarea")
      )
        return;

      let caret = active.getBoundingClientRect();
      const selection = window.getSelection();
      if (
        active.isContentEditable &&
        selection?.focusNode &&
        active.contains(selection.focusNode)
      ) {
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        if (rect.height > 0) caret = rect;
      }
      const region = documentRegion.getBoundingClientRect();
      const visibleTop = Math.max(region.top, top);
      let visibleBottom = Math.min(region.bottom, bottom);
      for (const bar of shell.querySelectorAll(
        '.editor-phone-dock, .editor-edit-bar[data-dock="keyboard"]',
      )) {
        const box = bar.getBoundingClientRect();
        if (box.height && getComputedStyle(bar).visibility !== "hidden")
          visibleBottom = Math.min(visibleBottom, box.top);
      }
      if (visibleBottom <= visibleTop) return;
      if (caret.bottom > visibleBottom)
        documentRegion.scrollTop += Math.ceil(caret.bottom - visibleBottom);
      else if (caret.top < visibleTop)
        documentRegion.scrollTop -= Math.ceil(visibleTop - caret.top);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    shell.addEventListener("focusin", schedule);
    document.addEventListener("selectionchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      shell.removeEventListener("focusin", schedule);
      document.removeEventListener("selectionchange", schedule);
      shell.style.removeProperty("--phone-editor-visible-height");
      shell.style.removeProperty("--phone-editor-bottom-inset");
    };
  }, [phone, root]);
}
