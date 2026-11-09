import { z } from "zod";
import { localDateStart } from "./reminder-time";

export const reportRanges = [
  ["month", "This month"],
  ["last-month", "Last month"],
  ["last-90", "Last 90 days"],
  ["year", "This year"],
  ["custom", "Custom"],
] as const;
const rangeKeys = ["month", "last-month", "last-90", "year", "custom"] as const;
const identity = z.union([z.uuid(), z.literal("none")]);
const day = z.iso
  .date()
  .refine((value) => value >= "1900-01-01" && value <= "9998-12-31");
export const reportFiltersSchema = z
  .object({
    range: z.enum(rangeKeys).default("month"),
    from: day.optional(),
    to: day.optional(),
    owner: identity.optional(),
    template: identity.optional(),
    client: z.uuid().optional(),
  })
  .refine(
    (p) =>
      p.range !== "custom" ||
      (!!p.from &&
        !!p.to &&
        p.from <= p.to &&
        Number(p.to.slice(0, 4)) - Number(p.from.slice(0, 4)) < 100),
    "Choose a valid date range under 100 years.",
  );
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export const reportStages = [
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["viewed", "Viewed"],
  ["signed", "Signed by client"],
  ["countersigned", "Countersigned"],
  ["billing", "Billing set up"],
  ["declined", "Declined"],
  ["expired", "Expired"],
] as const;
export type ReportStage = (typeof reportStages)[number][0];
const stageKeys = [
  "draft",
  "sent",
  "viewed",
  "signed",
  "countersigned",
  "billing",
  "declined",
  "expired",
] as const;
export const reportMetrics = [
  "sent",
  "viewed",
  "signed",
  "outcomes",
  "first-view-time",
  "sign-time",
  "open",
  "stage",
  "trend-sent",
  "trend-signed",
  "section",
  "questions",
  "questions-open",
  "questions-answered",
  "questions-closed",
  "value",
] as const;
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const reportDrillSchema = z
  .object({
    report: z.enum(reportMetrics),
    stage: z.enum(stageKeys).optional(),
    month: monthKey.optional(),
    section: z.string().max(200).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    interval: z.enum(["one_time", "monthly", "yearly"]).optional(),
  })
  .refine(
    (p) =>
      (p.report !== "stage" || !!p.stage) &&
      (!["trend-sent", "trend-signed"].includes(p.report) || !!p.month) &&
      (p.report !== "section" || !!p.section) &&
      (p.report !== "value" || (!!p.currency && !!p.interval)),
    "Choose a valid report metric.",
  );
export type ReportDrill = z.infer<typeof reportDrillSchema>;
export type ReportInterval = NonNullable<ReportDrill["interval"]>;
export const reportSortKeys = [
  "name",
  "sent",
  "signed",
  "winRate",
  "medianSign",
  "one_time",
  "recurring",
] as const;
export type ReportSort = {
  key: (typeof reportSortKeys)[number];
  direction: "asc" | "desc";
};
export const reportSortSchema = z
  .object({
    key: z.enum(reportSortKeys),
    direction: z.enum(["asc", "desc"]),
  })
  .catch({ key: "sent", direction: "desc" });

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const calendar = (date: string) => new Date(date + "T00:00:00Z");
const moveDays = (date: string, by: number) => {
  const d = calendar(date);
  d.setUTCDate(d.getUTCDate() + by);
  return ymd(d);
};
function moveMonth(date: string, by: number) {
  const d = calendar(date.slice(0, 7) + "-01");
  d.setUTCMonth(d.getUTCMonth() + by);
  return ymd(d);
}
const localFormatters = new Map<string, Intl.DateTimeFormat>();
function localDay(at: Date, zone: string) {
  let formatter = localFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    localFormatters.set(zone, formatter);
  }
  return formatter.format(at);
}
export function reportMonth(instant: string, zone: string) {
  return localDay(new Date(instant), zone).slice(0, 7);
}
export function reportDateRange(
  filters: ReportFilters,
  timezone: string,
  now: Date,
) {
  const today = localDay(now, timezone);
  let from = today.slice(0, 7) + "-01",
    to = today;
  switch (filters.range) {
    case "last-month":
      to = moveDays(from, -1);
      from = moveMonth(from, -1);
      break;
    case "last-90":
      from = moveDays(today, -89);
      break;
    case "year":
      from = today.slice(0, 4) + "-01-01";
      break;
    case "custom":
      from = filters.from!;
      to = filters.to!;
      break;
  }
  return {
    from,
    to,
    timezone,
    start: Date.parse(localDateStart(from, timezone)),
    end: Date.parse(localDateStart(moveDays(to, 1), timezone)),
  };
}
export type ReportDateRange = ReturnType<typeof reportDateRange>;
export function reportMonths(range: ReportDateRange) {
  const months: string[] = [];
  for (
    let date = range.from.slice(0, 7) + "-01";
    date.slice(0, 7) <= range.to.slice(0, 7);
    date = moveMonth(date, 1)
  )
    months.push(date.slice(0, 7));
  return months;
}
export function reportParams(filters: ReportFilters, drill?: ReportDrill) {
  const query = new URLSearchParams({ range: filters.range });
  for (const key of ["from", "to", "owner", "template", "client"] as const)
    if (filters[key]) query.set(key, filters[key]!);
  if (drill)
    for (const [key, value] of Object.entries(drill))
      if (value) query.set(key, value);
  return query;
}
export function reportMetricLabel(drill: ReportDrill) {
  switch (drill.report) {
    case "stage":
      return (
        reportStages.find(([key]) => key === drill.stage)?.[1] ?? "Pipeline"
      );
    case "sent":
      return "Proposals sent";
    case "trend-sent":
      return `Proposals sent · ${drill.month}`;
    case "signed":
      return "Signed proposals";
    case "trend-signed":
      return `Client signatures · ${drill.month}`;
    case "viewed":
      return "Viewed proposals";
    case "outcomes":
      return "Signed, declined, or expired";
    case "first-view-time":
      return "Proposals with a time to first view";
    case "sign-time":
      return "Proposals with a time to sign";
    case "open":
      return "Proposals open now";
    case "section":
      return `Time spent · ${drill.section}`;
    case "questions":
      return "Proposals with questions";
    case "questions-open":
      return "Proposals with open questions";
    case "questions-answered":
      return "Proposals with answered questions";
    case "questions-closed":
      return "Proposals with questions resolved without reply";
    case "value":
      return `Signed value · ${drill.currency}`;
  }
}
