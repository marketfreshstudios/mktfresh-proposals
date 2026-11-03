import type { Subline, QuoteItem } from "./model";
/** The same fallback is shown in the editor placeholder, reading view and PDF. */
export function sublineLabel(s: Pick<Subline, "label" | "interval">) {
  return (
    s.label?.trim() ||
    (s.interval === "one_time"
      ? "Setup fee"
      : s.interval === "month"
        ? "Subscription"
        : "Annual subscription")
  );
}
export function ambiguousSublines(item: Pick<QuoteItem, "sublines">) {
  const blank = item.sublines.filter((s) => !s.label?.trim());
  return blank.some((s, n) =>
    blank.slice(n + 1).some((v) => v.interval === s.interval),
  );
}
export function removeSubline(item: QuoteItem, id: string) {
  return item.sublines.length > 1
    ? item.sublines.filter((s) => s.id !== id)
    : item.sublines;
}
