import type { EngagementAggregate } from "./engagement";
import type { BillingLink, Proposal } from "./model";
import { formatMoney } from "./money";
import {
  reportMonth,
  reportMonths,
  reportStages,
  type ReportDateRange,
  type ReportDrill,
  type ReportFilters,
  type ReportInterval,
  type ReportSort,
  type ReportStage,
} from "./report-filters";

export type ReportProposal = Pick<
  Proposal,
  | "id"
  | "status"
  | "sent_at"
  | "first_viewed_at"
  | "client_signed_at"
  | "completed_at"
  | "created_at"
  | "updated_at"
  | "template_id"
  | "currency"
> & {
  client_id: string;
  client_name: string;
  owner_id: string | null;
  owner_name: string | null;
  archived: boolean;
  expiry: string | null;
  billing_links: Pick<BillingLink, "status" | "metadata">[];
};
export type ReportQuestion = {
  proposal_id: string;
  status: "open" | "answered" | "resolved";
  answered: boolean;
};
export type ReportEngagement = {
  id: string;
  targets: Pick<EngagementAggregate, "targets">["targets"];
};
export type ReportVersion = {
  proposal_id: string;
  version_no: number;
  variables: Record<string, string>;
};
export type ReportFacts = {
  questions: ReportQuestion[];
  engagement: ReportEngagement[];
  versions: ReportVersion[];
  pendingBilling: string[];
};
export type ReportDimensions = Record<
  "owner" | "template" | "client",
  { id: string; name: string }[]
>;

export function projectReportProposal(p: Proposal): ReportProposal {
  const person = p.sender ?? p.owner;
  return {
    id: p.id,
    status: p.status,
    sent_at: p.sent_at,
    first_viewed_at: p.first_viewed_at,
    client_signed_at: p.client_signed_at,
    completed_at: p.completed_at,
    created_at: p.created_at,
    updated_at: p.updated_at,
    template_id: p.template_id,
    currency: p.currency,
    client_id: p.client.id,
    client_name: p.client.company,
    owner_id:
      person?.user_id ??
      (p.created_by.startsWith("staff:") ? p.created_by.slice(6) : null),
    owner_name: person?.display_name ?? null,
    archived: !!p.archived_at || p.status === "archived",
    expiry: p.published_state ? p.published_state.valid_until : p.valid_until,
    billing_links: p.billing_links.map(({ status, metadata }) => ({
      status,
      metadata,
    })),
  };
}

const inRange = (value: string | null, range: ReportDateRange) => {
  const at = value ? Date.parse(value) : NaN;
  return at >= range.start && at < range.end;
};
const matchesDimensions = (p: ReportProposal, f: ReportFilters) =>
  (!f.owner || (p.owner_id ?? "none") === f.owner) &&
  (!f.template || (p.template_id ?? "none") === f.template) &&
  (!f.client || p.client_id === f.client);
export function reportCandidateRows(
  proposals: ReportProposal[],
  filters: ReportFilters,
  range: ReportDateRange,
) {
  return proposals.filter(
    (p) =>
      matchesDimensions(p, filters) &&
      (p.sent_at
        ? inRange(p.sent_at, range) || inRange(p.client_signed_at, range)
        : !p.archived && p.status === "draft" && inRange(p.created_at, range)),
  );
}
export function reportDimensions(
  proposals: ReportProposal[],
  names: {
    templates: Map<string, string>;
    staff: Map<string, string>;
    clients: Map<string, string>;
  },
): ReportDimensions {
  const owner = new Map<string, string>();
  const template = new Map<string, string>();
  const client = new Map<string, string>();
  for (const p of proposals) {
    if (!p.sent_at && (p.archived || p.status !== "draft")) continue;
    const ownerKey = p.owner_id ?? "none";
    if (!owner.has(ownerKey) || p.owner_name)
      owner.set(
        ownerKey,
        names.staff.get(ownerKey) ??
          p.owner_name ??
          (p.owner_id ? "Former staff member" : "No sender"),
      );
    const templateKey = p.template_id ?? "none";
    template.set(
      templateKey,
      names.templates.get(templateKey) ??
        (p.template_id ? "Removed template" : "No template"),
    );
    client.set(p.client_id, names.clients.get(p.client_id) ?? p.client_name);
  }
  const list = (map: Map<string, string>) =>
    Array.from(map, ([id, name]) => ({ id, name })).sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
  return { owner: list(owner), template: list(template), client: list(client) };
}
export function median(values: number[]) {
  if (!values.length) return null;
  const list = [...values].sort((a, b) => a - b);
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}
const duration = (from: string | null, to: string | null) => {
  if (!from || !to) return null;
  const elapsed = Date.parse(to) - Date.parse(from);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
};
const intervals = ["one_time", "monthly", "yearly"] as const;
/** The existing freeze stores these as en-US currency fields. Parse their exact
 * stored representation; never derive a total from quote items or missing data. */
