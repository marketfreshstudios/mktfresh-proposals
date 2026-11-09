export type CentsMode = "auto" | "always";
export function formatMoney(
  cents: number,
  currency = "USD",
  mode: CentsMode = "auto",
  currencyDisplay: "symbol" | "code" = "symbol",
) {
  const digits = mode === "always" || cents % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}
export function intervalSuffix(interval: "one_time" | "month" | "year") {
  return interval === "month" ? "/mo" : interval === "year" ? "/yr" : "";
}
