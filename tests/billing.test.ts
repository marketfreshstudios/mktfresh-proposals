import { quoteSublines, cloneQuote } from "../src/lib/quote-model";
import { expect, it } from "vitest";
import {
  bill,
  MockBillingProvider,
  paidInvoiceProgress,
  UnconfiguredBillingProvider,
} from "../src/lib/billing";
import { setup, staff, clientActor, signature } from "./helpers";
it("counts unique paid invoices against supplied schedule, never calculates a price", async () => {
  const { draft } = await setup();
  const line = {
    ...quoteSublines(draft.quote)[1],
    amount: 20000,
    schedule: {
      after_paid_invoices: 35,
      then: { amount: 9000, lookup_key: "maintenance-90" },
    },
  };
  expect(paidInvoiceProgress(line, []).remaining).toBe(35);
  expect(
    paidInvoiceProgress(line, [
      { id: "a", amount_paid: 20000, status: "paid" },
      { id: "a", amount_paid: 20000, status: "paid" },
      { id: "b", amount_paid: 10000, status: "paid" },
      { id: "c", amount_paid: 20000, status: "open" },
    ]).remaining,
  ).toBe(34);
});
it("routes one-time vs monthly, matches customers, blocks near-match, and is idempotent", async () => {
  const { service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const qbo = new MockBillingProvider("qbo"),
    stripe = new MockBillingProvider("stripe");
  qbo.customers = [
    { id: "old", email: "other@example.test", company: p.client.company },
  ];
  expect((await bill(p, "qbo", qbo)).status).toBe("needs_review");
  const sub = await bill(p, "stripe", stripe);
  expect(sub.status).toBe("succeeded");
  expect(
    (sub.metadata!.lines as { interval: string }[]).every(
      (l) => l.interval === "month",
    ),
  ).toBe(true);
  await bill(p, "stripe", stripe);
  expect(stripe.objects.size).toBe(1);
  qbo.customers = [];
  const invoice = await bill(p, "qbo", qbo);
  expect(invoice.metadata!.send_invoice).toBe(false);
  expect(
    (invoice.metadata!.lines as { interval: string }[]).every(
      (l) => l.interval === "one_time",
    ),
  ).toBe(true);
  qbo.failure = new Error("temporary failure");
  expect((await bill(p, "qbo", qbo)).status).toBe("failed");
  expect(
    (await bill(p, "qbo", new UnconfiguredBillingProvider("QBO"))).status,
  ).toBe("needs_review");
});

it("keeps supplied schedule terms and separate one-time billing", async () => {
  const { repo, service, draft } = await setup();
  const { mutate } = await import("../src/lib/repository");
  await mutate(repo, draft.id, (p) => {
    p.quote[1].schedule = {
      after_paid_invoices: 30,
      then: { amount: 10000, lookup_key: "maintenance-100" },
    };
    p.quote[1].plan_terms = {
      full_price: 275000,
      kickoff_qbo: 50000,
      build_credit_mo: 7500,
      payoff_months: 30,
    };
  });
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const result = await bill(p, "stripe", new MockBillingProvider("stripe"));
  expect(result.metadata!.schedules).toMatchObject([
    { remaining: 30, then: { amount: 10000, lookup_key: "maintenance-100" } },
  ]);
});
