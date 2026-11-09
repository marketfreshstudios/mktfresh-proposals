import type { Actor } from "./model";
import { workspaceStaff } from "./auth";
import type { Repository } from "./repository";
import type { WorkspaceSettings } from "./workspace";
import {
  reportDateRange,
  reportFiltersSchema,
  reportDrillSchema,
  reportSortSchema,
  type ReportDrill,
  type ReportSort,
} from "./report-filters";
import {
  buildReport,
  reportCandidateRows,
  reportDimensions,
  reportMatches,
  reportRows,
  sortBreakdown,
  type Report,
} from "./report-metrics";

export async function loadReportData(
  repo: Repository,
  search: URLSearchParams,
  now = new Date(),
  drill?: ReportDrill,
) {
  const filters = reportFiltersSchema.parse(Object.fromEntries(search));
  const [proposals, settings] = await Promise.all([
    repo.reportProposals(),
    repo.entities<WorkspaceSettings>("workspace_settings"),
  ]);
  const range = reportDateRange(filters, settings[0]?.timezone ?? "UTC", now);
  const candidates = reportCandidateRows(proposals, filters, range);
  const cohort = candidates.filter(
    (p) =>
      p.sent_at &&
      Date.parse(p.sent_at) >= range.start &&
      Date.parse(p.sent_at) < range.end,
  );
  const ids = (only: typeof cohort) => only.map((p) => p.id);
  const metric = drill?.report;
  const facts = await repo.reportFacts({
    sections:
      !metric || metric === "section"
        ? ids(cohort.filter((p) => p.first_viewed_at))
        : undefined,
    questions:
      !metric || metric.startsWith("questions") ? ids(cohort) : undefined,
    values:
      !metric || metric === "value"
        ? ids(cohort.filter((p) => p.client_signed_at))
        : undefined,
    billing:
      !metric || metric === "stage"
        ? ids(
            cohort.filter(
              (p) =>
                p.client_signed_at && p.completed_at && p.billing_links.length,
            ),
          )
        : undefined,
  });
  return { proposals, range, rows: reportRows(candidates, range, now, facts) };
}

export async function readReport(
  repo: Repository,
  search: URLSearchParams,
  actor: Actor,
  now = new Date(),
) {
  const [data, names, members] = await Promise.all([
    loadReportData(repo, search, now),
    repo.reportNames(),
    workspaceStaff(repo.workspaceId),
  ]);
  const staff = new Map(members.map((m) => [m.user_id, m.display_name]));
  if (actor.staff_name) staff.set(actor.actor.slice(6), actor.staff_name);
  return buildReport(
    data.rows,
    data.range,
    reportDimensions(data.proposals, { ...names, staff }),
  );
}

export async function reportDrilldown(
  repo: Repository,
  search: URLSearchParams,
  now = new Date(),
) {
  const drill = reportDrillSchema.parse(Object.fromEntries(search));
  const { rows, range } = await loadReportData(repo, search, now, drill);
  const ids = rows
    .filter((r) => reportMatches(r, drill))
    .sort(
      (a, b) =>
        Date.parse(b.proposal.updated_at) - Date.parse(a.proposal.updated_at) ||
        a.proposal.id.localeCompare(b.proposal.id),
    )
    .map((r) => r.proposal.id);
  return { ids, range };
}

const seconds = (ms: number | null) => (ms === null ? "" : ms / 1000);
const decimal = (cents: number | null | undefined) =>
  cents === undefined || cents === null ? "" : (cents / 100).toFixed(2);
const percent = (part: number | null) =>
  part === null
    ? ""
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(part);
export function reportExportSort(
  query: URLSearchParams,
  kind: "template" | "owner",
): ReportSort {
  return reportSortSchema.parse({
    key: query.get(kind + "_sort"),
    direction: query.get(kind + "_direction"),
  });
}
export function reportCsv(
  report: Report,
  templateSort: ReportSort,
  ownerSort: ReportSort,
) {
  const lines: (string | number)[][] = [
    [
      "Breakdown",
      "Name",
      "Currency",
      "Sent",
      "Signed",
      "Win rate",
      "Median time to sign (seconds)",
      "One-time value",
      "Monthly value",
      "Yearly value",
      "Signed records with missing totals",
    ],
  ];
  for (const [group, entries] of [
    ["Template", sortBreakdown(report.byTemplate, templateSort)],
    ["Owner", sortBreakdown(report.byOwner, ownerSort)],
  ] as const)
    for (const r of entries)
      for (const value of r.values.length ? r.values : [null])
        lines.push([
          group,
          r.name,
          value?.currency ?? "",
          r.sent,
          r.signed,
          percent(r.winRate),
          seconds(r.medianSign),
          decimal(value?.one_time),
          decimal(value?.monthly),
          decimal(value?.yearly),
          r.missingValue,
        ]);
  // User-authored labels must never execute as spreadsheet formulas.
  return (
    lines
      .map((line) =>
        line
          .map((cell) => {
            const safe =
              typeof cell === "string" &&
              /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(cell)
                ? "'" + cell
                : String(cell);
            return '"' + safe.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  );
}
