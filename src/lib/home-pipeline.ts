import type { Proposal } from "./model";
import { totals } from "./presentation";
import { inView } from "./proposal-state";
import { draftItems } from "./quote-model";
import type { HomePipelineRange } from "./staff-account-model";

export const pipelineStages = [
  { view: "not-viewed", label: "Sent" },
  { view: "viewed", label: "Viewed" },
  { view: "won", label: "Won" },
] as const;

export type PipelineAmounts = { month: number; once: number; year: number };
export const zeroPipelineAmounts: PipelineAmounts = {
  month: 0,
  once: 0,
  year: 0,
};

export function homePipeline(
  proposals: Proposal[],
  range: HomePipelineRange,
  now: Date,
  timezone: string,
) {
  const calendar = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
  });
  function monthIndex(date: Date) {
    const parts = calendar.formatToParts(date);
    const year = Number(parts.find(({ type }) => type === "year")?.value);
    const month = Number(parts.find(({ type }) => type === "month")?.value);
    return year * 12 + month - 1;
  }
  const month = monthIndex(now);
  const firstMonth = {
    month,
    "3-months": month - 2,
    "6-months": month - 5,
    year: month - (month % 12),
    all: -Infinity,
  }[range];
  const counts = pipelineStages.map(() => 0);
  const amounts: Record<string, PipelineAmounts> = {};
  for (const proposal of proposals) {
    const stage = pipelineStages.findIndex(({ view }) =>
      inView(proposal, view),
    );
    if (stage === -1) continue;
    if (range !== "all") {
      const sent = new Date(proposal.sent_at ?? "");
      if (!(sent <= now && monthIndex(sent) >= firstMonth)) continue;
    }
    counts[stage] += 1;
    const quote = proposal.client_signed_at
      ? (proposal.versions.at(-1)?.quote ?? proposal.quote)
      : draftItems(proposal.quote);
    const value = totals(quote);
    const sum = (amounts[proposal.currency] ??= { ...zeroPipelineAmounts });
    sum.month += value.monthly_total;
    sum.once += value.one_time_total;
    sum.year += value.yearly_total;
  }
  return { counts, amounts };
}

export type HomePipelineSummary = ReturnType<typeof homePipeline>;
