import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { engagementTargets, publicEngagement } from "../src/lib/engagement";
import {
  engagementReport,
  startEngagement,
  recordEngagement,
  engagementBot,
} from "../src/lib/engagement-server";
import { publicResult } from "../src/lib/service";
import { clientActor } from "../tests/helpers";
import { pdfPreview } from "../src/lib/pdf-preview";

test.beforeEach(() => {
  process.env.APP_MODE = "local";
});

async function capture(page: Page, name: string, panel = false) {
  if (process.env.CAPTURE_ENGAGEMENT !== "1") return;
  mkdirSync("docs/screenshots/engagement", { recursive: true });
  if (panel)
    await page.locator(".engagement-panel").screenshot({
      path: `docs/screenshots/engagement/${name}.png`,
      animations: "disabled",
    });
  else
    await page.screenshot({
      path: `docs/screenshots/engagement/${name}.png`,
      animations: "disabled",
    });
}
async function fixture(page: Page) {
  const f = await editorFixture(page);
  const extra = structuredClone(f.active().quote[0]);
  extra.id = crypto.randomUUID();
  extra.name = "Optional case study";
  extra.optional = true;
  extra.selected = false;
  extra.default_selected = false;
  extra.choice_group_id = null;
  extra.sublines = extra.sublines.map((line) => ({
    ...line,
    id: crypto.randomUUID(),
  }));
  await f.editRemote({
    content: [
      ...f.content,
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
    quote: [...f.active().quote, extra],
  });
  const preview = await pdfPreview(
    f.repo,
    { get: async () => new Uint8Array(), put: async () => {} },
    f.active(),
    f.settings,
  );
  await f.editRemote({
    pagination: {
      format: 1,
      pages: preview.layout.pages,
      starts: preview.layout.boundaries.map(
        ({ page, block, offset, explicit, unit, part }) => ({
          page,
          block,
          offset,
          explicit,
          ...(unit ? { unit } : {}),
          ...(part ? { part } : {}),
        }),
      ),
    },
  });
  const p = await f.sendRemote();
  await page.route(
    (url) => url.pathname === "/api/proposals",
    async (route) =>
      route.fulfill({ json: { items: [(await f.repo.get(p.id))!], total: 1 } }),
  );
  await page.route(
    (url) => url.pathname === `/api/proposals/${p.id}`,
    async (route) => route.fulfill({ json: (await f.repo.get(p.id))! }),
  );

  await page.route("**/api/engagement", async (route) => {
    const a = await f.repo.engagementSummary(p.id);
    await route.fulfill({ json: a ? { [p.id]: publicEngagement(a) } : {} });
  });
  await page.route("**/api/proposals/*/engagement", async (route) =>
    route.fulfill({
      json: await engagementReport(f.repo, (await f.repo.get(p.id))!),
    }),
  );
  return { ...f, p };
}
function qualifiedClientResult(p: Parameters<typeof publicResult>[0]) {
  return publicResult(p, { engagementAllowed: true });
}
async function clientRoutes(
  context: BrowserContext,
  f: Awaited<ReturnType<typeof fixture>>,
) {
  let offset = 0;
  const now = () => Date.now() + offset;
  const batches: any[] = [];
  await context.route("**/api/public/**", async (route) => {
    const parts = new URL(route.request().url()).pathname.split("/"),
      req = route.request();
    try {
      const p = (await f.repo.get(f.p.id))!;
      let result: unknown;
      if (parts[4] === "brand")
        result = {
          ...qualifiedClientResult(p).company,
          contact: qualifiedClientResult(p).contact,
        };
      else if (parts[4] === "engagement") {
        if (engagementBot(new Headers(req.headers())))
          result = { ignored: true };
        else if (parts[5] === "start") {
          const input = req.postDataJSON();
          const start = await startEngagement(f.repo, p, input, now());
          if (input.intent === "read")
            await f.service.view(p.token!, "", {
              ...clientActor,
              ip: "",
              user_agent: "",
            });
          result = { ticket: start.ticket, targets: engagementTargets(p) };
        } else {
          const batch = req.postDataJSON();
          batches.push(batch);
          await recordEngagement(
            f.repo,
            p,
            batch.ticket,
            batch.snapshot,
            now(),
          );
          result = { accepted: true };
        }
      } else if (parts[4] === "quote")
        result = qualifiedClientResult(
          await f.service.toggle(p.token!, "", req.postDataJSON(), clientActor),
        );
      else result = qualifiedClientResult(await f.service.byToken(p.token!));
      await route.fulfill({ json: result });
    } catch (error) {
      console.error("Engagement fixture request", parts[4], String(error));
      await route.fulfill({
        status: (error as any).status ?? 400,
        json: { error: String(error) },
      });
    }
  });
  return {
    batches,
    advance: async (page: Page, ms: number) => {
      offset += ms;
      await page.clock.runFor(ms);
    },
    now,
  };
}
for (const width of [1440, 375])
  test(`qualified client timing batches and stops for idle/hidden tabs at ${width}`, async ({
    page,
    browser,
  }) => {
    const f = await fixture(page);
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      baseURL: "http://127.0.0.1:3100",
    });
    try {
      const routes = await clientRoutes(context, f),
        client = await context.newPage();
      await client.clock.install();
      await client.goto(`/p/${f.p.token}`);
      await expect(client.locator("#proposal-document")).toBeVisible();
      if (width === 1440)
        await expect(
          client.locator('.client-document-sheets[data-layout-ready="true"]'),
        ).toBeVisible();
      expect((await f.repo.get(f.p.id))!.first_viewed_at).toBeNull();
      await client.bringToFront();
      await client
        .locator("#proposal-document")
        .click({ position: { x: 100, y: 100 } });
      await expect
        .poll(async () => (await f.repo.engagementSummary(f.p.id))?.views)
        .toBe(1);
      await routes.advance(client, 15000);
      await expect
        .poll(
          async () => (await f.repo.engagementSummary(f.p.id))?.total_ms ?? 0,
        )
        .toBeGreaterThan(1000);
      let active = (await f.repo.engagementSummary(f.p.id))!.total_ms;
      const beforeHidden = routes.batches.length;
      await client.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect
        .poll(() => routes.batches.length)
        .toBeGreaterThan(beforeHidden);
      active = routes.batches.at(-1).snapshot.active_ms;
      await expect
        .poll(async () => (await f.repo.engagementSummary(f.p.id))!.total_ms)
        .toBe(active);
      await routes.advance(client, 90000);
      await expect
        .poll(async () => (await f.repo.engagementSummary(f.p.id))!.total_ms)
        .toBe(active);
      await client.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await routes.advance(client, 90000);
      await expect.poll(async () => routes.batches.length).toBeGreaterThan(2);
      expect((await f.repo.engagementSummary(f.p.id))!.total_ms).toBe(active); // Still idle: visibility alone does not restart time.
      await client
        .getByRole("heading", { name: "First section", exact: true })
        .scrollIntoViewIfNeeded();
      await client.mouse.wheel(0, 40);
      await routes.advance(client, 15000);
      await expect
        .poll(async () => (await f.repo.engagementSummary(f.p.id))!.total_ms)
        .toBeGreaterThan(active);
      const choice = client
        .getByRole("checkbox", { name: /Optional case study/ })
        .first();
      await choice.check();
      await expect
        .poll(async () => (await f.repo.engagementSummary(f.p.id))!.choices)
        .toBe(1);
      const latest = routes.batches.at(-1);
      await recordEngagement(
        f.repo,
        (await f.repo.get(f.p.id))!,
        latest.ticket,
        latest.snapshot,
        routes.now(),
      );
      const report = await engagementReport(
        f.repo,
        (await f.repo.get(f.p.id))!,
      );
      expect(report.views).toBe(1);
      expect(report.unique_viewers).toBe(1);
      expect(report.targets.some((t) => t.ms > 0 && t.percent === 100)).toBe(
        true,
      );
      const after = (await f.repo.get(f.p.id))!;
      expect(
        after.versions.map((v) => ({
          ...v,
          quote: [],
          variables_resolved: {},
          content_hash: "",
        })),
      ).toEqual(
        f.p.versions.map((v) => ({
          ...v,
          quote: [],
          variables_resolved: {},
          content_hash: "",
        })),
      );
      expect(
        after.quote.find((i) => i.name === "Optional case study")!.selected,
      ).toBe(true);
      expect(
        routes.batches.every((b) => JSON.stringify(b).length < 60000),
      ).toBe(true);
      expect(JSON.stringify(routes.batches)).not.toMatch(
        /password|user_agent|browser_id|\"ip\"/,
      );
      const privacy = client.getByText(
        "The sender can see when and how this proposal was viewed.",
      );
      await expect(privacy).toBeAttached();
    } finally {
      await context.close();
    }
  });