export function parseStoredTotal(value: unknown, currency: string) {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  const match = value.replaceAll(",", "").match(/\d+(?:\.\d{2})?/);
  if (!match) return null;
  const [whole, fraction = "00"] = match[0].split(".");
  const cents =
    (Number(whole) * 100 + Number(fraction)) * (value.startsWith("-") ? -1 : 1);
  if (!Number.isSafeInteger(cents)) return null;
  return ["auto", "always"].some(
    (mode) => formatMoney(cents, currency, mode as "auto" | "always") === value,
  )
    ? cents
    : null;
}
type StoredValues = Record<ReportInterval, number | null>;
export type ReportValue = StoredValues & { currency: string };
function values(p: ReportProposal, version?: ReportVersion): StoredValues {
  return Object.fromEntries(
    intervals.map((key) => [
      key,
      parseStoredTotal(version?.variables?.[`quote.${key}_total`], p.currency),
    ]),
  ) as StoredValues;
}
type Row = {
  proposal: ReportProposal;
  inCohort: boolean;
  signedInRange: boolean;
  draft: boolean;
  open: boolean;
  stage: ReportStage | null;
  viewed: boolean;
  signed: boolean;
  outcome: boolean;
  firstViewTime: number | null;
  signTime: number | null;
  sentMonth: string | null;
  signedMonth: string | null;
  value: StoredValues;
  sections: Map<string, number>;
  questions: {
    total: number;
    open: number;
    answered: number;
    closedWithoutReply: number;
  };
};

