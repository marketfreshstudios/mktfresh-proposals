"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Icon } from "./ui";
import { useHistoryStatus } from "./editor-history";
import { PhoneEditorHeader } from "./editor/phone-header";
import { EditorIcon } from "./editor/editor-icon";
import { EditorButton } from "./editor/editor-button";
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
export function PanelChevron({
  direction,
  double = false,
}: {
  direction: "left" | "right";
  double?: boolean;
}) {
  return (
    <svg
      className="panel-chevron"
      width="16"
      height="16"
      viewBox={double ? "0 0 30 24" : "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
      {double && (
        <path
          transform="translate(6 0)"
          d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
        />
      )}
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
  phone = false,
  tablet = false,
  compact = false,
  locked = false,
  published = "draft",
  stale = false,
  recovered = false,
  aiPending = 0,
  hadAi = false,
  onNextAi,
  onPreviewPdf,
  onPreviewClient,
  onReviewSend,
  onDuplicate,
  editingTitle,
  onDone,
  onSections,
  liveLabel,
  notLiveReason,
  primaryLabel,
  onPrimary,
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
  phone?: boolean;
  tablet?: boolean;
  compact?: boolean;
  locked?: boolean;
  published?: "draft" | "live";
  stale?: boolean;
  recovered?: boolean;
  aiPending?: number;
  hadAi?: boolean;
  onNextAi?: () => void;
  onPreviewPdf?: () => void;
  onPreviewClient?: () => void;
  onReviewSend?: () => void;
  onDuplicate?: () => void;
  editingTitle?: string;
  onDone?: () => void;
  onSections?: () => void;
  liveLabel?: string;
  notLiveReason?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const pending = leaving || saving;
  const history = useHistoryStatus();
  const goBack = async () => {
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
  };
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
  if (phone && onReviewSend)
    return (
      <PhoneEditorHeader
        className={className}
        title={title}
        editingTitle={editingTitle}
        status={
          locked
            ? "Signed · locked"
            : stale
              ? "Edited elsewhere · Reload"
              : offline
                ? "Offline · saved on this device"
                : pending
                  ? "Saving…"
                  : error
                    ? "Couldn't save · Retry"
                    : dirty
                      ? "Unsaved changes"
                      : notLiveReason
                        ? `Not live · ${notLiveReason}`
                        : `${liveLabel ?? "Draft"} · Saved`
        }
        locked={locked || stale}
        aiPending={aiPending}
        onBack={goBack}
        onDone={onDone}
        onNextAi={onNextAi}
        onPreviewPdf={onPreviewPdf}
        onPreviewClient={onPreviewClient}
        onSections={onSections}
        primaryLabel={
          primaryLabel !== "Review & send" ? primaryLabel : undefined
        }
        onPrimary={onPrimary}
      />
    );
  if (!phone && onReviewSend) {
    const state = stale
      ? "stale"
      : offline
        ? "offline"
        : pending
          ? "saving"
          : error
            ? "error"
            : recovered
              ? "recovered"
              : dirty
                ? "dirty"
                : "saved";
    const text = locked
      ? "Signed · locked"
      : stale
        ? "Edited elsewhere · Reload"
        : offline
          ? "Offline · saved on this device"
          : pending
            ? "Saving…"
            : error
              ? "Couldn't save · Retry"
              : recovered
                ? "Unsaved changes recovered"
                : dirty
                  ? "Unsaved changes"
                  : notLiveReason
                    ? `Not live · ${notLiveReason}`
                    : `${liveLabel ?? (published === "live" ? "Sent · Not viewed" : "Draft")} · Saved`;
    const shortText = locked
      ? "Locked"
      : stale
        ? "Reload"
        : offline
          ? "Offline"
          : pending
            ? "Saving…"
            : error
              ? "Retry"
              : recovered
                ? "Recovered"
                : dirty
                  ? "Unsaved"
                  : notLiveReason
                    ? "Not live"
                    : "Saved";
    return (
      <header
        className={`editor-document-header editor-v2-header ${className}`}
        data-tablet={tablet || undefined}
      >
        <button
          type="button"
          className="editor-v2-back"
          onClick={goBack}
          disabled={leaving}
          title={`Back to ${backLabel.toLowerCase()}`}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
        >
          ‹ {backLabel}
        </button>
        <span className="editor-header-divider" aria-hidden="true" />
        <span className="editor-header-title" title={title} aria-label={title}>
          {title}
        </span>
        <div
          className="editor-save-status"
          data-state={state}
          title={tablet ? `${text} · ${tooltip}` : tooltip}
          role="status"
        >
          <span className="editor-status-dot" aria-hidden="true" />
          {stale || (error && !offline && !pending) ? (
            <button type="button" onClick={retry} aria-label={text}>
              {tablet ? shortText : text}
            </button>
          ) : (
            <span>{tablet ? shortText : text}</span>
          )}
        </div>
        <span className="editor-header-spacer" />
        {!tablet && (
          <div className="editor-header-history">
            <button
              type="button"
              aria-label="Undo"
              title="Undo (⌘Z / Ctrl+Z)"
              disabled={locked || stale || !history.canUndo}
              onClick={() => history.controller?.undo()}
            >
              <EditorIcon name="undo" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (⇧⌘Z / Ctrl+Shift+Z)"
              disabled={locked || stale || !history.canRedo}
              onClick={() => history.controller?.redo()}
            >
              <EditorIcon name="redo" />
            </button>
          </div>
        )}
        <EditorButton
          className="editor-header-pill editor-header-pdf"
          aria-label="Preview PDF"
          title="Preview PDF"
          disabled={saving || stale}
          onClick={onPreviewPdf}
        >
          {tablet || compact ? "PDF" : "Preview PDF"}
        </EditorButton>
        <EditorButton
          className="editor-header-pill editor-header-client"
          aria-label="Preview as client"
          title="Preview as client"
          disabled={saving || stale}
          onClick={onPreviewClient}
        >
          {tablet || compact ? "Preview" : "Preview as client"}
        </EditorButton>
        <EditorButton
          variant="primary"
          className="editor-header-pill editor-header-send"
          disabled={
            stale ||
            (offline &&
              !["Copy client link", "Duplicate as new draft"].includes(
                primaryLabel ?? "",
              )) ||
            (locked && !onDuplicate && !onPrimary)
          }
          title={offline ? "Reconnect to send" : undefined}
          onClick={onPrimary ?? (locked ? onDuplicate : onReviewSend)}
        >
          {primaryLabel ??
            (locked ? "Duplicate as new draft" : "Review & send")}
        </EditorButton>
        {hadAi &&
          (aiPending ? (
            <button
              type="button"
              className="editor-ai-pill"
              aria-label={`${aiPending} to review${tablet ? "" : " · Next"}`}
              title="Go to the next unreviewed AI section"
              disabled={locked || stale}
              onClick={onNextAi}
            >
              {!tablet && <Icon name="ai" />}
              {aiPending} to review{!tablet && !compact && " · Next ›"}
            </button>
          ) : (
            <span className="editor-ai-pill editor-ai-done">
              ✓ AI review done
            </span>
          ))}
      </header>
    );
  }
  return (
    <header className={`editor-document-header ${className}`}>
      <div className="editor-header-identity">
        <Button
          title={`Back to ${backLabel.toLowerCase()}`}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
          disabled={leaving}
          onClick={goBack}
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
