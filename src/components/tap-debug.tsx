"use client";

import { useEffect, useRef } from "react";

const KEY = "yeswell-tap-debug";
const TYPES = [
  "touchstart",
  "touchend",
  "touchcancel",
  "pointerdown",
  "pointerup",
  "pointercancel",
  "mouseover",
  "mousemove",
  "mousedown",
  "mouseup",
  "click",
] as const;

function describe(node: EventTarget | null) {
  if (!(node instanceof Element)) return String(node?.constructor?.name ?? "?");
  const control = node.closest("button,a,[role=button],[role=tab]") ?? node;
  const label =
    control.getAttribute("aria-label") ??
    control.getAttribute("data-phone-tool") ??
    (control.textContent ?? "").trim().slice(0, 18);
  const cls = control.className?.toString().split(/\s+/)[0] ?? "";
  return `${control.tagName.toLowerCase()}${cls ? "." + cls : ""} "${label}"`;
}

/**
 * Diagnostic log of the touch sequence for one-tap problems on phones.
 * Turn on with ?tapdebug=1 and off with ?tapdebug=0. The log only redraws a
 * second after a tap so it never changes the page during the tap itself.
 */
export function TapDebug() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let on = false;
    try {
      const flag = new URLSearchParams(location.search).get("tapdebug");
      if (flag === "1") sessionStorage.setItem(KEY, "1");
      if (flag === "0") sessionStorage.removeItem(KEY);
      on = sessionStorage.getItem(KEY) === "1";
    } catch {}
    const el = box.current;
    if (!on || !el) return;
    el.hidden = false;
    let lines: string[] = [];
    let start = 0;
    let taps = 0;
    let changes: string[] = [];
    let watching = false;
    let timer = 0;
    const observer = new MutationObserver((records) => {
      if (!watching) return;
      for (const record of records) {
        if (el.contains(record.target)) continue;
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        const what =
          record.type === "attributes"
            ? `@${record.attributeName}`
            : record.type === "childList"
              ? `+${record.addedNodes.length}-${record.removedNodes.length}`
              : "text";
        changes.push(
          `${target?.tagName.toLowerCase() ?? "?"}.${target?.className?.toString().split(/\s+/)[0] ?? ""}${what}`,
        );
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    const flush = () => {
      el.textContent = lines.slice(-26).join("\n");
    };
    const log = (event: Event) => {
      const now = performance.now();
      if (
        event.type === "touchstart" ||
        (event.type === "pointerdown" && now - start > 400)
      ) {
        if (now - start > 400) {
          taps += 1;
          start = now;
          changes = [];
          watching = true;
          lines.push(`— tap ${taps} —`);
        }
      }
      const type = event.type;
      if (type === "mousemove" || type === "click") {
        const unique = [...new Set(changes)];
        if (unique.length)
          lines.push(
            `  changed before ${type}: ${unique.slice(0, 6).join(" ")}${unique.length > 6 ? " …" : ""}`,
          );
        changes = [];
      }
      if (type === "click") watching = false;
      const pointer = (event as PointerEvent).pointerType;
      lines.push(
        `${String(Math.round(now - start)).padStart(4)}ms ${type}${pointer ? `(${pointer})` : ""} ${type === "mousemove" ? "" : describe(event.target)}${event.defaultPrevented ? " [prevented]" : ""}`,
      );
      lines = lines.slice(-60);
      clearTimeout(timer);
      timer = window.setTimeout(flush, 1000);
    };
    for (const type of TYPES)
      window.addEventListener(type, log, { capture: true, passive: true });
    const late = (event: Event) => {
      if (event.defaultPrevented)
        lines.push(`      ${event.type} prevented by the page`);
    };
    for (const type of ["touchstart", "touchend", "pointerdown", "mousedown"])
      document.addEventListener(type, late, { passive: true });
    flush();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      for (const type of TYPES)
        window.removeEventListener(type, log, { capture: true });
      for (const type of ["touchstart", "touchend", "pointerdown", "mousedown"])
        document.removeEventListener(type, late);
    };
  }, []);
  return (
    <div
      ref={box}
      hidden
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 8,
        right: 8,
        top: "30vh",
        zIndex: 2147483647,
        maxHeight: "40vh",
        overflow: "hidden",
        margin: 0,
        padding: 8,
        font: "11px/1.35 ui-monospace, Menlo, monospace",
        color: "#fff",
        background: "rgba(19, 48, 58, 0.88)",
        borderRadius: 8,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      }}
    />
  );
}