export function reportRows(
  proposals: ReportProposal[],
  range: ReportDateRange,
  now: Date,
  facts: ReportFacts,
): Row[] {
  const versions = new Map<string, ReportVersion>();
  for (const v of facts.versions) {
    if ((versions.get(v.proposal_id)?.version_no ?? -1) < v.version_no)
      versions.set(v.proposal_id, v);
  }
  const pending = new Set(facts.pendingBilling);
  const engagement = new Map(facts.engagement.map((x) => [x.id, x]));
  const questions = new Map<string, Row["questions"]>();
  for (const q of facts.questions) {
    const count = questions.get(q.proposal_id) ?? {
      total: 0,
      open: 0,
      answered: 0,
      closedWithoutReply: 0,
    };
    questions.set(q.proposal_id, count);
    count.total++;
    if (q.status === "open") count.open++;
    else if (q.answered || q.status === "answered") count.answered++;
    else count.closedWithoutReply++;
  }

  return proposals.map((p) => {
    const inCohort = inRange(p.sent_at, range);
    const signedInRange = !!p.sent_at && inRange(p.client_signed_at, range);
    const signed = !!p.client_signed_at;
    const viewed = !!p.first_viewed_at;
    const expired =
      !signed &&
      (p.status === "expired" ||
        (["sent", "viewed"].includes(p.status) &&
          !!p.expiry &&
          Date.parse(p.expiry) <= now.getTime()));
    const declined = !signed && p.status === "declined";
    const draft =
      !p.sent_at &&
      p.status === "draft" &&
      !p.archived &&
      inRange(p.created_at, range);
    const open =
      !signed &&
      !p.archived &&
      !expired &&
      ["sent", "viewed"].includes(p.status);
    const billed =
      p.billing_links.length > 0 &&
      !pending.has(p.id) &&
      p.billing_links.every(
        (l) =>
          l.status === "succeeded" && l.metadata?.requires_checkout !== true,
      );
    // “Marked won” does not fabricate a signature. Retain the last reached live stage.
    const stage: ReportStage | null = draft
      ? "draft"
      : !inCohort
        ? null
        : signed
          ? p.completed_at
            ? billed
              ? "billing"
              : "countersigned"
            : "signed"
          : declined
            ? "declined"
            : expired
              ? "expired"
              : viewed
                ? "viewed"
                : "sent";
    const sections = new Map<string, number>();
    if (viewed && inCohort)
      for (const t of Object.values(engagement.get(p.id)?.targets ?? {})) {
        if (t.kind !== "section" || !(t.ms > 0)) continue;
        const label = t.label.trim().replace(/\s+/g, " ") || "Untitled section";
        sections.set(label, (sections.get(label) ?? 0) + t.ms);
      }
    return {
      proposal: p,
      inCohort,
      signedInRange,
      draft,
      open,
      stage,
      viewed,
      signed,
      outcome: signed || declined || expired,
      firstViewTime: duration(p.sent_at, p.first_viewed_at),
      signTime: duration(p.sent_at, p.client_signed_at),
      sentMonth: inCohort ? reportMonth(p.sent_at!, range.timezone) : null,
      signedMonth: signedInRange
        ? reportMonth(p.client_signed_at!, range.timezone)
        : null,
      value: values(p, versions.get(p.id)),
      sections,
      questions: questions.get(p.id) ?? {
        total: 0,
        open: 0,
        answered: 0,
        closedWithoutReply: 0,
      },
    };
  });
}
export function reportMatches(row: Row, drill: ReportDrill) {
  if (drill.report === "stage") return row.stage === drill.stage;
  if (drill.report === "trend-sent") return row.sentMonth === drill.month;
  if (drill.report === "trend-signed") return row.signedMonth === drill.month;
  if (!row.inCohort) return false;
  switch (drill.report) {
    case "sent":
      return true;
    case "viewed":
      return row.viewed;
    case "signed":
      return row.signed;
    case "outcomes":
      return row.outcome;
    case "first-view-time":
      return row.firstViewTime !== null;
    case "sign-time":
      return row.signTime !== null;
    case "open":
      return row.open;
    case "value":
      return (
        row.signed &&
        row.proposal.currency === drill.currency &&
        row.value[drill.interval!] !== null
      );
    case "section":
      return row.sections.has(drill.section!);
    case "questions":
      return row.questions.total > 0;
    case "questions-open":
      return row.questions.open > 0;
    case "questions-answered":
      return row.questions.answered > 0;
    case "questions-closed":
      return row.questions.closedWithoutReply > 0;
  }
}
function summaries(rows: Row[]) {
  const signed = rows.filter((r) => r.signed);
  const closed = rows.filter((r) => r.outcome).length;
  const viewed = rows.filter((r) => r.viewed).length;
  const money = new Map<string, ReportValue>();
  let missingValue = 0;
  for (const r of signed) {
    if (intervals.some((interval) => r.value[interval] === null))
      missingValue++;
    const currency = r.proposal.currency;
    const amount = money.get(currency) ?? {
      currency,
      one_time: null,
      monthly: null,
      yearly: null,
    };
    money.set(currency, amount);
    for (const interval of intervals) {
      const value = r.value[interval];
      if (value !== null) amount[interval] = (amount[interval] ?? 0) + value;
    }
  }
  return {
    sent: rows.length,
    viewed,
    signed: signed.length,
    closed,
    viewedRate: rows.length ? viewed / rows.length : null,
    winRate: closed ? signed.length / closed : null,
    medianView: median(
      rows.flatMap((r) => (r.firstViewTime === null ? [] : [r.firstViewTime])),
    ),
    medianSign: median(
      rows.flatMap((r) => (r.signTime === null ? [] : [r.signTime])),
    ),
    open: rows.filter((r) => r.open).length,
    values: [...money.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
    missingValue,
  };
}
export type ReportBreakdown = ReturnType<typeof summaries> & {
  id: string;
  name: string;
};

export function buildReport(
  rows: Row[],
  range: ReportDateRange,
  dimensions: ReportDimensions,
) {
  const cohort = rows.filter((r) => r.inCohort);
  const stageCounts = new Map<string, number>();
  const trend = new Map(
    reportMonths(range).map((month) => [month, { month, sent: 0, signed: 0 }]),
  );
  const sections = new Map<
    string,
    { label: string; ms: number; proposals: number }
  >();
  const questions = { total: 0, open: 0, answered: 0, closedWithoutReply: 0 };
  for (const r of rows) {
    if (r.stage) stageCounts.set(r.stage, (stageCounts.get(r.stage) ?? 0) + 1);
    if (r.sentMonth) trend.get(r.sentMonth)!.sent++;
    if (r.signedMonth) trend.get(r.signedMonth)!.signed++;
    if (!r.inCohort) continue;
    for (const [label, ms] of r.sections) {
      const s = sections.get(label) ?? { label, ms: 0, proposals: 0 };
      s.ms += ms;
      s.proposals++;
      sections.set(label, s);
    }
    for (const key of [
      "total",
      "open",
      "answered",
      "closedWithoutReply",
    ] as const)
      questions[key] += r.questions[key];
  }
  const breakdown = (group: "owner" | "template") => {
    const names = new Map(dimensions[group].map((x) => [x.id, x.name]));
    const groups = new Map<string, Row[]>();
    for (const r of cohort) {
      const id =
        (group === "owner" ? r.proposal.owner_id : r.proposal.template_id) ??
        "none";
      const members = groups.get(id) ?? [];
      members.push(r);
      groups.set(id, members);
    }
    return Array.from(groups, ([id, members]) => ({
      id,
      name: names.get(id) ?? "Unknown",
      ...summaries(members),
    }));
  };
  return {
    range,
    dimensions,
    ...summaries(cohort),
    workspaceHasProposals: dimensions.client.length > 0,
    pipeline: reportStages.map(([id, label]) => ({
      id,
      label,
      count: stageCounts.get(id) ?? 0,
    })),
    trend: [...trend.values()],
    byTemplate: breakdown("template"),
    byOwner: breakdown("owner"),
    sections: [...sections.values()]
      .sort((a, b) => b.ms - a.ms || a.label.localeCompare(b.label))
      .slice(0, 10),
    questions,
  };
}
export type Report = ReturnType<typeof buildReport>;

export function sortBreakdown(
  rows: ReportBreakdown[],
  { key, direction }: ReportSort,
) {
  const currencies = [
    ...new Set(rows.flatMap((r) => r.values.map((v) => v.currency))),
  ].sort();
  function valueCompare(a: ReportBreakdown, b: ReportBreakdown) {
    for (const currency of currencies) {
      const left = a.values.find((v) => v.currency === currency);
      const right = b.values.find((v) => v.currency === currency);
      for (const interval of key === "one_time"
        ? (["one_time"] as const)
        : (["monthly", "yearly"] as const)) {
        const diff = (left?.[interval] ?? 0) - (right?.[interval] ?? 0);
        if (diff) return diff;
      }
    }
    return 0;
  }
  return [...rows].sort((a, b) => {
    const result =
      key === "name"
        ? a.name.localeCompare(b.name)
        : key === "one_time" || key === "recurring"
          ? valueCompare(a, b)
          : (a[key] ?? -1) - (b[key] ?? -1);
    return (
      (direction === "desc" ? -result : result) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
}
