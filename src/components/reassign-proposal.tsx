"use client";
import { withCount } from "../lib/count-label";
import { Select } from "./form-controls";
import { DialogActions } from "./dialog-actions";
import { useEffect, useState } from "react";
import { liveSenderAssignment } from "../lib/proposal-owner";
import type { Proposal } from "../lib/model";
import type { TeamPerson } from "../lib/team-model";
import { Sheet } from "./foundation";
import { api, post, Button, Field, Banner } from "./ui";
export function ReassignDialog({
  proposal,
  from,
  onClose,
  onChanged,
}: {
  proposal?: Proposal;
  from?: { user_id: string; display_name: string };
  onClose(): void;
  onChanged(rows: Proposal[]): void;
}) {
  const [people, setPeople] = useState<TeamPerson[]>([]),
    [rows, setRows] = useState<Proposal[]>(proposal ? [proposal] : []),
    [selected, setSelected] = useState<string[]>(proposal ? [proposal.id] : []),
    [to, setTo] = useState(""),
    [notify, setNotify] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const team = await api("/api/team");
        const work = proposal
          ? [proposal]
          : await api(`/api/team/${from!.user_id}/proposals`);
        if (live) {
          setPeople(
            team.members.filter((m: TeamPerson) => m.status === "active"),
          );
          setRows(work);
          setSelected(work.map((p: Proposal) => p.id));
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [proposal?.id, from?.user_id]);
  const target = people.find((p) => p.user_id === to);
  return (
    <Sheet
      title={
        proposal
          ? "Reassign proposal"
          : `Reassign ${from?.display_name}'s proposals`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="stack reassign-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = proposal
              ? [
                  await post<Proposal>(
                    `/api/proposals/${proposal.id}/reassign`,
                    { revision: proposal.revision, user_id: to, notify },
                  ),
                ]
              : await post<Proposal[]>("/api/team/reassign", {
                  from_user_id: from!.user_id,
                  user_id: to,
                  notify,
                  proposals: rows
                    .filter((p) => selected.includes(p.id))
                    .map((p) => ({ id: p.id, revision: p.revision })),
                });
            onChanged(result);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <Banner tone="danger" title="Unable to reassign">
            {error}
          </Banner>
        )}
        {loading ? (
          <p role="status">Loading team…</p>
        ) : (
          <>
            {proposal ? (
              <p>
                <strong>{proposal.title}</strong>
                <br />
                {proposal.status === "draft" && !proposal.sent_at
                  ? "Choose who owns this draft. Its creator stays in the activity history."
                  : liveSenderAssignment(proposal)
                    ? "Future reminders and follow-ups use the new sender and Reply-To. The client contact changes too; past emails and the sent document stay unchanged."
                    : "Only the internal owner and staff notifications change. Signed documents and past emails stay unchanged."}
              </p>
            ) : (
              <fieldset className="reassign-work">
                <legend>Unfinished proposals</legend>
                {rows.length ? (
                  rows.map((p) => (
                    <label className="check-row" key={p.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, p.id]
                              : ids.filter((id) => id !== p.id),
                          )
                        }
                      />
                      <span>
                        {p.title}
                        <small>
                          {p.status === "draft"
                            ? "Unsent draft"
                            : "Unfinished sent proposal"}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p>No unfinished proposals to reassign.</p>
                )}
              </fieldset>
            )}
            <Field label="To">
              <Select
                aria-label="To"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">Choose active staff member</option>
                {people
                  .filter((p) => p.user_id !== from?.user_id)
                  .map((p) => (
                    <option value={p.user_id} key={p.user_id}>
                      {p.display_name} | {p.email}
                    </option>
                  ))}
              </Select>
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <span>Notify {target?.display_name ?? "new owner"}</span>
            </label>
            <p className="muted">
              No client email is sent. The client link stays the same.
            </p>
          </>
        )}
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            disabled={loading || !to || !selected.length}
          >
            Reassign
            {proposal ? "" : ` ${withCount(selected.length, "proposal")}`}
          </Button>
        </DialogActions>
      </form>
    </Sheet>
  );
}
