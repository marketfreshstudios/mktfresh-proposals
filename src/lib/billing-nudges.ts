import type { Actor, Job, Proposal } from "./model";
import { event, queue } from "./service";

/**
 * Emails that bring a client back to finish billing after signing
 * (owner decision 25 Nov):
 * - one "Finish billing setup" email, sent the first time either the client
 *   chooses "I'll do this later" or an hour passes after billing is ready;
 * - reminders 3 and 7 days after signing;
 * - none of them once billing is finished.
 * Choosing "later" again never sends another email.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const billingReminderDays = [3, 7] as const;

/** A Stripe setup or approval is still waiting on the client. */
export function billingAwaitsClient(p: Proposal) {
  return (
    p.status !== "declined" &&
    !p.archived_at &&
    p.billing_links.some(
      (l) => l.provider === "stripe" && l.metadata?.requires_checkout === true,
    )
  );
}

export function isBillingNudge(p: Proposal, j: Job) {
  return (
    j.id === `${p.id}:billing-setup` ||
    j.id.startsWith(`${p.id}:billing-reminder:`)
  );
}

const nudge = (p: Proposal, subject: string) => ({
  to: p.client.email,
  email_template_key: "billing_setup",
  subject: `${subject}: ${p.title}`,
  text: "Your proposal is signed. Open it to finish billing setup.",
});

/** Called once billing is ready for the client: schedules every nudge. */
export function scheduleBillingEmails(p: Proposal, now = Date.now()) {
  const signed = Date.parse(p.client_signed_at ?? new Date(now).toISOString());
  // The client already chose "later" while billing was being prepared.
  const deferred = p.events.some((e) => e.type === "billing_deferred");
  queue(
    p,
    "email",
    "billing-setup",
    nudge(p, "Finish billing setup"),
    new Date(deferred ? now : Math.max(now, signed + HOUR)).toISOString(),
  );
  for (const days of billingReminderDays)
    queue(
      p,
      "email",
      `billing-reminder:${days}`,
      nudge(p, "Reminder: finish billing setup"),
      new Date(Math.max(now, signed + days * DAY)).toISOString(),
    );
}

/**
 * The client chose "I'll do this later". Brings the first email forward to
 * now if it hasn't gone yet; later clicks change nothing. Returns whether
 * an email is now due, so the caller can send it right away.
 */
export function deferBilling(p: Proposal, actor: Actor, now = new Date()) {
  if (!billingAwaitsClient(p) && p.billing_links.length) return false;
  const first = !p.events.some((e) => e.type === "billing_deferred");
  if (first) event(p, "billing_deferred", actor, {}, now.toISOString());
  const job = p.jobs.find((j) => j.id === `${p.id}:billing-setup`);
  if (!job || job.status !== "pending" || job.attempts > 0) return false;
  if (Date.parse(job.available_at) <= now.getTime()) return true;
  job.available_at = now.toISOString();
  return true;
}
