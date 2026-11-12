import { jobName } from "./job-presentation";
import type { Audit } from "./model";
/** Presentation only: stored event names and the immutable evidence are unchanged. */
export function eventLabel(
  e: Pick<Audit, "type" | "actor" | "metadata">,
  actorName = "staff",
) {
  const labels: Record<string, string> = {
    connector_template_created: `Claude created ${e.metadata.name} (on behalf of ${e.metadata.editor_name})`,
    connector_template_updated: `Claude updated ${e.metadata.name} (on behalf of ${e.metadata.editor_name})`,
    connector_saved_block_created: `Claude created ${e.metadata.name} (on behalf of ${e.metadata.editor_name})`,
    connector_saved_block_updated: `Claude updated ${e.metadata.name} (on behalf of ${e.metadata.editor_name})`,
    connector_change_restored: "Previous version restored",
    saved_block_updated: `Updated saved block “${e.metadata.name}” · version ${e.metadata.version}`,
    saved_block_replaced: `Replaced “${e.metadata.name}” with latest block · version ${e.metadata.version}`,
    saved_block_unlinked: `Unlinked saved block “${e.metadata.name}”`,
    email_template_saved: e.metadata.reset
      ? "Email template reset"
      : "Email template updated",
    client_stripe_linked: "Stripe customer linked",
    client_stripe_unlinked: "Stripe customer unlinked",
    client_changed: `Client changed from ${e.metadata.previous_company} to ${e.metadata.company}`,
    reassigned: `Reassigned from ${e.metadata.previous_name} to ${e.metadata.owner_name} by ${e.metadata.actor_name}`,
    created: "Draft created",
    edited: "Proposal edited",
    ai_sections_reviewed: "Assistant sections reviewed",
    ai_review_undone: "Assistant review reopened",
    sent:
      e.metadata.delivery_method === "manual"
        ? `Sent manually by ${e.metadata.actor_name ?? actorName} (link copied, no email from the app)`
        : "Proposal sent",
    automatic_reminders_changed: `Automatic reminders ${e.metadata.enabled ? "turned on" : "turned off"} by ${actorName}`,
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
    pdf_print_recovered: "PDF printer recovered on retry",
    declined: "Client declined",
    expired: "Proposal expired",
    downloaded: "Signed copy downloaded",
    reminder_sent: e.metadata.automatic
      ? `Automatic reminder emailed${e.metadata.kind === "unopened" ? " · unopened" : e.metadata.kind === "viewed" ? " · viewed, not signed" : ""}`
      : "Reminder emailed",
    countersign_reminder_sent: "Countersign reminder emailed",
    reminder_requested: "Reminder requested",
    stripe_subscription_linked: "Stripe subscription linked",
    marked_won: `Marked as won by ${actorName}`,
    marked_lost: `Marked as lost by ${actorName}`,
    archived: "Proposal archived",
    unarchived: "Proposal restored from archive",
    updated_after_send: `Proposal updated after sending · version ${e.metadata.previous_version} → ${e.metadata.new_version}`,
    reopened: "Proposal reopened",
    manual_invoice_recorded: "Manual invoice recorded",
    invoice_created: "Invoice created",
    qbo_manual_invoicing_chosen: "Manual invoicing chosen",
    template_deleted: "Template deleted",
    qbo_connected: "QuickBooks sandbox connected",
    qbo_disconnected: "QuickBooks sandbox disconnected",
    qbo_token_refreshed: "QuickBooks connection refreshed",
    qbo_customer_chosen: "QuickBooks customer selected",
    qbo_customer_creation_requested: "New QuickBooks customer requested",
    qbo_invoice_delivery_changed:
      e.metadata.delivery === "email"
        ? "QuickBooks invoices set to create and email"
        : "QuickBooks invoices set to draft for review",
    stripe_connect_authorized: "Stripe account connected",
    stripe_connect_disconnected: "Stripe account disconnected",
    stripe_connect_revoked: "Stripe access revoked",
    subscription_created: "Subscription created",
    sync_failed: (() => {
      const id = String(e.metadata.job ?? "");
      const pdf = e.metadata.job_kind === "pdf" || id.includes(":pdf:");
      const name = pdf
        ? e.metadata.stage === "company" || id.endsWith(":company")
          ? "Signed PDF"
          : "Client-signed PDF"
        : jobName(
            {
              kind:
                e.metadata.job_kind === "email"
                  ? "email"
                  : e.metadata.job_kind === "stripe_webhook"
                    ? "stripe_webhook"
                    : "billing",
              payload: {},
            },
            Array.isArray(e.metadata.providers)
              ? (e.metadata.providers as string[])
              : e.metadata.provider
                ? [String(e.metadata.provider)]
                : [],
          );
      return `${name}${e.metadata.status === "needs_review" ? " needs a decision" : e.metadata.terminal === false ? " retry scheduled" : " failed · Retry available"}`;
    })(),
    editing_new_version: "Started a new version",
    document_version: "Pricing reference saved",
    webhook_received: "Billing update received",
    billing_link_resent: "Billing link emailed again",
    billing_payment_processing: "Bank payment processing",
    billing_payment_failed: "Bank payment failed",
    billing_payment_paid: "Bank payment confirmed",
    billing_setup_completed: "Client completed billing setup",
    billing_checkout_renewed: "Payment page renewed for the client",
    billing_approved: "Client approved adding services to their subscription",
    billing_client_review: "Billing needs review before the client can pay",
    billing_invoice_updated: "Billing invoice updated",
    client_created: "Client created",
    client_saved: "Client details saved",
    client_archived: "Client archived",
    client_restored: "Client restored",
    client_deleted: `Client deleted${e.metadata.company ? `: ${e.metadata.company}` : ""}`,
    workspace_settings_saved: "Workspace settings saved",
    pricing_items_saved: "Product saved",
    content_library_deleted: "Saved block deleted",
    catalog_synced: "Products synced",
    template_styles_saved_from_proposal: `Styles saved from proposal ${String(e.metadata.proposal_title ?? "")} by ${String(e.metadata.editor_name ?? actorName)}`,
    template_styles_save_undone: "Template styles save undone",
    templates_saved: "Template saved",
    content_library_saved: "Reusable block saved",
    font_uploaded: "Proposal font uploaded",
    team_password_reset_requested: "Password reset requested",
    team_updated: "Staff display name updated",
    staff_profile_updated: "Staff profile updated",
    staff_signature_updated: "Company signature updated",
  };
  return labels[e.type] ?? "Activity recorded";
}
