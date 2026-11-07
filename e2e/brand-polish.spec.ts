import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { editorFixture } from "./editor-fixture";
import { defaultCover, coverText } from "../src/lib/cover";
import { accessibleAccent, whiteContrast } from "../src/lib/brand";
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
test.use({ actionTimeout: 10000 });
async function fixture(page: Page) {
  const f = await editorFixture(page);
  f.settings.accent_colour = "#365c4a";
  f.settings.brand_palette = ["#335577"];
  f.settings.logo = "";
  await f.repo.put("workspace_settings", f.settings);
  const logo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="96"><path d="M8 8H72V28H28V38H64V58H28V68H72V88H8Z" fill="#2f5d50"/><text x="88" y="65" font-family="Arial" font-size="44" fill="#ea4e26">Example Studio</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page.route("**/api/workspace_settings", async (r) => {
    if (r.request().method() === "POST") {
      Object.assign(f.settings, r.request().postDataJSON());
      await f.repo.put("workspace_settings", f.settings);
      return r.fulfill({ json: f.settings });
    }
    return r.fulfill({ json: [f.settings] });
  });
  await page.route("**/api/workspace-logo**", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          json: {
            path: `${f.repo.workspaceId}/logo.png`,
            palette_suggestions: ["#ea4e26", "#74ccdb"],
          },
        })
      : r.fulfill({ body: logo, contentType: "image/png" }),
  );
  await page.route("**/api/workspace-palette", (r) =>
    r.fulfill({ json: { colors: ["#ea4e26", "#74ccdb"] } }),
  );
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/studio/workspace?view=brand");
  return { ...f, logo };
}
const picker = (page: Page) =>
  page.getByRole("dialog", { name: /color picker/ });
