"use client";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
export function ToastSurface({
  children,
  role = "status",
  className = "",
  style,
  stableLayer = false,
  inline = false,
  onDismiss,
  dismissDisabled = false,
}: {
  children: ReactNode;
  role?: "status" | "alert";
  className?: string;
  style?: CSSProperties;
  stableLayer?: boolean;
  inline?: boolean;
  onDismiss?: () => void;
  dismissDisabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<Element | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (inline || dismissed) return;
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
      if (!stableLayer && toast?.matches(":popover-open")) {
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
  }, [inline, dismissed, stableLayer]);
  useEffect(() => {
    const toast = ref.current;
    if (!toast?.isConnected || inline) return;
    toast.showPopover();
    return () => {
      if (toast.isConnected) toast.hidePopover();
    };
  }, [host, inline, dismissed]);
  if (dismissed) return null;
  const toast = (
    <div
      ref={ref}
      style={style}
      popover={inline ? undefined : "manual"}
      data-editor-chrome
      className={`toast-surface block-feedback-toast ${className}`}
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="toast-body">{children}</div>
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        disabled={dismissDisabled}
        onClick={onDismiss ?? (() => setDismissed(true))}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
  return inline ? toast : host ? createPortal(toast, host) : null;
}
