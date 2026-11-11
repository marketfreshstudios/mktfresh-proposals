import {
  acceptedAdoptedStepDown,
  readStripeAdoption,
  subscriptionId,
} from "../stripe-adoption";
import {
  adoptedStripeSubscription,
  ownsCreatedStripeSubscription,
  stripeLink,
} from "../stripe-subscription-link";
import { bankPaymentState } from "./stripe-payment-state";
import {
  completedCheckouts,
  bankPayments,
  type BillingCompletion,
} from "../billing-confirmation";
import { billingLines } from "../quote-model";
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
    account?: string;
    created?: number;
    data: { object: Record<string, any> };
  };
}
export async function receiveStripeWebhook(
  repo: Repository,
  provider: StripeProvider,
  raw: string,
  signature: string,
  secret: string,
  account?: string,
) {
  const payload = verifyStripeWebhook(raw, signature, secret);
  check(
    payload.account === account,
    "Stripe webhook account does not match the connection.",
    403,
  );
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "invoice.paid",
      "invoice.payment_failed",
    ].includes(payload.type)
  )
    return { received: true, ignored: true };
  let object = payload.data.object;
  let adopted: Proposal | null = null;
  if (payload.type.startsWith("invoice.")) {
    if (
      typeof object.subscription !== "string" ||
      !subscriptionId.test(object.subscription)
    )
      return { received: true, ignored: true };
    adopted = await repo.byAdoptedStripeSubscription(object.subscription);
    object = await provider.api.get<Record<string, any>>(
      `/v1/subscriptions/${object.subscription}`,
      {},
    );
  }
  let proposal: Proposal;
  if (adopted) {
    const linked = adoptedStripeSubscription(stripeLink(adopted))!;
    check(
      object.livemode === false &&
        linked.id === object.id &&
        linked.customerId === object.customer &&
        linked.accountId === (account ?? null),
      "Webhook subscription does not match the workspace link.",
      403,
    );
    proposal = adopted;
  } else {
    if (!object.metadata?.proposal_id) return { received: true, ignored: true };
    const signed = await repo.get(String(object.metadata.proposal_id));
    check(signed && signed.client_signed_at, "Signed proposal not found", 404);
    check(
      !object.metadata?.workspace_id ||
        object.metadata.workspace_id === repo.workspaceId,
      "Workspace mismatch",
      403,
    );
    const billing = stripeLink(signed);
    check(
      billing?.external_customer_id === object.customer,
      "Webhook customer does not match signed proposal",
      403,
    );
    proposal = signed;
  }
  await mutate(repo, proposal.id, (p) => {
    if (p.jobs.some((j) => j.id === p.id + ":webhook:" + payload.id)) return;
    queue(p, "stripe_webhook", "webhook:" + payload.id, { event: payload });
    event(p, "webhook_received", system, {
      provider_event_id: payload.id,
      type: payload.type,
    });
  });
  return { received: true, proposal_id: proposal.id };
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
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
    ].includes(incoming.type)
  ) {
    check(
      typeof object.id === "string" && object.id.startsWith("cs_"),
      "Checkout session required",
    );
    const link = p.billing_links.find((l) => l.provider === "stripe")!;
    if (completedCheckouts(link).some((c) => c.session_id === object.id)) {
      await refreshCompletedBankPayment(repo, provider, p, object.id);
      return;
    }
    const session = await provider.api.get<Record<string, any>>(
      `/v1/checkout/sessions/${object.id}`,
      {},
    );
    check(
      session.livemode === false &&
        session.status === "complete" &&
        session.customer === link.external_customer_id,
      "Checkout does not match test customer",
    );
    check(
      session.metadata?.proposal_id === p.id &&
        session.metadata?.workspace_id === repo.workspaceId,
      "Checkout workspace or proposal mismatch",
    );
    const expected = (
      (link.metadata?.checkout ?? []) as {
        id: string;
        line_ids: string[];
        items?: { line_id: string; name: string }[];
        mode?: string;
        collection_method?: string;
        payment_methods?: string;
      }[]
    ).find((s) => s.id === session.id);
    check(expected, "Checkout was not created for this proposal");
    check(
      !expected.mode || expected.mode === session.mode,
      "Checkout mode changed",
    );
    check(
      ["setup", "subscription"].includes(session.mode),
      "Unsupported Checkout mode",
    );
    const lines = billingLines(p.versions.at(-1)!.quote).filter((l) =>
      expected.line_ids.includes(l.id),
    );
    check(
      lines.length > 0 &&
        lines.length === expected.line_ids.length &&
        lines.every((l) => l.interval !== "one_time"),
      "Checkout items do not match signed quote",
    );
    let ids: string[], method: any;
    // Preserve previously attempted keys and share them across all receipts for this session.
    const key =
      p.jobs.find((job) => {
        const receipt = job.payload.event as typeof incoming | undefined;
        return (
          job.kind === "stripe_webhook" &&
          receipt?.type.startsWith("checkout.session.") &&
          receipt.data.object.id === session.id
        );
      })?.id ?? `${p.id}:checkout:${session.id}`;
    if (session.mode === "setup") {
      const intent = await provider.api.get<any>(
        `/v1/setup_intents/${typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id}`,
        { "expand[]": "payment_method" },
      );
      check(
        intent.livemode === false &&
          intent.customer === session.customer &&
          intent.status === "succeeded",
        "Payment setup not complete for this test customer",
      );
      method = intent.payment_method;
      const pm = typeof method === "string" ? method : method?.id;
      check(
        typeof pm === "string" && pm.startsWith("pm_"),
        "Saved payment method required",
      );
      ids = await provider.finishSetup(session.customer, lines, pm, key, {
        currency: p.currency.toLowerCase(),
        proposal_id: p.id,
        proposal_title: p.title,
        collection_method: expected.collection_method,
      });
    } else {
      const id =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      check(
        typeof id === "string" && id.startsWith("sub_"),
        "Checkout subscription required",
      );
      ids = [id];
    }
    const subscriptions: BillingCompletion["subscriptions"] = [];
    let collection = expected.collection_method;
    let latestInvoice: string | undefined;
    const verifiedSubscriptions: any[] = [];
    for (const id of ids) {
      const sub = await provider.api.get<any>(`/v1/subscriptions/${id}`, {
        "expand[]": "default_payment_method",
      });
      check(
        sub.id === id &&
          sub.livemode === false &&
          sub.customer === session.customer,
        "Test subscription customer mismatch",
      );
      verifiedSubscriptions.push(sub);
      check(
        !expected.collection_method ||
          expected.collection_method === sub.collection_method,
        "Subscription collection method changed",
      );
      collection ??= sub.collection_method;
      method ||= sub.default_payment_method;
      latestInvoice ??=
        typeof sub.latest_invoice === "string"
          ? sub.latest_invoice
          : sub.latest_invoice?.id;
      const next =
        sub.status === "trialing" && sub.trial_end
          ? sub.trial_end
          : sub.current_period_end;
      subscriptions.push({
        id: sub.id,
        status: sub.status,
        next_billing_at:
          typeof next === "number" && next > 0
            ? new Date(next * 1000).toISOString()
            : null,
      });
    }
    if (!method && session.payment_intent) {
      const intent = await provider.api.get<any>(
        `/v1/payment_intents/${typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id}`,
        {},
      );
      check(
        intent.livemode === false && intent.customer === session.customer,
        "Test payment customer mismatch",
      );
      method = intent.payment_method;
    }
    if (!method) {
      const customer = await provider.api.get<any>(
        `/v1/customers/${session.customer}`,
        { "expand[]": "invoice_settings.default_payment_method" },
      );
      check(
        customer.id === session.customer &&
          customer.livemode === false &&
          !customer.deleted,
        "Test customer required for saved payment details",
      );
      method = customer.invoice_settings?.default_payment_method;
    }
    if (!method && latestInvoice) {
      const invoice = await provider.api.get<any>(
        `/v1/invoices/${latestInvoice}`,
        { "expand[]": "payment_intent.payment_method" },
      );
      check(
        invoice.livemode === false && invoice.customer === session.customer,
        "Test invoice customer mismatch",
      );
      if (typeof invoice.payment_intent === "string") {
        const intent = await provider.api.get<any>(
          `/v1/payment_intents/${invoice.payment_intent}`,
          {},
        );
        check(
          intent.livemode === false && intent.customer === session.customer,
          "Test payment customer mismatch",
        );
        method = intent.payment_method;
      } else method = invoice.payment_intent?.payment_method;
    }
    if (typeof method === "string")
      method = await provider.api.get<any>(`/v1/payment_methods/${method}`, {});
    if (method)
      check(
        method.livemode === false && method.customer === session.customer,
        "Test payment method customer mismatch",
      );
    if (method?.type === "card")
      check(
        typeof method.card?.brand === "string" &&
          /^\d{4}$/.test(method.card?.last4 ?? ""),
        "Saved card details incomplete",
      );
    if (method?.type === "us_bank_account") {
      const state = await bankPaymentState(
        provider.api,
        verifiedSubscriptions,
        session.customer,
      );
      await mutate(repo, p.id, (current) => {
        const billing = current.billing_links.find(
          (l) => l.provider === "stripe",
        )!;
        if (
          completedCheckouts(billing).some((c) => c.session_id === session.id)
        )
          return;
        const states = bankPayments(billing);
        const next = { state, subscription_ids: ids };
        check(
          JSON.stringify(states[session.id]) === JSON.stringify(next) ||
            JSON.stringify(states[session.id]) ===
              JSON.stringify(bankPayments(link)[session.id]),
          "Bank payment changed during verification; retry",
        );
        if (JSON.stringify(states[session.id]) !== JSON.stringify(next)) {
          billing.metadata = {
            ...billing.metadata,
            bank_payments: { ...states, [session.id]: next },
          };
          billing.metadata.requires_checkout = (
            (billing.metadata.checkout ?? []) as { id: string }[]
          ).some((c) => c.id !== session.id && !states[c.id]);
          event(current, "billing_payment_" + state, system, {
            session_id: session.id,
          });
        }
      });
      if (state !== "paid") return;
    } else {
      // The ACH option can still be paid by card; keep the card validation unchanged.
      check(
        ["paid", "no_payment_required"].includes(session.payment_status),
        "Checkout payment is not complete",
      );
    }
    check(
      verifiedSubscriptions.every((sub) =>
        ["active", "trialing"].includes(sub.status),
      ),
      "Subscription is not active yet",
    );
    const confirmation: BillingCompletion = {
      session_id: session.id,
      mode: session.mode,
      collection_method:
        collection === "send_invoice" ? "send_invoice" : "charge_automatically",
      completed_at: new Date().toISOString(),
      currency: p.currency,
      items: lines.map((l) => ({
        id: l.id,
        name: expected.items?.find((i) => i.line_id === l.id)?.name || l.name,
        amount: l.amount,
        qty: l.qty,
        interval: l.interval as "month" | "year",
      })),
      ...(method?.type === "us_bank_account"
        ? { payment_method_type: "us_bank_account" as const }
        : {}),
      card:
        method?.card && /^\d{4}$/.test(method.card.last4)
          ? { brand: String(method.card.brand), last4: method.card.last4 }
          : null,
      subscriptions,
    };
    await mutate(repo, p.id, (current) => {
      const billing = current.billing_links.find(
        (l) => l.provider === "stripe",
      )!;
      if (completedCheckouts(billing).some((c) => c.session_id === session.id))
        return;
      const pending = (billing.metadata?.checkout ?? []) as { id: string }[];
      billing.metadata = {
        ...billing.metadata,
        checkout: pending.filter((s) => s.id !== session.id),
        requires_checkout: pending.some(
          (s) => s.id !== session.id && !bankPayments(billing)[s.id],
        ),
        completed_checkout: [...completedCheckouts(billing), confirmation],
        ...(method?.type === "us_bank_account"
          ? {
              bank_payments: {
                ...bankPayments(billing),
                [session.id]: { state: "paid", subscription_ids: ids },
              },
            }
          : {}),
      };
      if (!billing.external_object_id?.startsWith("sub_"))
        billing.external_object_id = subscriptions[0]?.id;
      event(current, "billing_setup_completed", system, {
        session_id: session.id,
      });
      queue(current, "email", `billing-complete:${session.id}:client`, {
        to: current.client.email,
        email_template_key: "billing_complete",
        billing_confirmation: confirmation,
      });
      if (current.sender?.email)
        queue(current, "email", `billing-complete:${session.id}:staff`, {
          to: current.sender.email,
          email_template_key: "staff_billing_complete",
          billing_confirmation: confirmation,
        });
    });
  } else {
    const link = p.billing_links.find((l) => l.provider === "stripe")!;
    const adopted = adoptedStripeSubscription(link);
    const expansion: Record<string, string> = adopted
      ? { "expand[]": "items.data.price.product" }
      : {};
    const sub = await provider.api.get<any>(
      `/v1/subscriptions/${object.subscription}`,
      expansion,
    );
    if (adopted) {
      check(
        sub.livemode === false &&
          sub.id === adopted.id &&
          sub.customer === adopted.customerId &&
          adopted.accountId === (provider.api.accountId ?? null),
        "Invoice does not match the linked subscription.",
        403,
      );
      const identity = {
        linkedAt: adopted.linkedAt,
        linkedBy: adopted.linkedBy,
      };
      let snapshot = await readStripeAdoption(provider.api, p, sub, identity);
      const line =
        !p.archived_at && incoming.type === "invoice.paid"
          ? acceptedAdoptedStepDown(p, snapshot)
          : undefined;
      if (line) {
        await provider.configureSchedule(
          sub,
          line,
          `${p.id}:linked:${sub.id}:step-down`,
          p.id,
          { preserveMetadata: true },
        );
        const fresh = await provider.api.get<typeof sub>(
          `/v1/subscriptions/${sub.id}`,
          expansion,
        );
        check(
          fresh.id === adopted.id && fresh.customer === adopted.customerId,
          "Linked subscription changed.",
          409,
        );
        snapshot = await readStripeAdoption(provider.api, p, fresh, identity);
      }
      await mutate(repo, p.id, (current) => {
        const currentLink = stripeLink(current);
        if (
          !currentLink ||
          adoptedStripeSubscription(currentLink)?.id !== adopted.id
        )
          return;
        currentLink.metadata = {
          ...currentLink.metadata,
          adopted_subscription: snapshot,
        };
        if (
          !current.events.some(
            (e) =>
              e.type === "billing_invoice_updated" &&
              e.metadata.provider_event_id === incoming.id,
          )
        )
          event(current, "billing_invoice_updated", system, {
            provider_event_id: incoming.id,
            type: incoming.type,
          });
      });
      return;
    }
    check(
      sub.livemode === false &&
        sub.customer === link.external_customer_id &&
        sub.metadata?.proposal_id === p.id &&
        (!sub.metadata.workspace_id ||
          sub.metadata.workspace_id === repo.workspaceId),
      "Test invoice subscription/customer mismatch",
    );
    const line = billingLines(p.versions.at(-1)!.quote).find(
      (l) =>
        l.schedule &&
        (l.stripe_lookup_key ?? `custom:${l.custom_family_id}`) ===
          sub.metadata.plan,
    );
    if (line && ownsCreatedStripeSubscription(link, sub.id))
      await provider.configureSchedule(sub, line, j.id, p.id);
    const bank = (link.metadata?.bank_payments ?? {}) as Record<
      string,
      { state: string; subscription_ids: string[] }
    >;
    for (const [sessionId, payment] of Object.entries(bank)) {
      if (!payment.subscription_ids.includes(sub.id)) continue;
      const current = (await repo.get(p.id))!;
      if (
        !completedCheckouts(
          current.billing_links.find((l) => l.provider === "stripe")!,
        ).some((c) => c.session_id === sessionId)
      ) {
        // Reuse the Checkout's stable provider keys and completion/email dedupe, including setup mode.
        await executeStripeWebhook(repo, provider, current, {
          ...j,
          payload: {
            event: {
              id: incoming.id,
              type: "checkout.session.completed",
              data: { object: { id: sessionId } },
            },
          },
        });
      } else {
        await refreshCompletedBankPayment(repo, provider, current, sessionId);
      }
    }

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

async function refreshCompletedBankPayment(
  repo: Repository,
  provider: StripeProvider,
  p: Proposal,
  sessionId: string,
) {
  const link = p.billing_links.find((l) => l.provider === "stripe")!;
  const payment = bankPayments(link)[sessionId];
  if (!payment) return; // Existing card completions keep their original behavior.
  const subscriptions = await Promise.all(
    payment.subscription_ids.map((id) =>
      provider.api.get<any>(`/v1/subscriptions/${id}`, {}),
    ),
  );
  for (const [index, sub] of subscriptions.entries())
    check(
      sub.id === payment.subscription_ids[index] &&
        sub.livemode === false &&
        sub.customer === link.external_customer_id &&
        sub.metadata?.proposal_id === p.id &&
        (!sub.metadata.workspace_id ||
          sub.metadata.workspace_id === repo.workspaceId),
      "Test subscription customer mismatch",
    );
  const state = await bankPaymentState(
    provider.api,
    subscriptions,
    link.external_customer_id!,
  );
  await mutate(repo, p.id, (row) => {
    const billing = row.billing_links.find((l) => l.provider === "stripe")!;
    const latest = bankPayments(billing)[sessionId];
    check(
      JSON.stringify(latest) === JSON.stringify(payment) ||
        latest?.state === state,
      "Bank payment changed during verification; retry",
    );
    if (latest?.state !== state) {
      billing.metadata = {
        ...billing.metadata,
        bank_payments: {
          ...bankPayments(billing),
          [sessionId]: { ...payment, state },
        },
      };
      event(row, "billing_payment_" + state, system, { session_id: sessionId });
    }
  });
}
