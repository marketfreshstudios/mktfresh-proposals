import type { WorkspaceSettings } from "./workspace";
/** Calendar dates are based on the workspace's day, independent of the server timezone. */
export function defaultValidUntil(
  settings: Pick<WorkspaceSettings, "timezone" | "default_validity_days">,
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (key: string) =>
    Number(parts.find((p) => p.type === key)!.value);
  const date = new Date(
    Date.UTC(
      value("year"),
      value("month") - 1,
      value("day") + settings.default_validity_days,
      23,
      59,
      59,
      999,
    ),
  );
  return date.toISOString();
}
export function readableDate(value: string | null | undefined) {
  if (!value) return "";
  const day = value.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}
