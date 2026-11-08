import type { Job, Proposal } from "./model";
import { automaticRemindersEnabled, isAutomaticReminder } from "./delivery";
import { publishedExpiry, reminderCycle } from "./editor-publication";
import { afterLocalDays, nextBusinessMorning } from "./reminder-time";

export function cycleViewedAt(p: Proposal) {
  const start = p.events.findLastIndex((e) =>
    ["sent", "reopened"].includes(e.type),
  );
  return (
    p.events.slice(start + 1).find((e) => e.type === "viewed")?.created_at ??
    (start < 0 ? p.first_viewed_at : null)
  );
}
export function clientReminderAllowed(p: Proposal, j: Job, now = new Date()) {
  if (
    !automaticRemindersEnabled(p) ||
    p.archived_at ||
    p.signers.length ||
    !["sent", "viewed"].includes(p.status) ||
    j.payload.version !== reminderCycle(p).version ||
    (publishedExpiry(p) && Date.parse(publishedExpiry(p)!) <= now.getTime())
  )
    return false;
  if (!j.payload.reminder_kind) return true; // Keep legacy day-offset delivery behavior.
  const rules = p.workspace_settings?.reminder_rules;
  if (!rules?.enabled) return false;
  const viewed = cycleViewedAt(p);
  return (
    j.payload.reminder_kind === (viewed ? "viewed" : "unopened") &&
    j.payload.reminder_anchor === (viewed ?? reminderCycle(p).at)
  );
}
export function reminderCount(p: Proposal) {
  return p.events.filter(
    (e) => e.type === "reminder_sent" && e.metadata.day !== "manual",
  ).length;
}
export function dueClientReminders(p: Proposal, now: Date) {
  const rules = p.workspace_settings?.reminder_rules;
  const cycle = reminderCycle(p);
  const viewed = cycleViewedAt(p);
  const kind = viewed ? "viewed" : "unopened";
  const anchor = viewed ?? cycle.at;
  const days = kind === "viewed" ? rules?.viewed_days : rules?.unopened_days;
  if (!rules?.enabled || !days || !anchor) return [];
  const reservations = p.jobs.filter(
    (j) =>
      isAutomaticReminder(j) &&
      j.status !== "done" &&
      clientReminderAllowed(p, j, now),
  ).length;
  let remaining = rules.stop_after - reminderCount(p) - reservations;
  const due = [];
  for (let n = 1; n <= rules.stop_after && remaining > 0; n++) {
    const at = afterLocalDays(
      anchor,
      n * days,
      p.workspace_settings?.timezone ?? "UTC",
    );
    const key = `reminder:${cycle.version}:${kind}:${at}`;
    if (Date.parse(at) > now.getTime()) break;
    if (p.jobs.some((j) => j.id === `${p.id}:${key}`)) continue;
    due.push({ key, day: n * days, at, kind, anchor, version: cycle.version });
    remaining--;
  }
  return due;
}
export function countersignDue(p: Proposal) {
  const rule = p.workspace_settings?.countersign_reminder;
  if (!rule || rule.mode === "off" || !p.client_signed_at) return null;
  const timezone = p.workspace_settings?.timezone ?? "UTC";
  return rule.mode === "next_morning"
    ? nextBusinessMorning(p.client_signed_at, timezone)
    : afterLocalDays(p.client_signed_at, rule.days, timezone);
}
export function countersignReminderAllowed(
  p: Proposal,
  j: Job,
  now = new Date(),
) {
  return (
    !p.archived_at &&
    p.status === "signed_by_client" &&
    p.signers.some((s) => s.role === "client") &&
    !p.signers.some((s) => s.role === "company") &&
    j.payload.client_signed_at === p.client_signed_at &&
    countersignDue(p) === j.payload.countersign_due &&
    Date.parse(String(j.payload.countersign_due)) <= now.getTime()
  );
}
