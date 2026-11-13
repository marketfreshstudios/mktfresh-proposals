import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { billingFixture } from "../tests/billing-confirmation-fixture";
import { publicResult } from "../src/lib/service";
import { receiveStripeWebhook } from "../src/lib/providers/webhook";
import { proposalEmailLog } from "../src/lib/email-templates";
import { staff } from "../tests/helpers";
import { formatMoney } from "../src/lib/money";
test("verified billing: mode-specific Checkout, immediate receipt, bounded return polling, client/staff emails and record status", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const dir = ".data/evidence/billing-confirmations";
  await mkdir(`${dir}/html`, { recursive: true });
  let f = await billingFixture(),
    polls = 0;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname
      .split("/")
      .filter(Boolean)
      .slice(1);
    const p = (await f.repo.get(f.p.id))!;
    let value: unknown = [];
    if (path[0] === "public") {
      if (path[1] !== p.token)
        return route.fulfill({ status: 404, json: { error: "Not found" } });
      if (path[2] === "brand")
        value = {
          ...publicResult(p).company,
          contact: publicResult(p).contact,
        };
      else {
        if (path[2] === "state") polls++;
        value = publicResult(p);
      }
    } else if (path[0] === "auth")
      value = {
        user: staff,
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: "fixture",
      };
    else if (path[0] === "connections")
      value = { stripe: true, qbo: false, email: true, mock: true };
    else if (path[0] === "proposals")
      value =
        path[2] === "emails"
          ? await proposalEmailLog(f.repo, p.id)
          : path[1]
            ? p
            : { items: [p], total: 1 };
    else value = await f.repo.entities(path[0] as any);
    await route.fulfill({ json: value });
  });
  await page.clock.install();
  const captures: {
    file: string;
    state: string;
    width: number;
    theme: string;
  }[] = [];
  async function shot(state: string, width: number, theme: string) {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const file = `${state}-${width}-${theme}.png`;
    if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
      await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, state, width, theme });
  }
  async function record(state: string, width: number, theme: string) {
    await page.goto(`/proposals/${f.p.id}`);
    await expect(
      page.getByRole("heading", { name: "Billing", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("heading", { name: "Billing", exact: true })
      .scrollIntoViewIfNeeded();
    await shot(state, width, theme);
  }
  const messages = new Map<string, any>();
  for (const theme of ["light", "dark"]) {
    await context.addInitScript((t) => {
      if (window.top === window && location.origin === "http://127.0.0.1:3100")
        localStorage.setItem("proposal-theme", t);
    }, theme);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ["setup", "subscription"] as const) {
        f = await billingFixture(mode);
        polls = 0;
        await page.goto(`/p/${f.p.token}`);
        if (mode === "setup") {
          await expect(
            page.getByText(/^Your first invoice for .* is emailed once/),
          ).toBeVisible();
          await expect(
            page.getByText("Monthly total today", { exact: true }),
          ).toHaveCount(0);
          await expect(
            page.getByRole("link", { name: "Save a card", exact: true }),
          ).toBeVisible();
        } else {
          const paymentToday = page
            .getByRole("region", { name: "Recurring" })
            .locator(".after-total");
          await expect(
            paymentToday.getByText("First payment today", { exact: true }),
          ).toBeVisible();
          await expect(
            paymentToday.getByText(
              formatMoney(
                f.lines.reduce((sum, l) => sum + l.amount * l.qty, 0),
                f.p.currency,
              ),
              { exact: true },
            ),
          ).toBeVisible();
        }
        await shot(`checkout-${mode}`, width, theme);
        if (width === 1440 && theme === "light") {
          // The button asks Yeswell for a live Stripe page first.
          let asked = "";
          await page.route("**/api/public/*/checkout", async (route) => {
            asked = route.request().postDataJSON().session_id;
            await route.fulfill({
              json: { url: "https://checkout.stripe.com/c/pay/renewed" },
            });
          });
          await page.route("https://checkout.stripe.com/**", (route) =>
            route.fulfill({ contentType: "text/html", body: "<p>Stripe</p>" }),
          );
          await page
            .getByRole("link", {
              name: /^(Continue to secure payment|Save a card)$/,
            })
            .first()
            .click();
          await expect(page).toHaveURL(
            "https://checkout.stripe.com/c/pay/renewed",
          );
          expect(asked).toBe(f.id);
          await page.unroute("**/api/public/*/checkout");
          await page.unroute("https://checkout.stripe.com/**");
        }
        await record(`record-waiting-${mode}`, width, theme);
        await expect(
          page
            .locator(".record-billing-row")
            .getByRole("button", { name: "Resend payment link", exact: true }),
        ).toBeVisible();
        await page.goto(`/p/${f.p.token}?billing=returned&session_id=${f.id}`);
        await expect(
          page.getByRole("heading", {
            name: "Confirming your payment",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", {
            name: /^(Monthly|Yearly) billing is set up$/,
          }),
        ).toHaveCount(0);
        await shot(`return-finishing-${mode}`, width, theme);
        const r = f.signedRequest();
        await receiveStripeWebhook(
          f.repo,
          f.provider,
          r.raw,
          r.header,
          r.secret,
        );
        await f.worker.drain(f.p.id, "stripe_webhook");
        await page.clock.runFor(3100);
        await expect(
          page.getByRole("heading", {
            name: /^(Monthly|Yearly) billing is set up$/,
          }),
        ).toBeVisible();
        await expect(page.getByText(/Visa ending 4242/)).toBeVisible();
        await expect(
          page.getByText(/Next payment .* on November 30, 2026\./),
        ).toBeVisible();
        await shot(`return-confirmed-${mode}`, width, theme);
        const count = polls;
        await page.clock.runFor(9000);
        expect(polls).toBe(count);
        await f.worker.drain(f.p.id, "email");
        const sent = [...f.mailer.sent.values()] as any[];
        expect(sent).toHaveLength(2);
        for (const m of sent)
          messages.set(
            `${mode}-${m.to === f.p.client.email ? "client" : "staff"}`,
            m,
          );
        await record(`record-confirmed-${mode}`, width, theme);
        const subscription = page
          .locator(".record-billing-row")
          .filter({ hasText: "Monthly" });
        await expect(subscription.locator(".record-billing-end")).toContainText(
          "Active",
        );
        await subscription.locator("summary").click();
        await expect(
          page.getByText("Card saved", { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText("Subscription active", { exact: true }),
        ).toBeVisible();
        await expect(
          page
            .getByRole("link", {
              name: /Open subscription in Stripe test dashboard/,
            })
            .first(),
        ).toHaveAttribute(
          "href",
          /^https:\/\/dashboard.stripe.com\/test\/subscriptions\/sub_/,
        );
      }
      f = await billingFixture("subscription", "year");
      await page.goto(`/p/${f.p.token}`);
      await expect(
        page.getByRole("heading", {
          name: "Set up your yearly billing",
          exact: true,
        }),
      ).toBeVisible();
      await shot("checkout-yearly", width, theme);
      const yearlyReceipt = f.signedRequest();
      await receiveStripeWebhook(
        f.repo,
        f.provider,
        yearlyReceipt.raw,
        yearlyReceipt.header,
        yearlyReceipt.secret,
      );
      await f.worker.drain(f.p.id, "stripe_webhook");
      await page.goto(`/p/${f.p.token}?billing=returned&session_id=${f.id}`);
      await expect(
        page.getByRole("heading", {
          name: /^(Monthly|Yearly) billing is set up$/,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(/Next payment .* on October 31, 2027\./),
      ).toBeVisible();
      await shot("return-confirmed-yearly", width, theme);
      f = await billingFixture();
      polls = 0;
      await page.goto(`/p/${f.p.token}?billing=returned`);
      await expect(
        page.getByRole("heading", {
          name: "Confirming your payment",
          exact: true,
        }),
      ).toBeVisible();
      await page.clock.fastForward(61000);
      await expect(
        page.getByRole("heading", {
          name: "Still confirming your payment",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText("You don’t need to pay again.", { exact: false }),
      ).toBeVisible();
      expect(polls).toBeLessThanOrEqual(21);
      await shot("return-timeout", width, theme);
      const count = polls;
      await page.clock.runFor(12000);
      expect(polls).toBe(count);
      await expect(
        page.getByRole("heading", {
          name: /^(Monthly|Yearly) billing is set up$/,
        }),
      ).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
  for (const [key, m] of messages) {
    await writeFile(`${dir}/html/${key}.html`, m.html);
    await writeFile(`${dir}/html/${key}.txt`, m.text);
    const email = await context.newPage();
    for (const theme of ["light", "dark"] as const) {
      await email.emulateMedia({ colorScheme: theme });
      for (const width of [375, 600]) {
        await email.setViewportSize({ width, height: 950 });
        await email.setContent(m.html);
        await expect(email.locator("a.email-cta")).toHaveCount(1);
        expect(
          await email.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const file = `email-${key}-${width}-${theme}.png`;
        if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
          await email.screenshot({ path: `${dir}/${file}`, fullPage: true });
        captures.push({ file, state: `email-${key}`, width, theme });
      }
    }
    await email.close();
  }
  if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
    await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