test("record/list summaries match the retained sessions, with empty and responsive accessible states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await fixture(page);
  await page.goto(`/proposals/${f.p.id}`);
  await expect(
    page.getByRole("heading", { name: "Not opened yet" }),
  ).toBeVisible();
  await capture(page, "record-empty-1440", true);
  const now = Date.now(),
    viewer = crypto.randomUUID();
  for (let n = 0; n < 3; n++) {
    const start = await startEngagement(
      f.repo,
      f.p,
      {
        session_id: crypto.randomUUID(),
        browser_id: n === 2 ? crypto.randomUUID() : viewer,
        device: n === 2 ? "phone" : "desktop",
        intent: "read",
        activity: "pointer",
      },
      now - 600000 + n * 60000,
    );
    const targets = engagementTargets(f.p),
      section = targets.find(
        (t) => t.kind === "section" && t.label === "First section",
      )!;
    await recordEngagement(
      f.repo,
      f.p,
      start.ticket,
      {
        seq: 2,
        active_ms: 120000,
        targets: {
          [section.key]: 90000,
          "section:cover": 30000,
          "page:1": 120000,
        },
        actions: [],
        ended: true,
      },
      now - 480000 + n * 60000,
    );
  }
  await f.service.view(f.p.token!, "", {
    ...clientActor,
    ip: "",
    user_agent: "",
  });
  // The panel has no Refresh button (Redesign 27); reload picks up the data.
  await page.reload();
  const panel = page.locator(".engagement-panel");
  await expect(panel.locator("dd").nth(0)).toHaveText("3");
  await expect(panel.locator("dd").nth(1)).toHaveText("2");
  await expect(
    panel
      .locator(".engagement-stats > div")
      .filter({ has: page.getByText("Devices", { exact: true }) })
      .locator("dd"),
  ).toHaveText("2");
  await expect(panel.locator(".engagement-headline strong")).toHaveText(
    "6m 0s",
  );
  await expect(panel.locator(".engagement-visits li")).toHaveCount(3);
  await expect(panel.locator(".engagement-sessions>li")).toHaveCount(3);
  // Most read shows the top sections as bars; there is no separate Time by
  // page list.
  await expect(
    panel
      .getByRole("region", { name: "Most read" })
      .getByText("First section", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("Time by page")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include(".engagement-panel").analyze())
      .violations,
  ).toEqual([]);
  await capture(page, "record-data-1440", true);
  await page.setViewportSize({ width: 375, height: 950 });
  await capture(page, "record-data-375", true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/proposals");
  await expect(page.getByText(/Viewed 3× \| last/)).toBeVisible();
  await capture(page, "proposal-list-1440");
});
test("staff Preview as client and Send-me-a-test preview URLs never start tracking", async ({
  page,
}) => {
  const f = await fixture(page),
    requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/engagement/start")) requests.push(r.url());
  });
  await page.goto(`/p/${f.p.id}?preview=1`);
  await expect(page.locator("#proposal-document")).toBeVisible();
  await page
    .locator("#proposal-document")
    .click({ position: { x: 100, y: 100 } });
  await page.mouse.wheel(0, 500);
  await expect(
    page.getByText(/This is a preview|Preview/).first(),
  ).toBeAttached();
  expect(requests).toEqual([]);
  await page.goto(`/p/${f.p.token}`); // Staff eligibility is false even without preview=1.
  await expect(page.locator("#proposal-document")).toBeVisible();
  await page
    .locator("#proposal-document")
    .click({ position: { x: 100, y: 100 } });
  await page.mouse.wheel(0, 500);
  expect(requests).toEqual([]);
  expect(await f.repo.engagementSummary(f.p.id)).toBeNull();
  expect((await f.repo.get(f.p.id))!.first_viewed_at).toBeNull();
});
