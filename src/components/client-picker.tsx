"use client";
import { useState } from "react";
import { Sheet } from "./foundation";
import { Banner, Button, Field } from "./ui";
import type { Client } from "../lib/model";
export function ClientPicker({
  clients,
  initial = "",
  onChange,
  name = "client",
  required = true,
}: {
  clients: Client[];
  initial?: string;
  onChange?: (id: string) => void;
  name?: string;
  required?: boolean;
}) {
  const [all, setAll] = useState(clients),
    [selected, setSelected] = useState(initial),
    [open, setOpen] = useState(false);
  function choose(client: Client) {
    setAll((current) =>
      current.some((c) => c.id === client.id) ? current : [...current, client],
    );
    setSelected(client.id);
    onChange?.(client.id);
    setOpen(false);
  }
  return (
    <>
      <Field label="Client">
        <select
          name={name}
          required={required}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          <option value="">Choose a client</option>
          {all
            .toSorted((a, b) => a.company.localeCompare(b.company))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.company} · {c.email}
              </option>
            ))}
        </select>
      </Field>
      <button
        type="button"
        className="text-action"
        onClick={() => setOpen(true)}
      >
        Create new client instead
      </button>
      {open && (
        <CreateClientModal onClose={() => setOpen(false)} onSaved={choose} />
      )}
    </>
  );
}
export function CreateClientModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (client: Client) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [existing, setExisting] = useState<Client | null>(null);
  return (
    <Sheet title="New client" onClose={onClose}>
      <form
        className="form inline-client-form"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (busy) return;
          setBusy(true);
          setError("");
          setExisting(null);
          const values = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const response = await fetch("/api/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values),
            });
            const value = await response.json();
            if (!response.ok) {
              if (value.existing_client) setExisting(value.existing_client);
              throw new Error(
                value.issues
                  ?.map(
                    (i: { path: string[]; message: string }) =>
                      `${i.path.join(".")}: ${i.message}`,
                  )
                  .join("; ") ||
                  value.error ||
                  "Unable to save client",
              );
            }
            onSaved(value);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to save client");
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
        {existing && (
          <Button onClick={() => onSaved(existing)}>
            Use the existing client
          </Button>
        )}
        <div className="client-fields">
          {[
            ["first_name", "First name"],
            ["last_name", "Last name"],
            ["title", "Title"],
            ["email", "Email"],
            ["company", "Company"],
            ["phone", "Phone"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                name={key}
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                required={["email", "company"].includes(key)}
                maxLength={key === "email" ? 254 : 200}
              />
            </Field>
          ))}
        </div>
        <Button type="submit" variant="primary" busy={busy}>
          Create client
        </Button>
      </form>
    </Sheet>
  );
}
