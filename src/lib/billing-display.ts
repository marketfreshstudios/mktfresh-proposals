import { quoteSublines } from "./quote-model";
import type { Quote, BillingLine } from "./model";
export type BillingGroup = {
  url?: string;
  line_ids?: string[];
  items?: { line_id: string; name: string }[];
  mode?: "setup" | "subscription";
};
export function billingDisplay(
  quote: Quote,
  billing: {
    requires_checkout: boolean;
    checkout: BillingGroup[];
    added_existing: BillingGroup[];
  }[],
  preview = false,
) {
  const lines = quoteSublines(quote, true),
    recurring = lines.filter((l) => l.interval !== "one_time"),
    sessions = billing.flatMap((b) => (b.requires_checkout ? b.checkout : [])),
    existing = billing.flatMap((b) => b.added_existing);
  const resolve = (group: BillingGroup, fallback: BillingLine[]) => {
    const selected = group.line_ids
      ? recurring.filter((l) => group.line_ids!.includes(l.id))
      : fallback;
    return selected.map((l) => ({
      ...l,
      name: group.items?.find((i) => i.line_id === l.id)?.name || l.name,
    }));
  };
  const added = existing.flatMap((g) =>
    resolve(g, sessions.length ? [] : recurring),
  );
  const checkout = preview
    ? [{ url: "", mode: "subscription" as const, lines: recurring }]
    : sessions.map((g) => ({
        ...g,
        lines: resolve(
          g,
          sessions.length === 1
            ? recurring.filter((l) => !added.some((a) => a.id === l.id))
            : [],
        ),
      }));
  return {
    checkout,
    added: [...new Map(added.map((l) => [l.id, l])).values()],
    oneTime: lines.filter((l) => l.interval === "one_time"),
  };
}
export function recurringAmount(
  lines: BillingLine[],
  interval: "month" | "year",
) {
  return lines
    .filter((l) => l.interval === interval)
    .reduce((total, l) => total + l.amount * l.qty, 0);
}
