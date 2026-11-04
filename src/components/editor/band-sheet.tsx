"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useManagedPopover } from "../editor-popovers";
export function BandSheet({
  title,
  subtitle,
  children,
  close,
  onEscape,
  showCancel = true,
  trigger,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  onEscape?: () => void;
  showCancel?: boolean;
  trigger?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    finish = useRef(close),
    escape = useRef(onEscape);
  finish.current = close;
  escape.current = onEscape;
  useManagedPopover(true, close);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const viewport = window.visualViewport;
    const place = () => {
      el.style.setProperty(
        "--band-viewport-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      el.style.setProperty(
        "--band-viewport-bottom",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    };
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
      el.close();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      data-editor-chrome
      className="band-phone-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        (escape.current ?? finish.current)();
        if (!escape.current)
          requestAnimationFrame(
            () =>
              trigger?.isConnected && trigger.focus({ preventScroll: true }),
          );
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (e.clientY < b.top || e.clientX < b.left || e.clientX > b.right)
            close();
        }
      }}
    >
      <div className="band-sheet-grabber" aria-hidden="true" />
      <header>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="band-sheet-content">{children}</div>
      {showCancel && (
        <button
          type="button"
          className="band-sheet-cancel"
          onClick={() => {
            close();
            requestAnimationFrame(
              () =>
                trigger?.isConnected && trigger.focus({ preventScroll: true }),
            );
          }}
        >
          Cancel
        </button>
      )}
    </dialog>,
    document.body,
  );
}
