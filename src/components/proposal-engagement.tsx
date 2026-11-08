"use client";
import { useEffect, useState } from "react";
import { api, Button, Disclosure } from "./ui";
import type { engagementReport } from "../lib/engagement-server";
import {
  engagementAgo,
  engagementDuration,
  type EngagementSummary,
} from "../lib/engagement";

type Report = Awaited<ReturnType<typeof engagementReport>>;
function exact(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: timezone,
  }).format(new Date(value));
}
export function ProposalEngagement({
  id,
  timezone,
  notify = true,
  knownRecipient = false,
}: {
  id: string;
  timezone: string;
  notify?: boolean;
  knownRecipient?: boolean;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      setReport(await api<Report>(`/api/proposals/${id}/engagement`));
    } catch {
      setError("Couldn’t load engagement. Try again.");
    }
  };
  useEffect(() => {
    setReport(null);
    void load();
  }, [id]);
  const bars = (kind: "section" | "page") => {
    const targets = report!.targets.filter((t) => t.kind === kind),
      maximum = Math.max(1, ...targets.map((t) => t.ms));
    return (
      <ul className="engagement-sections">
        {targets.map((t) => (
          <li key={t.key}>
            <div>
              <strong>{t.label}</strong>
              <span>
                {engagementDuration(t.ms)} · {t.percent}% reached
              </span>
            </div>
            <meter
              min={0}
              max={maximum}
              value={t.ms}
              aria-label={`Time on ${t.label}`}
            />
          </li>
        ))}
      </ul>
    );
  };
  return (
    <section
      className="card engagement-panel"
      aria-labelledby="engagement-heading"
    >
      <header className="section-heading">
        <h2 id="engagement-heading">Engagement</h2>
        <Button onClick={load}>Refresh</Button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!report ? (
        <p role="status">Loading engagement…</p>
      ) : !report.views && !report.downloads ? (
        <div className="engagement-empty">
          <h3>
            {report.first_viewed_at
              ? "No tracked sessions yet"
              : "No client views yet"}
          </h3>
          <p>
            Engagement appears after your client interacts with the sent
            proposal. Previews don’t count.
          </p>
          {report.first_viewed_at && (
            <p>
              Earlier viewed activity remains in Timeline. Detailed engagement
              starts with a new client visit.
            </p>
          )}
        </div>
      ) : (
        <>
          {notify && report.views > 0 && (
            <p className="engagement-first-note">
              Client viewed this proposal.
            </p>
          )}
          <dl className="engagement-stats">
            <div>
              <dt>Total views</dt>
              <dd>{report.views}</dd>
            </div>
            <div>
              <dt title="Separate browsers that opened this link — not verified people">
                Devices
              </dt>
              <dd>{report.unique_viewers}</dd>
            </div>
            <div>
              <dt title="Distinct known recipient links opened">Recipients</dt>
              <dd>{report.views > 0 && knownRecipient ? 1 : 0}</dd>
            </div>
            <div>
              <dt>Total time</dt>
              <dd>{engagementDuration(report.total_ms)}</dd>
            </div>
            <div>
              <dt>PDF downloads</dt>
              <dd>{report.downloads}</dd>
            </div>
          </dl>
          {report.last_viewed_at && (
            <p className="engagement-last">
              Last viewed{" "}
              <time
                dateTime={report.last_viewed_at}
                title={exact(report.last_viewed_at, timezone)}
              >
                {engagementAgo(report.last_viewed_at)}
              </time>
              <small>{exact(report.last_viewed_at, timezone)}</small>
            </p>
          )}
          <h3>Time by section</h3>
          {bars("section")}
          <details>
            <Disclosure>Time by page</Disclosure>
            <p className="engagement-help muted">
              Page timing comes from desktop sheets. Phone and tablet visits are
              timed by section.
            </p>
            {bars("page")}
          </details>
          <h3>View sessions</h3>
          <p className="muted engagement-help">
            Recipient names identify the link used; a forwarded link doesn’t
            verify who read it. Time counts only while visible and focused, with
            a 60-second idle limit.
          </p>
          <ol className="engagement-sessions">
            {report.sessions.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>
                    {s.recipient
                      ? `${s.recipient} · recipient link`
                      : "Unknown viewer"}
                  </strong>
                  <span>
                    {s.device === "phone" ? "Phone" : "Desktop"} ·{" "}
                    {engagementDuration(s.active_ms)}
                  </span>
                </div>
                <time dateTime={s.started_at}>
                  {exact(s.started_at, timezone)}
                </time>
                <small>
                  {s.ended_at
                    ? `Ended ${exact(s.ended_at, timezone)}`
                    : `Last activity ${exact(s.last_at, timezone)}`}
                </small>
                {s.actions.length > 0 && (
                  <details>
                    <Disclosure>
                      Choices and downloads · {s.actions.length}
                    </Disclosure>
                    <ul>
                      {s.actions.map((a) => (
                        <li key={a.id}>
                          {a.kind === "download"
                            ? "Downloaded the PDF"
                            : `${a.name}: ${a.selected ? "selected" : "not selected"}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ol>
          <small>
            Detailed sessions are kept for 12 months. Lifetime totals stay with
            this record.
          </small>
        </>
      )}
    </section>
  );
}
export function useEngagementSummaries(key: string) {
  const [summaries, setSummaries] = useState<Record<string, EngagementSummary>>(
    {},
  );
  useEffect(() => {
    let active = true;
    api<Record<string, EngagementSummary>>("/api/engagement")
      .then((v) => {
        if (active) setSummaries(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  return summaries;
}
export function EngagementListLine({
  summary,
}: {
  summary?: EngagementSummary;
}) {
  return summary?.views && summary.last_viewed_at ? (
    <small className="proposal-engagement-line">
      Viewed {summary.views}× · last {engagementAgo(summary.last_viewed_at)}
    </small>
  ) : null;
}
