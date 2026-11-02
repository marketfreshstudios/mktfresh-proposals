"use client";
import { useEffect, useState } from "react";

/** Run after React reveals the editor and any outside modal releases focus. */
export function useVisibleEditorAction() {
  const [pending, setPending] = useState<{
    element: HTMLElement;
    apply: () => void;
  } | null>(null);
  useEffect(() => {
    if (!pending) return;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { element } = pending;
        const modal = document.querySelector("dialog:modal");
        if (
          !element.isConnected ||
          !element.checkVisibility({ visibilityProperty: true }) ||
          element.closest("[inert]") ||
          (modal && !modal.contains(element))
        )
          return;
        // Disconnect first: focusing and inserting can themselves mutate the DOM.
        stop();
        pending.apply();
        setPending((current) => (current === pending ? null : current));
      });
    };
    const mutations = new MutationObserver(schedule);
    const resize = new ResizeObserver(schedule);
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "open", "inert"],
    });
    resize.observe(pending.element);
    schedule();
    return stop;
  }, [pending]);
  return (element: HTMLElement, apply: () => void) =>
    setPending({ element, apply });
}
