import type { ReportFacts, ReportProposal } from "../src/lib/report-metrics";

export const reportId = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
export const sampleOwner = reportId(41),
  otherOwner = reportId(42);
export const sampleTemplate = reportId(51),
  otherTemplate = reportId(52);
export const sampleClient = reportId(61),
  otherClient = reportId(62);
export const sampleNow = new Date("2026-11-08T20:00:00Z");
export const sampleZone = "America/New_York";
export function reportProposal(
  n: number,
  change: Partial<ReportProposal> = {},
): ReportProposal {
  return {
    id: reportId(n),
    status: "sent",
    sent_at: "2026-11-04T15:00:00Z",
    first_viewed_at: null,
    client_signed_at: null,
    completed_at: null,
    created_at: "2026-10-30T14:00:00Z",
    updated_at: "2026-11-05T15:00:00Z",
    template_id: sampleTemplate,
    currency: "USD",
    client_id: sampleClient,
    client_name: "Juniper Works",
    owner_id: sampleOwner,
    owner_name: "Avery Chen",
    archived: false,
    expiry: "2026-12-15T15:00:00Z",
    billing_links: [],
    ...change,
  };
}
const signed = {
  status: "completed" as const,
  first_viewed_at: "2026-11-04T17:30:00Z",
  client_signed_at: "2026-11-05T15:00:00Z",
  completed_at: "2026-11-06T16:00:00Z",
};
const billing_links = [
  { status: "succeeded" as const, metadata: { requires_checkout: false } },
];
export const sampleProposals: ReportProposal[] = [
  reportProposal(1, { ...signed, billing_links }),
  reportProposal(2, {
    ...signed,
    billing_links,
    archived: true,
    currency: "CAD",
    owner_id: otherOwner,
    template_id: otherTemplate,
    first_viewed_at: "2026-11-04T18:00:00Z",
    client_signed_at: "2026-11-06T15:00:00Z",
  }),
  reportProposal(3, {
    status: "declined",
    first_viewed_at: "2026-11-04T20:00:00Z",
  }),
  reportProposal(4, {
    status: "viewed",
    expiry: "2026-11-07T15:00:00Z",
    first_viewed_at: "2026-11-05T00:00:00Z",
  }),
  reportProposal(5, {
    status: "viewed",
    first_viewed_at: "2026-11-04T16:00:00Z",
    client_id: otherClient,
    client_name: "Hearth & Field",
  }),
  reportProposal(6),
  reportProposal(7, {
    ...signed,
    sent_at: "2026-10-31T22:00:00Z",
    billing_links,
    template_id: otherTemplate,
    first_viewed_at: "2026-11-01T15:00:00Z",
    client_signed_at: "2026-11-03T15:00:00Z",
  }),
  reportProposal(8, {
    status: "draft",
    sent_at: null,
    created_at: "2026-11-06T15:00:00Z",
  }),
  reportProposal(9, {
    status: "draft",
    sent_at: null,
    archived: true,
    created_at: "2026-11-05T15:00:00Z",
  }),
  reportProposal(10, {
    ...signed,
    sent_at: "2026-09-27T15:00:00Z",
    first_viewed_at: "2026-09-28T15:00:00Z",
    client_signed_at: "2026-10-01T15:00:00Z",
    completed_at: null,
    status: "signed_by_client",
    billing_links,
    template_id: otherTemplate,
    owner_id: otherOwner,
  }),
  reportProposal(11, { sent_at: "2026-09-07T15:00:00Z", status: "declined" }),
  reportProposal(12, {
    sent_at: "2026-10-21T15:00:00Z",
    first_viewed_at: "2026-10-21T20:00:00Z",
    status: "viewed",
    owner_id: otherOwner,
    template_id: otherTemplate,
    client_id: otherClient,
  }),
  reportProposal(13, {
    sent_at: "2026-10-22T15:00:00Z",
    status: "sent",
    archived: true,
  }),
];
export const sampleFacts: ReportFacts = {
  questions: [
    { proposal_id: reportId(1), status: "answered", answered: true },
    { proposal_id: reportId(1), status: "resolved", answered: true },
    { proposal_id: reportId(4), status: "resolved", answered: false },
    { proposal_id: reportId(5), status: "open", answered: false },
  ],
  engagement: [
    {
      id: reportId(1),
      targets: {
        scope: { label: "Scope", kind: "section", ms: 940000, viewers: [] },
        page: { label: "Page 2", kind: "page", ms: 9999999, viewers: [] },
      },
    },
    {
      id: reportId(2),
      targets: {
        scope: { label: "Scope", kind: "section", ms: 600000, viewers: [] },
        price: {
          label: "Your investment",
          kind: "section",
          ms: 480000,
          viewers: [],
        },
      },
    },
    {
      id: reportId(5),
      targets: {
        timeline: {
          label: "Timeline",
          kind: "section",
          ms: 180000,
          viewers: [],
        },
      },
    },
  ],
  versions: [
    {
      proposal_id: reportId(1),
      version_no: 1,
      variables: { "quote.one_time_total": "$1" },
    },
    {
      proposal_id: reportId(1),
      version_no: 2,
      variables: {
        "quote.one_time_total": "$2,750.50",
        "quote.monthly_total": "$175",
        "quote.yearly_total": "$300",
      },
    },
    {
      proposal_id: reportId(2),
      version_no: 1,
      variables: {
        "quote.one_time_total": "CA$950",
        "quote.monthly_total": "CA$25",
        "quote.yearly_total": "CA$0",
      },
    },
    {
      proposal_id: reportId(7),
      version_no: 1,
      variables: {
        "quote.one_time_total": "$4,400",
        "quote.monthly_total": "$350",
        "quote.yearly_total": "$0",
      },
    },
    {
      proposal_id: reportId(10),
      version_no: 1,
      variables: {
        "quote.one_time_total": "$1,800",
        "quote.monthly_total": "$120",
        "quote.yearly_total": "$0",
      },
    },
  ],
  pendingBilling: [reportId(2)],
};
export const sampleNames = {
  staff: new Map([
    [sampleOwner, "Avery Chen"],
    [otherOwner, "Jordan Ellis"],
  ]),
  templates: new Map([
    [sampleTemplate, "Website design"],
    [otherTemplate, "Monthly strategy"],
  ]),
  clients: new Map([
    [sampleClient, "Juniper Works"],
    [otherClient, "Hearth & Field"],
  ]),
};
