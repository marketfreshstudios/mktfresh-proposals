"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  reportFiltersSchema,
  reportParams,
  reportRanges,
  type ReportDrill,
  type ReportFilters,
  type ReportInterval,
  type ReportSort,
} from "../lib/report-filters";
import {
  sortBreakdown,
  type Report,
  type ReportBreakdown,
  type ReportValue,
} from "../lib/report-metrics";
import type { StaffQuery } from "../lib/staff-routes";
import { Select } from "./form-controls";
import { Skeleton } from "./foundation";
import { api, Banner, Button, Empty, Icon } from "./ui";
import { useMoney } from "./money-context";

const defaultSort: ReportSort = { key: "sent", direction: "desc" };
const filterLabels = {
  owner: "Owner (sender)",
  template: "Template",
  client: "Client",
};
const formula =
  "Win rate = signed ÷ (signed + declined + expired), among proposals sent in this range.";
const number = new Intl.NumberFormat("en-US");
const proposalCount = (value: number) =>
  `${number.format(value)} ${value === 1 ? "proposal" : "proposals"}`;
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const monthLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const dateLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dateOf = (day: string) => new Date(day + "T00:00:00Z");
function duration(ms: number | null) {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return ms < 1000 ? "<1 sec" : `${Math.round(ms / 1000)} sec`;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  if (hours < 24) return `${hours} hr${rest ? ` ${rest} min` : ""}`;
  const days = Math.floor(hours / 24),
    remainder = hours % 24;
  return `${days} ${days === 1 ? "day" : "days"}${remainder ? ` ${remainder} hr` : ""}`;
}

type LinkTo = (
  metric: ReportDrill,
  children: ReactNode,
  label?: string,
  filters?: Partial<ReportFilters>,
) => ReactNode;

