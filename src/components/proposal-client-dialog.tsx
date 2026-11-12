"use client";
import { useEffect, useState } from "react";
import type { Client, Proposal } from "../lib/model";
import { ClientPicker } from "./client-picker";
import { DialogActions } from "./dialog-actions";
import { Sheet } from "./foundation";
import { api, post, Banner, Button, Field } from "./ui";

/** True while the client can still change: a draft that was never sent. */
export function canChangeClient(p: Proposal) {
  return (
    p.source === "native" &&
    p.status === "draft" &&
    !p.sent_at &&
    !p.token &&
    !p.versions.length &&
    !p.archived_at
  );
}

/** Swap the old client's company name in a title for the new one. */
export function titleForClient(
  title: string,
  from: Pick<Client, "company">,
  to: Pick<Client, "company"> | undefined,
) {
  if (!to || !from.company || to.company === from.company) return title;
  return title.split(from.company).join(to.company);
}

/** Times the old company name was typed into the document's own text. */
function typedMentions(p: Proposal) {
  const name = p.client.company.trim();
  if (!name) return 0;
  return JSON.stringify(p.content).split(name).length - 1;
}

/**
 * Who a proposal is for. Duplicate asks before creating the copy; Change
 * client re-points a draft that has never been sent.
 */
export function ProposalClientDialog({
  proposal,
  mode,
  onClose,
  onDone,
}: {
  proposal: Proposal;
  mode: "duplicate" | "change";
  onClose(): void;
  onDone(next: Proposal): void;
}) {
  const [clients, setClients] = useState<Client[] | null>(null),
    [clientId, setClientId] = useState(proposal.client.id),
    [title, setTitle] = useState(
      mode === "duplicate" ? `${proposal.title} (copy)` : proposal.title,
    ),
    [titleEdited, setTitleEdited] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api<Client[]>("/api/clients")
      .then((rows) => live && setClients(rows))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  const chosen = clients?.find((c) => c.id === clientId);
  const changed = clientId !== proposal.client.id;
  const mentions = changed ? typedMentions(proposal) : 0;
  function choose(id: string) {
    setClientId(id);
    const next = clients?.find((c) => c.id === id);
    if (id && !next) {
      // A client just created from the picker: reload the list first.
      void api<Client[]>("/api/clients").then((rows) => {
        setClients(rows);
        if (!titleEdited)
          setTitle(
            titleForClient(
              proposal.title,
              proposal.client,
              rows.find((c) => c.id === id),
            ),
          );
      });
      return;
    }
    if (titleEdited) return;
    const base =
      id === proposal.client.id
        ? mode === "duplicate"
          ? `${proposal.title} (copy)`
          : proposal.title
        : titleForClient(proposal.title, proposal.client, next);
    setTitle(base);
  }
  return (
    <Sheet
      title={mode === "duplicate" ? "Duplicate proposal" : "Change client"}
      subtitle={
        mode === "duplicate"
          ? "Who is the new proposal for?"
          : "You can change the client until the proposal is first sent."
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="stack proposal-client-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !clientId) return;
          setBusy(true);
          setError("");
          try {
            const next = await post<Proposal>(
              `/api/proposals/${proposal.id}/actions`,
              {
                revision: proposal.revision,
                action: mode === "duplicate" ? "duplicate" : "change_client",
                ...(changed || mode === "change"
                  ? { client_id: clientId }
                  : {}),
                title: title.trim(),
              },
            );
            onDone(next);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Unable to save the client",
            );
            setBusy(false);
          }
        }}
      >
        {error && (
          <Banner tone="danger" title="That didn’t work">
            {error}
          </Banner>
        )}
        {clients ? (
          <ClientPicker
            clients={clients}
            initial={proposal.client.id}
            onChange={choose}
          />
        ) : (
          !error && <p className="muted">Loading clients…</p>
        )}
        <Field label="Title">
          <input
            name="title"
            value={title}
            maxLength={300}
            required
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
          />
        </Field>
        {changed && (
          <p className="muted proposal-client-note">
            Client fields, like the company and contact name, switch to{" "}
            {chosen?.company ?? "the new client"} automatically.
            {mentions > 0 &&
              ` “${proposal.client.company}” is also typed into the proposal text ${mentions === 1 ? "once" : `${mentions} times`}; review those mentions before sending.`}
          </p>
        )}
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="action"
            busy={busy}
            disabled={!clients || !clientId || (mode === "change" && !changed)}
          >
            {mode === "duplicate" ? "Create draft" : "Change client"}
          </Button>
        </DialogActions>
      </form>
    </Sheet>
  );
}
