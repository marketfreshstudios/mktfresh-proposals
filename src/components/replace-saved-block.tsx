"use client";
import { documentBlocks } from "../lib/columns";
import { Select } from "./form-controls";
import { useEffect, useRef, useState } from "react";
import type { Proposal, SavedBlock } from "../lib/model";
import { api, post, Button, Field } from "./ui";
import { DialogActions } from "./dialog-actions";
export function ReplaceSavedBlockDialog({
  proposal,
  onClose,
  onChanged,
}: {
  proposal: Proposal;
  onClose: () => void;
  onChanged: (p: Proposal) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [rows, setRows] = useState<SavedBlock[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLButtonElement>('[data-dialog-action="back"]')
      ?.focus();
    api<SavedBlock[]>("/api/content_library")
      .then((all) => {
        const next = all.filter((r) =>
          documentBlocks(proposal.content).some(
            (b) => b.saved_block_id === r.id,
          ),
        );
        setRows(next);
        setSelected(next[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <dialog
      ref={dialog}
      className="block-dialog"
      aria-label="Replace with latest block"
      onCancel={onClose}
      onClose={onClose}
    >
      <h2>Replace with latest block</h2>
      <p>
        Replaces this block in this proposal, including any local edits. Once
        saved, it goes live on the same client link. No email is sent. Signed
        proposals never change.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !selected) return;
          setBusy(true);
          try {
            onChanged(
              await post(`/api/proposals/${proposal.id}/replace-saved-block`, {
                revision: proposal.revision,
                saved_block_id: selected,
              }),
            );
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Saved block">
          <Select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · version {r.version ?? 1}
              </option>
            ))}
          </Select>
        </Field>
        {error && <p role="alert">{error}</p>}
        <DialogActions>
          <Button autoFocus onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={!selected}
          >
            Replace block
          </Button>
        </DialogActions>
      </form>
    </dialog>
  );
}
