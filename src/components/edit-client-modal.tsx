"use client";
import { useState } from "react";
import type { Client } from "../lib/model";
import { ClientContactFields, clientFormValues } from "./client-contact-fields";
import { DialogActions } from "./dialog-actions";
import { Sheet } from "./foundation";
import { Banner, Button, Field, api, post } from "./ui";

/** The same fields, validation and save endpoint in Clients and Review & send. */
export function EditClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client;
  onClose: () => void;
  onSaved: (client: Client) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Sheet
      title={`Edit ${client.company}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          setBusy(true);
          setError("");
          const values = clientFormValues(e.currentTarget);
          try {
            // Only displayed fields are edits. Keep current hidden notes when
            // this proposal contains an older contact copy.
            const current = (await api<Client[]>("/api/clients")).find(
              (c) => c.id === client.id,
            );
            if (!current)
              throw new Error(
                "This client no longer exists. Reload before editing.",
              );
            const saved = await post<Client>("/api/clients", {
              ...current,
              ...values,
              qbo_customer_id: values.qbo_customer_id || null,
              stripe_customer_id: current.stripe_customer_id,
            });
            await onSaved(saved);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <Banner tone="danger" title="Client could not be saved">
            {error}
          </Banner>
        )}
        <ClientContactFields client={client} />
        <Field label="Verified QuickBooks customer ID">
          <input
            name="qbo_customer_id"
            defaultValue={client.qbo_customer_id ?? ""}
          />
        </Field>
        <p>
          Only enter a QuickBooks ID after checking this client’s identity.
          Choose a Stripe customer under Billing.
        </p>
        <DialogActions>
          <Button disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            Save client
          </Button>
        </DialogActions>
      </form>
    </Sheet>
  );
}
