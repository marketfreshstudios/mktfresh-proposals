import { expect, it } from "vitest";
import {
  reportDateRange,
  reportFiltersSchema,
  reportMonth,
  reportMonths,
} from "../src/lib/report-filters";
import {
  buildReport,
  median,
  parseStoredTotal,
  reportCandidateRows,
  reportDimensions,
  reportMatches,
  reportRows,
  sortBreakdown,
} from "../src/lib/report-metrics";
import { reportCsv } from "../src/lib/report-server";
import {
  otherClient,
  otherOwner,
  otherTemplate,
  reportId,
  reportProposal,
  sampleClient,
  sampleFacts,
  sampleNames,
  sampleNow,
  sampleOwner,
  sampleProposals,
  sampleTemplate,
  sampleZone,
} from "./report-fixture";

function fixture(input: unknown = {}) {
  const filters = reportFiltersSchema.parse(input);
  const range = reportDateRange(filters, sampleZone, sampleNow);
  const rows = reportRows(
    reportCandidateRows(sampleProposals, filters, range),
    range,
    sampleNow,
    sampleFacts,
  );
  const result = buildReport(
    rows,
    range,
    reportDimensions(sampleProposals, sampleNames),
  );
  return { range, rows, result };
}
it("uses actual views and signatures, excludes open proposals from the win denominator, and does not count archived drafts", () => {
  const { result, rows } = fixture();
  expect(result).toMatchObject({
    sent: 6,
    viewed: 5,
    signed: 2,
    closed: 4,
    winRate: 0.5,
    open: 2,
    medianView: 3 * 3600000,
    medianSign: 36 * 3600000,
  });
  expect(result.viewedRate).toBe(5 / 6);
  expect(
    Object.fromEntries(result.pipeline.map((r) => [r.id, r.count])),
  ).toEqual({
    draft: 1,
    sent: 1,
    viewed: 1,
    signed: 0,
    countersigned: 1,
    billing: 1,
    declined: 1,
    expired: 1,
  });
  for (const { id, count } of result.pipeline)
    expect(
      rows.filter((r) => reportMatches(r, { report: "stage", stage: id })),
    ).toHaveLength(count);
  expect(
    rows
      .filter((r) => reportMatches(r, { report: "open" }))
      .map((r) => r.proposal.id),
  ).toEqual([reportId(5), reportId(6)]);
  expect(result.questions).toEqual({
    total: 4,
    open: 1,
    answered: 2,
    closedWithoutReply: 1,
  });
  expect(result.sections).toEqual([
    { label: "Scope", ms: 1540000, proposals: 2 },
    { label: "Your investment", ms: 480000, proposals: 1 },
    { label: "Timeline", ms: 180000, proposals: 1 },
  ]);
  expect(
    rows.filter((r) =>
      reportMatches(r, { report: "section", section: "Scope" }),
    ),
  ).toHaveLength(2);
});
it("never combines accepted one-time, monthly, yearly or different currencies; missing fields are not priced", () => {
  const { result, rows } = fixture();
  expect(result.values).toEqual([
    { currency: "CAD", one_time: 95000, monthly: 2500, yearly: 0 },
    { currency: "USD", one_time: 275050, monthly: 17500, yearly: 30000 },
  ]);
  expect(parseStoredTotal("$2,750.50", "USD")).toBe(275050);
  expect(parseStoredTotal("CA$0.00", "CAD")).toBe(0);
  expect(parseStoredTotal("$10.00", "CAD")).toBeNull();
  expect(parseStoredTotal("$1,00", "USD")).toBeNull();
  expect(parseStoredTotal("2.50", "USD")).toBeNull();
  expect(
    rows.filter((r) =>
      reportMatches(r, {
        report: "value",
        currency: "USD",
        interval: "yearly",
      }),
    ),
  ).toHaveLength(1);
  const p = reportProposal(100, {
    client_signed_at: "2026-11-07T15:00:00Z",
    status: "signed_by_client",
  });
  const range = reportDateRange({ range: "month" }, sampleZone, sampleNow);
  const missing = buildReport(
    reportRows([p], range, sampleNow, sampleFacts),
    range,
    reportDimensions([p], sampleNames),
  );
  expect(missing).toMatchObject({
    signed: 1,
    missingValue: 1,
    values: [{ one_time: null, monthly: null, yearly: null }],
  });
});
it("uses workspace calendar dates across month boundaries and both DST transitions", () => {
  const start = reportDateRange(
    { range: "month" },
    sampleZone,
    new Date("2026-11-01T03:59:59Z"),
  );
  expect(start).toMatchObject({
    from: "2026-10-01",
    to: "2026-10-31",
    end: Date.parse("2026-11-01T04:00:00Z"),
  });
  expect(reportMonth("2026-11-01T03:59:59Z", sampleZone)).toBe("2026-10");
  expect(reportMonth("2026-11-01T04:00:00Z", sampleZone)).toBe("2026-11");
  for (const [day, hours] of [
    ["2026-03-08", 23],
    ["2026-11-01", 25],
  ] as const) {
    const range = reportDateRange(
      { range: "custom", from: day, to: day },
      sampleZone,
      sampleNow,
    );
    expect(range.end - range.start).toBe(hours * 3600000);
    const near = [
      reportProposal(21, { sent_at: new Date(range.start - 1).toISOString() }),
      reportProposal(22, { sent_at: new Date(range.start).toISOString() }),
      reportProposal(23, { sent_at: new Date(range.end).toISOString() }),
    ];
    expect(
      reportCandidateRows(
        near,
        { range: "custom", from: day, to: day },
        range,
      ).map((p) => p.id),
    ).toEqual([reportId(22)]);
  }
  expect(
    reportDateRange({ range: "last-90" }, sampleZone, sampleNow).from,
  ).toBe("2026-08-11");
  expect(
    reportDateRange({ range: "last-month" }, sampleZone, sampleNow),
  ).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
  expect(reportDateRange({ range: "year" }, sampleZone, sampleNow).from).toBe(
    "2026-01-01",
  );
  expect(reportMonths(fixture({ range: "last-90" }).range)).toEqual([
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
  ]);
});
it("reports medians, scopes all filters together and groups trend signatures by their own date", () => {
  expect(median([])).toBeNull();
  expect(median([4, 1, 7])).toBe(4);
  expect(median([2, 4, 10, 1])).toBe(3);
  const { result, rows } = fixture({
    owner: otherOwner,
    template: otherTemplate,
    client: sampleClient,
  });
  expect(result).toMatchObject({
    sent: 1,
    signed: 1,
    winRate: 1,
    medianSign: 48 * 3600000,
  });
  expect(
    rows
      .filter((r) => reportMatches(r, { report: "signed" }))
      .map((r) => r.proposal.id),
  ).toEqual([reportId(2)]);
  expect(
    fixture({
      owner: sampleOwner,
      template: sampleTemplate,
      client: otherClient,
    }).result.sent,
  ).toBe(1);
  expect(fixture().result.trend).toEqual([
    { month: "2026-11", sent: 6, signed: 3 },
  ]);
  const oct = fixture({ range: "last-month" });
  expect(oct.result.signed).toBe(1);
  expect(oct.result.trend).toEqual([{ month: "2026-10", sent: 3, signed: 1 }]);
  expect(
    oct.rows
      .filter((r) =>
        reportMatches(r, { report: "trend-signed", month: "2026-10" }),
      )
      .map((r) => r.proposal.id),
  ).toEqual([reportId(10)]);
  expect(oct.result.open).toBe(1);
});
it("CSV matches the same breakdown rows, sort order, currency and median units and protects formula-like names", () => {
  const { result } = fixture();
  const sort = { key: "name", direction: "asc" } as const;
  expect(sortBreakdown(result.byTemplate, sort).map((r) => r.name)).toEqual([
    "Monthly strategy",
    "Website design",
  ]);
  const csv = reportCsv(result, sort, sort);
  expect(csv.split("\r\n").slice(1, 3)).toEqual([
    '"Template","Monthly strategy","CAD","1","1","100%","172800","950.00","25.00","0.00","0"',
    '"Template","Website design","USD","5","1","33.3%","86400","2750.50","175.00","300.00","0"',
  ]);
  result.byOwner[0].name = "=2+2";
  expect(reportCsv(result, sort, sort)).toContain('"\'=2+2"');
});
