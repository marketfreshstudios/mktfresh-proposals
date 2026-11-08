/** Calendar arithmetic uses the workspace's IANA timezone, never the server timezone. */
function localParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const n = (name: string) => Number(parts.find((p) => p.type === name)!.value);
  return (
    Date.UTC(
      n("year"),
      n("month") - 1,
      n("day"),
      n("hour"),
      n("minute"),
      n("second"),
    ) + instant.getUTCMilliseconds()
  );
}
function fromLocal(wall: number, timezone: string) {
  // Both offsets around a transition: prefer the first occurrence in a fold,
  // and move forward through a missing wall-clock time in a spring gap.
  const offsets = new Set(
    [-36, 0, 36].map((hours) => {
      const at = wall + hours * 3600000;
      return localParts(new Date(at), timezone) - at;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => wall - offset)
    .sort((a, b) => a - b);
  const exact = candidates.find(
    (at) => localParts(new Date(at), timezone) === wall,
  );
  if (exact !== undefined) return new Date(exact);
  const after = candidates
    .filter((at) => localParts(new Date(at), timezone) > wall)
    .sort(
      (a, b) =>
        localParts(new Date(a), timezone) - localParts(new Date(b), timezone),
    );
  if (!after.length)
    throw new Error("Cannot resolve reminder time in workspace timezone");
  return new Date(after[0]);
}
export function afterLocalDays(
  instant: string,
  days: number,
  timezone: string,
) {
  const wall = new Date(localParts(new Date(instant), timezone));
  wall.setUTCDate(wall.getUTCDate() + days);
  return fromLocal(wall.getTime(), timezone).toISOString();
}
export function nextBusinessMorning(instant: string, timezone: string) {
  const wall = new Date(localParts(new Date(instant), timezone));
  do {
    wall.setUTCDate(wall.getUTCDate() + 1);
  } while ([0, 6].includes(wall.getUTCDay()));
  wall.setUTCHours(9, 0, 0, 0);
  return fromLocal(wall.getTime(), timezone).toISOString();
}
