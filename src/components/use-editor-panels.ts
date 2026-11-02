"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function useEditorPanels(
  user: string,
  paper: RefObject<HTMLElement | null>,
  fullDocument: boolean,
) {
  const container = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(0),
    [phone, setPhone] = useState(false),
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
      )
        setPreferences(stored);
    } catch {}
    setHydrated(true);
  }, [storageKey]);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem(storageKey, JSON.stringify(preferences));
      } catch {}
  }, [preferences, hydrated, storageKey]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const update = () => {
      setWidth(el.getBoundingClientRect().width);
      setPhone(innerWidth < 700);
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
  const canRight = width >= 44 + 816 + 48 + 420,
    right = preferences.right && canRight && !phone;
  const canLeft = width >= 240 + 816 + 48 + (right ? 420 : 44),
    left = preferences.left && canLeft && !phone;
  const rightWidth = right
    ? Math.min(600, Math.max(420, width - (left ? 240 : 44) - 816 - 48))
    : 44;
  const columns = `${left ? 240 : 44}px minmax(0,1fr) ${rightWidth}px`;
  const printMode = !phone || fullDocument,
    available = Math.max(100, width - (left ? 240 : 44) - rightWidth - 48),
    scale = printMode && fit ? Math.min(1, available / 816) : 1;
  return {
    container,
    columns,
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
    toggle: (side: "left" | "right") =>
      setPreferences((p) => ({ ...p, [side]: !p[side] })),
  };
}
