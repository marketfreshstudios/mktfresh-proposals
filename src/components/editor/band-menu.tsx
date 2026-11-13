"use client";
import { DialogActions } from "../dialog-actions";
import { sharedChangesLabel } from "../../lib/page-count";
import { useLayoutEffect, useRef } from "react";
import { menuKeys } from "./band-menus";
import type { BandKind, BandSource } from "../../lib/band-overrides";
export function BandMenu({
  kind,
  source,
  count,
  sharedOnly,
  onEdit,
  onUnique,
  onShared,
  onHide,
}: {
  kind: BandKind;
  source: BandSource;
  count: number;
  sharedOnly?: boolean;
  onEdit: () => void;
  onUnique: () => void;
  onShared: () => void;
  onHide: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  const shared = source === "shared";
  return (
    <div
      ref={root}
      className="band-actions-menu"
      role="menu"
      aria-label={`${kind} actions`}
      onKeyDown={menuKeys}
    >
      <button type="button" role="menuitem" onClick={onEdit}>
        <strong>
          {shared ? `Edit shared ${kind}` : `Edit this page's ${kind}`}
        </strong>
        {shared && <small>{sharedChangesLabel(count)}</small>}
      </button>
      {!sharedOnly && (
        <>
          {shared ? (
            <button type="button" role="menuitem" onClick={onUnique}>
              <strong>Make unique to this page</strong>
              <small>Starts as a copy you can change</small>
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={onShared}>
              <strong>Use shared {kind}</strong>
            </button>
          )}
          {source !== "hidden" && (
            <button type="button" role="menuitem" onClick={onHide}>
              <strong>Hide on this page</strong>
              <small>Leaves an empty band. Page breaks stay put.</small>
            </button>
          )}
        </>
      )}
      <p>↑ ↓ move | Enter pick | Esc close</p>
    </div>
  );
}
export function UseSharedConfirm({
  kind,
  page,
  all = false,
  onCancel,
  onConfirm,
}: {
  kind: BandKind;
  page: number;
  all?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      className="band-use-shared-confirm"
      ref={root}
      role="group"
      aria-label={
        all
          ? "Use shared on every page"
          : `Use the shared ${kind} on page ${page}?`
      }
    >
      <h3>
        {all
          ? "Use shared on every page?"
          : `Use the shared ${kind} on page ${page}?`}
      </h3>
      <p>
        {all
          ? "Every page's own header and footer will be replaced by the shared ones. You can undo this."
          : `This page's own ${kind} will be replaced by the shared one. You can undo this.`}
      </p>
      <DialogActions>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="band-confirm-primary"
          onClick={onConfirm}
        >
          {all ? "Use shared on every page" : `Use shared ${kind}`}
        </button>
      </DialogActions>
    </div>
  );
}
