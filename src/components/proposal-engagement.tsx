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
  const stat = (label: string, value: string | number, title?: string) => (
    <div>
      <dt title={title}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const refresh = (
    <Button className="engagement-refresh" onClick={load}>
      Refresh
    </Button>
  );
  const panel = (
    <div className={phone ? "engagement-panel" : "card engagement-panel"}>
      {error && <p role="alert">{error}</p>}
      {!report ? (
        error ? (
          refresh
        ) : (
          <p role="status">Loading engagement…</p>
        )
      ) : !report.views ? (
        <div className="engagement-empty">
          <h3>
            {report.first_viewed_at
              ? "No tracked visits yet"
              : "Not opened yet"}
          </h3>
          {(report.downloads > 0 || report.questions > 0) && (
            <dl className="engagement-stats">
              {report.questions > 0 && stat("Questions", report.questions)}
              {report.downloads > 0 && stat("PDF downloads", report.downloads)}
            </dl>
          )}
          {refresh}
        </div>
      ) : (
        <>
          <dl className="engagement-stats">
            {stat("Views", report.views)}
            {stat(
              "Devices",
              report.unique_viewers,
              "Separate browsers that opened this link — not verified people",
            )}
            {stat("Total time", engagementDuration(report.total_ms))}
            {stat("PDF downloads", report.downloads)}
            {report.questions > 0 && stat("Questions", report.questions)}
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
            </p>
          )}
          <details className="engagement-more">
            <Disclosure>Most read</Disclosure>
            {bars(
              report.targets.some((t) => t.kind === "section")
                ? "section"
                : "page",
            )}
          </details>
          <details className="engagement-more">
            <Disclosure>{`Sessions | ${report.sessions.length}`}</Disclosure>
            <ol className="engagement-sessions">
              {report.sessions.map((s) => (
                <li key={s.id}>
                  <strong>
                    {s.recipient ?? "Unknown viewer"} |{" "}
                    {s.device === "phone" ? "Phone" : "Desktop"}
                  </strong>
                  <span>{engagementDuration(s.active_ms)}</span>
                  <time dateTime={s.started_at} title={exact(s.started_at)}>
                    {date(s.started_at, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          </details>
          {refresh}
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
      <StaffSectionHeading id="engagement-heading">
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
      Viewed {summary.views}× | last {engagementAgo(summary.last_viewed_at)}
    </small>
  ) : null;
}
