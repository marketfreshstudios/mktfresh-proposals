"use client";
import { StaffSectionHeading } from "./staff-section-heading";
import { HeadingTokens } from "./editor/heading-tokens";
import { groupedEmails, emailWhen, studioDate } from "../lib/studio-v3";
import {
  StaffTable,
  StaffTableHead,
  StaffTableOpen,
  StaffTableEmpty,
} from "./staff-table";

import { Disclosure } from "./ui";
import { useEffect, useState } from "react";
import type { Data } from "./staff-app";
import { api, Button, Banner, date } from "./ui";
import { Skeleton } from "./foundation";
import { useStaffDates } from "./staff-account-context";
import { EmailEditor } from "./email-editor";

import {
  emailFields,
  editableEmail,
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
export function EmailsStudio({ data, id }: { data: Data | null; id?: string }) {
  const { date: staffDate, personal } = useStaffDates(data?.settings?.timezone);
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
  const loading = error ? (
    <Banner tone="danger" title="Emails could not be loaded">
      {error}
      <Button onClick={load}>Try again</Button>
    </Banner>
  ) : (
    <Skeleton kind="table" label="Loading emails…" />
  );
  if (id) {
    if (!templates || !data)
      return (
        <>
          <header className="page-header">
            <h1>Emails</h1>
          </header>
          {loading}
        </>
      );
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
      <>
        <header className="page-header">
          <h1>Emails</h1>
        </header>
        <Banner tone="danger" title="Email not found">
          <a href="/studio/emails">Back to Emails</a>
        </Banner>
      </>
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
        data-tab-style="underline"
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
            {templates?.filter((t) => t.staff === staff).length ?? "–"}
          </button>
        ))}
      </div>
      {(!templates || !data) && loading}
      <section aria-label={staffTab ? "Staff notifications" : "Client emails"}>
        {groupedEmails(data ? (templates ?? []) : [], staffTab).map(
          (group, n) => (
            <section
              className="studio-email-stage"
              key={`${group.name}-${n}`}
              aria-label={group.name}
            >
              <StaffSectionHeading>{group.name}</StaffSectionHeading>
              <StaffTable className="studio-email-rows">
                <StaffTableHead className="studio-email-head">
                  <span>Email</span>
                  <span>Subject</span>
                  <span>Status</span>
                  <span className="sr-only">Actions</span>
                </StaffTableHead>
                {group.templates.map((t) => (
                  <div className="staff-table-row email-list-row" key={t.key}>
                    <span>
                      <strong>{t.name}</strong>
                      <small>{emailWhen[t.key]}</small>
                    </span>
                    <span className="studio-email-subject">
                      <HeadingTokens text={t.subject} map={emailFields} />
                    </span>
                    <span
                      className={`studio-email-edited ${editableEmail(t) && t.updated_at ? "success" : ""}`}
                    >
                      {!editableEmail(t)
                        ? "Read-only"
                        : t.updated_at
                          ? `Edited ${personal ? staffDate(t.updated_at) : studioDate(t.updated_at)} · ${data?.staff.find((m) => t.updated_by === `staff:${m.user_id}` || t.updated_by === m.user_id)?.display_name ?? "Staff"}`
                          : "Default"}
                    </span>
                    <StaffTableOpen
                      href={`/studio/emails/${t.key}`}
                      label={`Open ${t.name}`}
                    />
                  </div>
                ))}
              </StaffTable>
            </section>
          ),
        )}
      </section>
      <p className="staff-surface staff-surface-note muted">
        Each proposal keeps an exact copy of every email it sent, on its record
        under Activity. Later edits here don’t change those copies.
      </p>
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
  const { date: staffDate } = useStaffDates();
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
      <StaffTable inline density="compact" className="proposal-email-table">
        <StaffTableHead>Sent email</StaffTableHead>
        {logs.length
          ? logs.map((log) => (
              <details key={log.id} className="staff-table-row">
                <Disclosure>
                  {log.snapshot.subject} · {staffDate(log.sent_at)}
                </Disclosure>
                <dl>
                  <dt>To</dt>
                  <dd>{log.snapshot.to}</dd>
                  <dt>From</dt>
                  <dd>{log.snapshot.from}</dd>
                  <dt>Sent</dt>
                  <dd>
                    {staffDate(log.sent_at, {
                      dateStyle: "medium",
                      timeStyle: "medium",
                    })}
                  </dd>
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
              <StaffTableEmpty>
                No saved email copies yet. Emails sent before template logging
                was introduced are not reconstructed.
              </StaffTableEmpty>
            )}
      </StaffTable>
    </section>
  );
}
