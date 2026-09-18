import { expect, it } from "vitest";
import {
  bill,
  MockBillingProvider,
  oiOTSchedule,
  UnconfiguredBillingProvider,
} from "../src/lib/billing";
import { setup, staff, clientActor, signature } from "./helpers";
it("ports legacy and current OIOT buyout math without credits for unpaid invoices", () => {
  expect(oiOTSchedule(375000, 112500, []).remaining).toBe(35);
  expect(oiOTSchedule(275000, 50000, []).remaining).toBe(30);
  expect(
    oiOTSchedule(275000, 50000, [
      { amount_paid: 17500, status: "paid" },
      { amount_paid: 10000, status: "paid" },
      { amount_paid: 17500, status: "open" },
    ]).remaining,
  ).toBe(29);
  expect(
    oiOTSchedule(
      275000,
      50000,
      Array.from({ length: 30 }, () => ({
        amount_paid: 17500,
        status: "paid",
      })),
    ).action,
  ).toBe("switch_now");
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
    (sub.metadata!.lines as { billing: string }[]).every(
      (l) => l.billing === "monthly",
    ),
  ).toBe(true);
  await bill(p, "stripe", stripe);
  expect(stripe.objects.size).toBe(1);
  qbo.customers = [];
  const invoice = await bill(p, "qbo", qbo);
  expect(invoice.metadata!.send_invoice).toBe(false);
  expect(
    (invoice.metadata!.lines as { billing: string }[]).every(
      (l) => l.billing === "one_time",
    ),
  ).toBe(true);
  qbo.failure = new Error("temporary failure");
  expect((await bill(p, "qbo", qbo)).status).toBe("failed");
  expect(
    (await bill(p, "qbo", new UnconfiguredBillingProvider("QBO"))).status,
  ).toBe("needs_review");
});

it("preserves OIOT kickoff separation and subscription scheduling metadata", async () => {
  const { repo, service, draft } = await setup();
  const items =
    await repo.entities<import("../src/lib/model").Item>("pricing_items");
  const kickoff = items.find((i) => i.sku === "oiot-kickoff")!,
    monthly = items.find((i) => i.sku === "oiot-monthly")!;
  const { mutate } = await import("../src/lib/repository");
  await mutate(repo, draft.id, (p) => {
    p.quote = [kickoff, monthly].map((i) => ({
      ...i,
      qty: 1,
      optional: false,
      selected: true,
    }));
    p.oiot = { full_price: 275000, kickoff: 50000, pages: 5 };
  });
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const qbo = await bill(p, "qbo", new MockBillingProvider("qbo")),
    stripe = await bill(p, "stripe", new MockBillingProvider("stripe"));
  expect(
    (qbo.metadata!.lines as { unit_price: number }[]).map((l) => l.unit_price),
  ).toEqual([50000]);
  expect(
    (stripe.metadata!.lines as { unit_price: number }[]).map(
      (l) => l.unit_price,
    ),
  ).toEqual([17500]);
  expect(stripe.metadata!.oiot).toMatchObject({
    remaining: 30,
    after_cents: 10000,
    build_credit_cents: 7500,
    proration_behavior: "none",
    kickoff_billed_in: "qbo",
  });
});
