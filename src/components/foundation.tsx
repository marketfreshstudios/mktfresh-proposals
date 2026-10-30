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
  menu = false,
  anchor,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  menu?: boolean;
  anchor?: HTMLElement | null;
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
    if (menu && window.innerWidth >= 700 && anchor) {
      const bounds = anchor.getBoundingClientRect(),
        box = dialog.getBoundingClientRect();
      dialog.style.setProperty(
        "--menu-x",
        `${Math.max(12, Math.min(bounds.right - box.width, innerWidth - box.width - 12))}px`,
      );
      dialog.style.setProperty(
        "--menu-y",
        `${Math.max(12, Math.min(bounds.bottom + 6, innerHeight - box.height - 12))}px`,
      );
      dialog
        .querySelector<HTMLElement>(
          ".action-menu a, .action-menu button:not(:disabled)",
        )
        ?.focus();
    } else dialog.querySelector<HTMLElement>("h2")?.focus();
    return () => dialog.close();
  }, [host, menu, anchor]);
  if (!host) return null;
  return createPortal(
    <dialog
      aria-labelledby={titleId}
      className={`foundation-sheet ${menu ? "foundation-action-menu" : ""}`}
      ref={ref}
      onClick={(e) => {
        if (menu && innerWidth >= 700 && e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
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
