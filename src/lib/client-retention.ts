import type { Proposal } from "./model";

export const keepClientHistory =
  "This client has proposal history that must be kept. Archive the client instead.";
export const archiveDraftsFirst =
  "Archive this client’s unsent drafts before deleting it.";

const protectedEvents = new Set([
  "sent",
  "reopened",
  "viewed",
  "signed",
  "counter_signed",
  "countersigned",
  "declined",
  "invoice_created",
  "subscription_created",
  "billing_completed",
]);

export function hasClientProposalHistory(p: Proposal) {
  return (
    p.source !== "native" ||
    !["draft", "archived"].includes(p.status) ||
    !!(
      p.token ||
      p.sent_at ||
      p.first_viewed_at ||
      p.client_signed_at ||
      p.completed_at
    ) ||
    (p.version_count ?? p.versions.length) > 0 ||
    p.signers.length > 0 ||
    p.billing_links.length > 0 ||
    p.files.some((file) => file.kind !== "render") ||
    p.jobs.some((job) => job.kind === "billing") ||
    p.events.some((event) => protectedEvents.has(event.type))
  );
}

export function clientDeleteBlocker(proposals: Proposal[]) {
  if (proposals.some(hasClientProposalHistory)) return keepClientHistory;
  if (proposals.some((p) => !p.archived_at && p.status !== "archived"))
    return archiveDraftsFirst;
  return null;
}
