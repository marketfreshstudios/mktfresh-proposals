import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { setup } from "../tests/helpers";
const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const shots = "docs/screenshots/workspace-icon";
async function capture(page: Page, name: string) {
  const emailCapture =
    process.env.STUDIO_EMAIL_CAPTURE === "1" && /^brand-filled-/.test(name);
  if (process.env.WORKSPACE_ICON_CAPTURE === "1" || emailCapture) {
    const dir = emailCapture ? "docs/screenshots/studio-v3-email" : shots;
    mkdirSync(dir, { recursive: true });
    if (emailCapture && name === "brand-filled-768")
      await page
        .locator(".workspace-brand-assets")
        .evaluate((el) =>
          el.scrollIntoView({ block: "center", behavior: "instant" }),
        );
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function icon(color = "#13303a", width = 256) {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="100%" height="100%" rx="40" fill="${color}"/><path d="M64 180V76h28l36 54 36-54h28v104h-28v-58l-36 50-36-50v58z" fill="#eef3f3"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
}
async function configure(request: APIRequestContext) {
  const f = await setup();
  f.settings.company_name = "Example Studio";
  const settings = await request.post("/api/workspace_settings", {
    headers,
    data: { ...f.settings, logo: null, logo_icon: null },
  });
  expect(settings.ok()).toBe(true);
  const item = {
    id: crypto.randomUUID(),
    sku: crypto.randomUUID(),
    name: "Project planning",
    amount: 275000,
    interval: "one_time",
    qbo_item_ref: "mock-plan",
  };
  const client = {
    id: crypto.randomUUID(),
    company: "Northwind Example",
    first_name: "Jane",
    last_name: "Doe",
    email: `jane-${crypto.randomUUID()}@example.test`,
  };
  const template = {
    id: crypto.randomUUID(),
    name: "Icon specimen",
    active: true,
    content: [
      {
        id: crypto.randomUUID(),
        type: "heading",
        text: "Project overview",
        level: 1,
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "A proposal prepared for your next project.",
      },
      { id: crypto.randomUUID(), type: "pricing_table" },
      { id: crypto.randomUUID(), type: "signature_block", role: "client" },
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
    default_quote: [
      { pricing_item_id: item.id, qty: 1, optional: false, selected: true },
    ],
  };
  for (const [table, data] of [
    ["clients", client],
    ["pricing_items", item],
    ["templates", template],
  ] as const)
    expect((await request.post(`/api/${table}`, { headers, data })).ok()).toBe(
      true,
    );
  const made = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: client.id,
      template_id: template.id,
      title: "A clear plan for your project",
    },
  });
  expect(made.ok()).toBe(true);
  const p = await made.json();
  const sent = await request.post(`/api/proposals/${p.id}/send`, {
    headers,
    data: { revision: p.revision, delivery_method: "manual" },
  });
  expect(sent.ok()).toBe(true);
  return await sent.json();
}
test("workspace icon uploads, replaces, removes and follows responsive marks without replacing the wide logo", async ({
  page,
  request,
}) => {
  const p = await configure(request);
  const session = await (
    await request.get("/api/auth/session", { headers })
  ).json();
  const initials = session.user.staff_name
    .split(" ")
    .map((part: string) => part[0])
    .slice(0, 2)
    .join("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace?view=brand");
  await expect(
    page.getByRole("heading", { name: "Brand", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-label .workspace-mark")).toHaveText(
    "E",
  );
  await capture(page, "brand-empty-1440");
  const input = page.locator("#workspace-icon-upload");
  for (const [name, mimeType, buffer, error] of [
    ["icon.svg", "image/svg+xml", Buffer.from("<svg/>"), "PNG icon required"],
    ["small.png", "image/png", await icon("#13303a", 64), "at least 128"],
    ["large.png", "image/png", Buffer.alloc(750000), "under 750 KB"],
  ] as const) {
    await input.setInputFiles({ name, mimeType, buffer });
    await expect(
      page.locator(".workspace-section-card").getByRole("alert"),
    ).toContainText(error);
  }
  await input.setInputFiles({
    name: "Studio icon.png",
    mimeType: "image/png",
    buffer: await icon(),
  });
  const mark = page.locator(".workspace-label img.workspace-mark");
  await expect(mark).toBeVisible();
  const oldSrc = await mark.getAttribute("src");
  await expect(page.getByText(/Studio icon.png | \d+ KB/)).toBeVisible();
  await expect(
    page.locator(".workspace-section-card").getByRole("alert"),
  ).toHaveCount(0);
  await expect(
    page.locator(".workspace-section [role=status]"),
  ).toHaveText("Saved");
  await capture(page, "brand-icon-1440");
  await page
    .getByLabel("Logo | used on covers, client pages, emails and PDFs", {
      exact: true,
    })
    .setInputFiles({
      name: "Wide logo.png",
      mimeType: "image/png",
      buffer: await sharp(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><rect width="80" height="80" y="10" rx="16" fill="#365c4a"/><text x="40" y="67" text-anchor="middle" font-family="Arial" font-weight="700" font-size="48" fill="white">E</text><text x="96" y="61" font-family="Arial" font-weight="700" font-size="29" fill="#13303a">Example Studio</text></svg>',
        ),
      )
        .png()
        .toBuffer(),
    });
  await expect(
    page.getByAltText("Workspace logo", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".workspace-section [role=status]"),
  ).toHaveText("Saved");
  const assets = page.locator(".workspace-brand-assets .workspace-logo-row");
  const boxes = await assets.evaluateAll((nodes) =>
    nodes.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width };
    }),
  );
  expect(boxes[0].y).toBe(boxes[1].y);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(1);
  await expect(assets.first().locator("img")).toHaveCSS("height", "48px");
  await expect(assets.last().locator("img")).toHaveCSS("width", "64px");
  for (const asset of await assets.all()) {
    const frame = await asset.boundingBox();
    const file = await asset.locator(".workspace-logo-file").boundingBox();
    expect(file!.y).toBeGreaterThanOrEqual(frame!.y + 12);
    expect(file!.y + file!.height).toBeLessThanOrEqual(
      frame!.y + frame!.height - 12,
    );
  }
  const banner = await page
    .locator(".banner")
    .filter({ hasText: "Workspace settings saved" })
    .boundingBox();
  const meta = await page.locator(".workspace-auto-label").boundingBox();
  expect(
    banner!.x + banner!.width - meta!.x - meta!.width,
  ).toBeGreaterThanOrEqual(16);
  expect(
    Math.abs(meta!.y + meta!.height / 2 - banner!.y - banner!.height / 2),
  ).toBeLessThanOrEqual(1);
  await capture(page, "brand-filled-1440");
  await capture(page, "sidebar-icon-1440");
  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(
    page.locator(".tablet-workspace-label img.workspace-mark"),
  ).toBeVisible();
  const stacked = await assets.evaluateAll((nodes) =>
    nodes.map((el) => el.getBoundingClientRect().y),
  );
  expect(stacked[1]).toBeGreaterThan(stacked[0]);
  await page
    .locator(".workspace-brand-assets")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await capture(page, "brand-filled-768");
  await capture(page, "tablet-icon-768");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/studio");
  await expect(
    page.locator(".studio-phone-account .workspace-mark"),
  ).toBeVisible();
  expect(
    await page
      .locator(".studio-phone-account .workspace-mark")
      .evaluate((el) => el.tagName),
  ).toBe("IMG");
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "/favicon.svg");
  await page.goto(`/p/${p.token}`);
  await expect(
    page.locator('link[rel="icon"][sizes="32x32"][data-workspace-icon=true]'),
  ).toHaveAttribute(
    "href",
    new RegExp(`/api/public/${p.token}/brand/icon\\?size=32`),
  );
  for (const [rel, size] of [
    ["icon", 16],
    ["icon", 32],
    ["apple-touch-icon", 180],
  ] as const) {
    const href = await page
      .locator(`link[rel="${rel}"][sizes="${size}x${size}"]`)
      .getAttribute("href");
    const response = await request.get(href!);
    expect(response.ok()).toBe(true);
    const meta = await sharp(await response.body()).metadata();
    expect([meta.width, meta.height]).toEqual([size, size]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByRole("button", { name: "Review and sign", exact: true }),
  ).toBeVisible();
  await capture(page, "client-icon-1440");
  await page.goto("/studio/workspace?view=brand");
  await input.setInputFiles({
    name: "Replacement.png",
    mimeType: "image/png",
    buffer: await icon("#c2602f"),
  });
  await expect(mark).toHaveAttribute("src", /workspace-icon/);
  await expect.poll(() => mark.getAttribute("src")).not.toBe(oldSrc);
  await expect(page.getByText(/Replacement.png |/)).toBeVisible();
  await page
    .locator(".workspace-icon-row")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.locator(".workspace-label .workspace-mark")).toHaveText(
    "E",
  );
  await expect(
    page.getByAltText("Workspace logo", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(
    page.locator(".tablet-workspace-label .workspace-mark"),
  ).toHaveText("E");
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/studio");
  await expect(
    page.locator(".studio-phone-account .workspace-mark"),
  ).toHaveCount(0);
  await expect(page.locator(".studio-phone-account .avatar")).toHaveAttribute(
    "data-initials",
    initials,
  );
  await page.goto(`/p/${p.token}`);
  await expect(
    page.locator('link[rel="icon"][data-workspace-icon=fallback]'),
  ).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator("link[data-workspace-icon=true]")).toHaveCount(0);
});
test("Staff cannot change the logo icon in Brand", async ({
  page,
  request,
}) => {
  await configure(request);
  await page.route("**/api/auth/session", async (route) => {
    const response = await route.fetch(),
      value = await response.json();
    value.user.staff_role = "member";
    await route.fulfill({ response, json: value });
  });
  await page.goto("/studio/workspace?view=brand");
  await expect(page.locator("#workspace-icon-upload")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Upload logo icon", exact: true }),
  ).toBeDisabled();
});
