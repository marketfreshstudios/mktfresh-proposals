"use client";
import { useEffect, useState } from "react";
import {
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
  wide = false,
  clientName = "The client",
  sentAt,
}: {
  id: string;
  timezone: string;
  notify?: boolean;
  knownRecipient?: boolean;
  phone?: boolean;
  /** Beside the Timeline before signing: tiles in one row, charts side by side. */
  wide?: boolean;
  clientName?: string;
  sentAt?: string | null;
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
      const raw = await api<Report>(`/api/proposals/${id}/engagement`);
      // Older responses (and test mocks) can omit the lists.
      const result: Report = {
        ...raw,
        targets: Array.isArray(raw?.targets) ? raw.targets : [],
        sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
      };
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
    if (!sessions.length) return null;
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
    ? [
        `${engagementDuration(report.total_ms)} reading`,
        withCount(report.views, "view"),
        report.last_viewed_at &&
          `last viewed ${engagementAgo(report.last_viewed_at)}`,
      ]
        .filter(Boolean)
        .join(" | ")
    : report
      ? "Not opened yet"
      : undefined;
  const stat = (
    label: string,
    value: string | number,
    Icon: typeof Eye,
    title?: string,
  ) => (
    <div>
      <dt title={title} data-icon={Icon.displayName}>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
  const when = (value: string) =>
    date(value, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).replace(", ", " at ");
  const sections = report ? readTargets() : [];
  const read = sections.filter((t) => t.ms > 0);
  const unread = sections.length - read.length;
  const sectionWord = report?.targets.some((t) => t.kind === "section")
    ? "section"
    : "page";
  const tiles = (zero = false) => (
    <dl className="engagement-stats" data-zero={zero || undefined}>
      {stat("Views", zero ? 0 : report!.views, Eye)}
      {stat(
        "Devices",
        zero ? 0 : report!.unique_viewers,
        MonitorSmartphone,
        "Separate browsers that opened this link, not verified people",
      )}
      {stat("Downloads", zero ? 0 : report!.downloads, Download)}
      {stat("Questions", zero ? 0 : report!.questions, MessageCircleQuestion)}
    </dl>
  );
  const single = report?.sessions.length === 1 ? report.sessions[0] : null;
  const panel = (
    <div
      className={phone ? "engagement-panel" : "card engagement-panel"}
      data-wide={wide || undefined}
    >
      {error && <p role="alert">{error}</p>}
      {!report ? (
        error ? (
          <Button className="engagement-refresh" onClick={load}>
            Try again
          </Button>
        ) : (
          <p role="status">Loading engagement…</p>
        )
      ) : !report.views ? (
        <div className="engagement-empty">
          <p className="engagement-eyebrow">
            {report.first_viewed_at
              ? "No tracked visits yet"
              : "Not opened yet"}
          </p>
          <h3>
            {report.first_viewed_at
              ? `${clientName} opened it, but no reading time was recorded`
              : `${clientName} hasn’t opened it yet`}
          </h3>
          <p className="muted">
            {sentAt ? `Sent ${when(sentAt)}. ` : ""}Visits, reading time and the
            sections read show here once the link is opened.
          </p>
          {tiles(!report.downloads && !report.questions)}
        </div>
      ) : (
        <>
          <div className="engagement-top">
            <div className="engagement-headline">
              <div>
                <span className="engagement-eyebrow">Time reading</span>
                <strong>{engagementDuration(report.total_ms)}</strong>
              </div>
              <p className="engagement-last" data-live={live || undefined}>
                {live ? (
                  <>
                    <span className="engagement-live-dot" aria-hidden="true" />
                    Reading now
                  </>
                ) : single ? (
                  `Opened once, on ${single.device === "phone" ? "a phone" : "a computer"}`
                ) : report.last_viewed_at ? (
                  <>
                    Last viewed{" "}
                    <time
                      dateTime={report.last_viewed_at}
                      title={exact(report.last_viewed_at)}
                    >
                      {engagementAgo(report.last_viewed_at)}
                    </time>
                  </>
                ) : null}
              </p>
            </div>
            {tiles()}
          </div>
          <div className="engagement-charts">
            {visits()}
            {read.length > 0 && (
              <section className="engagement-most-read" aria-label="Most read">
                <p className="engagement-eyebrow">Most read</p>
                {bars(read.slice(0, 3))}
                {unread > 0 && (
                  <p className="engagement-unread">
                    {unread === 1
                      ? `The other ${sectionWord} hasn’t been read yet.`
                      : `The other ${unread} ${sectionWord}s haven’t been read yet.`}
                  </p>
                )}
              </section>
            )}
          </div>
          <details className="engagement-more">
            <Disclosure>All {sectionWord}s and sessions</Disclosure>
            {sections.length > 0 && bars(sections)}
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
