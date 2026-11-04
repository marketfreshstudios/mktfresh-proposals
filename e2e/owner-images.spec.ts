import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import {
  defaultHeaderFooter,
  pageGeometry,
  bandImages,
} from "../src/lib/page-bands";
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
  await page.getByLabel("Alt text", { exact: true }).press("End");
  await page.getByLabel("Alt text", { exact: true }).press("Backspace");
  await expect(block.locator("img")).toHaveCount(1);
  await page.getByLabel("Alt text", { exact: true }).press("e");
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

  expect(
    await corner.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return (
        document
          .elementFromPoint(b.x + 40, b.y + 40)
          ?.closest(".image-resize-handle") === el
      );
    }),
  ).toBe(true);
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
    .poll(
      () =>
        bandImages(f.active().header_footer!.shared.header)[0].node.attrs!
          .height!,
    )
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

test("band images drag across columns with an insertion caret and exact undo", async ({
  page,
}) => {
  const { f } = await imageFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const band = page.locator('[data-band-frame="header"]').first();
  await band.locator("img").click();
  const img = band.locator('[data-image-kind="band"] img'),
    target = band.getByRole("textbox", { name: "header column 2" });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const box = (await target.boundingBox())!;
  await img.dispatchEvent("dragstart", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", {
    dataTransfer: transfer,
    clientX: box.x + box.width - 4,
    clientY: box.y + 8,
  });
  await expect(page.locator(".band-image-insertion-caret")).toBeVisible();
  await target.dispatchEvent("drop", {
    dataTransfer: transfer,
    clientX: box.x + box.width - 4,
    clientY: box.y + 8,
  });
  await expect
    .poll(() =>
      bandImages(f.active().header_footer!.shared.header)
        .filter((i) => i.node.attrs?.alt === "Band logo")
        .map((i) => i.slot),
    )
    .toEqual([1]);
  await expect(page.locator(".band-image-insertion-caret")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      bandImages(f.active().header_footer!.shared.header)
        .filter((i) => i.node.attrs?.alt === "Band logo")
        .map((i) => i.slot),
    )
    .toEqual([0]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await band.locator('[data-image-kind="band"] img').click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect
    .poll(
      () =>
        bandImages(f.active().header_footer!.shared.header).filter(
          (i) => i.node.attrs?.alt === "Band logo",
        ).length,
    )
    .toBe(0);
  await target.click();
  await target.press("End");
  await page.keyboard.press("ControlOrMeta+v");
  await expect
    .poll(() =>
      bandImages(f.active().header_footer!.shared.header)
        .filter((i) => i.node.attrs?.alt === "Band logo")
        .map((i) => i.slot),
    )
    .toEqual([1]);
});
test("phone touch resizing keeps proportions and the shared dark image toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const { f } = await imageFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const image = page.locator(
    '[data-block-id="block-photo"] [data-image-kind="block"]',
  );
  await image.locator("img").click();
  await expect(image.getByRole("toolbar")).toHaveCSS(
    "background-color",
    "rgb(28, 27, 24)",
  );
  const corner = image.getByRole("button", {
    name: "Resize image bottom right",
    exact: true,
  });
  await corner.scrollIntoViewIfNeeded();
  const b = (await corner.boundingBox())!,
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: b.x + 22, y: b.y + 22 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: b.x + 2, y: b.y + 12 }],
  });
  await expect(image.getByRole("status")).toContainText("×");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(() => f.active().content.find((b) => b.id === "photo")?.width_percent)
    .toBeLessThan(50);
  const box = (await image.locator("img").boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(320 / 180, 2);
});
test("wide cover logos fit the column proportionally without changing their stored size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const { f } = await imageFixture(page);
  const wide = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 100;
    c.getContext("2d")!.fillRect(0, 0, 1000, 100);
    return c.toDataURL("image/png");
  });
  await f.editRemote({
    cover: { ...defaultCover(), logo: wide, logo_height: 60 },
  });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const image = page.locator('.document-cover [data-image-kind="cover"] img');
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(1000);
  const size = (await image.boundingBox())!;
  expect(size.width / size.height).toBeCloseTo(10, 1);
  expect(size.height).toBeLessThan(60);
  expect(f.active().cover?.logo_height).toBe(60);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(() => image.evaluate((el) => el.getBoundingClientRect().height))
    .toBeCloseTo(60, 1);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  expect(f.renders[0].layout.sheets![0].html).toMatch(
    /data-image-height="60"[^>]*height: ?60px/,
  );
});
test("a single band click places the caret at the clicked text", async ({
  page,
}) => {
  const { f } = await imageFixture(page);
  const hf = defaultHeaderFooter();
  hf.shared.header.slots[0] = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before after" }] },
    ],
  };
  await f.editRemote({ header_footer: hf });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const band = page.locator('[data-band-frame="header"]').first();
  await band.scrollIntoViewIfNeeded();
  const text = band.locator('[data-band-slot="0"] p');
  const point = await text.evaluate((el) => {
    const r = document.createRange();
    r.setStart(el.firstChild!, 7);
    r.collapse(true);
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top + b.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  await expect(
    band.getByRole("textbox", { name: "header column 1" }),
  ).toBeFocused();
  await page.keyboard.type("here ");
  await expect(
    band.getByRole("textbox", { name: "header column 1" }),
  ).toHaveText("Before here after");
  await expect(
    band.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
});
