"use client";
import { YeswellBrand } from "../yeswell-brand";
import { useRef, useState } from "react";
import { ToolbarPopover } from "../toolbar-popover";
import { useHistoryStatus } from "../editor-history";
export function PhoneEditorHeader({
  title,
  className = "",
  status,
  editingTitle,
  aiPending,
  locked,
  onBack,
  onDone,
  onNextAi,
  onPreviewPdf,
  onPreviewClient,
  onSections,
  primaryLabel,
  onPrimary,
  onReassign,
}: {
  title: string;
  className?: string;
  status: string;
  editingTitle?: string;
  aiPending: number;
  locked: boolean;
  onBack(): void;
  onDone?(): void;
  onNextAi?(): void;
  onPreviewPdf?(): void;
  onPreviewClient?(): void;
  onSections?(): void;
  primaryLabel?: string;
  onPrimary?(): void;
  onReassign?(): void;
}) {
  const [open, setOpen] = useState(false),
    trigger = useRef<HTMLButtonElement>(null);
  const history = useHistoryStatus();
  return (
    <header
      data-editor-chrome
      className={`editor-phone-header editor-document-header ${className}`}
      data-editing={!!editingTitle}
    >
      <button
        type="button"
        className="phone-header-back"
        aria-label={editingTitle ? "Done editing section" : "Back to proposals"}
        title={editingTitle ? "Done" : "Back to proposals"}
        onClick={editingTitle ? onDone : onBack}
      >
        ‹
      </button>
      {!editingTitle && <YeswellBrand mark />}
      <div className="phone-header-title">
        <strong title={editingTitle ?? title}>{editingTitle ?? title}</strong>
        {!editingTitle && <small role="status">{status}</small>}
      </div>
      {!editingTitle && aiPending > 0 && (
        <button
          className="editor-ai-pill"
          type="button"
          disabled={locked}
          onClick={onNextAi}
          aria-label={`${aiPending} to review`}
        >
          {aiPending} to review
        </button>
      )}
      <button
        type="button"
        ref={trigger}
        className="phone-header-more"
        aria-label="More editor actions"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {editingTitle && (
        <button type="button" className="phone-header-done" onClick={onDone}>
          Done
        </button>
      )}
      {open && (
        <ToolbarPopover
          trigger={trigger.current}
          className="phone-editor-menu"
          close={() => setOpen(false)}
        >
          <div
            role="menu"
            aria-label="Editor actions"
            onClick={() => setOpen(false)}
          >
            {onReassign && (
              <button type="button" role="menuitem" onClick={onReassign}>
                Reassign…
              </button>
            )}
            {primaryLabel && (
              <button type="button" role="menuitem" onClick={onPrimary}>
                {primaryLabel}
              </button>
            )}
            <button type="button" role="menuitem" onClick={onPreviewPdf}>
              Preview PDF
            </button>
            <button type="button" role="menuitem" onClick={onPreviewClient}>
              Preview as client
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={locked || !history.canUndo}
              onClick={() => history.controller?.undo()}
            >
              Undo
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={locked || !history.canRedo}
              onClick={() => history.controller?.redo()}
            >
              Redo
            </button>
            <button type="button" role="menuitem" onClick={onSections}>
              Sections
            </button>
          </div>
        </ToolbarPopover>
      )}
    </header>
  );
}
