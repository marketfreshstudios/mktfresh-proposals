import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultHeaderFooter, pageGeometry } from "../src/lib/page-bands";
import { defaultCover } from "../src/lib/cover";
import { resolveStyles } from "../src/lib/proposal-styles";
async function imageFixture(page: import("@playwright/test").Page) {
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 180;
    const x = c.getContext("2d")!;
    x.fillStyle = "#789b8b";
    x.fillRect(0, 0, 320, 180);
    return c.toDataURL("image/png");
  });
  const f = await editorFixture(page, false, {
    content: [
      { id: "image-heading", type: "heading", text: "Visual overview" },
      {
        id: "photo",
        type: "image",
        src,
        alt: "Project example",
        width_percent: 50,
      },
      { id: "next-page", type: "page_break" },
      {
        id: "next-text",
        type: "paragraph",
        text: "Details on the following page.",
      },
      { id: "pricing", type: "pricing_table" },
      { id: "client-signature", type: "signature_block", role: "client" },
    ],
  });
  const hf = defaultHeaderFooter();
  hf.shared.header.image = { src, alt: "Band logo", slot: 0, height: 18 };
  await f.editRemote({
    header_footer: hf,
    cover: { ...defaultCover(), logo: src, logo_height: 60 },
  });
  return { f, src };
}
test("block, cover and band image controls resize with locked proportions, save and undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { f } = await imageFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const block = page.locator(
    '[data-block-id="block-photo"] [data-image-kind="block"]',
  );
  await block.locator("img").click();
  await expect(block.getByRole("button", { name: /Resize image/ })).toHaveCount(
    4,
  );
  const old = f.active().content.find((b) => b.id === "photo")!.width_percent;
  const box = (await block
    .getByRole("button", { name: "Resize image bottom right", exact: true })
    .boundingBox())!;
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + 82, box.y + 52, { steps: 8 });
  await expect(block.getByRole("status")).toContainText("×");
  const size = await block.locator("img").boundingBox();
  expect(size!.width / size!.height).toBeCloseTo(320 / 180, 2);
  await page.mouse.up();
  await expect
    .poll(() => f.active().content.find((b) => b.id === "photo")!.width_percent)
    .toBeGreaterThan(old!);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => f.active().content.find((b) => b.id === "photo")!.width_percent)
    .toBe(old);
  await block.locator("img").click();
  await block.getByRole("button", { name: "Alt text", exact: true }).click();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("Clear accessible image");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => f.active().content.find((b) => b.id === "photo")!.alt)
    .toBe("Clear accessible image");
  const cover = page.locator('.document-cover [data-image-kind="cover"]');
  await cover.locator("img").click();
  await cover.press("Shift+ArrowDown");
  await expect.poll(() => f.active().cover?.logo_height).toBe(70);
  const band = page.locator('[data-band-frame="header"]').first();
  await band.locator("img").click();
  const bandImage = band.locator('[data-image-kind="band"]');
  await expect(bandImage).toHaveAttribute("data-image-selected", "true");
  const corner = bandImage.getByRole("button", {
    name: "Resize image bottom right",
    exact: true,
  });
  const rect = (await corner.boundingBox())!;
  await page.mouse.move(rect.x + 40, rect.y + 40);
  await page.mouse.down();
  await page.mouse.move(rect.x + 500, rect.y + 500, { steps: 8 });
  await page.mouse.up();
  const limit = pageGeometry(
    resolveStyles(f.settings),
    f.active().header_footer,
    2,
  ).bandLimits.header.imageHeight;
  await expect
    .poll(() => f.active().header_footer!.shared.header.image!.height!)
    .toBeCloseTo(limit, 2);
  const height = await bandImage
    .locator("img")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeCloseTo(limit, 1);
});

test("image deletion and keyboard resizing use normal editor history", async ({
  page,
}) => {
  const { f } = await imageFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const image = page.locator(
    '[data-block-id="block-photo"] [data-image-kind="block"]',
  );
  await image.focus();
  await image.press("Enter");
  await image.press("Shift+ArrowRight");
  await expect
    .poll(() => f.active().content.find((b) => b.id === "photo")!.width_percent)
    .toBeGreaterThan(50);
  await image.press("Delete");
  await expect
    .poll(() => f.active().content.some((b) => b.id === "photo"))
    .toBe(false);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(image).toBeVisible();
  await expect
    .poll(() => f.active().content.filter((b) => b.id === "photo").length)
    .toBe(1);
});
