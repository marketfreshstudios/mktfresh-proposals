import type { Actor, Proposal } from "./model";
import type { WorkspaceSettings } from "./workspace";
export const listViews = [
  "All",
  "Drafts",
  "Sent",
  "Viewed",
  "Not viewed",
  "Won",
  "Needs countersign",
  "Lost",
  "Billing issues",
  "Archived",
  "Imported",
] as const;
export const viewKey = (name: string) =>
  name.toLowerCase().replaceAll(" ", "-");
export const needsCountersign = (p: Proposal) =>
  !!p.client_signed_at &&
  !p.signers.some((s) => s.role === "company") &&
  p.source === "native" &&
  !p.archived_at;
export const billingIssues = (p: Proposal) =>
  p.billing_links.some(
    (l) => l.status === "failed" || l.status === "needs_review",
  ) ||
  p.jobs.some(
    (j) => j.kind === "billing" && !!j.last_error && j.status !== "done",
  );
export const billingOpen = (p: Proposal) =>
  p.billing_links.some(
    (l) => l.status !== "succeeded" || l.metadata?.requires_checkout === true,
  ) || p.jobs.some((j) => j.kind === "billing" && j.status !== "done");
export const canCountersign = (
  p: Proposal,
  user: Actor,
  settings?: WorkspaceSettings | null,
) =>
  needsCountersign(p) &&
  !!settings?.company_signatory?.authorized_user_ids.includes(
    user.actor.slice(6),
  );
export function inView(p: Proposal, view: string) {
  if (view === "archived")
    return (
      !!p.archived_at || (p.status === "archived" && p.source === "native")
    );
  if (view === "imported") return p.source === "proposify_import";
  if (
    p.archived_at ||
    p.source === "proposify_import" ||
    p.status === "archived"
  )
    return false;
  return (
    {
      all: true,
      drafts: p.status === "draft",
      sent: ["sent", "viewed"].includes(p.status),
      viewed: p.status === "viewed",
      "not-viewed": p.status === "sent",
      won: ["signed_by_client", "completed"].includes(p.status),
      "needs-countersign": needsCountersign(p),
      lost: p.status === "declined",
      "billing-issues": billingIssues(p),
    }[view] ?? false
  );
}
export function nextAction(p: Proposal) {
  if (p.archived_at || p.source === "proposify_import")
    return "Read-only record";
  if (needsCountersign(p)) return "You countersign";
  if (billingIssues(p)) return "You review billing";
  if (p.status === "draft")
    return p.ai_unreviewed ? "You review the AI draft" : "You finish and send";
  if (p.status === "viewed") return "Client decides · link opened";
  if (p.status === "sent") return "Client opens the link";
  if (p.status === "declined" || p.status === "expired")
    return "Duplicate to try again";
  if (billingOpen(p)) return "Billing to finish";
  return "Nothing left to do";
}

export const expiringWithinSevenDays = (p: Proposal, now = Date.now()) =>
  !p.archived_at &&
  !!p.valid_until &&
  ["sent", "viewed"].includes(p.status) &&
  Date.parse(p.valid_until) > now &&
  Date.parse(p.valid_until) <= now + 7 * 86400000;

export const unfinishedJobs = (p: Proposal) =>
  p.jobs.filter((j) => j.status !== "done");
