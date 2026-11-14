// Yeswell's own plans and approved launch prices (cents). Shared by the
// billing page and the server; Stripe computes every total.
export const PLANS = {
  studio: { name: "Studio", included: 2 },
  agency: { name: "Agency", included: 5 },
} as const;
export type PriceKind = "studio" | "agency" | "seat" | "domain";
export type BillingInterval = "month" | "year";
export const CATALOG: Record<
  PriceKind,
  { name: string; month: number; year: number }
> = {
  studio: { name: "Yeswell Studio", month: 3900, year: 39000 },
  agency: { name: "Yeswell Agency", month: 8900, year: 89000 },
  seat: { name: "Yeswell extra person", month: 1500, year: 15000 },
  domain: { name: "Yeswell own email domain", month: 1000, year: 10000 },
};
export const priceLabel = (kind: PriceKind, interval: BillingInterval) =>
  `$${CATALOG[kind][interval] / 100}/${interval === "month" ? "mo" : "yr"}`;
