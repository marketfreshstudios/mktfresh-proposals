import { test, expect, type Locator } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultCover } from "../src/lib/cover";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { previewResult } from "../src/lib/preview";
import { pdfPreview } from "../src/lib/pdf-preview";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
async function inline(lockup: Locator, nameClass: string) {
  await expect(lockup.locator("img")).toBeVisible();
  const boxes = await lockup.evaluate((el, nameClass) => {
    const image = el.querySelector("img")!,
      scale = image.getBoundingClientRect().height / image.offsetHeight,
      a = image.getBoundingClientRect(),
      b = el.querySelector(nameClass)!.getBoundingClientRect();
    return {
      gap: (b.left - a.right) / scale,
      center: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) / scale,
      height: a.height / scale,
    };
  }, nameClass);
  expect(boxes.gap).toBeCloseTo(10, 0);
  expect(boxes.center).toBeLessThanOrEqual(1);
  return boxes;
}
test("icon-only workspace branding stays beside the name in the cover and header, editor, client and print", async ({
  page,
}, info) => {
  const f = await editorFixture(page);
  const png = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><path d="M128 160Q128 96 192 96H832V288H352V416H736V608H352V736H832V928H192Q128 928 128 864Z" fill="#2f5d50"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  f.settings.logo = "";
  f.settings.logo_icon = {
    path: `${f.repo.workspaceId}/workspace-icon/${"b".repeat(64)}.png`,
    name: "Studio mark.png",
    size: png.length,
    width: 1024,
    height: 1024,
  };
  await f.repo.put("workspace_settings", f.settings);
  await f.editRemote({
    cover: defaultCover(true),
    header_footer: defaultHeaderFooter(),
  });
  await page.route("**/api/workspace-icon**", (r) =>
    r.fulfill({ contentType: "image/png", body: png }),
  );
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(`/proposals/${f.draft.id}/edit`);
  const cover = page.locator('.editor-paper .cover-logo[data-brand="true"]');
  expect((await inline(cover, ".cover-brand-name")).height).toBeCloseTo(26, 0);
  if (process.env.CAPTURE_UPDATES) {
    await mkdir("docs/screenshots/deployment-notice", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/deployment-notice/cover-icon-name-1440.png",
    });
  }
  const band = page.locator('[data-band-frame="header"][data-band-page="2"]');
  expect(
    (await inline(band.locator(".band-brand-lockup"), ".band-brand-name"))
      .height,
  ).toBeCloseTo(16, 0);
  await band.click();
  await expect(band).toHaveAttribute("data-band-state", "editing");
  await inline(band.locator(".band-brand-lockup"), ".band-brand-name");
  await page.keyboard.press("Escape");
  const plan = JSON.parse(
    (await page.locator(".editor-paper").getAttribute("data-pagination"))!,
  );
  const p = { ...f.active(), pagination: plan };
  const publicView = previewResult(p, f.settings);
  await page.route("**/api/public/**", (r) => r.fulfill({ json: publicView }));
  await page.goto("/p/branding-check");
  const sheets = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await inline(
    sheets.locator(".cover-logo[data-brand=true]"),
    ".cover-brand-name",
  );
  await inline(
    sheets.locator('[data-page-band="header"] .band-brand-lockup').first(),
    ".band-brand-name",
  );
  const pdf = await pdfPreview(
    f.repo,
    { get: async () => png, put: async () => {} },
    p,
    f.settings,
  );
  const file = info.outputPath("brand.pdf");
  await writeFile(file, Buffer.from(pdf.pdf_base64, "base64"));
  expect(
    execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }),
  ).toContain(f.settings.company_name);
  expect(
    pdf.layout.sheets!.some((s) => s.html.includes("band-brand-lockup")),
  ).toBe(true);
});
