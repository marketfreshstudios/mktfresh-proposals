import { expect, it } from "vitest";
import { billingFixture } from "./billing-confirmation-fixture";
import {
  executeStripeWebhook,
  receiveStripeWebhook,
} from "../src/lib/providers/webhook";
import {
  bankPayments,
  completedCheckouts,
  stripeBillingStatus,
} from "../src/lib/billing-confirmation";
import { publicResult, queue } from "../src/lib/service";
import { mutate } from "../src/lib/repository";

async function bankFixture(mode: "setup" | "subscription") {
  const f = await billingFixture(mode);
  f.method.type = "us_bank_account";
  delete (f.method as any).card;
  f.session.payment_status =
    mode === "setup" ? "no_payment_required" : "unpaid";
  await mutate(f.repo, f.p.id, (p) => {
    (p.billing_links[0].metadata!.checkout as any[])[0].payment_methods =
      "card_ach";
  });
  const freshInvoice = (sub: any, state: "processing" | "failed" | "paid") => ({
    id: sub.latest_invoice,
    livemode: false,
    customer: "cus_fixture",
    subscription: sub.id,
    status: state === "paid" ? "paid" : "open",
    paid: state === "paid",
    payment_intent: {
      id: "pi_fixture",
      livemode: false,
      customer: "cus_fixture",
      status:
        state === "paid"
          ? "succeeded"
          : state === "failed"
            ? "requires_payment_method"
            : "processing",
      ...(state === "failed"
        ? { last_payment_error: { code: "insufficient_funds" } }
        : {}),
    },
  });
  // Setup-mode subscriptions are created on receipt. Supply invoices through the actual transport.
  const get = f.provider.api.get.bind(f.provider.api);
  let state: "processing" | "failed" | "paid" = "processing";
  f.provider.api.get = async <T>(
    path: string,
    params: Record<string, string>,
  ) => {
    const sub = [...f.subscriptions.values()].find(
      (s) => path === `/v1/invoices/${s.latest_invoice}`,
    );
    return sub ? (freshInvoice(sub, state) as T) : get<T>(path, params);
  };
  async function receipt(id: string, type: string, drain = true) {
    const r = f.signedRequest(id, type);
    await receiveStripeWebhook(f.repo, f.provider, r.raw, r.header, r.secret);
    if (drain) await f.worker.drain(f.p.id, "stripe_webhook");
    return (await f.repo.get(f.p.id))!;
  }
  return {
    ...f,
    receipt,
    payment: (v: typeof state) => {
      state = v;
      f.session.payment_status = v === "paid" ? "paid" : "unpaid";
    },
  };
}
for (const mode of ["subscription", "setup"] as const) {
  it(`${mode}: bank setup/completed Checkout is processing, not paid; invoice.paid completes exactly once`, async () => {
    const f = await bankFixture(mode);
    const versions = structuredClone(f.p.versions);
    let p = await f.receipt("evt_checkout", "checkout.session.completed");
    expect(completedCheckouts(p.billing_links[0])).toEqual([]);
    expect(bankPayments(p.billing_links[0])[f.id].state).toBe("processing");
    expect(stripeBillingStatus(p.billing_links[0]).labels).toEqual([
      "Bank payment processing",
    ]);
    expect(publicResult(p).billing[0]).toMatchObject({
      payment_state: "processing",
      requires_checkout: false,
      checkout: [],
    });
    expect(
      p.jobs
        .filter((j) => j.kind === "stripe_webhook")
        .every((j) => j.status === "done"),
    ).toBe(true);
    await f.worker.drain(p.id, "email");
    expect(f.mailer.sent.size).toBe(0);
    // A success-shaped event is not proof; current unpaid invoice wins.
    await f.receipt("evt_early_paid", "invoice.paid");
    await f.receipt(
      "evt_early_async",
      "checkout.session.async_payment_succeeded",
    );
    expect(
      completedCheckouts((await f.repo.get(p.id))!.billing_links[0]),
    ).toEqual([]);
    f.payment("paid");
    p = await f.receipt("evt_paid", "invoice.paid");
    expect(completedCheckouts(p.billing_links[0])).toHaveLength(1);
    expect(stripeBillingStatus(p.billing_links[0]).labels).toEqual([
      "Subscription active",
    ]);
    await f.worker.drain(p.id, "email");
    expect(f.mailer.sent.size).toBe(2);
    // Duplicate and stale failure receipts after success re-read the paid invoice.
    await f.receipt("evt_paid", "invoice.paid");
    await f.receipt("evt_late_completed", "checkout.session.completed");
    await f.receipt("evt_late_failed", "invoice.payment_failed");
    await f.receipt(
      "evt_late_async_failed",
      "checkout.session.async_payment_failed",
    );
    await f.worker.drain(p.id);
    p = (await f.repo.get(p.id))!;
    expect(bankPayments(p.billing_links[0])[f.id].state).toBe("paid");
    expect(completedCheckouts(p.billing_links[0])).toHaveLength(1);
    expect(p.jobs.filter((j) => j.kind === "email")).toHaveLength(2);
    expect(f.mailer.sent.size).toBe(2);
    expect(p.versions).toEqual(versions);
    const creates = f.calls.filter((c) => c.path === "/v1/subscriptions");
    expect(new Set(creates.map((c) => c.key)).size).toBe(
      mode === "setup" ? f.lines.length : 0,
    );
  });
  it(`${mode}: async failure and invoice failure are durable, never successful, and later recovery works`, async () => {
    const f = await bankFixture(mode);
    f.payment("failed");
    let p = await f.receipt(
      "evt_failure_first",
      "checkout.session.async_payment_failed",
    );
    await f.receipt("evt_failure_invoice", "invoice.payment_failed");
    p = await f.receipt("evt_old_completed", "checkout.session.completed");
    expect(completedCheckouts(p.billing_links[0])).toEqual([]);
    expect(stripeBillingStatus(p.billing_links[0]).labels).toEqual([
      "Bank payment failed",
    ]);
    await f.worker.drain(p.id, "email");
    expect(f.mailer.sent.size).toBe(0);
    expect(
      p.events.filter((e) => e.type === "billing_payment_failed"),
    ).toHaveLength(1);
    f.payment("paid");
    await f.receipt(
      "evt_recovered",
      "checkout.session.async_payment_succeeded",
    );
    await f.worker.drain(p.id, "email");
    expect(f.mailer.sent.size).toBe(2);
  });
}
it("invoice.paid before Checkout receipt and parallel receipts cannot lose or duplicate completion", async () => {
  const f = await bankFixture("subscription");
  f.payment("paid");
  await f.receipt("evt_invoice_first", "invoice.paid");
  expect(
    completedCheckouts((await f.repo.get(f.p.id))!.billing_links[0]),
  ).toHaveLength(0);
  await f.receipt("evt_one", "checkout.session.completed", false);
  await f.receipt("evt_two", "checkout.session.async_payment_succeeded", false);
  const p = (await f.repo.get(f.p.id))!;
  const jobs = p.jobs.filter(
    (j) => (j.payload.event as any)?.id !== "evt_invoice_first",
  );
  await Promise.all(
    jobs.map((j) => executeStripeWebhook(f.repo, f.provider, p, j)),
  );
  await f.worker.drain(p.id);
  const result = (await f.repo.get(p.id))!;
  expect(completedCheckouts(result.billing_links[0])).toHaveLength(1);
  expect(result.jobs.filter((j) => j.kind === "email")).toHaveLength(2);
  expect(f.mailer.sent.size).toBe(2);
});
it("a later failed ACH invoice removes the active label; a stale paid event cannot restore it", async () => {
  const f = await bankFixture("subscription");
  f.payment("paid");
  await f.receipt("evt_first", "checkout.session.completed");
  await f.worker.drain(f.p.id, "email");
  f.payment("failed");
  await f.receipt(
    "evt_renewal_failed",
    "checkout.session.async_payment_failed",
  );
  const p = await f.receipt("evt_stale_paid", "invoice.paid");
  expect(stripeBillingStatus(p.billing_links[0]).labels).toEqual([
    "Bank payment failed",
  ]);
  expect(publicResult(p).billing[0].payment_state).toBe("failed");
  await f.worker.drain(p.id, "email");
  expect(f.mailer.sent.size).toBe(2);
});

