import { cssColorToken } from "./css-color-token";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { editorFixture } from "./editor-fixture";
import { staff } from "../tests/helpers";
import { postgresFixture } from "../tests/postgres-fixture";
import type { Template } from "../src/lib/model";
import { sampleNames, sampleNow, sampleZone } from "../tests/report-fixture";
import { buildReport, reportDimensions } from "../src/lib/report-metrics";
import { reportDateRange } from "../src/lib/report-filters";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";

const workspaceId = "00000000-0000-4000-8000-000000000099";
const screenshots = "docs/screenshots/redesign-21-b";
type State = "day-one" | "partly-done" | "set-up" | "staff";

async function capture(page: Page, label: string) {
  if (process.env.CAPTURE_FIRST_RUN !== "1") return;
  await mkdir(screenshots, { recursive: true });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  await page.setViewportSize({ width: viewport.width, height });
  await page.screenshot({
    path: `${screenshots}/${label}-${page.viewportSize()!.width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize(viewport);
}

async function setupHome(page: Page, state: State, platform = false) {
  const fixture = await editorFixture(page);
  const complete = state === "set-up";
  const started = complete || state === "partly-done";
  let stripe = complete;
  let manual = false;
  await page.clock.setFixedTime(new Date("2026-11-09T15:00:00Z"));
  const draftSettings = {
    ...fixture.settings,
    id: platform ? LOCAL_WORKSPACE_ID : workspaceId,
    logo: null,
    logo_icon: null,
    sending_domain: "",
    company_signatory: undefined,
    business_state: undefined,
  };
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: {
          ...staff,
          staff_role: state === "staff" ? "member" : "owner",
          workspace_id: platform ? LOCAL_WORKSPACE_ID : workspaceId,
        },
        settings: started
          ? {
              ...fixture.settings,
              logo: "/logo.png",
              qbo_manual_invoice: manual,
            }
          : null,
        workspace_defaults: draftSettings,
        staff: [fixture.members.find((m) => m.role === "owner")!],
      },
    }),
  );
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: {
        stripe,
        stripe_platform: platform,
        ...(!platform && {
          stripe_connect: {
            state: stripe ? "connected" : "not_connected",
            available: true,
            eventsConfigured: stripe,
          },
        }),
        qbo: complete,
        email: true,
        mock: false,
        mode: "test",
      },
    }),
  );
  const proposals =
    state === "partly-done"
      ? [
          {
            ...fixture.draft,
            title: "Website redesign",
            client: { ...fixture.draft.client, company: "Harbor Dental" },
            ai_unreviewed: true,
            ai_connector: "Claude",
            updated_at: "2026-11-09T14:50:00Z",
          },
        ]
      : [];
  await page.route("**/api/proposals?*", (route) =>
    route.fulfill({ json: { items: proposals, total: proposals.length } }),
  );
  await page.route("**/api/assistants", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/workspace_settings/manual-invoicing", (route) => {
    manual = true;
    return route.fulfill({ json: { ok: true } });
  });
  return {
    ...fixture,
    disconnectStripe: () => {
      stripe = false;
    },
  };
}

for (const width of [1440, 375]) {
  for (const state of ["day-one", "partly-done", "set-up", "staff"] as const) {
    test(`Home keeps its layout with ${state} setup at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 375 ? 844 : 1000 });
      await setupHome(page, state);
      await page.goto("/");
      const setup = page.locator(".home-setup-card");
      if (state === "staff") {
        const banner = page.getByRole("region", { name: "Staff welcome" });
        await expect(banner).toContainText(
          "You joined Example Studio as Staff",
        );
        await expect(
          banner.getByRole("button", { name: "Dismiss", exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          setup.getByRole("heading", {
            name:
              state === "set-up" ? "You’re set up." : "Set up Example Studio",
            exact: true,
          }),
        ).toBeVisible();
      }
      await expect(
        page.locator(".home-overview + .home-setup-card + .home-attention"),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Recent proposals" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Pipeline 0 proposals" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Expiring this week" }),
      ).toBeVisible();
      await expect(setup).toHaveCSS("background-color", "rgb(255, 255, 255)");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      if (state === "day-one" || state === "partly-done") {
        const required = setup.getByRole("region", {
          name: "Needed before you send",
        });
        const optional = setup.getByRole("region", {
          name: "When you’re ready",
        });
        await expect(
          optional.getByText("Optional", { exact: true }),
        ).toBeVisible();
        await expect(optional.getByRole("heading")).toHaveCSS(
          "color",
          await cssColorToken(optional.getByRole("heading"), "--ink-muted"),
        );
        const requiredBox = (await required.boundingBox())!;
        const optionalBox = (await optional.boundingBox())!;
        if (width === 1440) {
          expect(
            optionalBox.x - requiredBox.x - requiredBox.width,
          ).toBeGreaterThanOrEqual(40);
          expect(
            await optional.evaluate(
              (node) => getComputedStyle(node, "::before").borderLeftWidth,
            ),
          ).toBe("1px");
        } else {
          expect(optionalBox.y).toBeGreaterThan(
            requiredBox.y + requiredBox.height,
          );
          await expect(optional).toHaveCSS("border-top-width", "1px");
        }
        const signatory = required
          .getByRole("listitem")
          .filter({ hasText: "Company signatory" });
        if (state === "day-one") {
          await expect(signatory.locator(".home-setup-icon")).toHaveCSS(
            "color",
            "rgb(19, 48, 58)",
          );
          await expect(
            signatory.locator(".home-setup-icon svg.lucide-pen-tool"),
          ).toBeVisible();
        } else {
          await expect(
            signatory.locator(".home-setup-icon svg.lucide-check"),
          ).toBeVisible();
        }
        await expect(setup.getByRole("progressbar")).toHaveAttribute(
          "value",
          state === "day-one" ? "0" : "4",
        );
        await expect(
          setup.getByRole("link", { name: "Connect: Connect Stripe" }),
        ).toHaveAttribute("href", "/studio/connections/stripe");
        await expect(
          setup.getByRole("button", { name: "Record invoice numbers by hand" }),
        ).toBeVisible();
      }
      if (state === "staff")
        await expect(setup.getByRole("progressbar")).toHaveCount(0);
      if (state === "partly-done") {
        await expect(
          page.getByRole("region", { name: "Needs your attention" }),
        ).toContainText("Harbor Dental — Website redesign");
      }
      await capture(page, `home-${state}`);
      if (state === "partly-done") {
        await setup
          .getByRole("button", { name: "Record invoice numbers by hand" })
          .click();
        await expect(setup.getByRole("progressbar")).toHaveAttribute(
          "value",
          "5",
        );
        await expect(
          setup.getByRole("button", { name: "Record invoice numbers by hand" }),
        ).toHaveCount(0);
      }
      if (state === "set-up") {
        await expect(setup.getByRole("progressbar")).toBeHidden();
        await setup.getByRole("button", { name: "Show", exact: true }).click();
        await expect(setup.getByRole("progressbar")).toHaveAttribute(
          "value",
          "6",
        );
        await setup.getByRole("button", { name: "Dismiss" }).click();
        await expect(setup).toHaveCount(0);
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "Recent proposals" }),
        ).toBeVisible();
        await expect(setup).toHaveCount(0);
      }
    });
  }
}