async function shot(page: Page, name: string) {
  if (process.env.CAPTURE_POLISH) {
    await mkdir("docs/screenshots/brand-polish", { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/brand-polish/${name}.png`,
    });
  }
}
async function pair(
  page: Page,
  group: import("@playwright/test").Locator,
  state: string,
) {
  if (!process.env.CAPTURE_POLISH) return;
  const actual = await group.screenshot();
  const ref = await page.context().newPage();
  const font = (await readFile("public/fonts/DMSans-Variable.woff2")).toString(
    "base64",
  );
  const html = (await readFile("design/covers/BrandColors.dc.html", "utf8"))
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(
      /<link[^>]*fonts.googleapis[^>]*>/g,
      `<style>@font-face{font-family:'DM Sans';src:url(data:font/woff2;base64,${font})}</style>`,
    );
  await ref.setViewportSize({ width: 1100, height: 850 });
  await ref.route("http://brand-reference.test/", (r) =>
    r.fulfill({ body: html, contentType: "text/html" }),
  );
  await ref.goto("http://brand-reference.test/");
  const reference = await ref.locator("x-dc>div").first().screenshot();
  const a = await sharp(actual).resize({ width: 800 }).png().toBuffer(),
    b = await sharp(reference).resize({ width: 800 }).png().toBuffer();
  const am = await sharp(a).metadata(),
    bm = await sharp(b).metadata();
  await sharp({
    create: {
      width: 1624,
      height: Math.max(am.height!, bm.height!),
      channels: 3,
      background: "#f3f0ea",
    },
  })
    .composite([
      { input: a, left: 0, top: 0 },
      { input: b, left: 824, top: 0 },
    ])
    .png()
    .toFile(`docs/screenshots/brand-polish/brand-${state}-reference.png`);
  await ref.close();
}
test("one shared picker toggles reliably, closes every way, and accepts low-contrast Primary exactly", async ({
  page,
}) => {
  const f = await fixture(page),
    trigger = page.getByRole("button", {
      name: "Edit primary color",
      exact: true,
    });
  for (let n = 0; n < 4; n++) {
    await trigger.click();
    await expect(picker(page)).toBeVisible();
    await trigger.click();
    await expect(picker(page)).toHaveCount(0);
  }
  await trigger.dblclick();
  await expect(picker(page)).toHaveCount(0);
  await trigger.press("Space");
  await expect(picker(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("heading", { name: "Brand", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await trigger.click();
  await page.getByLabel("Hex color", { exact: true }).fill("#ea4e26");
  await expect(
    picker(page).getByText(/fine for backgrounds and large text/),
  ).toBeVisible();
  await expect.poll(() => f.settings.accent_colour).toBe("#ea4e26");
  await expect(picker(page)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".color-picker-menu").analyze())
      .violations,
  ).toEqual([]);
  await page
    .getByRole("slider", { name: "Saturation and brightness" })
    .press("ArrowLeft");
  await page.getByLabel("Hue", { exact: true }).press("ArrowRight");
  await page.getByLabel("Hex color", { exact: true }).fill("#ea4e26");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect.poll(() => f.settings.accent_colour).toBe("#ea4e26");
  const cover = defaultCover(true);
  cover.elements!.find((e) => e.kind === "eyebrow")!.content =
    coverText("Project proposal");
  await f.editRemote({ cover });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const eyebrow = page.locator(".editor-paper .flow-eyebrow");
  await expect(eyebrow).toBeVisible();
  const rgb = await eyebrow.evaluate((el) => getComputedStyle(el).color);
  const shade = accessibleAccent("#ea4e26");
  expect(whiteContrast(shade)).toBeGreaterThanOrEqual(4.5);
  expect(rgb).toBe(
    `rgb(${shade
      .match(/[\da-f]{2}/g)!
      .map((v) => parseInt(v, 16))
      .join(", ")})`,
  );
  await expect(page.locator(".editor-paper .cover-main-group")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await f.editRemote({
    cover: {
      ...f.active().cover!,
      background: { type: "solid", graphic: "none" },
    },
  });
  await page.reload();
  await expect(page.locator(".editor-paper .cover-decoration")).toHaveCSS(
    "background-color",
    "rgb(234, 78, 38)",
  );
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.locator(".cover-settings-accordion>summary").click();
  await page.getByRole("button", { name: /^Edit background color/ }).click();
  await expect(picker(page)).toBeVisible();
  await expect(
    picker(page).getByRole("button", { name: "Use brand color #ea4e26" }),
  ).toBeVisible();
  await expect(page.locator("input[type=color]")).toHaveCount(0);
});
test("Brand swatches add/edit/remove, cap at five, and Primary has no remove action", async ({
  page,
}) => {
  const f = await fixture(page);
  await page
    .getByRole("button", { name: "Edit primary color", exact: true })
    .click();
  await expect(
    picker(page).getByRole("button", { name: "Remove color" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (let n = 0; n < 3; n++) {
    await page.getByRole("button", { name: "Add color", exact: true }).click();
    await expect(picker(page)).toBeVisible();
    const added = page.getByRole("button", {
      name: `Edit color ${n + 3}`,
      exact: true,
    });
    await added.click();
    await expect(picker(page)).toHaveCount(0);
    await added.click();
    await expect(picker(page)).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Add color", exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => f.settings.brand_palette?.length).toBe(4);
  await page.getByRole("button", { name: "Edit color 3", exact: true }).click();
  await page.getByLabel("Hex color", { exact: true }).fill("#884422");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect.poll(() => f.settings.brand_palette?.[1]).toBe("#884422");
  await page.getByRole("button", { name: "Edit color 3", exact: true }).click();
  await page.getByRole("button", { name: "Remove color", exact: true }).click();
  await expect.poll(() => f.settings.brand_palette?.length).toBe(3);
  expect(f.settings.accent_colour).toBe("#365c4a");
  await expect(
    page.getByRole("button", { name: "Add color", exact: true }),
  ).toBeVisible();
});
test("logo suggestions add one/all or dismiss without replacing saved colors; capture the artboard comparison", async ({
  page,
}) => {
  const f = await fixture(page),
    group = page.getByRole("region", { name: "Brand colors", exact: true });
  await page.locator("#workspace-logo-upload").setInputFiles({
    name: "Studio logo.png",
    mimeType: "image/png",
    buffer: f.logo,
  });
  await expect(page.getByText("From your logo", { exact: true })).toBeVisible();
  expect(f.settings.brand_palette).toEqual(["#335577"]);
  expect(f.settings.accent_colour).toBe("#365c4a");
  await group.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(page, "brand-suggestions-1440");
  await pair(page, group, "with");
  await page
    .getByRole("button", { name: "Edit primary color", exact: true })
    .click();
  await shot(page, "picker-open-1440");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Add #EA4E26 to brand colors", exact: true })
    .click();
  await expect
    .poll(() => f.settings.brand_palette)
    .toEqual(["#335577", "#ea4e26"]);
  await expect(
    page.getByRole("button", { name: "Add #EA4E26 to brand colors" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add all", exact: true }).click();
  await expect
    .poll(() => f.settings.brand_palette)
    .toEqual(["#335577", "#ea4e26", "#74ccdb"]);
  await expect(page.getByText("From your logo", { exact: true })).toHaveCount(
    0,
  );
  await shot(page, "brand-no-suggestions-1440");
  await pair(page, group, "without");
  await page
    .getByRole("button", { name: "Suggest from logo", exact: true })
    .click();
  await expect(page.getByText("From your logo", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Edit color 3", exact: true }).click();
  await page.getByRole("button", { name: "Remove color", exact: true }).click();
  await page
    .getByRole("button", { name: "Suggest from logo", exact: true })
    .click();
  await expect(page.getByText("From your logo", { exact: true })).toBeVisible();
  const before = [...(f.settings.brand_palette ?? [])];
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  expect(f.settings.brand_palette).toEqual(before);
});