it("a retried billing job cannot overwrite a bank update that arrives after its read", async () => {
  const f = await bankFixture("subscription");
  await f.receipt("evt_processing", "checkout.session.completed");
  await mutate(f.repo, f.p.id, (p) => queue(p, "billing", "retry-payment", {}));
  const get = f.repo.get.bind(f.repo);
  let runningReads = 0;
  f.repo.get = async (id: string) => {
    const p = await get(id);
    if (
      p?.jobs.some((j) => j.kind === "billing" && j.status === "running") &&
      ++runningReads === 2
    ) {
      await mutate(f.repo, id, (current) => {
        bankPayments(current.billing_links[0])[f.id].state = "failed";
      });
    }
    return p;
  };
  await f.worker.drain(f.p.id, "billing");
  expect(runningReads).toBeGreaterThanOrEqual(2);
  expect(
    bankPayments(
      (await get(f.p.id))!.billing_links.find((l) => l.provider === "stripe")!,
    )[f.id].state,
  ).toBe("failed");
});

it("choosing Card in a Card + ACH Checkout keeps immediate verified card completion", async () => {
  const f = await billingFixture("subscription");
  await mutate(f.repo, f.p.id, (p) => {
    (p.billing_links[0].metadata!.checkout as any[])[0].payment_methods =
      "card_ach";
  });
  const r = f.signedRequest();
  await receiveStripeWebhook(f.repo, f.provider, r.raw, r.header, r.secret);
  await f.worker.drain(f.p.id);
  const p = (await f.repo.get(f.p.id))!;
  expect(bankPayments(p.billing_links[0])).toEqual({});
  expect(stripeBillingStatus(p.billing_links[0]).labels).toEqual([
    "Card saved",
    "Subscription active",
  ]);
  expect(f.mailer.sent.size).toBe(2);
});
it.each(["livemode", "customer", "subscription"])(
  "bank completion refuses a mismatched %s invoice",
  async (field) => {
    const f = await bankFixture("subscription");
    f.payment("paid");
    const get = f.provider.api.get.bind(f.provider.api);
    f.provider.api.get = async <T>(
      path: string,
      params: Record<string, string>,
    ) => {
      const value = await get<any>(path, params);
      if (path.startsWith("/v1/invoices/"))
        value[field] =
          field === "livemode" ? true : "another_customer_or_subscription";
      return value as T;
    };
    const p = await f.receipt("evt_mismatch", "checkout.session.completed");
    expect(completedCheckouts(p.billing_links[0])).toEqual([]);
    expect(p.jobs.find((j) => j.kind === "stripe_webhook")).toMatchObject({
      status: "pending",
      last_error: "Test invoice subscription/customer mismatch",
    });
    await f.worker.drain(p.id, "email");
    expect(f.mailer.sent.size).toBe(0);
  },
);
