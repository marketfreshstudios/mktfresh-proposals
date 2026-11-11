"use client";
import { confirmDialog } from "./dialog-actions";
import { ToolbarPopover } from "./toolbar-popover";
import { isStaffSignedOut, openStaffSignIn } from "./staff-sign-in";
import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Icon } from "./ui";
import { ChevronLeft } from "lucide-react";
import { chromeIcons } from "./staff-icons";
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
    <Icon
      name={`chevron-${direction}`}
      className="panel-chevron disclosure-icon"
    />
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
  sendPanelOpen = false,
  onDuplicate,
  editingTitle,
  onDone,
  onSections,
  liveLabel,
  notLiveReason,
  primaryLabel,
  onPrimary,
  onReassign,
  onReplaceBlock,
  titleEditor,
  externalHeading = false,
  savedLabel,
  dirtyLabel,
  meta,
}: {
  titleEditor?: ReactNode;
  externalHeading?: boolean;
  savedLabel?: string;
  dirtyLabel?: string;
  meta?: ReactNode;
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
  /** The Send panel (with its own clay Send button) is showing. */
  sendPanelOpen?: boolean;
  onDuplicate?: () => void;
  editingTitle?: string;
  onDone?: () => void;
  onSections?: () => void;
  liveLabel?: string;
  notLiveReason?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  onReassign?: () => void;
  onReplaceBlock?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const retryAction = isStaffSignedOut(error) ? openStaffSignIn : retry;
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
        (await confirmDialog({
          title: "Leave the editor?",
          description:
            "Your changes could not be saved. Leave the editor anyway? Your edits are kept on this device.",
          cancelLabel: "Keep editing",
          confirmLabel: "Leave editor",
          destructive: true,
        }))
      ) {
        beforeLeave?.();
        window.location.assign(backHref);
      }
    } finally {
      setLeaving(false);
    }
  };
  const onBackLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    void goBack();
  };
  const label = offline
    ? "Offline — changes kept on this device"
    : pending
      ? "Saving…"
      : error
        ? isStaffSignedOut(error)
          ? "Signed out — Sign in"
          : "Couldn't save — Retry"
        : dirty
          ? (dirtyLabel ?? "Unsaved changes")
          : (savedLabel ?? "All changes saved");
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
            ? "Signed | locked"
            : stale
              ? "Edited elsewhere | Reload"
              : offline
                ? "Offline | saved on this device"
                : pending
                  ? "Saving…"
                  : error
                    ? isStaffSignedOut(error)
                      ? "Signed out | Sign in"
                      : "Couldn't save | Retry"
                    : dirty
                      ? "Unsaved changes"
                      : notLiveReason
                        ? `Not live | ${notLiveReason}`
                        : `${liveLabel ?? "Draft"} | Saved`
        }
        locked={locked || stale}
        aiPending={aiPending}
        onBack={goBack}
        backLabel={backLabel}
        onDone={onDone}
        onNextAi={onNextAi}
        onPreviewPdf={onPreviewPdf}
        onPreviewClient={onPreviewClient}
        onSections={onSections}
        primaryLabel={
          primaryLabel !== "Review & send" ? primaryLabel : undefined
        }
        onPrimary={onPrimary}
        onReassign={onReassign}
        onReplaceBlock={onReplaceBlock}
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
      ? "Signed | locked"
      : stale
        ? "Edited elsewhere | Reload"
        : offline
          ? "Offline | saved on this device"
          : pending
            ? "Saving…"
            : error
              ? isStaffSignedOut(error)
                ? "Signed out | Sign in"
                : "Couldn't save | Retry"
              : recovered
                ? "Unsaved changes recovered"
                : dirty
                  ? "Unsaved changes"
                  : notLiveReason
                    ? `Not live | ${notLiveReason}`
                    : `${liveLabel ?? (published === "live" ? "Sent | Not viewed" : "Draft")} | Saved`;
    const shortText = locked
      ? "Locked"
      : stale
        ? "Reload"
        : offline
          ? "Offline"
          : pending
            ? "Saving…"
            : error
              ? isStaffSignedOut(error)
                ? "Sign in"
                : "Retry"
              : recovered
                ? "Recovered"
                : dirty
                  ? "Unsaved"
                  : notLiveReason
                    ? "Not live"
                    : "Saved";
    return (
      <header
        className={`editor-document-header editor-v2-header button-on-ink ${className}`}
        data-tablet={tablet || undefined}
      >
        <a
          className="editor-v2-back editor-navigation-link"
          href={backHref}
          onClick={onBackLink}
          aria-disabled={leaving || undefined}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {backLabel}
        </a>
        <span className="editor-header-divider" aria-hidden="true" />
        <h1
          className="editor-header-title editor-page-heading"
          title={title}
          aria-label={title}
        >
          {title}
        </h1>
        <div
          className="editor-save-status"
          data-state={state}
          title={tablet ? `${text} | ${tooltip}` : tooltip}
          role="status"
        >
          <span className="editor-status-dot" aria-hidden="true" />
          {stale || (error && !offline && !pending) ? (
            <button type="button" onClick={retryAction} aria-label={text}>
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
              className="round-icon"
              aria-label="Undo"
              title="Undo (⌘Z / Ctrl+Z)"
              disabled={locked || stale || !history.canUndo}
              onClick={() => history.controller?.undo()}
            >
              <EditorIcon name="undo" />
            </button>
            <button
              type="button"
              className="round-icon"
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
          className={`editor-header-pill editor-header-send${
            // Owner 10 Nov: Review & send is the page's clay primary, except
            // while the Send panel's own clay Send button is on screen.
            !locked &&
            (primaryLabel ?? "Review & send") === "Review & send" &&
            !sendPanelOpen
              ? " action"
              : ""
          }`}
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
        {(onReassign || onReplaceBlock) && (
          <>
            <button
              ref={moreTrigger}
              type="button"
              className="editor-header-more round-icon"
              aria-label="More editor actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <chromeIcons.more size={18} aria-hidden="true" />
            </button>
            {moreOpen && (
              <ToolbarPopover
                className="phone-editor-menu"
                trigger={moreTrigger.current}
                close={() => setMoreOpen(false)}
              >
                <div role="menu" aria-label="Editor actions">
                  {onReplaceBlock && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        onReplaceBlock();
                      }}
                    >
                      Replace with latest block
                    </button>
                  )}
                  {onReassign && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        onReassign();
                      }}
                    >
                      Reassign…
                    </button>
                  )}
                </div>
              </ToolbarPopover>
            )}
          </>
        )}
        {hadAi &&
          (aiPending ? (
            <button
              type="button"
              className="editor-ai-pill"
              aria-label={`${aiPending} to review${tablet ? "" : " | Next"}`}
              title="Go to the next unreviewed AI section"
              disabled={locked || stale}
              onClick={onNextAi}
            >
              {!tablet && <Icon name="ai" />}
              {aiPending} to review
              {!tablet && !compact && (
                <>
                  {" "}
                  | Next{" "}
                  <Icon name="chevron-right" className="disclosure-icon" />
                </>
              )}
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
    <header className={`editor-document-header button-on-ink ${className}`}>
      <div className="editor-header-identity">
        <a
          className="editor-back-link editor-navigation-link"
          href={backHref}
          title={`Back to ${backLabel.toLowerCase()}`}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
          aria-disabled={leaving || undefined}
          onClick={onBackLink}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          {backLabel}
        </a>
        {titleEditor ? (
          <>
            {!externalHeading && <h1 className="sr-only">{title}</h1>}
            <div className="editor-header-title" title={title}>
              {titleEditor}
            </div>
          </>
        ) : (
          <h1 className="editor-header-title editor-page-heading" title={title}>
            {title}
          </h1>
        )}
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
          <button type="button" onClick={retryAction} aria-label={label}>
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
      {meta}
      <div className="editor-header-actions">{children}</div>
    </header>
  );
}
