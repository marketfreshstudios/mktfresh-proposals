"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
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
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
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
        <h2 id={titleId}>{title}</h2>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </header>
      {children}
    </dialog>
  );
}
