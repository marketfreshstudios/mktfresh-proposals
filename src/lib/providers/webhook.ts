import { createHmac, timingSafeEqual } from "node:crypto";
import { check, type Proposal, type Job } from "../model";
import { event, queue, system } from "../service";
import { mutate, type Repository } from "../repository";
import { StripeProvider } from "./stripe";
export function verifyStripeWebhook(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  check(secret.startsWith("whsec_"), "Webhook signing secret required", 503);
  const fields = header.split(",").map((s) => s.split("="));
  const timestamp = fields.find(([k]) => k === "t")?.[1];
  check(
    timestamp && Math.abs(now / 1000 - Number(timestamp)) <= 300,
    "Invalid webhook timestamp",
    400,
  );
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + raw)
    .digest();
  check(
    fields.some(([k, v]) => {
      const actual = Buffer.from(v ?? "", "hex");
      return (
        k === "v1" &&
        actual.length === expected.length &&
        timingSafeEqual(actual, expected)
      );
    }),
    "Invalid webhook signature",
    400,
  );
  const payload = JSON.parse(raw);
  check(payload.livemode === false, "Live webhook refused", 400);
  check(
    payload.api_version === "2024-06-20",
    "Webhook must use pinned snapshot API version",
    400,
  );
  check(
    typeof payload.id === "string" && payload.id.startsWith("evt_"),
    "Invalid webhook event",
    400,
  );
  return payload as {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };
}
export async function receiveStripeWebhook(
  repo: Repository,
  provider: StripeProvider,
  raw: string,
  signature: string,
  secret: string,
) {
  const payload = verifyStripeWebhook(raw, signature, secret);
  if (
    ![
      "checkout.session.completed",
      "invoice.paid",
      "invoice.payment_failed",
    ].includes(payload.type)
  )
    return { received: true, ignored: true };
  let object = payload.data.object;
  if (payload.type.startsWith("invoice.")) {
    check(
      typeof object.subscription === "string",
      "Subscription invoice required",
    );
    object = await provider.api.get<Record<string, any>>(
      `/v1/subscriptions/${object.subscription}`,
      {},
    );
  }
  const proposal = await repo.get(String(object.metadata?.proposal_id));
  check(
    proposal && proposal.client_signed_at,
    "Signed proposal not found",
    404,
  );
  check(
    !object.metadata?.workspace_id ||
      object.metadata.workspace_id === repo.workspaceId,
    "Workspace mismatch",
    403,
  );
  const billing = proposal.billing_links.find((l) => l.provider === "stripe");
  check(
    billing?.external_customer_id === object.customer,
    "Webhook customer does not match signed proposal",
    403,
  );
  await mutate(repo, proposal.id, (p) => {
    if (p.jobs.some((j) => j.id === p.id + ":webhook:" + payload.id)) return;
    queue(p, "stripe_webhook", "webhook:" + payload.id, { event: payload });
    event(p, "webhook_received", system, {
      provider_event_id: payload.id,
      type: payload.type,
    });
  });
  return { received: true };
}
export async function executeStripeWebhook(
  repo: Repository,
  provider: StripeProvider,
  p: Proposal,
  j: Job,
) {
  const incoming = j.payload.event as {
    id: string;
    type: string;
    data: { object: Record<string, any> };
  };
  const object = incoming.data.object;
  if (incoming.type === "checkout.session.completed") {
    const session = await provider.api.get<Record<string, any>>(
      `/v1/checkout/sessions/${object.id}`,
      {},
    );
    check(
      session.status === "complete" &&
        session.customer ===
          p.billing_links.find((l) => l.provider === "stripe")
            ?.external_customer_id,
      "Checkout does not match customer",
    );
    const link = p.billing_links.find((l) => l.provider === "stripe")!;
    const sessions = (link.metadata?.checkout ?? []) as {
      id: string;
      line_ids: string[];
    }[];
    const expected = sessions.find((s) => s.id === session.id);
    check(expected, "Checkout was not created for this proposal");
    const lines = p.versions
      .at(-1)!
      .quote.filter((l) => expected.line_ids.includes(l.id));
    if (session.mode === "setup") {
      const intent = await provider.api.get<{
        status: string;
        payment_method: string;
      }>(`/v1/setup_intents/${session.setup_intent}`, {});
      check(intent.status === "succeeded", "Payment setup not complete");
      await provider.finishSetup(
        session.customer,
        lines,
        intent.payment_method,
        j.id,
        {
          currency: p.currency.toLowerCase(),
          proposal_id: p.id,
          proposal_title: p.title,
        },
      );
    }
    await mutate(repo, p.id, (current) => {
      const billing = current.billing_links.find(
        (l) => l.provider === "stripe",
      )!;
      const pending = (billing.metadata?.checkout ?? []) as { id: string }[];
      billing.metadata = {
        ...billing.metadata,
        checkout: pending.filter((s) => s.id !== session.id),
        requires_checkout: pending.some((s) => s.id !== session.id),
      };
      if (
        !current.events.some(
          (e) =>
            e.type === "billing_setup_completed" &&
            e.metadata.session_id === session.id,
        )
      )
        event(current, "billing_setup_completed", system, {
          session_id: session.id,
        });
    });
  } else {
    const sub = await provider.api.get<any>(
      `/v1/subscriptions/${object.subscription}`,
      {},
    );
    const line = p.versions
      .at(-1)!
      .quote.find(
        (l) =>
          l.schedule &&
          (l.stripe_lookup_key ?? `custom:${l.custom_family_id}`) ===
            sub.metadata.plan,
      );
    if (line) await provider.configureSchedule(sub, line, j.id, p.id);
    await mutate(repo, p.id, (current) => {
      if (
        !current.events.some(
          (e) =>
            e.metadata.provider_event_id === incoming.id &&
            e.type === "billing_invoice_updated",
        )
      )
        event(current, "billing_invoice_updated", system, {
          provider_event_id: incoming.id,
          type: incoming.type,
        });
    });
  }
}
