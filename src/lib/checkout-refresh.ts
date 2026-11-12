import { AppError, check, type Proposal } from "./model";
import { proposalLink, proposalOrigin } from "./links";
import { billingLines } from "./quote-model";
import { mutate, type Repository } from "./repository";
import { event, queue, system } from "./service";
import type { BillingApproval, StripeProvider } from "./providers/stripe";
import { NeedsReview } from "./billing";

type PendingCheckout = {
  id: string;
  url: string;
  line_ids: string[];
  [key: string]: unknown;
};

/**
 * The client's proposal link is the permanent payment link. Stripe Checkout
 * pages expire (24 hours by default), so the client page asks for a checkout
 * URL when the client clicks: an open session is reused, an expired one is
 * replaced by a new session for the same lines, and a finished one returns
 * the client to the proposal.
 */
export async function freshCheckoutUrl(
  repo: Repository,
  provider: StripeProvider,
  p: Proposal,
  sessionId: string,
  now = Date.now(),
): Promise<string> {
  const link = p.billing_links.find((l) => l.provider === "stripe");
  const pending = (link?.metadata?.checkout ?? []) as PendingCheckout[];
  const entry = pending.find((s) => s.id === sessionId);
  check(
    !!p.client_signed_at && link?.metadata?.requires_checkout === true && entry,
    "This payment setup is no longer pending",
    409,
  );
  const session = await provider.api.get<{
    status: string;
    url: string | null;
    expires_at: number;
  }>(`/v1/checkout/sessions/${entry.id}`, {});
  if (session.status === "complete") return proposalLink(p);
  // Reuse an open page unless it is about to expire mid-checkout.
  if (
    session.status === "open" &&
    session.url &&
    session.expires_at * 1000 > now + 10 * 60_000
  )
    return session.url;
  const v = p.versions.at(-1);
  check(v, "Signed version missing", 409);
  const lines = billingLines(v.quote).filter((l) =>
    entry.line_ids.includes(l.id),
  );
  check(
    lines.length === entry.line_ids.length && link?.external_customer_id,
    "Payment setup needs staff review",
    409,
  );
  // Billing never adds to a subscription without the client's approval, so a
  // renewal either yields a new checkout page or, if the client now pays a
  // subscription with a working card, an approval they confirm on the proposal.
  let result: Awaited<ReturnType<StripeProvider["createObject"]>>;
  try {
    result = await provider.createObject(
      {
        id: link.external_customer_id,
        email: p.client.email,
        company: p.client.company,
      },
      lines,
      `${p.id}:stripe:v${v.version_no}:refresh:${entry.id}`,
      {
        ...link.metadata,
        checkout: undefined,
        added_existing: undefined,
        requires_checkout: undefined,
        proposal_id: p.id,
        proposal_title: p.title,
        currency: p.currency.toLowerCase(),
        client_origin: proposalOrigin(p),
        client_return_url: proposalLink(p),
      },
    );
  } catch (error) {
    if (error instanceof NeedsReview) await markReview(repo, p, error.message);
    throw error instanceof NeedsReview
      ? new AppError(409, reviewMessage)
      : error;
  }
  const approvals = (
    (result.metadata.approval ?? []) as BillingApproval[]
  ).filter((a) => a.line_ids.every((id) => entry.line_ids.includes(id)));
  if (approvals.length) {
    await mutate(repo, p.id, (current) => {
      const billing = current.billing_links.find(
        (l) => l.provider === "stripe",
      );
      if (!billing?.metadata) return;
      const list = (billing.metadata.checkout ?? []) as PendingCheckout[];
      if (!list.some((s) => s.id === entry.id)) return;
      billing.metadata = {
        ...billing.metadata,
        checkout: list.filter((s) => s.id !== entry.id),
        approval: [
          ...((billing.metadata.approval ?? []) as BillingApproval[]),
          ...approvals,
        ],
        requires_checkout: true,
      };
    });
    return proposalLink(p);
  }
  const fresh = ((result.metadata.checkout ?? []) as PendingCheckout[]).find(
    (s) => s.line_ids.join() === entry.line_ids.join(),
  );
  check(fresh?.url, "Payment setup needs staff review", 409);
  await mutate(repo, p.id, (current) => {
    const billing = current.billing_links.find((l) => l.provider === "stripe");
    if (!billing?.metadata) return;
    const list = (billing.metadata.checkout ?? []) as PendingCheckout[];
    if (!list.some((s) => s.id === entry.id)) return;
    billing.metadata = {
      ...billing.metadata,
      checkout: list.map((s) => (s.id === entry.id ? fresh : s)),
    };
    event(current, "billing_checkout_renewed", system, {
      previous_session_id: entry.id,
      session_id: fresh.id,
    });
  });
  return fresh.url;
}

/**
 * The client approves adding signed recurring services to the subscription
 * they already pay (or starting a scheduled plan on their card on file).
 * Nothing is added at signing; this is the only path that adds it.
 */
