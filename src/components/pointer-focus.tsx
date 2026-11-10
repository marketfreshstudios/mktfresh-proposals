"use client";

import { useEffect } from "react";

export function PointerFocus() {
  useEffect(() => {
    let pressed: Element | null = null;
    function clear() {
      pressed?.removeAttribute("data-pointer-focus");
      pressed = null;
    }
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      clear();
      const label = event.target.closest("label");
      const radio = label?.control;
      pressed =
        event.target.closest(
          'button, .btn, [role="tab"], [data-tab-style] > a, input[type="radio"]',
        ) ?? (radio?.matches('input[type="radio"]') ? radio : null);
      // Clicking a control that already owns focus can leave :focus-visible on.
      pressed?.setAttribute("data-pointer-focus", "");
    }
    function onFocusOut(event: FocusEvent) {
      if (event.target === pressed) clear();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", clear, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", clear, true);
      document.removeEventListener("focusout", onFocusOut, true);
      clear();
    };
  }, []);
  return null;
}
