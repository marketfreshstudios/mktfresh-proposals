import type { Job, Proposal } from "./model";
/** Untagged proposals retain the existing emailed-send reminder policy. */
export function automaticRemindersEnabled(
  p: Pick<Proposal, "delivery_method" | "automatic_reminders">,
) {
  return p.automatic_reminders ?? p.delivery_method !== "manual";
}
export function isAutomaticReminder(j: Pick<Job, "kind" | "payload">) {
  return (
    j.kind === "email" &&
    !!j.payload.reminder_day &&
    j.payload.reminder_day !== "manual"
  );
}
