import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { billingFixture } from "./billing-confirmation-fixture";
import { receiveStripeWebhook } from "../src/lib/providers/webhook";
import {
  completedCheckouts,
  publicCompletion,
  stripeBillingStatus,
} from "../src/lib/billing-confirmation";
import { billingDisplay } from "../src/lib/billing-display";
import { publicResult, queue } from "../src/lib/service";
import { mutate } from "../src/lib/repository";
import {
  proposalEmailLog,
  saveEmailTemplate,
  plainBody,
} from "../src/lib/email-templates";
import { staff } from "./helpers";
beforeEach(() => vi.stubEnv("APP_URL", "https://proposals.example.test"));
afterEach(() => vi.unstubAllEnvs());
async function receive(
  f: Awaited<ReturnType<typeof billingFixture>>,
  id?: string,
  type?: string,
) {
  const r = f.signedRequest(id, type);
  return receiveStripeWebhook(f.repo, f.provider, r.raw, r.header, r.secret);
}
for (const mode of ["setup", "subscription"] as const)
  it(`${mode}: verified completion saves facts, emails client and sender once, and preserves signed snapshots`, async () => {
    const f = await billingFixture(mode),
      before = structuredClone(f.p.versions);
    await saveEmailTemplate(f.repo, staff, "billing_complete", {
      subject: "All arranged: {{proposal.title}}",
      body: plainBody("Thank you {{client.first_name}}."),
      button_label: "View your signed proposal",
    });
    await receive(f);
    await f.worker.drain(f.p.id, "stripe_webhook");
    const p = (await f.repo.get(f.p.id))!,
      link = p.billing_links[0],
      confirmed = completedCheckouts(link);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]).toMatchObject({
      mode,
      card: { brand: "visa", last4: "4242" },
      items: f.lines.map((l) => ({
        id: l.id,
        name: l.name,
        amount: l.amount,
        qty: l.qty,
        interval: l.interval,
      })),
    });
    expect(link.metadata?.requires_checkout).toBe(false);
    expect(link.external_object_id).toMatch(/^sub_/);
    expect(p.versions).toEqual(before);
    expect(stripeBillingStatus(link).labels).toEqual([
      "Card saved",
      "Subscription active",
    ]);
    const exposed = publicResult(p).billing[0].confirmations![0];
    expect(exposed).toMatchObject({
      checkout_session_id: f.id,
      next_billing_at: "2026-11-30T17:00:00.000Z",
    });
    expect(JSON.stringify(exposed)).not.toMatch(/sub_|cus_|pm_fixture|seti_/);
    await f.worker.drain(p.id, "email");
    const emails = [...f.mailer.sent.values()] as any[];
    expect(emails).toHaveLength(2);
    expect(emails.map((m) => m.to).sort()).toEqual(
      [p.client.email, p.sender!.email].sort(),
    );
    for (const m of emails) {
      expect(m.text).toContain("Visa ending 4242");
      expect(m.text).toContain("Next billing date: November 30, 2026");
      expect(m.text).toContain(f.lines[0].name);
      expect(m.html.match(/class="email-cta"/g)).toHaveLength(1);
      expect(m.from).toContain(p.sender!.email);
    }
    expect(emails.find((m) => m.to === p.client.email).html).toContain(
      "View your signed proposal",
    );
    expect(await proposalEmailLog(f.repo, p.id)).toHaveLength(2);
    const posts = f.calls.filter((c) => c.path === "/v1/subscriptions");
    expect(posts).toHaveLength(mode === "setup" ? f.lines.length : 0);
    await receive(f, "evt_second", "checkout.session.async_payment_succeeded");
    await f.worker.drain(p.id);
    const replay = (await f.repo.get(p.id))!;
    expect(completedCheckouts(replay.billing_links[0])).toEqual(confirmed);
    expect(
      replay.events.filter((e) => e.type === "billing_setup_completed"),
    ).toHaveLength(1);
    expect(f.mailer.sent.size).toBe(2);
    expect(f.calls.filter((c) => c.path === "/v1/subscriptions")).toHaveLength(
      posts.length,
    );
  });
