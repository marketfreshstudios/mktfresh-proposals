"use client";

import { withCount } from "../lib/count-label";
import { StaffNativeTable } from "./staff-table";
import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Sheet } from "./foundation";
import { Select } from "./form-controls";
import { api, Button } from "./ui";
import { chromeIcons } from "./staff-icons";
import { useMoney } from "./money-context";
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

const count = new Intl.NumberFormat("en-US");
const rate = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const day = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const year = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
});
const month = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
});
const fullMonth = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});
const dateOf = (value: string) => new Date(value + "T00:00:00Z");
const defaultSort: ReportSort = { key: "sent", direction: "desc" };
const dimensions = {
  owner: "Owner",
  template: "Template",
  client: "Client",
} as const;
const periods = {
  one_time: "One-time",
  monthly: "Monthly",
  yearly: "Yearly",
} as const;
const signSuffix = { one_time: "", monthly: "/mo", yearly: "/yr" } as const;
type Link = (metric: ReportDrill, extra?: Partial<ReportFilters>) => string;

function duration(ms: number | null | undefined, seconds = false) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (seconds && s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 60) return s ? `${s} sec` : "<1 sec";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${countFraction(s / 3600)} hr`;
  return `${countFraction(s / 86400)} ${s === 86400 ? "day" : "days"}`;
}
function countFraction(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
function dateCaption(range: Report["range"]) {
  const from = dateOf(range.from),
    to = dateOf(range.to);
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const first = day.format(from) + (sameYear ? "" : `, ${year.format(from)}`);
  return `${first} – ${day.format(to)}, ${year.format(to)}`;
}
function arrowTabs(
  event: KeyboardEvent,
  selected: number,
  length: number,
  change: (index: number) => void,
) {
  const direction =
    event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? length - 1
        : (selected + direction + length) % length;
  change(next);
  event.currentTarget
    .querySelectorAll<HTMLButtonElement>("button")
    [next]?.focus();
}

export function ReportsPage({ query }: { query: StaffQuery }) {
  const [filters, setFilters] = useState<ReportFilters>(
    () => reportFiltersSchema.safeParse(query).data ?? { range: "month" },
  );
  const [result, setResult] = useState<{
    report: Report;
    filters: ReportFilters;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<ReportFilters | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [trendView, setTrendView] = useState<"chart" | "table">("chart");
  const [templateSort, setTemplateSort] = useState(defaultSort);
  const [ownerSort, setOwnerSort] = useState(defaultSort);
  const key = reportParams(filters).toString();
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError(false);
    api<Report>("/api/reports?" + key, { signal: request.signal })
      .then((report) => {
        if (!request.signal.aborted) setResult({ report, filters });
      })
      .catch(() => {
        if (!request.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [key, retry]);
  const report = result?.report;
  const empty = !!report && !report.workspaceHasProposals;
  const exact = result
    ? {
        ...result.filters,
        range: "custom" as const,
        from: result.report.range.from,
        to: result.report.range.to,
      }
    : filters;
  const link: Link = (metric, extra) =>
    "/proposals?" + reportParams({ ...exact, ...extra }, metric);
  const csv = reportParams(exact);
  for (const [kind, sort] of [
    ["template", templateSort],
    ["owner", ownerSort],
  ] as const) {
    csv.set(kind + "_sort", sort.key);
    csv.set(kind + "_direction", sort.direction);
  }
  function apply(next: ReportFilters) {
    const parsed = reportFiltersSchema.safeParse(next);
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEditing(null);
    setFilters(parsed.data);
    history.replaceState(null, "", "/reports?" + reportParams(parsed.data));
  }
  function openFilters(range = filters.range) {
    setInvalid(false);
    setEditing({
      ...filters,
      range,
      from: filters.from ?? report?.range.from,
      to: filters.to ?? report?.range.to,
    });
  }
  function changeRange(index: number) {
    const [range] = reportRanges[index];
    if (range === "custom") openFilters(range);
    else apply({ ...filters, range, from: undefined, to: undefined });
  }
  function rangeTabs(location: string) {
    const selected = reportRanges.findIndex(([key]) => key === filters.range);
    return (
      <div
        className={`report-ranges ${location}`}
        role="group"
        aria-label="Date range"
        onKeyDown={(event) =>
          arrowTabs(event, selected, reportRanges.length, changeRange)
        }
      >
        {reportRanges.map(([key, label], i) => (
          <button
            type="button"
            key={key}
            disabled={empty}
            aria-pressed={filters.range === key}
            onClick={() => changeRange(i)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  function fields(
    value: ReportFilters,
    onChange: (value: ReportFilters) => void,
    compact = false,
  ) {
    return (Object.keys(dimensions) as (keyof typeof dimensions)[]).map(
      (name) => {
        const options = report?.dimensions[name];
        const selectedName = options?.find(
          (option) => option.id === value[name],
        )?.name;
        return (
          <label
            key={name}
            className={compact ? "report-filter-pill" : undefined}
          >
            <span>{dimensions[name]}</span>
            {compact && (
              <>
                <strong aria-hidden="true">{selectedName ?? "All"}</strong>
                <ChevronDown size={14} aria-hidden="true" />
              </>
            )}
            <Select
              aria-label={dimensions[name]}
              disabled={empty}
              value={value[name] ?? ""}
              onChange={(event) =>
                onChange({ ...value, [name]: event.target.value || undefined })
              }
            >
              <option value="">All</option>
              {options?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </label>
        );
      },
    );
  }
  const scoped = [filters.owner, filters.template, filters.client].filter(
    Boolean,
  ).length;
  const proposalCount =
    report?.pipeline.reduce((sum, stage) => sum + stage.count, 0) ?? 0;

  return (
    <div className="reports">
      <header className="report-header">
        <div>
          <p className="t-eyebrow">
            {report
              ? `${dateCaption(report.range)} · ${count.format(proposalCount)} ${proposalCount === 1 ? "proposal" : "proposals"}`
              : reportRanges.find(([value]) => value === filters.range)?.[1]}
          </p>
          <h1 className="t-page-title">Reports</h1>
        </div>
        <div className="report-phone-ranges">{rangeTabs("phone-ranges")}</div>
      </header>
      <div
        className={`report-filterbar ${empty ? "empty-filters" : ""}`}
        aria-label="Report filters"
      >
        {rangeTabs("wide-ranges")}
        <div className="report-filter-fields">
          {fields(filters, apply, true)}
        </div>
        <Button
          className="report-filter-trigger"
          disabled={empty}
          onClick={() => openFilters()}
        >
          {scoped ? `Filters · ${scoped}` : "Filters"}
        </Button>
        <div className="report-export">
          {empty || !report ? (
            <Button disabled>Export CSV</Button>
          ) : (
            <a className="btn" download href={"/api/reports/export?" + csv}>
              Export CSV
            </a>
          )}
        </div>
      </div>
      {editing && (
        <Sheet
          title="Filters"
          className="report-filter-sheet"
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(editing);
            }}
          >
            {editing.range === "custom" && (
              <div className="report-custom-dates">
                <label>
                  Start date
                  <input
                    type="date"
                    required
                    value={editing.from ?? ""}
                    onChange={(event) =>
                      setEditing({ ...editing, from: event.target.value })
                    }
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    required
                    value={editing.to ?? ""}
                    onChange={(event) =>
                      setEditing({ ...editing, to: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
            <div className="report-sheet-fields">
              {fields(editing, setEditing)}
            </div>
            {invalid && (
              <p role="alert">
                Choose a valid start and end date under 100 years.
              </p>
            )}
            <Button type="submit">Apply filters</Button>
          </form>
        </Sheet>
      )}
      {error && (
        <div className="report-error" role="alert">
          <span>
            Couldn't load reports.{" "}
            <button
              type="button"
              className="report-retry"
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          </span>
        </div>
      )}
      {loading && !report && <ReportSkeleton />}
      {report && (
        <>
          {!empty && !report.sent && (
            <p className="report-range-note staff-surface staff-surface-note">
              No proposals were sent in this date range.
            </p>
          )}
          <Headline report={report} link={link} empty={empty} />
          {empty ? (
            <section className="report-empty">
              <p className="t-eyebrow">Nothing to report yet</p>
              <h2>Reports fill in once you send proposals.</h2>
              <p>
                After you send a proposal, you’ll see who viewed it, how long it
                took to sign, and the one-time and monthly value signed.
              </p>
              <a className="btn action" href="/proposals?new=1">
                New proposal
              </a>
            </section>
          ) : (
            <>
              <div className="report-card report-stages">
                <ValueSigned report={report} link={link} />
                <Pipeline report={report} link={link} />
              </div>
              <Trend
                report={report}
                link={link}
                view={trendView}
                setView={setTrendView}
              />
              <section
                className="report-breakdowns"
                aria-labelledby="report-breakdowns"
              >
                <h2 className="t-section-title" id="report-breakdowns">
                  Breakdowns
                </h2>
                <Breakdown
                  group="template"
                  rows={report.byTemplate}
                  sort={templateSort}
                  setSort={setTemplateSort}
                  link={link}
                />
                <Breakdown
                  group="owner"
                  rows={report.byOwner}
                  sort={ownerSort}
                  setSort={setOwnerSort}
                  link={link}
                />
              </section>
              <Engagement report={report} link={link} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="report-skeleton" role="status" aria-label="Loading reports">
      <div className="report-cards" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} />
        ))}
      </div>
      <div className="report-skeleton-track" aria-hidden="true" />
      <div className="report-skeleton-track" aria-hidden="true" />
    </div>
  );
}

function Headline({
  report,
  link,
  empty,
}: {
  report: Report;
  link: Link;
  empty: boolean;
}) {
  const tooltipId = useId();
  const declined = report.pipeline.find((x) => x.id === "declined")?.count ?? 0;
  const expired = report.pipeline.find((x) => x.id === "expired")?.count ?? 0;
  const metrics: [ReportDrill["report"], string, string, string][] = [
    [
      "sent",
      "Proposals sent",
      count.format(report.sent),
      dateCaption(report.range),
    ],
    [
      "viewed",
      "Viewed",
      count.format(report.viewed),
      report.viewedRate === null
        ? "— of sent"
        : `${rate.format(report.viewedRate)} of sent`,
    ],
    [
      "signed",
      "Signed",
      count.format(report.signed),
      report.winRate === null
        ? "— win rate"
        : `${rate.format(report.winRate)} win rate`,
    ],
    [
      "first-view-time",
      "Median time to first view",
      duration(report.medianView),
      "From send to first open",
    ],
    [
      "sign-time",
      "Median time to sign",
      duration(report.medianSign),
      "From send to client signature",
    ],
    [
      "open",
      "Open now",
      count.format(report.open),
      `${report.openSent} sent · ${report.openViewed} viewed`,
    ],
  ];
  return (
    <section aria-label="Overview" className="report-cards">
      {metrics.map(([metric, title, value, note]) => {
        if (empty)
          return (
            <div key={metric} className="report-metric report-metric-empty">
              <strong>{title}</strong>
              <span className="t-number">—</span>
            </div>
          );
        return (
          <div className="report-metric" key={metric}>
            <a href={link({ report: metric })}>
              <strong className="report-metric-label">{title}</strong>
              <span className="t-number">{value}</span>
              <small>{note}</small>
              <span className="report-metric-link">View proposals</span>
            </a>
            {metric === "signed" && (
              <div className="report-tooltip">
                <button
                  className="report-info"
                  type="button"
                  aria-label="About win rate"
                  aria-describedby={tooltipId}
                >
                  <chromeIcons.info size={16} aria-hidden="true" />
                </button>
                <div id={tooltipId} role="tooltip">
                  <strong>Signed ÷ (signed + declined + expired)</strong>
                  <p>
                    {report.signed} ÷ ({report.signed} + {declined} + {expired})
                    = {report.signed} ÷ {report.closed}
                  </p>
                  <p>Proposals still open aren’t counted.</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function ValueSigned({ report, link }: { report: Report; link: Link }) {
  const money = useMoney();
  return (
    <section className="report-section" aria-labelledby="report-value">
      <div className="report-section-heading">
        <h2 className="t-section-title" id="report-value">
          Value signed
        </h2>
        <span>
          {count.format(report.signed)} signed{" "}
          {report.signed === 1 ? "proposal" : "proposals"}
        </span>
      </div>
      {report.values.length ? (
        report.values.map((value) => {
          const keys: ReportInterval[] = value.yearly
            ? ["one_time", "monthly", "yearly"]
            : ["one_time", "monthly"];
          return (
            <div
              className="report-currency-group"
              key={value.currency}
              aria-label={value.currency}
            >
              {report.values.length > 1 && (
                <p className="t-col-head">{value.currency}</p>
              )}
              <div className="report-value-tiles">
                {keys.map((key) => {
                  const amount = value[key];
                  const contents = (
                    <>
                      <span>{periods[key]}</span>
                      <strong className="t-hero-number">
                        {amount === null ? "—" : money(amount, value.currency)}
                        {amount !== null && signSuffix[key] && (
                          <span className="report-value-cadence">
                            {signSuffix[key]}
                          </span>
                        )}
                      </strong>
                      <small>
                        {key === "one_time"
                          ? "Project fees and kickoffs"
                          : key === "monthly"
                            ? "Monthly plans"
                            : "Yearly plans"}
                      </small>
                    </>
                  );
                  return amount === null ? (
                    <div className="report-value-tile" key={key}>
                      {contents}
                    </div>
                  ) : (
                    <a
                      className="report-value-tile"
                      key={key}
                      href={link({
                        report: "value",
                        interval: key,
                        currency: value.currency,
                      })}
                    >
                      {contents}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        <p className="muted">No signed value in this range.</p>
      )}
      <p className="t-ui-note">
        From proposals signed by clients in this range. Amounts are as signed.
      </p>
      {!!report.missingValue && (
        <p className="t-ui-note">
          Totals are unavailable for some signed records.
        </p>
      )}
    </section>
  );
}

function Pipeline({ report, link }: { report: Report; link: Link }) {
  const max = Math.max(1, ...report.pipeline.map((stage) => stage.count));
  return (
    <section className="report-section" aria-labelledby="report-pipeline">
      <div className="report-section-heading">
        <h2 className="t-section-title" id="report-pipeline">
          Pipeline by stage
        </h2>
        <span>Where each proposal is now · click a stage to open it</span>
      </div>
      <div className="report-pipeline">
        {[report.pipeline.slice(0, 6), report.pipeline.slice(6)].map(
          (stages, i) => (
            <div className={i ? "pipeline-exited" : ""} key={i}>
              <h3 className="t-col-head">
                {i ? "Exited" : "In progress and won"} ·{" "}
                {stages.reduce((n, s) => n + s.count, 0)}
              </h3>
              <div className="pipeline-track">
                {stages.map(
                  (stage) =>
                    stage.count > 0 && (
                      <a
                        href={link({ report: "stage", stage: stage.id })}
                        aria-label={`${stage.count} · ${stage.label}`}
                        key={stage.id}
                        data-stage={stage.id}
                        style={{ flex: stage.count }}
                      >
                        {stage.count}
                      </a>
                    ),
                )}
              </div>
              <ul className="pipeline-legend" role="list">
                {stages.map((stage) => (
                  <li key={stage.id} data-stage={stage.id}>
                    <a href={link({ report: "stage", stage: stage.id })}>
                      <span>{stage.label}</span>
                      <i
                        aria-hidden="true"
                        style={
                          {
                            "--stage-width": `${(stage.count / max) * 100}%`,
                          } as CSSProperties
                        }
                      />
                      <strong>{stage.count}</strong>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function Trend({
  report,
  link,
  view,
  setView,
}: {
  report: Report;
  link: Link;
  view: "chart" | "table";
  setView: (v: "chart" | "table") => void;
}) {
  const id = useId();
  const max = Math.max(1, ...report.trend.flatMap((r) => [r.sent, r.signed]));
  const step = Math.ceil(max / 4),
    top = step * 4;
  const totals = report.trend.reduce((n, row) => n + row.signed, 0);
  const summary = `${report.sent} sent and ${withCount(totals, "client signature")} across ${report.trend.length} ${report.trend.length === 1 ? "month" : "months"}.`;
  const dataLink = (date: string, kind: "sent" | "signed", value: number) => (
    <a
      href={link({
        report: kind === "sent" ? "trend-sent" : "trend-signed",
        month: date,
      })}
      aria-label={`${fullMonth.format(dateOf(date + "-01"))}: ${value} ${kind}`}
    >
      {count.format(value)}
    </a>
  );
  return (
    <section
      className="report-card report-section"
      aria-labelledby="report-trend"
    >
      <div className="report-section-heading">
        <h2 className="t-section-title" id="report-trend">
          Sent vs signed by month
        </h2>
        <div className="report-trend-controls">
          {view === "chart" && (
            <ul className="report-legend" role="list">
              <li>
                Sent <span className="sr-only">(hatched)</span>
              </li>
              <li>
                Signed <span className="sr-only">(solid)</span>
              </li>
            </ul>
          )}
          <div
            className="report-trend-tabs"
            data-tab-style="segment"
            role="tablist"
            aria-label="Trend display"
            onKeyDown={(event) =>
              arrowTabs(event, view === "chart" ? 0 : 1, 2, (i) =>
                setView(i ? "table" : "chart"),
              )
            }
          >
            {(["chart", "table"] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                id={id + tab}
                aria-controls={id + "panel"}
                aria-selected={view === tab}
                tabIndex={view === tab ? 0 : -1}
                onClick={() => setView(tab)}
              >
                {tab === "chart" ? "Chart" : "View as table"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div role="tabpanel" id={id + "panel"} aria-labelledby={id + view}>
        {view === "chart" ? (
          <figure aria-labelledby={id + "caption"} className="report-chart">
            <figcaption id={id + "caption"} className="sr-only">
              {summary} Sent bars are outlined and hatched. Signed bars are
              solid.
            </figcaption>
            <div className="report-chart-scroll">
              <div
                className="report-plot"
                style={{ "--months": report.trend.length } as CSSProperties}
              >
                <div className="report-gridlines" aria-hidden="true">
                  {[4, 3, 2, 1, 0].map((i) => (
                    <span key={i}>
                      <b>{step * i}</b>
                    </span>
                  ))}
                </div>
                <ol className="report-chart-months" role="list">
                  {report.trend.map((r) => (
                    <li key={r.month}>
                      <div className="report-bar-pair">
                        {(["sent", "signed"] as const).map((kind) => (
                          <div
                            key={kind}
                            className={`report-bar ${kind}`}
                            style={
                              {
                                "--bar": `${(r[kind] / top) * 100}%`,
                              } as CSSProperties
                            }
                          >
                            {dataLink(r.month, kind, r[kind])}
                            <span aria-hidden="true" />
                          </div>
                        ))}
                      </div>
                      <span>{month.format(dateOf(r.month + "-01"))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </figure>
        ) : (
          <StaffNativeTable className="report-table">
            <caption className="sr-only">
              Monthly proposals sent and signed. {summary}
            </caption>
            <thead className="staff-table-head">
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Sent</th>
                <th scope="col">Signed</th>
                <th scope="col">Signed ÷ sent</th>
              </tr>
            </thead>
            <tbody>
              {report.trend.map((r) => (
                <tr key={r.month}>
                  <th scope="row">
                    {fullMonth.format(dateOf(r.month + "-01"))}
                  </th>
                  <td>{dataLink(r.month, "sent", r.sent)}</td>
                  <td>{dataLink(r.month, "signed", r.signed)}</td>
                  <td>
                    {r.sent ? (
                      <a
                        href={link({ report: "trend-signed", month: r.month })}
                      >
                        {rate.format(r.signed / r.sent)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </StaffNativeTable>
        )}
      </div>
    </section>
  );
}

const columns: [ReportSort["key"], string][] = [
  ["name", "Name"],
  ["sent", "Sent"],
  ["signed", "Signed"],
  ["winRate", "Win rate"],
  ["medianSign", "Median to sign"],
  ["one_time", "One-time"],
  ["recurring", "Monthly"],
];
function Breakdown({
  group,
  rows,
  sort,
  setSort,
  link,
}: {
  group: "template" | "owner";
  rows: ReportBreakdown[];
  sort: ReportSort;
  setSort: (s: ReportSort) => void;
  link: Link;
}) {
  const heading = `By ${group}`,
    sorted = sortBreakdown(rows, sort);
  const groupName = group === "template" ? "Template" : "Owner";
  function cells(row: ReportBreakdown) {
    const filter = { [group]: row.id };
    return [
      <a key="name" href={link({ report: "sent" }, filter)}>
        {row.name}
      </a>,
      <a key="sent" href={link({ report: "sent" }, filter)}>
        {row.sent}
      </a>,
      <a key="signed" href={link({ report: "signed" }, filter)}>
        {row.signed}
      </a>,
      <a key="winRate" href={link({ report: "outcomes" }, filter)}>
        {row.winRate === null ? "—" : rate.format(row.winRate)}
      </a>,
      <a key="medianSign" href={link({ report: "sign-time" }, filter)}>
        {duration(row.medianSign)}
      </a>,
      <BreakdownValues
        key="one_time"
        values={row.values}
        keys={["one_time"]}
        link={link}
        filter={filter}
      />,
      <BreakdownValues
        key="recurring"
        values={row.values}
        keys={["monthly", "yearly"]}
        link={link}
        filter={filter}
      />,
    ];
  }
  return (
    <section
      className="report-card report-section report-breakdown"
      aria-label={heading}
    >
      <div className="report-section-heading">
        <h3 className="t-section-title">{heading}</h3>
        <span className="report-sort-hint">Click a column to sort</span>
        <label className="report-sort-phone">
          Sort{" "}
          <Select
            aria-label={`Sort ${heading.toLowerCase()}`}
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as ReportSort["key"];
              setSort({ key, direction: key === "name" ? "asc" : "desc" });
            }}
          >
            {columns.map(([key, label]) => (
              <option key={key} value={key}>
                {key === "name" ? groupName : label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {rows.length ? (
        <>
          <StaffNativeTable className="report-table report-breakdown-table">
            <caption className="sr-only">{heading}</caption>
            <thead className="staff-table-head">
              <tr>
                {columns.map(([key, label]) => {
                  const active = sort.key === key;
                  const Direction =
                    sort.direction === "asc"
                      ? chromeIcons.ascending
                      : chromeIcons.descending;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        active
                          ? sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSort({
                            key,
                            direction:
                              (active && sort.direction === "desc") ||
                              (!active && key === "name")
                                ? "asc"
                                : "desc",
                          })
                        }
                      >
                        {key === "name" ? groupName : label}
                        {active && <Direction size={13} aria-hidden="true" />}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.id}>
                  {cells(row).map((cell, i) =>
                    i === 0 ? (
                      <th scope="row" key={i}>
                        {cell}
                      </th>
                    ) : (
                      <td key={i}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </StaffNativeTable>
          <div className="report-breakdown-cards">
            {sorted.map((row) => {
              const values = cells(row);
              return (
                <article key={row.id}>
                  <strong>{values[0]}</strong>
                  <dl>
                    {columns.slice(1).map(([, label], i) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{values[i + 1]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <p className="muted">No sends to compare.</p>
      )}
      <p className="t-ui-note">
        One-time and monthly values are totaled separately and never combined.
      </p>
    </section>
  );
}
function BreakdownValues({
  values,
  keys,
  link,
  filter,
}: {
  values: ReportValue[];
  keys: ReportInterval[];
  link: Link;
  filter: Partial<ReportFilters>;
}) {
  const money = useMoney();
  const symbols = values.map(
    ({ currency }) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value,
  );
  const display = new Set(symbols).size === values.length ? "symbol" : "code";
  const lines = values.flatMap((value) =>
    keys.flatMap((key) =>
      value[key] === null || (key === "yearly" && value.yearly === 0)
        ? []
        : [{ value, key }],
    ),
  );
  if (!lines.length) return <span className="muted">—</span>;
  return (
    <span className="report-money-lines">
      {lines.map(({ value, key }) => (
        <a
          key={value.currency + key}
          href={link(
            { report: "value", currency: value.currency, interval: key },
            filter,
          )}
        >
          {key === "yearly" && "Yearly "}
          {money(value[key]!, value.currency, display)}
          {signSuffix[key]}
        </a>
      ))}
    </span>
  );
}
function Engagement({ report, link }: { report: Report; link: Link }) {
  const { questions, sections } = report;
  const largest = Math.max(1, ...sections.map((s) => s.ms / s.proposals));
  return (
    <section className="report-section" aria-labelledby="report-engagement">
      <h2 className="t-section-title" id="report-engagement">
        Engagement
      </h2>
      <div className="report-engagement">
        <section className="report-card" aria-labelledby="report-sections">
          <h3 className="t-section-title" id="report-sections">
            Most-read sections
          </h3>
          <p className="t-ui-note">
            Average time per proposal where the section was read
          </p>
          {sections.length ? (
            <ol className="report-sections" role="list">
              {sections.map((s) => (
                <li key={s.label}>
                  <a href={link({ report: "section", section: s.label })}>
                    <span>{s.label}</span>
                    <span className="report-reading-time">
                      <strong>{duration(s.ms / s.proposals, true)}</strong>
                      <small className="t-ui-note">
                        {s.proposals}{" "}
                        {s.proposals === 1 ? "proposal" : "proposals"}
                      </small>
                    </span>
                    <i
                      aria-hidden="true"
                      style={
                        {
                          "--reading": `${(s.ms / s.proposals / largest) * 100}%`,
                        } as CSSProperties
                      }
                    />
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No section time recorded yet.</p>
          )}
        </section>
        <section className="report-card" aria-labelledby="report-questions">
          <h3 className="t-section-title" id="report-questions">
            Client questions
          </h3>
          <dl className="report-questions">
            {(
              [
                ["Asked", "questions", questions.total],
                ["Open", "questions-open", questions.open],
                ["Answered", "questions-answered", questions.answered],
              ] as const
            ).map(([label, metric, n]) => (
              <div
                className={label === "Open" && n ? "review" : ""}
                key={label}
              >
                <dt>{label}</dt>
                <dd>
                  <a href={link({ report: metric })}>{n}</a>
                </dd>
              </div>
            ))}
          </dl>
          {report.medianReply != null && (
            <p className="t-ui-note">
              Median time to first reply {duration(report.medianReply)}.
            </p>
          )}
          {!!questions.closedWithoutReply && (
            <p className="t-ui-note">
              {questions.closedWithoutReply} resolved without reply.
            </p>
          )}
          <div className="report-question-links">
            <a href={link({ report: "questions-open" })}>
              See {questions.open} open{" "}
              {questions.open === 1 ? "question" : "questions"}
            </a>
            <a href={link({ report: "questions" })}>All {questions.total}</a>
          </div>
        </section>
      </div>
    </section>
  );
}
