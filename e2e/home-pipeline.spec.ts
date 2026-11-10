import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { clientActor, setup, signature, staff } from "../tests/helpers";
import { readStaffAccount, saveStaffAccount } from "../src/lib/staff-account";
import { StaffAccountPatchSchema } from "../src/lib/staff-account-model";
import type { Proposal, Quote } from "../src/lib/model";

const now = new Date("2026-11-08T14:00:00Z");
const evidence = "docs/screenshots/home-pipeline-range";
async function capture(page: Page, name: string, area?: "full" | "pipeline") {
  if (process.env.CAPTURE_HOME_PIPELINE !== "1") return;
  await page.evaluate(() => document.fonts.ready);
  await mkdir(evidence, { recursive: true });
  const path = `${evidence}/${name}.png`;
  if (area === "pipeline") {
    const clip = await page.locator(".home-pipeline").boundingBox();
    await page.screenshot({ path, clip: clip! });
  } else {
    await page.screenshot({ path, fullPage: area === "full" });
  }
}

async function fixture(page: Page, multiCurrency = false) {
  const { draft, repo, service, settings, members } = await setup();
  settings.timezone = "America/New_York";
  settings.currency = "USD";
  settings.logo = "/brand/yeswell/yeswell-logo.svg";
  settings.company_name = "MarketFresh Studios";
  const actor = {
    ...staff,
    staff_name: "Jonathan Garces",
    staff_email: staff.staff_email!,
    workspace_id: repo.workspaceId,
  };
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const quote = (monthly: number, once: number): Quote =>
    (
      [
        [monthly, "month"],
        [once, "one_time"],
      ] as const
    )
      .filter(([amount]) => amount > 0)
      .map(([amount, interval], position) => ({
        ...draft.quote[0],
        id: crypto.randomUUID(),
        position,
        sublines: [
          {
            ...draft.quote[0].sublines[0],
            id: crypto.randomUUID(),
            amount: amount * 100,
            interval,
            qty: 1,
          },
        ],
      }));

  function row(
    company: string,
    title: string,
    status: Proposal["status"],
    monthly: number,
    once: number,
    sent_at = "2026-11-02T14:00:00Z",
    valid_until: string | null = null,
  ): Proposal {
    const base = status === "signed_by_client" ? signed : sent;
    return {
      ...base,
      id: crypto.randomUUID(),
      title,
      status,
      client: { ...base.client, company },
      quote: quote(monthly, once),
      versions: [],
      signers: base.signers.map((signer) => ({
        ...signer,
        signed_at: sent_at,
      })),
      published_state: undefined,
      sent_at,
      valid_until,
      updated_at: sent_at,
      ...(status === "viewed" ? { first_viewed_at: sent_at } : {}),
    };
  }
  const cedar = row(
    "Cedar Law",
    "Local visibility",
    "sent",
    50,
    0,
    undefined,
    "2026-11-11T23:00:00Z",
  );
  const items: Proposal[] = [
    cedar,
    row(
      "Bloom Florals",
      "Social media",
      "sent",
      80,
      0,
      undefined,
      "2026-11-13T23:00:00Z",
    ),
    row(
      "Ridge Roofing",
      "Website build",
      "sent",
      160,
      500,
      undefined,
      "2026-11-15T13:00:00Z",
    ),
    row(
      "Northside Gym",
      "Website",
      "viewed",
      100,
      2750,
      undefined,
      "2026-11-15T13:30:00Z",
    ),
    row(
      "West Elm Interiors",
      "Local visibility",
      "viewed",
      75,
      0,
      undefined,
      "2026-11-15T13:45:00Z",
    ),
    row("Oak & Pine Bakery", "Care renewal", "signed_by_client", 175, 0),
    row(
      "Lumen Yoga",
      "Local visibility",
      "completed",
      295,
      4250,
      "2026-10-08T14:00:00Z",
    ),
    row(
      "Elm Street Cafe",
      "Care plan",
      "sent",
      65,
      2500,
      "2026-09-08T14:00:00Z",
    ),
    row(
      "Northside Law",
      "Support plan",
      "sent",
      90,
      1000,
      "2026-06-01T14:00:00Z",
    ),
    row(
      "Juniper LLC",
      "Website",
      "completed",
      150,
      3000,
      "2026-01-10T14:00:00Z",
    ),
    row(
      "Birch Outfitters",
      "Care and updates",
      "completed",
      200,
      4000,
      "2025-12-08T14:00:00Z",
    ),
    {
      ...row("Harbor Dental", "Website", "draft", 260, 500),
      ai_unreviewed: true,
      ai_connector: "Claude",
      sent_at: null,
    },
  ];
  items[6].billing_links = [
    {
      provider: "stripe",
      status: "failed",
      attempts: 1,
      last_error: "Checkout was not finished",
    },
  ];
  if (multiCurrency) {
    const birch = items.find(
      (proposal) => proposal.client.company === "Birch Outfitters",
    )!;
    birch.currency = "CAD";
    birch.quote[0].sublines[0].interval = "year";
  }
  const byId = new Map(items.map((proposal) => [proposal.id, proposal]));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const [, , area, id] = new URL(request.url()).pathname.split("/");
    let json: unknown = [];
    if (area === "auth") {
      json = {
        user: actor,
        settings,
        staff: members,
        account: await readStaffAccount(repo, actor),
        app_url: new URL(request.url()).origin,
      };
    } else if (area === "account" && request.method() === "PATCH") {
      json = await saveStaffAccount(
        repo,
        actor,
        StaffAccountPatchSchema.parse(request.postDataJSON()),
      );
    } else if (area === "proposals") {
      json = id ? byId.get(id) : { total: items.length, items };
    } else if (area === "connections") {
      json = { stripe: true, qbo: true, email: true, mock: true };
    } else if (area === "engagement") json = {};
    await route.fulfill({ json });
  });
  return { cedar };
}
const controls = (page: Page) => page.locator(".home-pipeline-range");
const amount = (page: Page, type: "month" | "once") =>
  page.locator(`[data-pipeline-amount="${type}"]`);
