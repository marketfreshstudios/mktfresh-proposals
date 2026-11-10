"use client";
import { Select } from "./form-controls";
import { Disclosure } from "./ui";
import { useState } from "react";
import type { ReferenceDocument } from "../lib/documents";
import { Button, Field, post } from "./ui";
type Runner = (fn: () => Promise<unknown>, success?: string) => Promise<void>;
function ReferenceStatus({ documents }: { documents: ReferenceDocument[] }) {
  if (!documents.length) return null;
  return (
    <section
      className="reference-document-section stack"
      aria-label="Pricing reference status"
    >
      <h3>Status</h3>
      {documents.map((d) => (
        <div key={d.id}>
          <strong>
            {d.name} · {d.version || "No successful version yet"}
          </strong>
          {d.source_type === "linked" && (
            <p>
              Last successful refresh:{" "}
              {d.last_success_at
                ? new Date(d.last_success_at).toLocaleString()
                : "Never"}
            </p>
          )}
          {d.fetch_error && (
            <p role="alert">
              {d.fetch_error}.{" "}
              {d.content_hash
                ? "Assistants can still read the last good version."
                : "No content is available yet."}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
export function ReferenceDocuments({
  documents,
  run,
}: {
  documents: ReferenceDocument[];
  run: Runner;
}) {
  const [editing, setEditing] = useState<ReferenceDocument | null>(null);
  return (
    <section className="stack">
      <ReferenceStatus documents={documents} />
      <section className="reference-document-section stack">
        <h3>Pricing reference for assistants</h3>
        {documents.map((d) => (
          <div key={d.id} className="stack">
            <details>
              <Disclosure>
                {d.name} · {d.version || "Awaiting first fetch"}
              </Disclosure>
              <p>SHA-256: {d.content_hash || "Unavailable"}</p>
              <pre>{d.content}</pre>
            </details>
            <div className="toolbar">
              <Button onClick={() => setEditing(d)}>Edit {d.name}</Button>
              {d.source_type === "linked" && (
                <Button
                  onClick={() =>
                    void run(
                      () =>
                        post(`/api/workspace_documents/${d.id}/refresh`, {}),
                      "Reference refresh finished",
                    )
                  }
                >
                  Refresh now
                </Button>
              )}
            </div>
          </div>
        ))}
        <ReferenceForm
          key={editing?.id ?? "new"}
          document={editing}
          run={run}
          done={() => setEditing(null)}
        />
        {editing && (
          <Button onClick={() => setEditing(null)}>Cancel editing</Button>
        )}
      </section>
    </section>
  );
}
function ReferenceForm({
  document,
  run,
  done,
}: {
  document: ReferenceDocument | null;
  run: Runner;
  done: () => void;
}) {
  const [source, setSource] = useState(document?.source_type ?? "pasted");
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fields = new FormData(form);
        const input = {
          ...Object.fromEntries(fields),
          id: document?.id,
          source_type: source,
          clear_auth: fields.get("clear_auth") === "on",
        };
        void run(async () => {
          const result = await post("/api/workspace_documents", input);
          form.reset();
          done();
          return result;
        }, "Pricing reference saved");
      }}
    >
      <h4>{document ? "Edit reference" : "Add reference"}</h4>
      <Field label="Reference name">
        <input name="name" required defaultValue={document?.name} />
      </Field>
      <Field label="Source">
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value as "pasted" | "linked")}
        >
          <option value="pasted">Pasted text</option>
          <option value="linked">Linked HTTPS document</option>
        </Select>
      </Field>
      {source === "linked" ? (
        <>
          <Field label="Reference URL">
            <input
              name="url"
              type="url"
              required
              placeholder="https://example.com/pricing.txt"
              defaultValue={document?.url}
            />
          </Field>
          <p>
            Fetched on save and hourly. Plain UTF-8 text, up to 1 MB. Optional
            Basic auth credentials are encrypted and never displayed after
            saving.
          </p>
          {document?.has_auth && (
            <p>Credentials saved. Leave both fields blank to keep them.</p>
          )}
          <Field label="Basic auth username">
            <input name="username" autoComplete="off" />
          </Field>
          <Field label="Basic auth password">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
            />
          </Field>
          {document?.has_auth && (
            <label>
              <input name="clear_auth" type="checkbox" /> Remove saved
              credentials
            </label>
          )}
        </>
      ) : (
        <>
          <Field label="Version">
            <input name="version" defaultValue={document?.version} />
          </Field>
          <Field label="Format">
            <Select name="format" defaultValue={document?.format ?? "markdown"}>
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="text">Plain text</option>
            </Select>
          </Field>
          <Field label="Pricing reference content">
            <textarea
              rows={8}
              name="content"
              required
              defaultValue={document?.content}
            />
          </Field>
        </>
      )}
      <Button type="submit">Save reference</Button>
    </form>
  );
}
