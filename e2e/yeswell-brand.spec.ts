import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { setup } from "../tests/helpers";
import { openEditorPanel } from "./editor-ui";
const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const shots = "docs/screenshots/yeswell";
async function shot(page: Page, name: string) {
  if (process.env.YESWELL_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({
      path: `${shots}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function configure(request: APIRequestContext) {
  const { settings } = await setup();
  const client = {
    id: crypto.randomUUID(),
    company: "Northwind Example",
    first_name: "Jane",
    last_name: "Doe",
    email: `jane-${crypto.randomUUID()}@example.test`,
  };
  const item = {
    id: crypto.randomUUID(),
    sku: crypto.randomUUID(),
    name: "Website planning",
    amount: 275000,
    interval: "one_time",
    qbo_item_ref: "mock-plan",
  };
  const template = {
    id: crypto.randomUUID(),
    name: "Brand specimen",
    active: true,
    content: [
      { id: crypto.randomUUID(), type: "heading", text: "Overview", level: 1 },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "A clear proposal for your next project. Your workspace identity stays with every client document.",
      },
      { id: crypto.randomUUID(), type: "pricing_table" },
      { id: crypto.randomUUID(), type: "signature_block", role: "client" },
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
    default_quote: [
      { pricing_item_id: item.id, qty: 1, optional: false, selected: true },
    ],
  };
  for (const [path, data] of [
    ["workspace_settings", settings],
    ["clients", client],
    ["pricing_items", item],
    ["templates", template],
  ] as const) {
    const res = await request.post(`/api/${path}`, { headers, data });
    expect(res.ok(), await res.text()).toBe(true);
  }
  const res = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: client.id,
      template_id: template.id,
      title: "A website worth saying yes to",
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  return { settings, p: await res.json() };
}
test("Yeswell staff branding and install metadata stay separate from workspace client identity", async ({
  page,
  request,
  context,
}) => {
  const { settings, p } = await configure(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const theme of ["light", "dark"]) {
    await page.goto("/login");
    await page.evaluate(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    await page.reload();
    // Login also follows the user's saved theme without requiring a staff shell.
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("img", { name: "Yeswell", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Sign in | Yeswell");
    await expect(
      page.locator('link[rel="icon"][type="image/svg+xml"]'),
    ).toHaveAttribute("href", "/favicon.svg");
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(180, 83, 42)" : "rgb(224, 122, 74)",
    );
    await shot(page, `login-${theme}-1440`);
    for (const [path, name] of [
      ["/", "home"],
      ["/studio/workspace", "studio"],
      [`/proposals/${p.id}`, "editor"],
    ]) {
      await page.goto(path);
      // The editor is full-screen, with no navigation sidebar, from its first
      // loading frame on.
      if (name !== "editor")
        await expect(
          page.locator(".sidebar .brand img:visible"),
        ).toHaveAttribute("alt", "Yeswell");
      if (name === "editor")
        await expect(
          page.locator('.editor-page-sheets[data-layout-settled="true"]'),
        ).toBeVisible();
      else await expect(page.locator(".skeleton")).toHaveCount(0);
      if (name === "editor") await openEditorPanel(page, "Quote");
      await shot(page, `${name}-${theme}-1440`);
    }
  }
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto("/");
  await expect(
    page.locator(".shell-tablet-header .yeswell-brand img:visible"),
  ).toHaveAttribute("alt", "Yeswell");
  await page.setViewportSize({ width: 375, height: 900 });
  // Owner 10 Nov: on phones the mark sits in line, left of the page H1.
  await expect(page.locator(".staff-mobile-brand")).toBeHidden();
  const mark = await page.locator("#workspace-content h1").evaluate((h1) => {
    const before = getComputedStyle(h1, "::before");
    const title = h1.getBoundingClientRect();
    return {
      image: before.backgroundImage,
      width: before.width,
      inside: title.left >= 0 && title.right <= innerWidth,
    };
  });
  expect(mark.image).toContain("/brand/yeswell/yeswell-mark");
  expect(mark.width).toBe("28px");
  expect(mark.inside).toBe(true);
  await page.goto("/login");
  await page.setViewportSize({ width: 375, height: 900 });
  await shot(page, "login-dark-375");
  await page.evaluate(() => {
    localStorage.setItem("proposal-theme", "light");
    document.documentElement.dataset.theme = "light";
  });
  await shot(page, "login-light-375");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Yeswell");
  expect(manifest.theme_color).toBe("#13303A");
  await context.clearCookies();
  for (const asset of [
    "/favicon.svg",
    "/icon-192.png",
    "/icon-512.png",
    "/brand/yeswell/yeswell-logo.svg",
    "/yeswell-social-1200x630.png",
  ])
    expect((await page.request.get(asset, { maxRedirects: 0 })).status()).toBe(
      200,
    );
  // Explicit bearer auth keeps staff calls separate from this signed-out client browser.
  const sent = await request.post(`/api/proposals/${p.id}/send`, {
    headers,
    data: { revision: p.revision, delivery_method: "manual" },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const published = await sent.json();
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/p/${published.token}`);
    const footer = page.locator(".powered-by-yeswell");
    await expect(
      footer.getByRole("link", { name: "Powered by Yeswell" }),
    ).toHaveAttribute("href", "https://yeswell.co");
    await expect(page.locator(".client-flow")).toHaveCSS(
      "--accent",
      settings.accent_colour,
    );
    await expect(
      page.getByText("Example Studio", { exact: true }).first(),
    ).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    await shot(page, `client-footer-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const audit = await new AxeBuilder({ page })
    .include(".powered-by-yeswell")
    .analyze();
  expect(audit.violations).toEqual([]);
  const email = await request.post(
    "/api/email-templates/proposal_sent/preview",
    { headers, data: { proposal_id: p.id } },
  );
  expect(email.ok(), await email.text()).toBe(true);
  const mail = await email.json();
  expect(mail.html).toContain("Powered by Yeswell");
  expect(mail.html).toContain("Example Studio");
  if (process.env.YESWELL_CAPTURE === "1")
    writeFileSync(`${shots}/client-email.html`, mail.html);
  await page.setContent(mail.html);
  await shot(page, "client-email-1440");
  const off = await request.post("/api/workspace_settings", {
    headers,
    data: { ...settings, show_powered_by: false },
  });
  expect(off.ok()).toBe(true);
  await page.goto(`/p/${published.token}`);
  await expect(page.locator(".flow-sender-contact")).toBeVisible();
  await expect(page.locator(".powered-by-yeswell")).toHaveCount(0);
  const offMail = await request.post(
    "/api/email-templates/proposal_sent/preview",
    { headers, data: {} },
  );
  expect((await offMail.json()).html).not.toContain("Powered by Yeswell");
  // Restore workspace state for the shared full-suite local fixture.
  await request.post("/api/workspace_settings", { headers, data: settings });
});