const count = (page: Page) => page.locator("[data-pipeline-count]");
const choose = (page: Page, name: string) =>
  controls(page).getByText(name, { exact: true });

test("Home animates Pipeline amounts and stage widths without moving its sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install({ time: now });
  const { cedar } = await fixture(page);
  await page.goto("/");
  await expect(count(page)).toHaveText("6 proposals");
  await expect(amount(page, "month")).toHaveText("$640/mo");
  await expect(amount(page, "once")).toHaveText("$3,250");
  const track = page.locator(".home-pipeline-bar");
  const segments = track.locator("span");
  await expect(track).toHaveCSS("border-radius", "4px");
  for (const segment of await segments.all())
    await expect(segment).toHaveCSS("border-radius", "0px");
  const initial = await segments.evaluateAll((rows) =>
    rows.map((row) => row.getBoundingClientRect().toJSON()),
  );
  expect(initial[1].left - initial[0].right).toBeCloseTo(2, 0);
  expect(initial[2].left - initial[1].right).toBeCloseTo(2, 0);
  await expect(page.locator("[data-pipeline-stage-count]")).toHaveText([
    "3 Sent",
    "2 Viewed",
    "1 Won",
  ]);
  await expect(page.locator(".home-expiring li")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "View all 5" })).toHaveAttribute(
    "href",
    "/proposals?view=expiring",
  );
  await expect(
    page.getByRole("link", { name: "Extend Local visibility" }),
  ).toHaveAttribute("href", `/proposals/${cedar.id}?view=send`);
  await expect(page.locator(".home-attention-row .btn")).toHaveText([
    "Review",
    "Sign Oak & Pine Bakery: Care renewal",
    "Remind",
    "Remind",
    "Open",
  ]);
  await expect(
    page.locator(".home-attention-row .btn:is(.action, .primary)"),
  ).toHaveCount(0);
  const attention = page.getByRole("heading", { name: "Needs your attention" });
  const attentionY = (await attention.boundingBox())!.y;
  const digits = await amount(page, "once")
    .locator(".home-pipeline-digit")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    );
  expect(new Set(digits).size).toBe(1);
  await capture(page, "home-1440", "full");

  const time = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(time + 100);
  const allTime = choose(page, "All time");
  const { x, y, width, height } = (await allTime.boundingBox())!;
  await page.mouse.click(x + width / 2, y + height / 2);
  await expect(allTime).toHaveCSS("outline-style", "none");
  await expect(amount(page, "month")).toHaveText("$640/mo");
  await capture(page, "range-0ms", "pipeline");
  await page.clock.runFor(120);
  const interimAmount = await amount(page, "month").textContent();
  expect(interimAmount).not.toBe("$640/mo");
  expect(interimAmount).not.toBe("$1,440/mo");
  expect((await segments.first().boundingBox())!.width).not.toBe(
    initial[0].width,
  );
  expect((await attention.boundingBox())!.y).toBe(attentionY);
  await capture(page, "range-120ms", "pipeline");
  await page.clock.runFor(480);
  await expect(count(page)).toHaveText("11 proposals");
  await expect(amount(page, "month")).toHaveText("$1,440/mo");
  await expect(amount(page, "once")).toHaveText("$18,000");
  await expect(page.locator("[data-pipeline-stage-count]")).toHaveText([
    "5 Sent",
    "2 Viewed",
    "4 Won",
  ]);
  expect((await attention.boundingBox())!.y).toBe(attentionY);
  await capture(page, "range-600ms", "pipeline");
  await page.clock.resume();
  await page.getByRole("link", { name: "View all 5" }).click();
  await expect(
    page.getByRole("button", { name: /Expiring.*More views/ }),
  ).toBeVisible();
  await expect(page.locator(".proposal-row")).toHaveCount(5);
  await page.goto("/");
  await page.getByRole("link", { name: "Extend Local visibility" }).click();
  await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue(
    "2026-11-11",
  );
});

