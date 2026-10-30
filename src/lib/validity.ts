import type { WorkspaceSettings } from "./workspace";
/** ISO calendar date in the workspace, independent of the browser/server timezone. */
export function calendarDate(value: string | Date, timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Find next local midnight, then subtract 1ms. Re-evaluate the offset for DST. */
export function endOfDay(day: string, timezone = "UTC") {
  const [year, month, date] = day.split("-").map(Number);
  const target = Date.UTC(year, month - 1, date + 1);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let n = 0; n < 4; n++) {
    const parts = formatter.formatToParts(new Date(instant));
    const p = (key: string) =>
      Number(parts.find((part) => part.type === key)!.value);
    const local = Date.UTC(
      p("year"),
      p("month") - 1,
      p("day"),
      p("hour"),
      p("minute"),
      p("second"),
    );
    const correction = target - local;
    instant += correction;
    if (!correction) break;
  }
  return new Date(instant - 1).toISOString();
}
export function defaultValidUntil(
  settings: Pick<WorkspaceSettings, "timezone" | "default_validity_days">,
  now = new Date(),
) {
  const day = new Date(calendarDate(now, settings.timezone) + "T12:00:00Z");
  day.setUTCDate(day.getUTCDate() + (settings.default_validity_days ?? 30));
  return endOfDay(day.toISOString().slice(0, 10), settings.timezone);
}
export function readableDate(
  value: string | null | undefined,
  timezone = "UTC",
) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
}
