"use client";
import { useEffect, useState } from "react";
import { api, Button, Disclosure } from "./ui";
import { StaffSectionHeading } from "./staff-section-heading";
import { RecordDisclosure } from "./record-disclosure";
import { withCount } from "../lib/count-label";
import { useStaffDates } from "./staff-account-context";
import type { engagementReport } from "../lib/engagement-server";
import {
  engagementAgo,
  engagementDuration,
  type EngagementSummary,
} from "../lib/engagement";

type Report = Awaited<ReturnType<typeof engagementReport>>;
export function ProposalEngagement({
  id,
  timezone,
  notify = true,
  knownRecipient = false,
  onLoaded,
  phone = false,
}: {
  id: string;
  timezone: string;
  notify?: boolean;
  knownRecipient?: boolean;
  phone?: boolean;
  onLoaded?: (summary: Pick<Report, "views" | "last_viewed_at"> | null) => void;
}) {
  const { date } = useStaffDates(timezone);
  const exact = (value: string) =>
    date(value, { dateStyle: "medium", timeStyle: "long" });
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const result = await api<Report>(`/api/proposals/${id}/engagement`);
      setReport(result);
      onLoaded?.(result);
    } catch {
      setError("Couldn’t load engagement. Try again.");
    }
  };
  useEffect(() => {
    setReport(null);
    onLoaded?.(null);
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
                {engagementDuration(t.ms)} | {t.percent}% reached
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
  const summary = report?.views
    ? `${withCount(report.views, "visit")} | ${engagementDuration(report.total_ms)} reading`
    : report
      ? "No visits"
      : undefined;
  const panel = (
    <div className={phone ? "engagement-panel" : "card engagement-panel"}>
      {error && <p role="alert">{error}</p>}
      {!report ? (
        error ? (
          <Button onClick={load}>Refresh</Button>
        ) : (
          <p role="status">Loading engagement…</p>
        )
      ) : !report.views && !report.downloads && !report.questions ? (
        <div className="engagement-empty">
          <h3>
            {report.first_viewed_at
              ? "No tracked sessions yet"
              : "Not opened yet"}
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
          <Button onClick={load}>Refresh</Button>
        </div>
      ) : (
        <>
          <h3 className="record-most-read">Most read</h3>
          {bars("section")}
          <details className="record-engagement-details">
            <Disclosure>Engagement details</Disclosure>
            <Button onClick={load}>Refresh</Button>
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
                <dt title="Distinct known recipient links opened">
                  Recipients
                </dt>
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
              {!!report.questions && (
                <div>
                  <dt>Questions asked</dt>
                  <dd>{report.questions}</dd>
                </div>
              )}
            </dl>
            {report.last_viewed_at && (
              <p className="engagement-last">
                Last viewed{" "}
                <time
                  dateTime={report.last_viewed_at}
                  title={exact(report.last_viewed_at)}
                >
                  {engagementAgo(report.last_viewed_at)}
                </time>
                <small>{exact(report.last_viewed_at)}</small>
              </p>
            )}
            <details>
              <Disclosure>Time by page</Disclosure>
              <p className="engagement-help muted">
                Page timing comes from desktop sheets. Phone and tablet visits
                are timed by section.
              </p>
              {bars("page")}
            </details>
            <h3>View sessions</h3>
            <p className="muted engagement-help">
              Recipient names identify the link used; a forwarded link doesn’t
              verify who read it. Time counts only while visible and focused,
              with a 60-second idle limit.
            </p>
            <ol className="engagement-sessions">
              {report.sessions.map((s) => (
                <li key={s.id}>
                  <div>
                    <strong>
                      {s.recipient
                        ? `${s.recipient} | recipient link`
                        : "Unknown viewer"}
                    </strong>
                    <span>
                      {s.device === "phone" ? "Phone" : "Desktop"} |{" "}
                      {engagementDuration(s.active_ms)}
                    </span>
                  </div>
                  <time dateTime={s.started_at}>{exact(s.started_at)}</time>
                  <small>
                    {s.ended_at
                      ? `Ended ${exact(s.ended_at)}`
                      : `Last activity ${exact(s.last_at)}`}
                  </small>
                  {s.actions.length > 0 && (
                    <details>
                      <Disclosure>
                        Choices and downloads | {s.actions.length}
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
              Detailed sessions are kept for 12 months. Lifetime totals stay
              with this record.
            </small>
          </details>
        </>
      )}
    </div>
  );
  if (phone)
    return (
      <section className="record-section" aria-label="Engagement">
        <RecordDisclosure title="Engagement" summary={summary}>
          {panel}
        </RecordDisclosure>
      </section>
    );
  return (
    <section className="record-section" aria-labelledby="engagement-heading">
      <StaffSectionHeading
        id="engagement-heading"
        action={
          report?.views ? (
            <span className="record-engagement-summary">
              {withCount(report.views, "visit")} |{" "}
              {engagementDuration(report.total_ms)} reading
            </span>
          ) : undefined
        }
      >
        Engagement
      </StaffSectionHeading>
      {panel}
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
