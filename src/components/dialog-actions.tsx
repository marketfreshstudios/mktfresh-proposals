"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
export function dialogActionRank(label: string) {
  return /^(cancel|back|go back|close|keep|not now|discard)\b/i.test(
    label.trim(),
  )
    ? 0
    : 1;
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string" || typeof n === "number"
        ? String(n)
        : isValidElement(n)
          ? text((n.props as { children?: ReactNode }).children)
          : "",
    )
    .join(" ");
}
/** DOM and visual order match: backwards left, forward/destructive right. */
export function DialogActions({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const actions = Children.toArray(children);
  const isDanger = (n: ReactNode) =>
    isValidElement(n) &&
    ((n.props as any).variant === "danger" ||
      /^(delete|remove|deactivate|unlink|archive|reset|decline|leave)\b/i.test(
        text(n).trim(),
      ));
  const destructive = actions.some(isDanger);
  useEffect(() => {
    const dialog = root.current?.closest("dialog");
    if (!dialog || !destructive) return;
    let focused = false;
    const focus = () => {
      if (dialog.open && !focused) {
        focused = true;
        root.current
          ?.querySelector<HTMLElement>('[data-dialog-action="back"]')
          ?.focus();
      }
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as Element;
      const button = target.closest("button,a");
      if (
        !button ||
        (button.getAttribute("data-dialog-destructive") !== "true" &&
          button.getAttribute("data-dialog-action") !== "back" &&
          button.getAttribute("type") === "submit")
      )
        event.preventDefault();
    };
    const observer = new MutationObserver(focus);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    dialog.addEventListener("keydown", keys, true);
    focus();
    return () => {
      observer.disconnect();
      dialog.removeEventListener("keydown", keys, true);
    };
  }, [destructive]);
  return (
    <div ref={root} className={`actions dialog-actions ${className}`}>
      {actions
        .sort((a, b) => dialogActionRank(text(a)) - dialogActionRank(text(b)))
        .map((n) =>
          isValidElement(n)
            ? cloneElement(n as ReactElement<any>, {
                "data-dialog-action":
                  dialogActionRank(text(n)) === 0 ? "back" : "forward",
                "data-dialog-destructive": isDanger(n) ? "true" : undefined,
                ...(destructive && dialogActionRank(text(n)) === 0
                  ? { autoFocus: true }
                  : {}),
              })
            : n,
        )}
    </div>
  );
}

/** App-owned confirmation, so button order/focus are consistent across platforms. */
export async function confirmDialog({
  title,
  description,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmVariant = "primary",
}: {
  title: string;
  description?: string;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmVariant?: "primary" | "action";
}): Promise<boolean> {
  const { createRoot } = await import("react-dom/client");
  return new Promise((resolve) => {
    const host = document.createElement("div");
    (document.querySelector(".staff-foundation") ?? document.body).append(host);
    const root = createRoot(host);
    const finish = (value: boolean) => {
      resolve(value);
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
    };
    function Confirmation() {
      const dialog = useRef<HTMLDialogElement>(null);
      useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
      }, []);
      return (
        <dialog
          ref={dialog}
          className="foundation-sheet"
          aria-label={title}
          onCancel={(e) => {
            e.preventDefault();
            finish(false);
          }}
        >
          <h2>{title}</h2>
          {description && <p>{description}</p>}
          {details}
          <DialogActions>
            <button
              type="button"
              className="btn"
              autoFocus
              onClick={() => finish(false)}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className={`btn ${destructive ? "danger" : confirmVariant}`}
              data-dialog-destructive={destructive ? "true" : undefined}
              onClick={() => finish(true)}
            >
              {confirmLabel}
            </button>
          </DialogActions>
        </dialog>
      );
    }
    root.render(<Confirmation />);
  });
}
