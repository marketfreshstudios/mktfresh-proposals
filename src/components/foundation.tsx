"use client";
import { chromeIcons } from "./staff-icons";
import { anchoredPopover } from "../lib/popover-position";
import { createPortal } from "react-dom";
import { useEffect, useRef, useId, useState, type ReactNode } from "react";
export function Skeleton({
  kind = "rows",
  label = "Loading your workspace…",
}: {
  kind?: "rows" | "document" | "cards" | "table";
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
  className = "",
  surface = "staff",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  menu?: boolean;
  anchor?: HTMLElement | null;
  className?: string;
  surface?: "staff" | "client";
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    setHost(
      document.querySelector(
        surface === "client" ? ".client-flow" : ".staff-foundation",
      ) ?? document.body,
    );
  }, [surface]);
  useEffect(() => {
    if (!host) return;
    const dialog = ref.current!;
    dialog.showModal();
    let stopPlacing = () => {};
    if (menu && window.innerWidth >= 700 && anchor) {
      const place = () => {
        const viewport = window.visualViewport;
        const left = (viewport?.offsetLeft ?? 0) + 12,
          top = (viewport?.offsetTop ?? 0) + 12;
        const position = anchoredPopover(
          anchor.getBoundingClientRect(),
          dialog.getBoundingClientRect(),
          {
            left,
            top,
            right: left + (viewport?.width ?? innerWidth) - 24,
            bottom: top + (viewport?.height ?? innerHeight) - 24,
          },
        );
        dialog.style.setProperty("--menu-x", `${position.left}px`);
        dialog.style.setProperty("--menu-y", `${position.top}px`);
        dialog.style.maxHeight = `${position.maxHeight}px`;
      };
      place();
      const viewport = window.visualViewport;
      const observer = new ResizeObserver(place);
      observer.observe(dialog);
      window.addEventListener("resize", place);
      window.addEventListener("scroll", place, true);
      viewport?.addEventListener("resize", place);
      viewport?.addEventListener("scroll", place);
      stopPlacing = () => {
        observer.disconnect();
        window.removeEventListener("resize", place);
        window.removeEventListener("scroll", place, true);
        viewport?.removeEventListener("resize", place);
        viewport?.removeEventListener("scroll", place);
      };
      dialog
        .querySelector<HTMLElement>(
          ".action-menu a, .action-menu button:not(:disabled)",
        )
        ?.focus();
    } else dialog.querySelector<HTMLElement>("h2")?.focus();
    return () => {
      stopPlacing();
      dialog.close();
    };
  }, [host, menu, anchor]);
  if (!host) return null;
  return createPortal(
    <dialog
      aria-labelledby={titleId}
      className={`foundation-sheet ${["Block settings", "Block style", "Edit block", "Add a block"].includes(title) ? "block-owned-dialog" : ""} ${menu ? "foundation-action-menu" : ""} ${className}`}
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
        <button
          type="button"
          className={`btn ghost ${surface === "staff" ? "icon-only" : ""}`}
          title={surface === "staff" ? "Close" : undefined}
          aria-label="Close"
          onClick={onClose}
        >
          <chromeIcons.close size={18} aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>,
    host,
  );
}
