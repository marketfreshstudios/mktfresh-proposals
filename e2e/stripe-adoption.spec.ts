import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { inView } from "../src/lib/proposal-state";
import { catalogQuoteItem } from "../src/lib/quote-model";
import type { Item, Proposal } from "../src/lib/model";
import type {
  AdoptedStripeSubscription,
  StripeLinkedPrice,
} from "../src/lib/stripe-subscription-link";
import { setup, staff } from "../tests/helpers";

const screenshots = "docs/screenshots/stripe-subscription-link";
const capture = process.env.CAPTURE_STRIPE_LINK === "1";

test("billing card links a client's subscription and shows progress or recorded Stripe phases", async ({
  page,
}) => {
  const { draft, repo, members, settings } = await setup();
  const catalog = await repo.entities<Item>("pricing_items");
  const monthly = catalogQuoteItem(
    catalog.find((item) => item.stripe_lookup_key === "oiot-monthly-175")!,
    1,
    crypto.randomUUID(),
    [crypto.randomUUID()],
  );
  const proposed: Proposal = {
    ...draft,
    status: "completed",
    marked_won_by: staff.actor,
    title: "Website for Acme & Sons",
    quote: [draft.quote[0], monthly],
  };
  const original: StripeLinkedPrice = {
    id: "price_StandardFixture",
    name: "Own It Over Time — Standard",
    amount: 17500,
    currency: "usd",
    interval: "month",
    intervalCount: 1,
    quantity: 1,
    lookupKey: "oiot-monthly-175",
  };
  const next: StripeLinkedPrice = {
    ...original,
    id: "price_CareFixture",
    name: "Hosting & Care Standard",
    amount: 10000,
    lookupKey: "hosted-standard-100",
  };
  const choice = {
    id: "sub_AcmeStandard",
    status: "active",
    prices: [original],
    nextBillingAt: "2026-12-01T15:00:00.000Z",
  };
  let linked: AdoptedStripeSubscription = {
    ...choice,
    customerId: "cus_AcmeFixture",
    accountId: "acct_AcmeFixture",
    linkedAt: "2026-11-01T15:00:00.000Z",
    linkedBy: staff.actor,
    paidInvoices: 12,
    stepDown: { after: 35, price: next, automatic: false },
  };
  let chosen = false;
  const requests: unknown[] = [];
  const record = (): Proposal =>
    chosen
      ? {
          ...proposed,
          revision: proposed.revision + 1,
          billing_links: [
            {
              provider: "stripe",
              status: "succeeded",
              attempts: 0,
              external_customer_id: linked.customerId,
              external_object_id: linked.id,
              metadata: { adopted_subscription: linked },
            },
          ],
        }
      : proposed;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/").filter(Boolean).slice(1);
    let response: unknown = [];
    if (path[0] === "auth")
      response = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
      };
    if (path[0] === "connections")
      response = { stripe: true, qbo: false, email: true };
    if (path[0] === "proposals") {
      if (path[2] === "stripe-subscription") {
        if (route.request().method() === "POST") {
          requests.push(route.request().postDataJSON());
          chosen = true;
          response = record();
        } else {
          response = {
            clientId: draft.client.id,
            choices: [
              choice,
              {
                ...choice,
                id: "sub_AcmeHosting",
                prices: [next],
              },
            ],
          };
        }
      } else if (path[2] === "questions")
        response = { threads: [], can_reply: true, notified: [] };
      else if (path[2] === "engagement")
        response = {
          views: 0,
          unique_viewers: 0,
          total_ms: 0,
          sessions: [],
          targets: [],
        };
      else if (path[2] === "emails") response = [];
      else if (path[1]) response = record();
      else
        response = {
          items: [record()].filter((p) =>
            inView(p, url.searchParams.get("view") ?? "all"),
          ),
          total: 1,
        };
    }
    await route.fulfill({ json: response });
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  if (capture) await mkdir(screenshots, { recursive: true });
  const shot = async (name: string) => {
    if (capture)
      await page.screenshot({
        path: `${screenshots}/${name}.png`,
        fullPage: false,
        animations: "disabled",
      });
  };
  await page.goto("/proposals");
  await page.getByRole("button", { name: "More views", exact: true }).click();
  await page
    .getByRole("dialog", { name: "More views" })
    .getByRole("button", { name: /Billing issues/ })
    .click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Billing issues" })
      .getByText("Needs linking", { exact: true }),
  ).toBeVisible();
  await page.goto(`/proposals/${draft.id}?view=record`);
  const billing = page.locator(".record-billing-card");
  await expect(
    billing.getByText("Needs linking", { exact: true }),
  ).toBeVisible();
  await billing.scrollIntoViewIfNeeded();
  await shot("needs-linking-1440");
  await billing
    .getByRole("button", { name: "Link a Stripe subscription" })
    .click();
  const chooser = page.getByRole("dialog", {
    name: "Link a Stripe subscription",
  });
  await expect(chooser.getByRole("radio")).toHaveCount(2);
  await chooser
    .getByRole("searchbox", { name: "Search subscriptions" })
    .fill("Own It Over Time");
  await expect(chooser.getByRole("radio")).toHaveCount(1);
  await chooser.getByRole("radio", { name: /Own It Over Time/ }).check();
  expect(
    (await new AxeBuilder({ page }).include(".stripe-link-sheet").analyze())
      .violations,
  ).toEqual([]);
  await shot("choose-subscription-1440");
  await chooser
    .getByRole("button", { name: "Link subscription", exact: true })
    .click();
  expect(requests).toEqual([
    { revision: proposed.revision, subscription_id: choice.id },
  ]);
  await expect(
    billing.getByText("12 of 35 paid | steps down to $100/mo after payment 35"),
  ).toBeVisible();
  await expect(
    billing.getByRole("link", { name: "Open in Stripe" }),
  ).toHaveAttribute(
    "href",
    /dashboard\.stripe\.com\/.+\/subscriptions\/sub_AcmeStandard/,
  );
  await billing.scrollIntoViewIfNeeded();
  await shot("paid-progress-1440");
  linked = {
    ...linked,
    stepDown: undefined,
    schedule: {
      id: "sub_sched_AcmeFixture",
      phases: [
        {
          startsAt: "2026-11-01T15:00:00.000Z",
          endsAt: "2027-02-01T15:00:00.000Z",
          prices: [original],
        },
        {
          startsAt: "2027-02-01T15:00:00.000Z",
          endsAt: "2027-03-01T15:00:00.000Z",
          prices: [next],
        },
      ],
    },
  };
  await page.reload();
  await billing.getByText("Stripe schedule", { exact: true }).click();
  await expect(billing.getByText("Phase 2", { exact: true })).toBeVisible();
  await expect(
    billing.getByText("Hosting & Care Standard | $100/mo"),
  ).toBeVisible();
  await expect(billing.getByText(/of 35 paid/)).toHaveCount(0);
  await billing.scrollIntoViewIfNeeded();
  await shot("stripe-schedule-1440");
  await page.setViewportSize({ width: 375, height: 812 });
  await billing.scrollIntoViewIfNeeded();
  await expect(billing.getByText("Phase 2", { exact: true })).toBeVisible();
  await shot("stripe-schedule-375");
});
