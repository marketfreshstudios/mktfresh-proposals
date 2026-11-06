import type { EmailTemplate } from "./email-template-content";
export function studioDate(value: string, now = new Date()) {
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
export function templateUsage(count: number) {
  return count === 0
    ? "Not used yet"
    : count === 1
      ? "Used once"
      : `Used ${count} times`;
}
export const emailStages = [
  { name: "Send", keys: ["proposal_sent"] },
  { name: "Follow up", keys: ["reminder_unopened", "reminder_viewed"] },
  { name: "Sign", keys: ["signed_copy", "completed"] },
  {
    name: "Billing",
    keys: ["billing_setup", "billing_complete", "billing_updated"],
  },
  { name: "Client activity", keys: ["staff_viewed", "staff_declined"] },
  {
    name: "Signatures",
    keys: ["staff_signed", "staff_completed", "staff_copy"],
  },
  { name: "Billing", keys: ["staff_billing_complete"] },
  {
    name: "Team and jobs · editable",
    keys: ["staff_billing_failed", "team_invite", "team_password_reset"],
  },
];
export function groupedEmails(templates: EmailTemplate[], staff: boolean) {
  return emailStages
    .map((g) => ({
      ...g,
      templates: g.keys.flatMap((key) =>
        templates.filter((t) => t.key === key && t.staff === staff),
      ),
    }))
    .filter((g) => g.templates.length);
}
export const emailWhen: Record<string, string> = {
  proposal_sent: "When you send a proposal",
  reminder_unopened: "If the client hasn’t opened it",
  reminder_viewed: "If the client viewed it but hasn’t signed",
  signed_copy: "Right after the client signs",
  completed: "When both parties have signed",
  billing_setup: "After signing, if billing setup is still needed",
  billing_complete: "When the client finishes billing setup",
  billing_updated: "When items are added to an existing subscription",
  staff_viewed: "When the client opens a proposal",
  staff_declined: "When the client declines",
  staff_signed: "When the client signs",
  staff_completed: "When both parties have signed",
  staff_copy: "When a signed copy is available",
  staff_billing_complete: "When billing setup completes",
  staff_billing_failed: "When a job needs attention",
  team_invite: "When an admin invites a teammate",
  team_password_reset: "When an admin sends a password reset",
};
export function stripeStatus(
  health?: { stripe: boolean; mock: boolean; mode?: string } | null,
) {
  return health?.stripe
    ? `Connected · ${health.mode === "live" ? "live" : "test"} mode`
    : health?.mock
      ? "Mock mode"
      : health
        ? "Not connected"
        : "Status unavailable";
}

export const workspaceSections = [
  ["brand", "Brand"],
  ["fonts", "Proposal fonts"],
  ["money", "Money"],
  ["styles", "Proposal styles"],
  ["billing", "Billing defaults"],
  ["team", "Team"],
  ["signatory", "Signatory"],
  ["client-links", "Client links"],
  ["email-sending", "Email sending"],
  ["pricing-references", "Pricing references"],
] as const;