test("platform owner only sees setup when a required step is incomplete", async ({
  page,
}) => {
  const { disconnectStripe } = await setupHome(page, "set-up", true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recent proposals" }),
  ).toBeVisible();
  await expect(page.locator(".home-setup-card")).toHaveCount(0);
  disconnectStripe();
  await page.reload();
  await expect(
    page.getByRole("progressbar", { name: "Workspace setup progress" }),
  ).toHaveAttribute("value", "5");
  await expect(
    page.getByRole("link", { name: "Connect: Connect Stripe" }),
  ).toBeVisible();
});

test("first-run and filtered empty states stay on white surfaces", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setupHome(page, "day-one");
  for (const route of ["clients", "pricing_items", "custom_families"]) {
    await page.route(`**/api/${route}`, (r) => r.fulfill({ json: [] }));
  }
  await page.goto("/proposals");
  await expect(
    page.getByRole("heading", { name: "No proposals yet" }),
  ).toBeVisible();
  await expect(page.locator(".staff-empty")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await capture(page, "proposals-empty");
  await page.getByRole("tab", { name: /Needs countersign/ }).click();
  await expect(page.getByText("Nothing to countersign")).toBeVisible();
  await page.getByRole("textbox", { name: "Search proposals" }).fill("Juniper");
  await expect(page.getByText("No results for “Juniper”")).toBeVisible();

  await page.goto("/clients");
  await expect(
    page.getByRole("heading", { name: "No clients yet" }),
  ).toBeVisible();
  await expect(page.locator(".staff-empty")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await capture(page, "clients-empty");

  await page.route("**/api/reports?*", (route) =>
    route.fulfill({
      json: buildReport(
        [],
        reportDateRange({ range: "month" }, sampleZone, sampleNow),
        reportDimensions([], sampleNames),
      ),
    }),
  );
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", {
      name: "Reports fill in once you send proposals.",
    }),
  ).toBeVisible();
  await expect(page.locator(".report-empty")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await capture(page, "reports-empty");

  await page.goto("/studio/products");
  await expect(
    page.getByRole("heading", {
      name: "Connect Stripe to bring in your products",
    }),
  ).toBeVisible();
  await expect(page.locator(".staff-empty")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await capture(page, "products-empty");

  const db = await postgresFixture();
  let templates: Template[];
  try {
    await db.query("insert into workspaces(id, name) values ($1, $2)", [
      workspaceId,
      "Example Studio",
    ]);
    templates = (
      await db.query<{ data: Template }>(
        "select data from templates where workspace_id=$1 order by id",
        [workspaceId],
      )
    ).rows.map(({ data }) => data);
  } finally {
    await db.close();
  }
  await page.route("**/api/templates", (route) =>
    route.fulfill({ json: templates }),
  );
  await page.route("**/api/templates/*", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    templates = templates.filter(
      (row) => !route.request().url().endsWith(row.id),
    );
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/studio/templates");
  await expect(page.getByText("Sample", { exact: true })).toHaveCount(3);
  const defaults = page.locator('[data-starter-status="default"]');
  await expect(defaults).toHaveCount(7);
  await expect(defaults.filter({ hasText: /Default$/ })).toHaveCount(7);
  await expect(page.getByText("Starter", { exact: true })).toHaveCount(0);
  await capture(page, "templates-samples");
  await page.getByRole("button", { name: /Website proposal/ }).click();
  await page.getByRole("menuitem", { name: "Delete sample" }).click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete sample" })
    .click();
  await expect(page.getByText("Sample", { exact: true })).toHaveCount(2);
});

test("Staff welcome dismissal follows the account to another device without leaving a gap", async ({
  browser,
  request,
}) => {
  const authFixture = "http://127.0.0.1:3112/fixture";
  const origin = "http://127.0.0.1:3100";
  async function account(account: "staff" | "other") {
    const session = await request.post(authFixture, { data: { account } });
    expect(session.ok()).toBe(true);
    return session.json() as Promise<{ access_token: string }>;
  }
  const [first, second, other] = await Promise.all([
    account("staff"),
    account("staff"),
    account("other"),
  ]);
  const [laptop, phone] = await Promise.all([
    browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    }),
    browser.newContext({
      baseURL: origin,
      viewport: { width: 375, height: 844 },
    }),
  ]);
  try {
    for (const [device, session] of [
      [laptop, first],
      [phone, second],
    ] as const) {
      await device.addCookies([
        {
          name: "proposal_session",
          value: session.access_token,
          url: origin,
          httpOnly: true,
        },
      ]);
    }
    const [desktop, mobile] = await Promise.all([
      laptop.newPage(),
      phone.newPage(),
    ]);
    await Promise.all([desktop.goto("/"), mobile.goto("/")]);
    const banner = (page: Page) =>
      page.getByRole("region", { name: "Staff welcome" });
    await expect(banner(desktop)).toBeVisible();
    await expect(banner(mobile)).toBeVisible();
    const dismiss = banner(mobile).getByRole("button", { name: "Dismiss" });
    expect((await dismiss.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const denied = await request.post("/api/auth/staff-home-banner", {
      headers: {
        Authorization: `Bearer ${first.access_token}`,
        Origin: "https://other.example.test",
      },
    });
    expect(denied.status()).toBe(403);
    await expect(banner(desktop)).toBeVisible();
    await banner(desktop).getByRole("button", { name: "Dismiss" }).click();
    await expect(banner(desktop)).toHaveCount(0);
    await expect(
      desktop.locator(".home-overview + .home-attention"),
    ).toBeVisible();

    await mobile.reload();
    await expect(
      mobile.locator(".home-overview + .home-attention"),
    ).toBeVisible();
    await expect(banner(mobile)).toHaveCount(0);
    const otherSession = await request.get("/api/auth/session", {
      headers: { Authorization: `Bearer ${other.access_token}` },
    });
    expect(otherSession.ok()).toBe(true);
    expect((await otherSession.json()).user.staff_home_banner_dismissed).toBe(
      false,
    );
  } finally {
    await Promise.all([laptop.close(), phone.close()]);
  }
});