test("Home range supports keyboard navigation, reduced motion, and a saved choice at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 850 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: now });
  await fixture(page);
  await page.goto("/");
  await expect(count(page)).toHaveText("6 proposals");
  await capture(page, "home-375");
  if (process.env.CAPTURE_HOME_PIPELINE === "1") {
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.setViewportSize({ width: 375, height });
    await capture(page, "home-375-full", "full");
    await page.setViewportSize({ width: 375, height: 850 });
  }
  const findings = await new AxeBuilder({ page }).include(".home-v4").analyze();
  expect(findings.violations.map((violation) => violation.id)).toEqual([]);
  const month = controls(page).getByRole("radio", { name: "This month" });
  await expect(month).toBeChecked();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/account") &&
      response.request().method() === "PATCH",
  );
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await month.press("ArrowRight");
  expect((await saved).ok()).toBe(true);
  await expect(
    controls(page).getByRole("radio", { name: "3 months" }),
  ).toBeChecked();
  await expect(count(page)).toHaveText("8 proposals");
  await expect(amount(page, "month")).toHaveText("$1,000/mo");
  await page.reload();
  await expect(
    controls(page).getByRole("radio", { name: "3 months" }),
  ).toBeChecked();
  await expect(amount(page, "month")).toHaveText("$1,000/mo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375,
  );
  await page.clock.setSystemTime(new Date("2026-06-02T14:00:00Z"));
  await page.reload();
  await expect(count(page)).toHaveText("1 proposal");
  const track = page.locator(".home-pipeline-bar");
  const segments = track.locator("span");
  await expect(segments).toHaveCount(1);
  expect((await segments.first().boundingBox())!.width).toBeCloseTo(
    (await track.boundingBox())!.width,
    0,
  );
});

test("Home keeps currency and yearly amount rows in place when a range excludes them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(now);
  await fixture(page, true);
  await page.goto("/");
  await expect(count(page)).toHaveText("6 proposals");
  const yearly = page.locator(
    '[aria-label="CAD"] [data-pipeline-amount="year"]',
  );
  await expect(yearly).toHaveText("CA$0/yr");
  await page.evaluate(() => document.fonts.ready);
  const attention = page.getByRole("heading", { name: "Needs your attention" });
  const initialY = (await attention.boundingBox())!.y;
  await choose(page, "All time").click();
  await expect(yearly).toHaveText("CA$200/yr");
  expect((await attention.boundingBox())!.y).toBe(initialY);
});

test("Pipeline range shows its focus ring for keyboard Tab only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.clock.setFixedTime(now);
  await fixture(page);
  await page.goto("/");
  const segment = choose(page, "3 months");
  const radio = controls(page).getByRole("radio", { name: "3 months" });

  await segment.click();
  await expect(radio).toBeChecked();
  await expect(segment).toHaveCSS("outline-style", "none");
  await expect(segment).toHaveCSS("box-shadow", "none");

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(radio).toBeFocused();
  await expect(segment).toHaveCSS("outline-style", "solid");

  await segment.click();
  await expect(segment).toHaveCSS("outline-style", "none");
});
