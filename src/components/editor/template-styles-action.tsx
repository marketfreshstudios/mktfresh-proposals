"use client";
import { useEffect, useState } from "react";
import { api, ApiError, Button, post } from "../ui";
import { confirmDialog } from "../dialog-actions";
import { ToastSurface } from "../toast-surface";
import type { StyleOverrides } from "../../lib/proposal-styles";

type Target = {
  name: string;
  revision: string;
  proposal_revision: number;
  changes: string[];
};
export function TemplateStylesAction({
  id,
  templateId,
  revision,
  prepare,
  onApplied,
  onConflict,
  disabled,
  disabledReason,
}: {
  id: string;
  templateId?: string | null;
  revision: number;
  disabled?: boolean;
  disabledReason?: string;
  prepare: () => Promise<boolean>;
  onApplied: (styles: StyleOverrides) => Promise<() => Promise<void>>;
  onConflict: () => Promise<void>;
}) {
  const [target, setTarget] = useState<Target | null>(null),
    [missing, setMissing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [undo, setUndo] = useState<{
    event: string;
    apply: () => Promise<void>;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!templateId) return;
    let active = true;
    api<Target>(`/api/proposals/${id}/template-styles`)
      .then((value) => {
        if (active) {
          setTarget(value);
          setMissing(false);
        }
      })
      .catch((e) => {
        if (active) {
          setMissing(/no longer available|not found/i.test(String(e)));
          setError(String(e));
        }
      });
    return () => {
      active = false;
    };
  }, [id, templateId, revision, refresh]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(timer);
  }, [undo]);
  if (!templateId || missing) return null;
  const reason = disabled
    ? (disabledReason ?? "This proposal is locked")
    : !target?.changes
      ? "Loading template styles"
      : !target.changes.length
        ? "No style changes to save"
        : undefined;
  return (
    <>
      <Button
        className="studio-primary"
        disabled={busy || !!reason}
        title={reason}
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (!(await prepare())) return;
            const fresh = await api<Target>(
              `/api/proposals/${id}/template-styles`,
            );
            setTarget(fresh);
            if (!fresh.changes.length) return;
            if (
              !(await confirmDialog({
                title: `Save styles to ${fresh.name}?`,
                description:
                  "New proposals from it will use these styles. Existing proposals don't change.",
                details: (
                  <ul>
                    {fresh.changes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
                confirmLabel: "Save to template",
                confirmVariant: "action",
              }))
            )
              return;
            const result = await post<{
              style_overrides: StyleOverrides;
              event_id: string | null;
            }>(`/api/proposals/${id}/template-styles`, {
              revision: fresh.revision,
              proposal_revision: fresh.proposal_revision,
            });
            const apply = await onApplied(result.style_overrides);
            if (result.event_id) setUndo({ event: result.event_id, apply });
            setRefresh((n) => n + 1);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not save template styles.",
            );
            if (e instanceof ApiError && e.status === 409) {
              try {
                await onConflict();
              } catch {
                /* Keep the original conflict visible; never retry a write. */
              }
            }
            // Refresh for a new confirmation; a conflict is never retried automatically.
            setRefresh((n) => n + 1);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save to template
      </Button>
      {error && (
        <p className="template-style-error" role="alert">
          {error}
        </p>
      )}
      {undo && (
        <ToastSurface onDismiss={() => setUndo(null)} dismissDisabled={busy}>
          Styles saved to template{" "}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post(`/api/proposals/${id}/undo-template-styles`, {
                  event_id: undo.event,
                });
                await undo.apply();
                setUndo(null);
                setRefresh((n) => n + 1);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not undo template styles.",
                );
                setUndo(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Undo
          </button>
        </ToastSurface>
      )}
    </>
  );
}
