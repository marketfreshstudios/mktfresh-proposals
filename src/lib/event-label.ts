import type { Audit } from "./model";
/** Presentation only: stored event names and the immutable evidence are unchanged. */
export function eventLabel(
  e: Pick<Audit, "type" | "actor" | "metadata">,
  actorName = "staff",
) {
  const labels: Record<string, string> = {
    created: "Draft created",
    edited: "Draft edited",
    sent: "Proposal sent",
    viewed: "Client opened the proposal",
    quote_changed: "Client updated their choices",
    consent_given:
      e.metadata.role === "company"
        ? "Company signer gave consent"
        : "Client gave consent",
    signed: "Client signed",
    client_signed: "Client signed",
    signed_by_client: "Client signed",
    counter_signed: "Company signature applied",
    company_signed: "Company signature applied",
    completed: "Agreement completed",
    declined: "Client declined",
    expired: "Proposal expired",
    downloaded: "Signed copy downloaded",
    reminder_sent: "Reminder emailed",
    reminder_requested: "Reminder requested",
    marked_won: `Marked as won by ${actorName}`,
    marked_lost: `Marked as lost by ${actorName}`,
    archived: "Proposal archived",
    unarchived: "Proposal restored from archive",
    reopened: "Proposal reopened",
    manual_invoice_recorded: "Manual invoice recorded",
    invoice_created: "Invoice created",
    subscription_created: "Subscription created",
    sync_failed: "Background work needs attention",
    editing_new_version: "Started a new version",
    document_version: "Pricing reference saved",
    webhook_received: "Billing update received",
    billing_link_resent: "Billing link emailed again",
    billing_setup_completed: "Client completed billing setup",
    billing_invoice_updated: "Billing invoice updated",
    client_created: "Client created",
    client_saved: "Client details saved",
    client_deleted: `Client deleted${e.metadata.company ? `: ${e.metadata.company}` : ""}`,
    workspace_settings_saved: "Workspace settings saved",
    pricing_items_saved: "Catalog item saved",
    templates_saved: "Template saved",
    content_library_saved: "Reusable block saved",
    font_uploaded: "Proposal font uploaded",
    team_updated: "Staff display name updated",
  };
  return labels[e.type] ?? "Activity recorded";
}
