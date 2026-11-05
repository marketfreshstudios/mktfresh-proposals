"use client";
import { groupedEmails, emailWhen } from "../lib/studio-v3";
import { Icon } from "./ui";
import { DialogActions } from "./dialog-actions";
import { Disclosure } from "./ui";
import { useEffect, useRef, useState } from "react";
import type { Data } from "./staff-app";
import { api, post, Button, Field, Banner, date } from "./ui";
import { Sheet, Skeleton } from "./foundation";
import { SubjectField } from "./field-options";
import { FieldEditor } from "./field-editor";
import {
  emailFields,
  editableEmail,
  validateTemplate,
  type EmailTemplate,
} from "../lib/email-template-content";
import type { EmailLog } from "../lib/email-templates";
function previewHtml(html: string, dark?: boolean) {
  return html
    .replace(
      /(<a\b[^>]*?)\shref="([^"]*)"/g,
      '$1 data-preview-href="$2" aria-disabled="true"',
    )
    .replace(
      "@media(prefers-color-scheme:dark)",
      dark === undefined
        ? "@media(prefers-color-scheme:dark)"
        : dark
          ? "@media screen"
          : "@media not all",
    );
}
type Preview = {
  subject: string;
  html: string;
  text: string;
  values: Record<string, string>;
  logo_error?: string;
};
export function EmailsStudio({ data, id }: { data: Data; id?: string }) {
  const [staffTab, setStaffTab] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setError("");
      setTemplates(await api("/api/email-templates"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (!templates)
    return error ? (
      <Banner tone="danger" title="Emails could not be loaded">
        {error}
        <Button onClick={load}>Try again</Button>
      </Banner>
    ) : (
      <Skeleton kind="document" label="Loading emails…" />
    );
  if (id) {
    const t = templates.find((t) => t.key === id);
    return t ? (
      <EmailEditor
        key={id}
        data={data}
        initial={t}
        saved={(next) =>
          setTemplates(templates.map((t) => (t.key === id ? next : t)))
        }
      />
    ) : (
      <Banner tone="danger" title="Email not found">
        <a href="/studio/emails">Back to Emails</a>
      </Banner>
    );
  }
  return (
    <div className="emails-studio studio-v3-emails">
      <p className="studio-description">
        What clients and staff receive at each step. Client emails use your
        branding and come from the proposal’s sender. The proposal link is
        always added for you.
      </p>
      <div
        className="studio-segments"
        role="tablist"
        aria-label="Email audiences"
      >
        {[false, true].map((staff) => (
          <button
            role="tab"
            aria-selected={staffTab === staff}
            key={String(staff)}
            onClick={() => setStaffTab(staff)}
          >
            {staff ? "Staff notifications" : "Client emails"} ·{" "}
            {templates.filter((t) => t.staff === staff).length}
          </button>
        ))}
      </div>
      <section aria-label={staffTab ? "Staff notifications" : "Client emails"}>
        {groupedEmails(templates, staffTab).map((group, n) => (
          <section
            className="studio-email-stage"
            key={`${group.name}-${n}`}
            aria-label={group.name}
          >
            <h2>{group.name}</h2>
            <div className="studio-email-rows">
              {group.templates.map((t) => (
                <a
                  className="email-list-row"
                  key={t.key}
                  href={`/studio/emails/${t.key}`}
                >
                  <span>
                    <strong>{t.name}</strong>
                    <small>{emailWhen[t.key]}</small>
                  </span>
                  <span className="studio-email-subject">{t.subject}</span>
                  <span className="studio-email-edited">
                    {t.updated_at
                      ? `Edited ${date(t.updated_at)} · ${data.staff.find((m) => t.updated_by === `staff:${m.user_id}` || t.updated_by === m.user_id)?.display_name ?? "Staff"}`
                      : "Default"}
                  </span>
                  <Icon name="chevron-right" />
                  <span className="sr-only">Open {t.name}</span>
                </a>
              ))}
            </div>
          </section>
        ))}
      </section>
      <p className="muted">
        Each proposal keeps an exact copy of every email it sent, on its record
        under Activity. Later edits here don’t change those copies.
      </p>
    </div>
  );
}
function EmailEditor({
  data,
  initial,
  saved,
}: {
  data: Data;
  initial: EmailTemplate;
  saved: (t: EmailTemplate) => void;
}) {
  const [form, setForm] = useState(initial),
    [proposal, setProposal] = useState(""),
    [width, setWidth] = useState<"desktop" | "phone">("desktop"),
    [darkPreview, setDarkPreview] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewError, setPreviewError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false);
  const testId = useRef(crypto.randomUUID());
  const editable =
    editableEmail(form) &&
    (!form.key.startsWith("team_") || data.user.staff_role === "owner");
  let validation = "";
  try {
    validateTemplate({
      subject: form.subject,
      body: form.body,
      button_label: form.button_label,
    });
  } catch (e) {
    validation = (e as Error).message;
  }
  useEffect(() => {
    if (matchMedia("(max-width:699px)").matches) setWidth("phone");
    setDarkPreview(document.documentElement.dataset.theme === "dark");
  }, []);
  const payload = () => ({
    proposal_id: proposal || null,
    ...(editable
      ? {
          subject: form.subject,
          body: form.body,
          button_label: form.button_label,
        }
      : {}),
  });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (validation) return;
      void api<Preview>(`/api/email-templates/${form.key}/preview`, {
        method: "POST",
        body: JSON.stringify(payload()),
        signal: controller.signal,
      })
        .then((p) => {
          setPreview(p);
          setPreviewError("");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setPreviewError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, proposal, validation]);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api<EmailTemplate>(
        `/api/email-templates/${form.key}`,
        {
          method: "PUT",
          body: JSON.stringify({
            subject: form.subject,
            body: form.body,
            button_label: form.button_label,
          }),
        },
      );
      setForm(next);
      saved(next);
      setNotice("Email template saved. Future emails will use this version.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="email-editor">
      <a href="/studio/emails">‹ Emails</a>
      <div className="email-editor-heading">
        <div>
          <h2>{form.name}</h2>
          <p className="muted">
            {form.staff
              ? editable
                ? "Staff notification · editable"
                : "Staff notification · read-only"
              : form.updated_at
                ? `Last edited ${date(form.updated_at)}`
                : "Workspace default"}
          </p>
        </div>
        {editable && (
          <Button disabled={busy} onClick={() => setReset(true)}>
            Reset to default
          </Button>
        )}
      </div>
      {!editable && (
        <Banner title="Staff notification">
          This message is generated by proposal activity. Its wording and action
          cannot be edited. Declined notifications include the client’s note
          when provided.
        </Banner>
      )}
      {data.connections?.mock && (
        <Banner title="Local email preview">
          Test messages are captured locally; they are not delivered to an
          inbox.
        </Banner>
      )}
      {(validation || error) && (
        <Banner tone="danger" title="Check this email">
          {validation || error}
        </Banner>
      )}
      {notice && (
        <p role="status" className="email-notice">
          {notice}
        </p>
      )}
      <div className="email-editor-grid">
        <section className="email-edit-fields" aria-label="Email content">
          <Field label="Subject">
            <SubjectField
              value={form.subject}
              readOnly={!editable}
              map={
                preview?.values ??
                Object.fromEntries(
                  Object.keys(emailFields).map((k) => [k, `{{${k}}}`]),
                )
              }
              onChange={(subject) => setForm({ ...form, subject })}
            />
          </Field>
          <div className="field">
            <span>Body</span>
            {!editable ? (
              <p className="muted">
                Read the generated message in the preview.
              </p>
            ) : (
              <FieldEditor
                label="Email body"
                allowLinks
                value={form.body}
                onChange={(body) => setForm({ ...form, body })}
                map={
                  preview?.values ??
                  Object.fromEntries(
                    Object.keys(emailFields).map((k) => [k, `{{${k}}}`]),
                  )
                }
                showNames
              />
            )}
          </div>
          <Field label="Primary button label">
            <input
              value={form.button_label}
              maxLength={80}
              readOnly={!editable}
              onChange={(e) =>
                setForm({ ...form, button_label: e.target.value })
              }
            />
          </Field>
          <p className="muted">
            The button always opens the secure{" "}
            {form.staff ? "staff record" : "proposal"}. Signed copies are
            attached and can also be downloaded from that page. The destination
            is managed automatically.
          </p>
          {["billing_complete", "staff_billing_complete"].includes(
            form.key,
          ) && (
            <p className="muted">
              Verified products, rates, card details and the next billing date
              are added automatically after setup. These details cannot be
              removed from the confirmation.
            </p>
          )}
          <p className="muted">
            Pricing fields are optional and are not included in the defaults.
          </p>
          <DialogActions>
            {editable && (
              <Button
                variant="primary"
                busy={busy}
                disabled={!!validation || busy}
                onClick={save}
              >
                Save email template
              </Button>
            )}
            <Button
              disabled={!!validation || busy}
              busy={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  const result = await post<{ sent_to: string }>(
                    `/api/email-templates/${form.key}/test`,
                    { ...payload(), request_id: testId.current },
                  );
                  setNotice(
                    `${data.connections?.mock ? "Test captured for" : "Test sent to"} ${result.sent_to}.`,
                  );
                  testId.current = crypto.randomUUID();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send me a test
            </Button>
          </DialogActions>
          <p className="muted">
            Tests go only to you: {data.user.staff_email}. No client is
            contacted.
          </p>
        </section>
        <section
          className="email-preview-section"
          aria-label="Live email preview"
        >
          <div className="email-preview-tools">
            <Field label="Preview data">
              <select
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              >
                <option value="">Sample client · no prices</option>
                {data.proposals
                  .filter((p) => p.source === "native")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.client.company}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="segmented" role="group" aria-label="Preview width">
              <Button
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
              >
                Desktop
              </Button>
              <Button
                aria-pressed={width === "phone"}
                onClick={() => setWidth("phone")}
              >
                Phone
              </Button>
            </div>
          </div>
          <p className="muted">
            Preview uses your staff sender and sample or selected client data.
            Links are disabled. Mail apps may adjust colors.
          </p>
          {(previewError || preview?.logo_error) && (
            <Banner tone="warning" title="Preview needs attention">
              {previewError || preview?.logo_error}
            </Banner>
          )}
          <label className="check">
            <input
              type="checkbox"
              role="switch"
              checked={darkPreview}
              onChange={(e) => setDarkPreview(e.target.checked)}
            />
            Dark email preview
          </label>
          {preview ? (
            <>
              <p className="email-preview-subject">
                <strong>Subject:</strong> {preview.subject}
              </p>
              <div className="email-preview-scroll">
                <iframe
                  key={width}
                  title="Email preview"
                  sandbox=""
                  srcDoc={previewHtml(preview.html, darkPreview)}
                  style={{ width: width === "phone" ? 320 : 600 }}
                />
              </div>
              {(validation || previewError) && (
                <p className="muted">Showing the last valid preview.</p>
              )}
              <details>
                <Disclosure>Plain-text alternative</Disclosure>
                <pre className="email-plain-text">{preview.text}</pre>
              </details>
            </>
          ) : (
            <Skeleton kind="document" label="Preparing email preview…" />
          )}
        </section>
      </div>
      {reset && (
        <Sheet title="Reset email template?" onClose={() => setReset(false)}>
          <p>
            Reset “{form.name}” to the default? This replaces its saved subject,
            body and button label. Emails already sent keep their saved copy.
          </p>
          <DialogActions>
            <Button onClick={() => setReset(false)}>Keep my edits</Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const next = await post<EmailTemplate>(
                    `/api/email-templates/${form.key}/reset`,
                    {},
                  );
                  setForm(next);
                  saved(next);
                  setNotice("Email template reset to default.");
                  setReset(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset email template
            </Button>
          </DialogActions>
        </Sheet>
      )}
    </div>
  );
}
export function ProposalEmailLog({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const [logs, setLogs] = useState<EmailLog[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<EmailLog[]>(`/api/proposals/${id}/emails`)
      .then((v) => {
        if (active) setLogs(Array.isArray(v) ? v : []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return (
    <section className="card stack">
      <h2>Email log</h2>
      <p className="muted">
        Saved subject and content exactly as sent. Later template edits do not
        change these copies.
      </p>
      {error && <p role="alert">{error}</p>}
      {logs.length
        ? logs.map((log) => (
            <details key={log.id}>
              <Disclosure>
                {log.snapshot.subject} · {date(log.sent_at)}
              </Disclosure>
              <dl>
                <dt>To</dt>
                <dd>{log.snapshot.to}</dd>
                <dt>From</dt>
                <dd>{log.snapshot.from}</dd>
                <dt>Sent</dt>
                <dd>{new Date(log.sent_at).toLocaleString()}</dd>
              </dl>
              <iframe
                className="email-log-preview"
                title={`Sent email: ${log.snapshot.subject}`}
                sandbox=""
                srcDoc={previewHtml(log.snapshot.html)}
              />
              <details>
                <Disclosure>Plain text</Disclosure>
                <pre className="email-plain-text">{log.snapshot.text}</pre>
              </details>
            </details>
          ))
        : !error && (
            <p>
              No saved email copies yet. Emails sent before template logging was
              introduced are not reconstructed.
            </p>
          )}
    </section>
  );
}
