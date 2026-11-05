import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { testSignatureImage } from "../tests/helpers";

for (const width of [1440, 375])
  test(`required and optional products share the 20px slot and 12px gap at ${width}`, async ({
    page,
  }) => {
    const f = await editorFixture(page, false, {
      quote: (base) =>
        [false, true].map((optional, n) => ({
          ...structuredClone(base[0]),
          id: crypto.randomUUID(),
          order: n,
          name: optional ? "Optional product" : "Required product",
          optional,
          default_selected: true,
          selected: true,
          sublines: base[0].sublines.map((s) => ({
            ...s,
            id: crypto.randomUUID(),
          })),
        })),
    });
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`/proposals/${f.draft.id}`);
    const check = async (selector: string) => {
      if (width >= 1100 && selector === "#proposal-document")
        // The hidden canonical measurement stage also contains quote rows. Only
        // compare visible scaled sheets after their atomic layout commit.
        await expect(page.locator(".client-document-sheets")).toHaveAttribute(
          "data-layout-ready",
          "true",
        );
      const rows = page.locator(selector).first().locator(".flow-quote-line");
      await expect(rows).toHaveCount(2);
      const geometry = await rows.evaluateAll((els) =>
        els.map((el) => {
          const slot = el.querySelector<HTMLElement>(".quote-control-slot")!,
            name = el.querySelector(".flow-line-title strong")!,
            control =
              slot.querySelector(".print-selection") ?? slot.firstElementChild!,
            r = el.getBoundingClientRect(),
            s = slot.getBoundingClientRect(),
            c = control.getBoundingClientRect(),
            n = name.getBoundingClientRect();
          const root = el.getRootNode();
          const scale =
            root instanceof ShadowRoot
              ? Number((root.host as HTMLElement).dataset.scale ?? 1)
              : 1;
          return {
            name: (n.left - r.left) / scale,
            slot: s.width / scale,
            gap: (n.left - s.right) / scale,
            controlWidth: c.width / scale,
            controlLeft: (c.left - s.left) / scale,
          };
        }),
      );
      expect(Math.abs(geometry[0].name - geometry[1].name)).toBeLessThanOrEqual(
        1,
      );
      for (const g of geometry) {
        expect(g.slot).toBeCloseTo(20, 3);
        expect(g.gap).toBeCloseTo(12, 3);
        expect(g.controlWidth).toBeCloseTo(20, 3);
        expect(g.controlLeft).toBeCloseTo(0, 3);
      }
    };
    await page
      .locator('.editor-page-sheets[data-layout-settled="true"]')
      .waitFor();
    await check(".editor-paper .document-quote");
    if (width === 1440) {
      await page
        .getByRole("button", { name: "Preview PDF", exact: true })
        .click();
      await expect.poll(() => f.renders.length).toBe(1);
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loading = getDocument({
        data: new Uint8Array(Buffer.from(f.renders[0].pdf_base64, "base64")),
      });
      const doc = await loading.promise;
      const positions: number[] = [];
      for (let n = 1; n <= doc.numPages; n++)
        for (const item of (await (await doc.getPage(n)).getTextContent())
          .items)
          if ("str" in item && /^(Required|Optional) product$/.test(item.str))
            positions.push(item.transform[4]);
      expect(positions).toHaveLength(2);
      expect(Math.abs(positions[0] - positions[1])).toBeLessThanOrEqual(0.75);
      await loading.destroy();
    }
    await page.goto(`/p/${f.draft.id}?preview=1`);
    await check("#proposal-document");
    await page.getByRole("checkbox", { name: /Optional product/ }).uncheck();
    await expect(
      page.getByRole("checkbox", { name: /Optional product/ }),
    ).not.toBeChecked();
  });

test("cover logo upload is a keyboard button and its menu avoids the title", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("button", { name: "Edit cover logo", exact: true })
    .click();
  const menu = page.locator(".cover-logo-menu"),
    upload = menu.getByRole("button", { name: "Upload logo", exact: true });
  await expect(upload).toBeVisible();
  await expect(menu.locator('input[type="file"]')).toBeHidden();
  const styles = await menu.getByRole("button").evaluateAll((els) =>
    els.map((el) => {
      const s = getComputedStyle(el);
      return {
        height: s.height,
        radius: s.borderRadius,
        font: s.font,
        padding: s.padding,
      };
    }),
  );
  expect(styles).toHaveLength(3);
  expect(styles[0]).toEqual(styles[1]);
  expect(styles[0]).toEqual(styles[2]);
  const box = await menu.boundingBox(),
    title = await page.locator(".document-cover h1").boundingBox();
  expect(box).not.toBeNull();
  expect(title).not.toBeNull();
  expect(
    box!.x + box!.width <= title!.x ||
      box!.x >= title!.x + title!.width ||
      box!.y + box!.height <= title!.y ||
      box!.y >= title!.y + title!.height,
  ).toBe(true);
  await upload.focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from(testSignatureImage.split(",")[1], "base64"),
  });
  await expect(menu).toHaveCount(0);
  await expect.poll(() => f.active().cover?.logo).toBe(testSignatureImage);
  await expect(page.locator(".document-cover .cover-logo img")).toBeVisible();
});