const reviewMessage =
  "This couldn’t be set up automatically. We’ve let the sender know, and they’ll follow up.";
async function markReview(repo: Repository, p: Proposal, reason: string) {
  await mutate(repo, p.id, (current) => {
    const billing = current.billing_links.find((l) => l.provider === "stripe");
    if (!billing) return;
    billing.status = "needs_review";
    billing.last_error = reason;
    event(current, "billing_client_review", system, { reason });
  });
}

export async function approveBilling(
  repo: Repository,
  provider: StripeProvider,
  p: Proposal,
  approvalId: string,
): Promise<void> {
  const link = p.billing_links.find((l) => l.provider === "stripe");
  const approvals = (link?.metadata?.approval ?? []) as BillingApproval[];
  const approval = approvals.find((a) => a.id === approvalId);
  check(
    !!p.client_signed_at && approval && link?.external_customer_id,
    "This approval is no longer pending",
    409,
  );
  const v = p.versions.at(-1);
  check(v, "Signed version missing", 409);
  const lines = billingLines(v.quote).filter((l) =>
    approval.line_ids.includes(l.id),
  );
  check(
    lines.length === approval.line_ids.length,
    "Payment setup needs staff review",
    409,
  );
  let added: Awaited<ReturnType<StripeProvider["applyApproval"]>>;
  try {
    added = await provider.applyApproval(
      {
        id: link.external_customer_id,
        email: p.client.email,
        company: p.client.company,
      },
      lines,
      approval,
      `${p.id}:stripe:v${v.version_no}:${approval.id}`,
      {
        ...link.metadata,
        checkout: undefined,
        approval: undefined,
        added_existing: undefined,
        requires_checkout: undefined,
        proposal_id: p.id,
        proposal_title: p.title,
        currency: p.currency.toLowerCase(),
      },
    );
  } catch (error) {
    if (!(error instanceof NeedsReview)) throw error;
    await markReview(repo, p, error.message);
    throw new AppError(409, reviewMessage);
  }
  await mutate(repo, p.id, (current) => {
    const billing = current.billing_links.find((l) => l.provider === "stripe");
    if (!billing?.metadata) return;
    const pending = (billing.metadata.approval ?? []) as BillingApproval[];
    if (!pending.some((a) => a.id === approval.id)) return;
    const rest = pending.filter((a) => a.id !== approval.id);
    const checkout = (billing.metadata.checkout ?? []) as unknown[];
    billing.metadata = {
      ...billing.metadata,
      approval: rest,
      added_existing: [
        ...((billing.metadata.added_existing ?? []) as unknown[]),
        added,
      ],
      requires_checkout: checkout.length > 0 || rest.length > 0,
    };
    if (!billing.external_object_id?.startsWith("sub_") && added?.id)
      billing.external_object_id = added.id;
    event(current, "billing_approved", system, {
      approval_id: approval.id,
      subscription_id: added?.id ?? null,
      line_ids: approval.line_ids,
    });
    queue(current, "email", `billing-added:${approval.id}`, {
      to: current.client.email,
      email_template_key: "billing_updated",
    });
  });
}

/**
 * Confirm a Checkout the client just finished, without waiting for Stripe's
 * webhook. Stripe is asked directly; a complete session is processed by the
 * same job the webhook would queue, so a webhook arriving later is a no-op.
 * Returns true once processing has been queued (or already happened).
 */
export async function confirmCheckout(
  repo: Repository,
  provider: StripeProvider,
  p: Proposal,
  sessionId: string,
): Promise<boolean> {
  const link = p.billing_links.find((l) => l.provider === "stripe");
  const pending = (link?.metadata?.checkout ?? []) as PendingCheckout[];
  if (!p.client_signed_at || !pending.some((s) => s.id === sessionId))
    return false;
  const receipt = `return_${sessionId}`;
  if (p.jobs.some((j) => j.id === `${p.id}:webhook:${receipt}`)) return true;
  const session = await provider.api.get<{
    status: string;
    livemode: boolean;
    metadata?: Record<string, string>;
  }>(`/v1/checkout/sessions/${sessionId}`, {});
  if (
    session.status !== "complete" ||
    session.livemode !== false ||
    session.metadata?.proposal_id !== p.id
  )
    return false;
  await mutate(repo, p.id, (current) => {
    queue(current, "stripe_webhook", `webhook:${receipt}`, {
      event: {
        id: receipt,
        type: "checkout.session.completed",
        data: { object: { id: sessionId } },
      },
    });
  });
  return true;
}

/** Signed proposals whose Checkout may have finished without a webhook. */
export function openCheckouts(p: Proposal) {
  const link = p.billing_links.find((l) => l.provider === "stripe");
  if (!p.client_signed_at || link?.metadata?.requires_checkout !== true)
    return [];
  return ((link.metadata.checkout ?? []) as PendingCheckout[]).map((s) => s.id);
}
