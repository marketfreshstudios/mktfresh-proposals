"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Icon } from "./ui";
/** Event handlers and pending requests must read current state before React paints. */
export function useCurrentState<T>(initial: T) {
  const [value, update] = useState(initial),
    ref = useRef(value);
  const set = useCallback((next: T) => {
    ref.current = next;
    update(next);
  }, []);
  return [value, set, ref] as const;
}
export function PanelChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      className="panel-chevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
export function EditorHeader({
  title,
  backLabel,
  backHref,
  save,
  dirty,
  saving,
  error,
  offline,
  lastSaved,
  retry,
  children,
  className = "",
  beforeLeave,
}: {
  title: string;
  backLabel: string;
  backHref: string;
  save: () => Promise<boolean>;
  dirty: boolean;
  saving: boolean;
  error: string;
  offline: boolean;
  lastSaved: string | null;
  retry: () => void;
  children?: ReactNode;
  className?: string;
  beforeLeave?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const pending = leaving || saving;
  const label = offline
    ? "Offline — changes kept on this device"
    : pending
      ? "Saving…"
      : error
        ? "Couldn't save — Retry"
        : dirty
          ? "Unsaved changes"
          : "All changes saved";
  const icon = offline
    ? "declined"
    : error
      ? "declined"
      : pending
        ? "clock"
        : dirty
          ? "edit"
          : "verified";
  const tooltip = lastSaved
    ? `Last saved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(lastSaved))}`
    : "Not saved yet";
  return (
    <header className={`editor-document-header ${className}`}>
      <div className="editor-header-identity">
        <Button
          title={`Back to ${backLabel.toLowerCase()}`}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
          disabled={leaving}
          onClick={async () => {
            if (leaving) return;
            setLeaving(true);
            try {
              const ok = await save();
              if (
                ok ||
                window.confirm(
                  "Your changes could not be saved. Leave the editor anyway? Your edits are kept on this device.",
                )
              ) {
                beforeLeave?.();
                window.location.assign(backHref);
              }
            } finally {
              setLeaving(false);
            }
          }}
        >
          <PanelChevron direction="left" />
          {backLabel}
        </Button>
        <span className="editor-header-title" title={title}>
          {title}
        </span>
      </div>
      <div
        className="editor-save-status"
        data-state={
          offline
            ? "offline"
            : pending
              ? "saving"
              : error
                ? "error"
                : dirty
                  ? "dirty"
                  : "saved"
        }
        title={tooltip}
      >
        {error && !offline && !pending ? (
          <button type="button" onClick={retry} aria-label={label}>
            <Icon name={icon} />
            {label}
          </button>
        ) : (
          <span role="status">
            <Icon name={icon} />
            {label}
          </span>
        )}
      </div>
      <div className="editor-header-actions">{children}</div>
    </header>
  );
}
