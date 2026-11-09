"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function useEditorPanels(
  user: string,
  paper: RefObject<HTMLElement | null>,
  fullDocument: boolean,
  shellV2 = false,
  dockedToolsWidth = 400,
) {
  const container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(0),
    [phone, setPhone] = useState(false),
    [viewportWidth, setViewportWidth] = useState(0),
    [shell, setShell] = useState({
      wide: { left: true, right: true },
      medium: { left: false, right: true },
      narrow: { left: false, right: false },
    }),
    [preferences, setPreferences] = useState({ left: true, right: true }),
    [hydrated, setHydrated] = useState(false),
    [fit, setFit] = useState(true),
    [height, setHeight] = useState(1000);
  const storageKey = `proposal-editor-panels:${user}`;
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (
        stored &&
        typeof stored.left === "boolean" &&
        typeof stored.right === "boolean"
      ) {
        setPreferences({ left: stored.left, right: stored.right });
        if (
          stored.shell &&
          ["wide", "medium", "narrow"].every(
            (b) =>
              typeof stored.shell[b]?.left === "boolean" &&
              typeof stored.shell[b]?.right === "boolean",
          )
        )
          setShell(stored.shell);
        else
          setShell((previous) => ({
            ...previous,
            wide: { left: stored.left, right: stored.right },
          }));
      }
    } catch {}
    setHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...preferences, shell }),
        );
      } catch {}
  }, [preferences, shell, hydrated, storageKey]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const update = () => {
      setWidth(el.getBoundingClientRect().width);
      setPhone(innerWidth < 700);
      setViewportWidth(innerWidth);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    const el = paper.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, [paper]);
  // Desktop starts with usable Quote tools. Letter paper scales without reflow
  // while the 420px tools column stays readable; narrower surfaces use drawers.
  const v2 = shellV2 && !phone;
  const band =
    viewportWidth >= 1180 ? "wide" : viewportWidth >= 960 ? "medium" : "narrow";
  const current = shell[band];
  const canRight = v2 ? viewportWidth >= 960 : width >= 1100,
    right = v2 ? current.right : preferences.right && canRight && !phone;
  const canLeft = v2
      ? viewportWidth >= 960
      : width >= 240 + 816 + 48 + (right ? 420 : 44),
    left = v2 ? current.left : preferences.left && canLeft && !phone;
  const rightWidth = v2
    ? canRight && right
      ? dockedToolsWidth
      : canRight
        ? 56
        : 64
    : right
      ? Math.min(600, Math.max(420, width - (left ? 240 : 44) - 816 - 48))
      : 44;
  const leftWidth = v2 ? (canLeft && left ? 220 : 56) : left ? 240 : 44;
  const columns = `${leftWidth}px minmax(0,1fr) ${rightWidth}px`;
  const printMode = !phone || fullDocument,
    available = Math.max(100, width - leftWidth - rightWidth - (v2 ? 32 : 48)),
    scale = printMode && fit ? Math.min(1, available / 816) : 1;
  return {
    container,
    columns,
    viewportWidth,
    compact: viewportWidth - leftWidth - rightWidth < 760,
    mode: v2 && viewportWidth < 960 ? ("drawer" as const) : ("docked" as const),
    ready: hydrated && width > 0,
    phone,
    printMode,
    left,
    right,
    canLeft,
    canRight,
    scale,
    height,
    fit,
    setFit,
    preferences,
    toggle: (side: "left" | "right") => {
      if (v2)
        setShell((previous) => {
          const next = { ...previous[band], [side]: !previous[band][side] };
          if (viewportWidth < 1180 && next[side])
            next[side === "left" ? "right" : "left"] = false;
          return { ...previous, [band]: next };
        });
      else setPreferences((p) => ({ ...p, [side]: !p[side] }));
    },
  };
}