it("unpaid, incomplete, mismatched, live and inactive subscriptions never produce a success receipt", async () => {
  for (const change of [
    "unpaid",
    "open",
    "customer",
    "live",
    "inactive",
    "workspace",
    "card",
  ]) {
    const f = await billingFixture("subscription");
    if (change === "unpaid") f.session.payment_status = "unpaid";
    if (change === "open") f.session.status = "open";
    if (change === "customer") f.session.customer = "cus_other";
    if (change === "live") f.session.livemode = true;
    if (change === "inactive")
      f.subscriptions.get("sub_fixture").status = "incomplete";
    if (change === "workspace") f.session.metadata.workspace_id = "other";
    if (change === "card") f.method.card.last4 = "";
    await receive(f);
    await f.worker.drain(f.p.id, "stripe_webhook");
    const p = (await f.repo.get(f.p.id))!;
    expect(completedCheckouts(p.billing_links[0])).toEqual([]);
    expect(p.billing_links[0].metadata?.requires_checkout).toBe(true);
    expect(p.events.some((e) => e.type === "billing_setup_completed")).toBe(
      false,
    );
    expect(p.jobs.find((j) => j.kind === "stripe_webhook")?.status).toBe(
      "pending",
    );
  }
});
it("permission failures retry with stable session-based subscription keys; a later workspace change cannot turn a promised invoice into a charge", async () => {
  const f = await billingFixture();
  f.denyPaymentMethods(true);
  await f.repo.put("workspace_settings", {
    ...f.settings,
    collection_method: "charge_automatically",
  });
  await receive(f);
  await f.worker.drain(f.p.id, "stripe_webhook");
  let p = (await f.repo.get(f.p.id))!;
  expect(completedCheckouts(p.billing_links[0])).toEqual([]);
  expect(p.jobs.find((j) => j.kind === "stripe_webhook")?.last_error).toContain(
    "payment_methods_read",
  );
  f.denyPaymentMethods(false);
  await mutate(f.repo, p.id, (row) => {
    row.jobs
      .filter((j) => j.kind === "stripe_webhook")
      .forEach((j) => (j.available_at = new Date(0).toISOString()));
  });
  await f.worker.drain(p.id, "stripe_webhook");
  p = (await f.repo.get(p.id))!;
  expect(completedCheckouts(p.billing_links[0])).toHaveLength(1);
  const attempts = f.calls.filter((c) => c.path === "/v1/subscriptions");
  expect(attempts.length).toBeGreaterThan(1);
  expect(new Set(attempts.map((c) => c.key)).size).toBe(f.lines.length);
  expect(
    attempts.every((c) => c.params.collection_method === "send_invoice"),
  ).toBe(true);
});
it("completing one Checkout retains the other group and only exposes its own verified facts", async () => {
  const f = await billingFixture();
  await mutate(f.repo, f.p.id, (p) => {
    const checkout = p.billing_links[0].metadata!.checkout as any[];
    checkout.push({
      ...checkout[0],
      id: "cs_other",
      url: "https://checkout.stripe.com/other",
    });
  });
  await receive(f);
  await f.worker.drain(f.p.id, "stripe_webhook");
  const p = (await f.repo.get(f.p.id))!;
  expect(p.billing_links[0].metadata?.requires_checkout).toBe(true);
  expect(publicResult(p).billing[0].checkout).toHaveLength(1);
  expect(publicResult(p).billing[0].confirmations).toHaveLength(1);
  expect(
    publicCompletion(completedCheckouts(p.billing_links[0])[0]),
  ).not.toHaveProperty("subscriptions");
});
it("concurrent duplicate event IDs for one completed Checkout cannot create another subscription or confirmation", async () => {
  const f = await billingFixture();
  await Promise.all([
    receive(f, "evt_concurrent_a"),
    receive(f, "evt_concurrent_b"),
  ]);
  await Promise.all([
    f.worker.drain(f.p.id, "stripe_webhook"),
    f.worker.drain(f.p.id, "stripe_webhook"),
  ]);
  const p = (await f.repo.get(f.p.id))!;
  expect(completedCheckouts(p.billing_links[0])).toHaveLength(1);
  expect(
    p.events.filter((e) => e.type === "billing_setup_completed"),
  ).toHaveLength(1);
  expect(
    p.jobs.filter((j) => j.payload.email_template_key === "billing_complete"),
  ).toHaveLength(1);
  expect(
    new Set(
      f.calls.filter((c) => c.path === "/v1/subscriptions").map((c) => c.key),
    ).size,
  ).toBe(f.lines.length);
});
it("yearly rates remain yearly and unknown next billing dates are omitted", async () => {
  const f = await billingFixture("subscription", "year");
  f.subscriptions.get("sub_fixture").current_period_end = null;
  await receive(f);
  await f.worker.drain(f.p.id);
  const p = (await f.repo.get(f.p.id))!;
  const c = publicResult(p).billing[0].confirmations![0];
  expect(c.items.every((i) => i.interval === "year")).toBe(true);
  expect(c.next_billing_at).toBeNull();
  const m = [...f.mailer.sent.values()] as any[];
  expect(
    m.every(
      (m) =>
        m.text.includes("/year") &&
        !m.text.includes("/month") &&
        !m.text.includes("Next billing date"),
    ),
  ).toBe(true);
});
it("receipt product names are escaped literal data, including braces and HTML-like text", async () => {
  const f = await billingFixture();
  await mutate(f.repo, f.p.id, (p) => {
    (p.billing_links[0].metadata!.checkout as any[])[0].items[0].name =
      "Service {{literal.name}} <included>";
  });
  await receive(f);
  await f.worker.drain(f.p.id);
  expect(f.mailer.sent.size).toBe(2);
  for (const m of [...f.mailer.sent.values()] as any[]) {
    expect(m.text).toContain("Service {{literal.name}} <included>");
    expect(m.html).toContain("Service {{literal.name}} &lt;included&gt;");
  }
});
it("inherited customer payment details are read only from the linked test customer", async () => {
  const f = await billingFixture("subscription");
  f.subscriptions.get("sub_fixture").default_payment_method = null;
  await receive(f);
  await f.worker.drain(f.p.id, "stripe_webhook");
  const c = completedCheckouts((await f.repo.get(f.p.id))!.billing_links[0])[0];
  expect(c.card).toEqual({ brand: "visa", last4: "4242" });
  expect(f.calls.some((c) => c.path === "/v1/customers/cus_fixture")).toBe(
    true,
  );
  expect(f.calls.some((c) => c.path.startsWith("/v1/invoices/"))).toBe(false);
});

it("client preview follows the workspace collection method without creating Checkout or charging", async () => {
  const f = await billingFixture();
  expect(
    billingDisplay(f.p.quote, [], true, "send_invoice").checkout[0].mode,
  ).toBe("setup");
  expect(
    billingDisplay(f.p.quote, [], true, "charge_automatically").checkout[0]
      .mode,
  ).toBe("subscription");
  expect(f.calls).toEqual([]);
});

it("one bounded proposal drain processes its verified webhook before older notifications", async () => {
  const f = await billingFixture();
  await mutate(f.repo, f.p.id, (p) =>
    queue(p, "email", "older-notice", {
      to: p.sender!.email,
      email_template_key: "staff_viewed",
    }),
  );
  await receive(f);
  const result = await f.worker.drain(f.p.id);
  expect(result[0].job).toContain(":webhook:");
  expect(
    (await f.repo.get(f.p.id))!.jobs.every((j) => j.status === "done"),
  ).toBe(true);
});
