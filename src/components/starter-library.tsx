"use client";
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { Ellipsis } from "lucide-react";
import type { Template } from "../lib/model";
import { useConnectorRestore } from "./connector-restore";
import { post, Button, Field, Banner } from "./ui";
import { Sheet } from "./foundation";
import { DialogActions } from "./dialog-actions";
import { ToastSurface } from "./toast-surface";
import { ToolbarPopover } from "./toolbar-popover";
function Cancel({
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      className="btn secondary"
      onClick={onClick}
    >
      {children ?? "Cancel"}
    </button>
  );
}
export function useStarterActions(
  template: Template | null | undefined,
  owner: boolean,
  onChanged: (t: Template) => void | Promise<void>,
  beforeNavigate?: () => void,
  attempt?: Template | null,
) {
  const [copyMode, setCopyMode] = useState<"copy" | "backup" | null>(null),
    [reset, setReset] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [undo, setUndo] = useState<string | null>(null);
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(id);
  }, [undo]);
  const copy = () => {
    setName(`${template?.name} (copy)`);
    setError("");
    setCopyMode("copy");
  };
  const doReset = async () => {
    const value = await post<{ template: Template; event_id: string }>(
      `/api/templates/${template!.id}/reset`,
      {},
    );
    await onChanged(value.template);
    setReset(false);
    setUndo(value.event_id);
  };
  const safe = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const availability = () =>
    safe(async () => {
      const value = await post<{ template: Template }>(
        `/api/templates/${template!.id}/availability`,
        { active: !template!.active },
      );
      await onChanged(value.template);
    });
  return {
    copy,
    reset: () => {
      setError("");
      setReset(true);
    },
    availability,
    busy,
    dialogs: (
      <>
        {error && !copyMode && !reset && (
          <Banner tone="danger" title="Could not update starter">
            {error}
          </Banner>
        )}
        {copyMode && (
          <Sheet
            title="Name your template"
            onClose={() => {
              if (!busy) {
                setCopyMode(null);
                if (copyMode === "backup") setReset(true);
              }
            }}
          >
            <form
              className="stack starter-dialog-content"
              onSubmit={(e) => {
                e.preventDefault();
                void safe(async () => {
                  const value = await post<
                    Template & { attempt_applied?: boolean }
                  >(`/api/templates/${template!.id}/copy`, {
                    name,
                    ...(copyMode === "copy" && attempt ? { attempt } : {}),
                  });
                  if (copyMode === "backup") {
                    await doReset();
                    setCopyMode(null);
                  } else {
                    beforeNavigate?.();
                    location.assign(
                      `/studio/templates/${value.id}${value.attempt_applied === false ? "?copy=without-edit" : ""}`,
                    );
                  }
                });
              }}
            >
              <Field label="Template name">
                <input
                  value={name}
                  maxLength={200}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              {copyMode === "backup" && (
                <p>
                  Your edited version will be kept as a separate template before
                  the starter is reset.
                </p>
              )}
              {error && (
                <p role="alert" className="danger">
                  {error}
                </p>
              )}
              <DialogActions>
                <Cancel
                  children="Cancel"
                  disabled={busy}
                  onClick={() => {
                    setCopyMode(null);
                    if (copyMode === "backup") setReset(true);
                  }}
                />
                <Button
                  variant="primary"
                  type="submit"
                  busy={busy}
                  disabled={!name.trim()}
                >
                  Make copy
                </Button>
              </DialogActions>
            </form>
          </Sheet>
        )}
        {reset && !copyMode && (
          <Sheet
            title={`Reset ${template!.name} to the latest starter?`}
            onClose={() => !busy && setReset(false)}
          >
            <div className="stack starter-dialog-content">
              <p>
                Your changes to this template will be replaced. Proposals
                already made from it don't change.
              </p>
              {error && (
                <p role="alert" className="danger">
                  {error}
                </p>
              )}
              <DialogActions>
                <Cancel
                  children="Cancel"
                  disabled={busy}
                  onClick={() => setReset(false)}
                />
                <Button
                  disabled={busy}
                  onClick={() => {
                    setName(`${template!.name} (copy)`);
                    setCopyMode("backup");
                  }}
                >
                  Make a copy first
                </Button>
                <Button
                  variant="primary"
                  busy={busy}
                  onClick={() => void safe(doReset)}
                >
                  Reset to starter
                </Button>
              </DialogActions>
            </div>
          </Sheet>
        )}
        {undo && (
          <ToastSurface>
            Starter reset ·{" "}
            <button
              onClick={() =>
                void safe(async () => {
                  const value = await post<{ template: Template }>(
                    `/api/templates/${template!.id}/undo-reset`,
                    { event_id: undo },
                  );
                  await onChanged(value.template);
                  setUndo(null);
                })
              }
            >
              Undo
            </button>
          </ToastSurface>
        )}
      </>
    ),
    items: (
      <>
        <button type="button" role="menuitem" onClick={copy}>
          Make a copy
        </button>
        {owner && template?.starter_edited && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setError("");
              setReset(true);
            }}
          >
            Reset to starter
          </button>
        )}
        {owner && (
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={availability}
          >
            {template?.active
              ? "Hide from new proposals"
              : "Show in new proposals"}
          </button>
        )}
      </>
    ),
  };
}
export function StarterCardMenu({
  template,
  owner,
  onChanged,
  onDelete,
}: {
  template: Template;
  owner: boolean;
  onChanged: () => Promise<void>;
  onDelete?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const actions = useStarterActions(template, owner, onChanged);
  const restore = useConnectorRestore(onChanged);
  return (
    <>
      <button
        type="button"
        className="starter-card-more"
        aria-label={`Actions for ${template.name}`}
        aria-haspopup="menu"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {anchor && (
        <ToolbarPopover
          className="starter-actions-menu"
          trigger={anchor}
          close={() => setAnchor(null)}
        >
          <div
            role="menu"
            aria-label={`${template.name} actions`}
            onClick={() => setAnchor(null)}
          >
            <a
              role="menuitem"
              href={`/studio/templates/${template.id}?preview=1`}
            >
              Preview
            </a>
            <a
              role="menuitem"
              href={`/proposals?new=1&template=${template.id}`}
            >
              New proposal from this
            </a>
            {template.starter_key && actions.items}
            {onDelete && (
              <button type="button" role="menuitem" onClick={onDelete}>
                Delete sample
              </button>
            )}
            {template.connector_restore_event_id && (
              <button
                type="button"
                role="menuitem"
                disabled={restore.busy}
                onClick={() =>
                  void restore.restore(template.connector_restore_event_id!)
                }
              >
                Restore previous version
              </button>
            )}
          </div>
        </ToolbarPopover>
      )}
      {actions.dialogs}
      {restore.feedback}
    </>
  );
}
