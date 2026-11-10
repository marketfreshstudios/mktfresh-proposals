"use client";

import { useEffect, useState } from "react";

/** Wait for the visible document to finish laying out a newly included clause. */
export function useTermsJump(surface: "editor" | "client") {
  const [clause, jumpTo] = useState<string | null>(null);
  useEffect(() => {
    if (!clause) return;
    let frame = 0;
    const finish = () => jumpTo(null);
    const tryScroll = () => {
      const id = CSS.escape(clause);
      const scroller =
        surface === "editor"
          ? document.querySelector<HTMLElement>(".editor-document-region")
          : null;
      const root =
        surface === "editor"
          ? scroller
          : document.getElementById("proposal-document");
      if (
        scroller &&
        !scroller.querySelector(".editor-page-sheets[data-layout-settled=true]")
      )
        return;
      if (!root || document.querySelector("dialog:modal")) return;
      if (root.shadowRoot && root.getAttribute("data-layout-ready") !== "true")
        return;
      const heading = (root.shadowRoot ?? root).querySelector<HTMLElement>(
        surface === "editor"
          ? `[data-terms-heading="${id}"]`
          : `h3[data-print-part="${id}"]`,
      );
      if (!heading?.checkVisibility({ visibilityProperty: true })) return;

      const top = scroller?.getBoundingClientRect().top ?? 0;
      let inset = 12;
      for (const bar of document.querySelectorAll<HTMLElement>(
        surface === "editor"
          ? ".editor-document-header,.phone-formatting-bar"
          : ".preview-controls,.client-header,.flow-stale",
      )) {
        const style = getComputedStyle(bar);
        const rect = bar.getBoundingClientRect();
        if (
          ["fixed", "sticky"].includes(style.position) &&
          style.top !== "auto" &&
          rect.height &&
          rect.bottom > top
        )
          inset = Math.max(inset, rect.bottom - top + 12);
      }
      const offset = heading.getBoundingClientRect().top - top - inset;
      const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth";
      if (scroller)
        scroller.scrollTo({ top: scroller.scrollTop + offset, behavior });
      else window.scrollTo({ top: window.scrollY + offset, behavior });
      finish();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tryScroll);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-layout-settled", "open", "hidden"],
    });
    document.addEventListener("client-document-ready", schedule);
    const timeout = setTimeout(finish, 5000);
    schedule();
    return () => {
      observer.disconnect();
      document.removeEventListener("client-document-ready", schedule);
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [clause, surface]);
  return jumpTo;
}
