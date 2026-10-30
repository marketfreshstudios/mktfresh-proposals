"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useId, useState, type ReactNode } from "react";
export function Skeleton({
  kind = "rows",
  label = "Loading your workspace…",
}: {
  kind?: "rows" | "document" | "cards";
  label?: string;
}) {
  return (
    <div
      className={`skeleton skeleton-${kind}`}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3].map((n) => (
        <div className="skeleton-line" key={n} />
      ))}
    </div>
  );
}
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    setHost(document.querySelector(".staff-foundation") ?? document.body);
  }, []);
  useEffect(() => {
    if (!host) return;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("h2")?.focus();
    return () => dialog.close();
  }, [host]);
  if (!host) return null;
  return createPortal(
    <dialog
      aria-labelledby={titleId}
      className="foundation-sheet"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {children}
    </dialog>,
    host,
  );
}
