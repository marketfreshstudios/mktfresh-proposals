"use client";
import { useEffect, useRef, useState } from "react";
/** Wait for the inserted editor to mount; menus/modals must release focus first. */
export function useInsertedBlockFocus(select: (id: string) => void) {
  const [pending, setPending] = useState<{
      id: string;
      text: boolean;
      afterFocus?: () => void;
    } | null>(null),
    latest = useRef(select);
  latest.current = select;
  useEffect(() => {
    if (!pending) return;
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const owner = document.getElementById(pending.id),
          target = pending.text
            ? owner?.querySelector<HTMLElement>(".tiptap,textarea")
            : owner;
        const modal = document.querySelector("dialog:modal");
        if (
          !target?.isConnected ||
          !target.checkVisibility({ visibilityProperty: true }) ||
          target.closest("[inert]") ||
          (modal && !modal.contains(target))
        )
          return;
        stop();
        latest.current(pending.id);
        target.focus({ preventScroll: true });
        owner?.scrollIntoView({ block: "center" });
        setPending(null);
        pending.afterFocus?.();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "open", "inert"],
    });
    schedule();
    return stop;
  }, [pending]);
  return (id: string, text: boolean, afterFocus?: () => void) =>
    setPending({ id, text, afterFocus });
}
