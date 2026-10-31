import { expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "./helpers";
import { emailHtml } from "../src/lib/branding";
import { MockMailer, Worker } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import {
  completionCertificate,
  certificateTime,
} from "../src/lib/completion-certificate";
import { publicResult } from "../src/lib/service";
import { billingDisplay } from "../src/lib/billing-display";
import { quoteSublines } from "../src/lib/quote-model";
import {
  BillingItems,
  BillingRecurringTotal,
  checkoutAmount,
} from "../src/components/billing-breakdown";
import { StripeProvider } from "../src/lib/providers/stripe";
import type { BillingLine, QuoteItem } from "../src/lib/model";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("proposal and reminder HTML keep the note/brand/footer, exactly one button and no automatic pricing or printed URL", async () => {
  vi.stubEnv("APP_URL", "https://proposals.example.test");
  const { service, repo, draft, settings } = await setup();
  settings.logo = repo.workspaceId + "/logo.png";
  await repo.put("workspace_settings", settings);
  const p = await service.send(draft.id, staff, false, undefined, {
    note: "Hello Jane,\nHere is the agreed scope. <Enjoy> & thank you.",
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.now() + 4 * 86400000));
  await service.tick();
  const mailer = new MockMailer();
  await new Worker(
    repo,
    { put: async () => {}, get: async () => new Uint8Array() },
    mailer,
    {
      stripe: new MockBillingProvider("stripe"),
      qbo: new MockBillingProvider("qbo"),
    },
  ).drain(p.id, "email");
  const emails = [...mailer.sent.values()] as { html: string; text: string }[];
  expect(emails.length).toBeGreaterThanOrEqual(2);
  for (const m of emails) {
    expect(m.html.match(/<a\b/g)).toHaveLength(1);
    expect(m.html).toContain("View proposal");
    if (m.text.includes("Here is the agreed scope."))
      expect(m.html).toContain(
        "Here is the agreed scope. &lt;Enjoy&gt; &amp; thank you.",
      );
    expect(m.html).toContain("Sent by Alex Morgan at Example Studio");
    expect(m.html).toContain("/brand/logo");
    expect(m.html).not.toMatch(/One-time|Monthly|Yearly|\$2,750|\$25/);
    expect(m.html.replace(/<[^>]*>/g, "")).not.toContain("https://");
    expect(m.text).toContain(`/p/${p.token}`);
    expect(m.text).not.toContain("{{");
  }
});
it("previously queued proposal email text loses only the generated HTML URL and retains authored notes", async () => {
  const { service, draft } = await setup(),
    p = await service.send(draft.id, staff);
  const html = emailHtml(
    p,
    `A personal note.\n\nReview your proposal: https://example.test/p/${p.token}`,
    true,
  );
  expect(html).toContain("A personal note.");
  expect(html.replace(/<[^>]*>/g, "")).not.toContain("https://");
});
it("the certificate projects completion facts and actual delegation without exposing or changing internal audit data", async () => {
  const { service, draft, settings } = await setup();
  settings.timezone = "America/New_York";
  let p = await service.send(draft.id, staff);
  p = await service.view(p.token!, "", clientActor);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  p = await service.sign(
    p.id,
    companyConsent(p.revision, settings),
    "company",
    staff,
  );
  p.signers[1].applied_by = {
    user_id: "delegate",
    name: "Taylor",
    email: "taylor@example.test",
  };
  p.signers[1].authorization_text = "I am authorized to apply this signature.";
  p.events.push({
    ...p.events[0],
    id: "internal",
    type: "webhook_received",
    metadata: { secret: "DO_NOT_RENDER_INTERNAL_DATA" },
  });
  const before = JSON.stringify(p),
    v = p.versions.at(-1)!;
  const html = completionCertificate(v, p.signers, p.events, {
    settings,
    document: { id: p.id, title: p.title },
  });
  for (const text of [
    p.id,
    p.title,
    v.content_hash,
    "Version 1",
    "Certificate of completion",
    "Signed on behalf of Alex Morgan by Taylor",
    "taylor@example.test",
    "203.0.113.10",
    "America/New_York",
    "First viewed",
    'signature" src="data:image/',
  ])
    expect(html).toContain(text);
  expect(html).not.toMatch(
    /webhook_received|DO_NOT_RENDER_INTERNAL_DATA|<h2>Events/,
  );
  expect(JSON.stringify(p)).toBe(before);
});
it.each([
  ["2026-01-12T17:04:30Z", "January 12, 2026 at 12:04:30 PM EST"],
  ["2026-07-12T17:04:30Z", "July 12, 2026 at 1:04:30 PM EDT"],
])(
  "certificate timestamps use workspace timezone including DST: %s",
  (input, output) => {
    expect(certificateTime(input, "America/New_York")).toBe(output);
  },
);
it("unsigned previews and client-only copies never claim both signatures are complete", async () => {
  const { service, draft, settings } = await setup(),
    p = await service.send(draft.id, staff),
    v = p.versions[0];
  expect(completionCertificate(v, [], p.events, { settings })).toContain(
    "Unsigned preview",
  );
  const signed = await service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  expect(
    completionCertificate(v, signed.signers, signed.events, { settings }),
  ).toContain("Company countersignature pending");
});
function quote(base: QuoteItem): QuoteItem[] {
  return [
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      name: "Store Care — Pro",
      optional: false,
      order: 0,
      sublines: [
        {
          ...base.sublines[0],
          id: "00000000-0000-4000-8000-000000000005",
          amount: 32500,
          interval: "month",
          qty: 1,
        },
      ],
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000002",
      name: "Annual licence",
      optional: false,
      order: 1,
      sublines: [
        {
          ...base.sublines[0],
          id: "00000000-0000-4000-8000-000000000006",
          amount: 12000,
          interval: "year",
          qty: 1,
        },
      ],
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000003",
      name: "Website setup",
      optional: false,
      order: 2,
      sublines: [
        {
          ...base.sublines[0],
          id: "00000000-0000-4000-8000-000000000007",
          amount: 250000,
          interval: "one_time",
          qty: 1,
        },
      ],
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000004",
      name: "Declined option",
      optional: true,
      selected: false,
      default_selected: false,
      order: 3,
      sublines: [
        {
          ...base.sublines[0],
          id: "00000000-0000-4000-8000-000000000008",
          amount: 90000,
          interval: "month",
          qty: 1,
        },
      ],
    },
  ];
}
it("billing separates exactly the selected Checkout items, additions and one-time fees with per-interval amounts", async () => {
  const { draft } = await setup(),
    q = quote(draft.quote[0]);
  const result = billingDisplay(q, [
    {
      requires_checkout: true,
      checkout: [
        {
          url: "month",
          line_ids: ["00000000-0000-4000-8000-000000000005"],
          items: [
            {
              line_id: "00000000-0000-4000-8000-000000000005",
              name: "Stripe Store Care — Pro",
            },
          ],
        },
      ],
      added_existing: [{ line_ids: ["00000000-0000-4000-8000-000000000006"] }],
    },
  ]);
  expect(result.checkout[0].lines.map((l) => l.name)).toEqual([
    "Stripe Store Care — Pro",
  ]);
  expect(result.added.map((l) => l.id)).toEqual([
    "00000000-0000-4000-8000-000000000006",
  ]);
  expect(result.oneTime.map((l) => l.name)).toEqual(["Website setup"]);
  expect(checkoutAmount(result.checkout[0].lines, "USD")).toBe("$325/month");
  const html = renderToStaticMarkup(
    <>
      <BillingItems lines={result.checkout[0].lines} currency="USD" />
      <BillingRecurringTotal lines={result.checkout[0].lines} currency="USD" />
    </>,
  );
  expect(html).toContain("Monthly total today");
  expect(html).toContain("$325/month");
  expect(html).not.toMatch(
    /\$2,500|Website setup|Annual licence|Declined option/,
  );
});
it("yearly Checkout totals stay yearly and ambiguous old session groups cannot guess amounts", async () => {
  const { draft } = await setup(),
    q = quote(draft.quote[0]);
  const result = billingDisplay(q, [
    {
      requires_checkout: true,
      checkout: [{ line_ids: ["00000000-0000-4000-8000-000000000006"] }],
      added_existing: [],
    },
  ]);
  expect(checkoutAmount(result.checkout[0].lines, "USD")).toBe("$120/year");
  const html = renderToStaticMarkup(
    <BillingRecurringTotal lines={result.checkout[0].lines} currency="USD" />,
  );
  expect(html).toContain("Yearly total");
  expect(html).not.toContain("Monthly total today");
  const setupHtml = renderToStaticMarkup(
    <BillingRecurringTotal
      lines={result.checkout[0].lines}
      currency="USD"
      setup
    />,
  );
  expect(setupHtml).toContain("Yearly subscription rate");
  expect(setupHtml).not.toContain("total today");
  const unknown = billingDisplay(q, [
    {
      requires_checkout: true,
      checkout: [{ url: "a" }, { url: "b" }],
      added_existing: [],
    },
  ]);
  expect(unknown.checkout.every((s) => s.lines.length === 0)).toBe(true);
});
it("public invoice wording uses actual manual review over a configured QuickBooks adapter and exposes no internal provider IDs", async () => {
  const { draft, service } = await setup(),
    p = await service.send(draft.id, staff);
  expect(publicResult(p, { qboConnected: true }).invoice_method).toBe(
    "quickbooks",
  );
  p.billing_links.push({
    id: "qbo",
    provider: "qbo",
    status: "needs_review",
    last_error: "Invoice manually",
    attempts: 1,
    metadata: { action: "Invoice manually" },
  } as any);
  expect(publicResult(p, { qboConnected: true }).invoice_method).toBe("manual");
});
it.each([false, true])(
  "Checkout names use the actual shared product without per-client products (setup=%s)",
  async (scheduled) => {
    const { repo, draft } = await setup(),
      line = {
        ...quoteSublines(draft.quote, true).find(
          (l) => l.interval === "month",
        )!,
        name: "App display alias",
        amount: 32500,
        list_amount: 32500,
        ...(scheduled
          ? {
              schedule: {
                after_paid_invoices: 3,
                then: { lookup_key: "later", amount: 10000 },
              },
            }
          : {}),
      } as BillingLine;
    const calls: { path: string; params: any }[] = [];
    const provider = new StripeProvider(
      {
        get: async <T,>(path: string) => {
          if (path.startsWith("/v1/customers/"))
            return {
              id: "cus_test",
              invoice_settings: { default_payment_method: null },
            } as T;
          if (path === "/v1/subscriptions")
            return { data: [], has_more: false } as T;
          if (path === "/v1/prices")
            return {
              data: [
                {
                  id: "price_care",
                  lookup_key: line.stripe_lookup_key,
                  unit_amount: 32500,
                  currency: "usd",
                  recurring: { interval: "month" },
                  product: {
                    id: "prod_care",
                    name: "Store Care — Pro",
                    active: true,
                  },
                  metadata: {},
                },
              ],
              has_more: false,
            } as T;
          throw Error(path);
        },
        post: async <T,>(path: string, params: Record<string, unknown>) => {
          calls.push({ path, params });
          return {
            id: "cs_test",
            url: "https://checkout.stripe.com/test",
          } as T;
        },
      },
      repo,
    );
    const result = await provider.createObject(
      { id: "cus_test", company: "Example", email: "jane@example.test" },
      [line],
      "test",
      { currency: "usd", proposal_id: draft.id, proposal_title: draft.title },
    );
    const checkout = (result.metadata.checkout as any[])[0];
    expect(checkout.items).toEqual([
      { line_id: line.id, name: "Store Care — Pro" },
    ]);
    const request = calls.find(
      (c) => c.path === "/v1/checkout/sessions",
    )!.params;
    if (scheduled) {
      expect(request.mode).toBe("setup");
      expect(request.custom_text.submit.message).toContain(
        "Store Care — Pro · $325/month",
      );
    } else
      expect(request.line_items).toEqual([
        { price: "price_care", quantity: 1 },
      ]);
    expect(
      calls.some((c) => c.path === "/v1/products" || c.params.product_data),
    ).toBe(false);
  },
);
