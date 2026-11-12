import { check, type Proposal } from "./model";
import { proposalLink, proposalOrigin } from "./links";
import { billingLines } from "./quote-model";
import { mutate, type Repository } from "./repository";
import { event, system } from "./service";
import type { StripeProvider } from "./providers/stripe";

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
  // A renewal must always end on a Stripe page the client confirms. If the
  // customer now has an active subscription, creating billing again could add
  // these lines to it directly, so staff review that case instead.
  const active = await provider.api.get<{ data: unknown[] }>(
    "/v1/subscriptions",
    { customer: link.external_customer_id, status: "active", limit: "1" },
  );
  check(!active.data.length, "Payment setup needs staff review", 409);
  const result = await provider.createObject(
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
