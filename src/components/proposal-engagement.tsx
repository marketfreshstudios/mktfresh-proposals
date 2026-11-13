"use client";
import { useEffect, useState } from "react";
import {
  Clock3,
  Download,
  Eye,
  MessageCircleQuestion,
  MonitorSmartphone,
} from "lucide-react";
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
  const readTargets = () => {
    const kind = report!.targets.some((t) => t.kind === "section")
      ? "section"
      : "page";
    return report!.targets
      .filter((t) => t.kind === kind)
      .toSorted((a, b) => b.ms - a.ms);
  };
  const bars = (targets: Report["targets"]) => {
    const maximum = Math.max(1, ...targets.map((t) => t.ms));
    return (
      <ul className="engagement-sections">
        {targets.map((t) => (
          <li
            key={t.key}
            title={`${t.label}: ${engagementDuration(t.ms)}, ${t.percent}% reached`}
          >
            <div>
              <strong>{t.label}</strong>
              <span>{engagementDuration(t.ms)}</span>
            </div>
            <span
              className="engagement-bar"
              role="img"
              aria-label={`${engagementDuration(t.ms)} on ${t.label}, ${t.percent}% reached`}
            >
              <span style={{ inlineSize: `${(t.ms / maximum) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    );
  };
  /** One bar per visit, oldest first, height = time spent. */
  const visits = () => {
    const sessions = report!.sessions
      .toSorted((a, b) => a.started_at.localeCompare(b.started_at))
      .slice(-24);
    const maximum = Math.max(1, ...sessions.map((s) => s.active_ms));
    if (sessions.length < 2) return null;
    const when = (value: string) =>
      date(value, { month: "short", day: "numeric" });
    return (
      <figure className="engagement-visits">
        <figcaption>Visits</figcaption>
        <ol aria-label="Time spent on each visit, oldest first">
          {sessions.map((s) => {
            const label = `${date(s.started_at, { dateStyle: "medium", timeStyle: "short" })}: ${engagementDuration(s.active_ms)} on ${s.device === "phone" ? "a phone" : "a computer"}`;
            return (
              <li key={s.id} title={label} aria-label={label}>
                <span
                  style={{
                    blockSize: `${Math.max(8, (s.active_ms / maximum) * 100)}%`,
                  }}
                />
              </li>
            );
          })}
        </ol>
        <div className="engagement-visits-axis" aria-hidden="true">
          <span>{when(sessions[0].started_at)}</span>
          {when(sessions[0].started_at) !==
            when(sessions.at(-1)!.started_at) && (
            <span>{when(sessions.at(-1)!.started_at)}</span>
          )}
        </div>
      </figure>
    );
  };
  const live =
    !!report?.last_viewed_at &&
    Date.now() - Date.parse(report.last_viewed_at) < 2 * 60_000;
  const summary = report?.views
    ? `${withCount(report.views, "visit")} | ${engagementDuration(report.total_ms)} reading`
    : report
      ? "No visits"
      : undefined;
  const stat = (
    label: string,
    value: string | number,
    Icon: typeof Eye,
    title?: string,
  ) => (
    <div>
      <dt title={title}>
        <Icon size={14} aria-hidden="true" />
        {label}
      </dt>
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
              {report.questions > 0 &&
                stat("Questions", report.questions, MessageCircleQuestion)}
              {report.downloads > 0 &&
                stat("Downloads", report.downloads, Download)}
            </dl>
          )}
          {refresh}
        </div>
      ) : (
        <>
          <div className="engagement-headline">
            <div>
              <span className="engagement-eyebrow">
                <Clock3 size={14} aria-hidden="true" />
                Time reading
              </span>
              <strong>{engagementDuration(report.total_ms)}</strong>
            </div>
            {report.last_viewed_at && (
              <p className="engagement-last" data-live={live || undefined}>
                {live ? (
                  <>
                    <span className="engagement-live-dot" aria-hidden="true" />
                    Reading now
                  </>
                ) : (
                  <>
                    Last viewed{" "}
                    <time
                      dateTime={report.last_viewed_at}
                      title={exact(report.last_viewed_at)}
                    >
                      {engagementAgo(report.last_viewed_at)}
                    </time>
                  </>
                )}
              </p>
            )}
          </div>
          <dl className="engagement-stats">
            {stat("Views", report.views, Eye)}
            {stat(
              "Devices",
              report.unique_viewers,
              MonitorSmartphone,
              "Separate browsers that opened this link, not verified people",
            )}
            {stat("Downloads", report.downloads, Download)}
            {report.questions > 0 &&
              stat("Questions", report.questions, MessageCircleQuestion)}
          </dl>
          {visits()}
          {readTargets().length > 0 && (
            <section className="engagement-most-read" aria-label="Most read">
              <p className="engagement-eyebrow">Most read</p>
              {bars(readTargets().slice(0, 3))}
              {readTargets().length > 3 && (
                <details className="engagement-more">
                  <Disclosure>{`All ${report.targets.some((t) => t.kind === "section") ? "sections" : "pages"} | ${readTargets().length}`}</Disclosure>
                  {bars(readTargets().slice(3))}
                </details>
              )}
            </section>
          )}
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