export function ReportsPage({ query }: { query: StaffQuery }) {
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const result = reportFiltersSchema.safeParse(query);
    return result.success ? result.data : { range: "month" };
  });
  const [pending, setPending] = useState(filters);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState("");
  const [retry, setRetry] = useState(0);
  const [table, setTable] = useState(false);
  const [templateSort, setTemplateSort] = useState(defaultSort);
  const [ownerSort, setOwnerSort] = useState(defaultSort);
  const queryString = reportParams(filters).toString();
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    api<Report>("/api/reports?" + queryString, { signal: request.signal })
      .then((data) => {
        if (!request.signal.aborted) setReport(data);
      })
      .catch((err: Error) => {
        if (!request.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [queryString, retry]);

  function apply(next: ReportFilters) {
    const result = reportFiltersSchema.safeParse(next);
    if (!result.success) {
      setInvalid("Choose a valid start and end date under 100 years.");
      return;
    }
    setInvalid("");
    setFilters(result.data);
    setPending(result.data);
    history.replaceState(null, "", "/reports?" + reportParams(result.data));
  }
  function field<K extends keyof ReportFilters>(
    name: K,
    value: ReportFilters[K],
  ) {
    setPending((prev) => ({ ...prev, [name]: value }));
    setInvalid("");
  }

  const exact = report
    ? {
        ...filters,
        range: "custom" as const,
        from: report.range.from,
        to: report.range.to,
      }
    : filters;
  const link: LinkTo = (metric, children, label, extra) => (
    <a
      className="report-number"
      href={"/proposals?" + reportParams({ ...exact, ...extra }, metric)}
      aria-label={
        label && typeof children === "string" && !label.includes(children)
          ? `${children} · ${label}`
          : label
      }
    >
      {children}
    </a>
  );
  const csv = reportParams(exact);
  for (const [kind, sorting] of [
    ["template", templateSort],
    ["owner", ownerSort],
  ] as const) {
    csv.set(kind + "_sort", sorting.key);
    csv.set(kind + "_direction", sorting.direction);
  }
  const summary = report
    ? `${dateLabel.format(dateOf(report.range.from))} – ${dateLabel.format(dateOf(report.range.to))} · ${report.range.timezone}`
    : "";
  return (
    <div className="reports stack">
      <form
        className="card report-filter"
        aria-label="Report filters"
        onSubmit={(event) => {
          event.preventDefault();
          apply(pending);
        }}
      >
        <div className="report-filter-fields">
          <label className="ui-small-strong">
            Date range
            <Select
              aria-label="Date range"
              value={pending.range}
              onChange={(e) => {
                const range = e.target.value as ReportFilters["range"];
                const next = {
                  ...pending,
                  range,
                  from: undefined,
                  to: undefined,
                };
                setPending(
                  range === "custom"
                    ? {
                        ...next,
                        from: report?.range.from,
                        to: report?.range.to,
                      }
                    : next,
                );
                setInvalid("");
              }}
            >
              {reportRanges.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </Select>
          </label>
          {(["owner", "template", "client"] as const).map((key) => (
            <label className="ui-small-strong" key={key}>
              {filterLabels[key]}
              <Select
                aria-label={filterLabels[key]}
                value={pending[key] ?? ""}
                onChange={(e) => field(key, e.target.value || undefined)}
              >
                <option value="">
                  {key === "owner"
                    ? "All senders"
                    : key === "template"
                      ? "All templates"
                      : "All clients"}
                </option>
                {report?.dimensions[key].map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </label>
          ))}
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
        </div>
        {pending.range === "custom" && (
          <div className="report-custom-dates">
            <label className="ui-small-strong">
              Start date
              <input
                type="date"
                required
                value={pending.from ?? ""}
                onChange={(e) => field("from", e.target.value)}
              />
            </label>
            <label className="ui-small-strong">
              End date
              <input
                type="date"
                required
                value={pending.to ?? ""}
                onChange={(e) => field("to", e.target.value)}
              />
            </label>
          </div>
        )}
        {invalid && <p role="alert">{invalid}</p>}
        {summary && <small className="report-date-summary">{summary}</small>}
      </form>
      {error && (
        <Banner
          title="Unable to load Reports"
          tone="danger"
          action={<Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
        >
          {error}
        </Banner>
      )}
      {loading ? (
        <Skeleton />
      ) : (
        report &&
        !error && (
          <>
            {!report.workspaceHasProposals ? (
              <section className="card report-empty">
                <Empty
                  title="No proposal activity yet"
                  action={
                    <a className="btn" href="/proposals?new=1">
                      New proposal
                    </a>
                  }
                >
                  Send your first proposal to see views, signatures, and signed
                  value here.
                </Empty>
              </section>
            ) : (
              <>
                {!report.sent && (
                  <Banner title="No proposals were sent in this date range">
                    Try a longer date range or different filters. The trend can
                    still include signatures from earlier sends.
                  </Banner>
                )}
                <section aria-labelledby="report-overview">
                  <h2 className="sr-only" id="report-overview">
                    Overview
                  </h2>
                  <div className="report-cards">
                    <Metric
                      title="Proposals sent"
                      value={link(
                        { report: "sent" },
                        number.format(report.sent),
                        `${proposalCount(report.sent)} sent`,
                      )}
                    />
                    <Metric
                      title="Viewed"
                      value={link(
                        { report: "viewed" },
                        number.format(report.viewed),
                        `${number.format(report.viewed)} viewed ${report.viewed === 1 ? "proposal" : "proposals"}`,
                      )}
                    >
                      {report.viewedRate !== null
                        ? link(
                            { report: "viewed" },
                            percent.format(report.viewedRate) + " of sent",
                          )
                        : "No sends in range"}
                    </Metric>
                    <Metric
                      title="Signed"
                      value={link(
                        { report: "signed" },
                        number.format(report.signed),
                        `${number.format(report.signed)} signed ${report.signed === 1 ? "proposal" : "proposals"}`,
                      )}
                    >
                      <span className="report-tooltip">
                        <a
                          className="report-number"
                          href={
                            "/proposals?" +
                            reportParams(exact, { report: "outcomes" })
                          }
                          aria-describedby="report-win-rate-formula"
                        >
                          {report.winRate === null
                            ? "—"
                            : percent.format(report.winRate)}{" "}
                          win rate
                        </a>
                        <span role="tooltip" id="report-win-rate-formula">
                          {formula}
                        </span>
                      </span>
                    </Metric>
                    <Metric
                      title="Median time to first view"
                      value={link(
                        { report: "first-view-time" },
                        duration(report.medianView),
                        "Proposals with a recorded time to first view",
                      )}
                    />
                    <Metric
                      title="Median time to sign"
                      value={link(
                        { report: "sign-time" },
                        duration(report.medianSign),
                        "Proposals with a recorded time to sign",
                      )}
                    />
                    <Metric
                      title="Open now"
                      value={link(
                        { report: "open" },
                        number.format(report.open),
                        `${proposalCount(report.open)} open now`,
                      )}
                    >
                      Sent or viewed, not expired
                    </Metric>
                  </div>
                </section>
                <section
                  className="card report-panel"
                  aria-labelledby="report-value"
                >
                  <h2 id="report-value">Value signed</h2>
                  <p className="muted">
                    Accepted totals from signed versions. Amounts stay separate
                    by currency and billing period.
                  </p>
                  {report.values.length ? (
                    <div className="report-value-rows">
                      {report.values.map((value) => (
                        <div className="report-value-row" key={value.currency}>
                          <strong>{value.currency}</strong>
                          <div>
                            <small>One-time</small>
                            <Values
                              values={[value]}
                              intervals={["one_time"]}
                              link={link}
                            />
                          </div>
                          <div>
                            <small>Monthly</small>
                            <Values
                              values={[value]}
                              intervals={["monthly"]}
                              link={link}
                            />
                          </div>
                          {(value.yearly ?? 0) !== 0 && (
                            <div>
                              <small>Yearly</small>
                              <Values
                                values={[value]}
                                intervals={["yearly"]}
                                link={link}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">No signed value in this range.</p>
                  )}
                  {!!report.missingValue && (
                    <small className="report-data-note">
                      Totals are unavailable for some signed records. Only
                      recorded amounts are included.
                    </small>
                  )}
                </section>
                <section
                  className="card report-panel"
                  aria-labelledby="report-pipeline"
                >
                  <h2 id="report-pipeline">Pipeline by status</h2>
                  <p className="muted">
                    Current stage of proposals sent in this range. Drafts use
                    their creation date.
                  </p>
                  <ul className="report-pipeline">
                    {report.pipeline.map(({ id, label, count }) => (
                      <li key={id}>
                        <span>{label}</span>
                        {link(
                          { report: "stage", stage: id },
                          number.format(count),
                          `${label}: ${proposalCount(count)}`,
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
                <section
                  className="card report-panel"
                  aria-labelledby="report-trend"
                >
                  <div className="report-panel-heading">
                    <div>
                      <h2 id="report-trend">Sent and signed over time</h2>
                      <p className="muted">
                        Sends use the send date. Signatures use the client
                        signature date.
                      </p>
                    </div>
                    <Button
                      aria-pressed={table}
                      onClick={() => setTable(!table)}
                    >
                      {table ? "Show chart" : "Show data table"}
                    </Button>
                  </div>
                  <Trend report={report} table={table} link={link} />
                </section>
                <section
                  className="report-breakdowns"
                  aria-labelledby="report-breakdowns"
                >
                  <div className="report-panel-heading">
                    <div>
                      <h2 id="report-breakdowns">Breakdowns</h2>
                      <p className="muted">
                        Results for proposals sent in the selected date range.
                      </p>
                    </div>
                    <a
                      className="btn"
                      href={"/api/reports/export?" + csv}
                      download
                    >
                      <Icon name="download" /> Export CSV
                    </a>
                  </div>
                  <Breakdown
                    title="By template"
                    group="template"
                    rows={report.byTemplate}
                    sort={templateSort}
                    setSort={setTemplateSort}
                    link={link}
                  />
                  <Breakdown
                    title="By owner"
                    group="owner"
                    rows={report.byOwner}
                    sort={ownerSort}
                    setSort={setOwnerSort}
                    link={link}
                  />
                </section>
                <div className="report-engagement">
                  <section
                    className="card report-panel"
                    aria-labelledby="report-sections"
                  >
                    <h2 id="report-sections">Top engagement</h2>
                    <p className="muted">
                      Time spent on sections across viewed proposals.
                    </p>
                    {report.sections.length ? (
                      <ol className="report-sections">
                        {report.sections.map((s) => (
                          <li key={s.label}>
                            <span>{s.label}</span>
                            {link(
                              { report: "section", section: s.label },
                              duration(s.ms),
                              `${s.label}: ${duration(s.ms)} across ${proposalCount(s.proposals)}`,
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="empty-copy">
                        No section time recorded yet.
                      </p>
                    )}
                  </section>
                  <section
                    className="card report-panel"
                    aria-labelledby="report-questions"
                  >
                    <h2 id="report-questions">Client questions</h2>
                    <dl className="report-questions">
                      <div>
                        <dt>Asked</dt>
                        <dd>
                          {link(
                            { report: "questions" },
                            number.format(report.questions.total),
                            "Proposals with client questions",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Open</dt>
                        <dd>
                          {link(
                            { report: "questions-open" },
                            number.format(report.questions.open),
                            "Proposals with open questions",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Answered</dt>
                        <dd>
                          {link(
                            { report: "questions-answered" },
                            number.format(report.questions.answered),
                            "Proposals with answered questions",
                          )}
                        </dd>
                      </div>
                      {!!report.questions.closedWithoutReply && (
                        <div>
                          <dt>Resolved without reply</dt>
                          <dd>
                            {link(
                              { report: "questions-closed" },
                              number.format(
                                report.questions.closedWithoutReply,
                              ),
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </section>
                </div>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  children,
}: {
  title: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card report-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      {children && <small>{children}</small>}
    </div>
  );
}
function Values({
  values,
  intervals,
  link,
  filters,
}: {
  values: ReportValue[];
  intervals: ReportInterval[];
  link: LinkTo;
  filters?: Partial<ReportFilters>;
}) {
  const money = useMoney();
  const entries = values.flatMap((v) =>
    intervals.flatMap((key) =>
      v[key] === null || (key === "yearly" && v[key] === 0) ? [] : [{ v, key }],
    ),
  );
  if (!entries.length) return <span className="muted">—</span>;
  return (
    <span className="report-value-links">
      {entries.map(({ v, key }) => (
        <span key={v.currency + key}>
          {link(
            { report: "value", currency: v.currency, interval: key },
            money(v[key]!, v.currency) +
              (key === "monthly" ? "/mo" : key === "yearly" ? "/yr" : ""),
            undefined,
            filters,
          )}
        </span>
      ))}
    </span>
  );
}

function Trend({
  report,
  table,
  link,
}: {
  report: Report;
  table: boolean;
  link: LinkTo;
}) {
  const max = Math.max(1, ...report.trend.flatMap((r) => [r.sent, r.signed]));
  const signed = report.trend.reduce((sum, r) => sum + r.signed, 0);
  const summary = `${report.sent} sent and ${signed} client signatures across ${report.trend.length} ${report.trend.length === 1 ? "month" : "months"}.`;
  const cell = (month: string, kind: "sent" | "signed", count: number) =>
    link(
      { report: kind === "sent" ? "trend-sent" : "trend-signed", month },
      number.format(count),
      `${monthLabel.format(dateOf(month + "-01"))}: ${count} ${kind}`,
    );
  if (table)
    return (
      <table className="report-table report-trend-table">
        <caption className="sr-only">
          Monthly proposals sent and signed. {summary}
        </caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Sent</th>
            <th scope="col">Signed</th>
          </tr>
        </thead>
        <tbody>
          {report.trend.map(({ month, sent, signed }) => (
            <tr key={month}>
              <th scope="row">{monthLabel.format(dateOf(month + "-01"))}</th>
              <td>{cell(month, "sent", sent)}</td>
              <td>{cell(month, "signed", signed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return (
    <figure className="report-chart" aria-labelledby="report-chart-caption">
      <figcaption id="report-chart-caption" className="sr-only">
        {summary} Each month lists sent followed by signed. Use Show data table
        for a tabular view.
      </figcaption>
      <ul className="report-legend" aria-hidden="true">
        <li>Sent</li>
        <li>Signed</li>
      </ul>
      <ol className="report-chart-months">
        {report.trend.map(({ month, sent, signed }) => (
          <li key={month}>
            <strong>{monthLabel.format(dateOf(month + "-01"))}</strong>
            <div>
              {(
                [
                  ["sent", sent],
                  ["signed", signed],
                ] as const
              ).map(([kind, count]) => (
                <div className={"report-bar-row " + kind} key={kind}>
                  <span className="report-bar" aria-hidden="true">
                    <i style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  {cell(month, kind, count)}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const columns: [ReportSort["key"], string][] = [
  ["name", "Name"],
  ["sent", "Sent"],
  ["signed", "Signed"],
  ["winRate", "Win rate"],
  ["medianSign", "Median time to sign"],
  ["one_time", "One-time value"],
  ["recurring", "Recurring value"],
];
function Breakdown({
  title,
  group,
  rows,
  sort,
  setSort,
  link,
}: {
  title: string;
  group: "template" | "owner";
  rows: ReportBreakdown[];
  sort: ReportSort;
  setSort: (sort: ReportSort) => void;
  link: LinkTo;
}) {
  return (
    <section
      className="card report-panel"
      aria-labelledby={`report-by-${group}`}
    >
      <h3 id={`report-by-${group}`}>{title}</h3>
      {!rows.length ? (
        <p className="empty-copy">No sends to compare.</p>
      ) : (
        <div
          className="report-table-scroll"
          role="region"
          aria-label={title + " table"}
          tabIndex={0}
        >
          <table className="report-table">
            <caption className="sr-only">
              {title} · Select a column header to sort.
            </caption>
            <thead>
              <tr>
                {columns.map(([key, name]) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort.key === key
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    <button
                      className="btn ghost report-sort"
                      onClick={() =>
                        setSort({
                          key,
                          direction:
                            sort.key === key && sort.direction === "desc"
                              ? "asc"
                              : key === "name" && sort.key !== key
                                ? "asc"
                                : "desc",
                        })
                      }
                    >
                      {key === "name"
                        ? group === "template"
                          ? "Template"
                          : "Owner"
                        : name}
                      {sort.key === key && (
                        <span aria-hidden="true">
                          {sort.direction === "asc" ? " ↑" : " ↓"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortBreakdown(rows, sort).map((row) => {
                const filter = { [group]: row.id };
                return (
                  <tr key={row.id}>
                    <th scope="row">
                      {link({ report: "sent" }, row.name, undefined, filter)}
                    </th>
                    <td>
                      {link(
                        { report: "sent" },
                        number.format(row.sent),
                        `${row.name}: ${row.sent} sent`,
                        filter,
                      )}
                    </td>
                    <td>
                      {link(
                        { report: "signed" },
                        number.format(row.signed),
                        `${row.name}: ${row.signed} signed`,
                        filter,
                      )}
                    </td>
                    <td>
                      {link(
                        { report: "outcomes" },
                        row.winRate === null
                          ? "—"
                          : percent.format(row.winRate),
                        undefined,
                        filter,
                      )}
                    </td>
                    <td>
                      {link(
                        { report: "sign-time" },
                        duration(row.medianSign),
                        undefined,
                        filter,
                      )}
                    </td>
                    <td>
                      <Values
                        values={row.values}
                        intervals={["one_time"]}
                        link={link}
                        filters={filter}
                      />
                    </td>
                    <td>
                      <Values
                        values={row.values}
                        intervals={["monthly", "yearly"]}
                        link={link}
                        filters={filter}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
