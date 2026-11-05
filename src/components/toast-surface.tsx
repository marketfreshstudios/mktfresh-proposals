"use client";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
export function ToastSurface({
  children,
  role = "status",
  className = "",
}: {
  children: ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const sync = () => {
      const modal = Array.from(document.querySelectorAll("dialog:modal")).at(
        -1,
      );
      setHost((current) =>
        current === (modal ?? document.body)
          ? current
          : (modal ?? document.body),
      );
      // A newly opened menu/dialog must not cover an existing toast. Keeping
      // it inside the modal also prevents the browser from making Undo inert.
      const toast = ref.current;
      if (toast?.matches(":popover-open")) {
        toast.hidePopover();
        toast.showPopover();
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const toast = ref.current;
    if (!toast) return;
    toast.showPopover();
    return () => toast.hidePopover();
  }, [host]);
  return host
    ? createPortal(
        <div
          ref={ref}
          popover="manual"
          data-editor-chrome
          className={`block-feedback-toast ${className}`}
          role={role}
        >
          {children}
        </div>,
        host,
      )
    : null;
}
