import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultCover } from "../src/lib/cover";
import {
  defaultHeaderFooter,
  BandSpacingSchema,
  pageGeometry,
  bandImages,
} from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
test("a tiny logo retains every image action at intrinsic toolbar width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    c.getContext("2d")!.fillRect(0, 0, 24, 24);
    return c.toDataURL("image/png");
  });
  await f.editRemote({
    cover: { ...defaultCover(), logo: src, logo_height: 24 },
  });
  await page.goto(`/proposals/${f.draft.id}`);
  const image = page.locator('.document-cover [data-image-kind="cover"] img');
  await image.click();
  const bar = page.getByRole("toolbar", { name: "Image actions" });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute("data-placement", "above");
  const b = (await bar.boundingBox())!,
    i = (await image.boundingBox())!;
  expect(i.width).toBe(24);
  expect(b.width).toBeGreaterThan(200);
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(1440);
  for (const button of await bar.getByRole("button").all()) {
    await expect(button).toBeVisible();
    const r = (await button.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(b.x);
    expect(r.x + r.width).toBeLessThanOrEqual(b.x + b.width + 1);
  }
  await bar.getByRole("button", { name: "Alt text", exact: true }).click();
  await expect(page.getByLabel("Alt text", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(bar).toHaveCSS("position", "fixed");
  for (const button of await bar.getByRole("button").all()) {
    const r = (await button.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(375);
    expect(r.width).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(bar).toHaveCSS("position", "absolute");
  await expect
    .poll(async () => {
      const r = (await bar.boundingBox())!,
        p = (await page.locator(".page-sheet").first().boundingBox())!;
      return r.x >= p.x && r.x + r.width <= p.x + p.width;
    })
    .toBe(true);
});
test("every cover line edits with formatting, shared spacing, extra lines, field insertion and exact undo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  for (const name of [
    "Cover workspace name",
    "Proposal title",
    "Cover client name",
    "Cover byline",
  ]) {
    await page.getByRole("textbox", { name, exact: true }).click();
    await expect(
      page.getByRole("toolbar", { name: "Cover text formatting" }),
    ).toBeVisible();
  }
  const client = page.getByRole("textbox", {
    name: "Cover client name",
    exact: true,
  });
  await client.click();
  await client.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(client).toBeFocused();
  await expect(client.locator("strong")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Align", exact: true }).click();
  await page.getByRole("button", { name: "Align center", exact: true }).click();
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Space below", exact: true })
    .fill("32");
  const line = page.locator('[data-cover-element="prepared_for"]');
  await expect(line).toHaveCSS("text-align", "center");
  await expect(line).toHaveCSS("margin-bottom", "32px");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBeGreaterThan(0);
  const html = f.renders.at(-1)!.layout.sheets![0].html;
  expect(html).toContain("text-align:center");
  expect(html).toContain("margin-bottom:32px");
  await page
    .getByRole("button", { name: "Close PDF preview", exact: true })
    .click();
  await client.click();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page
    .getByRole("button", { name: "Add line below", exact: true })
    .click();
  const extra = page.getByRole("textbox", {
    name: "Cover extra line",
    exact: true,
  });
  await expect(extra).toBeFocused();
  await extra.fill("A personal introduction");
  await expect
    .poll(
      () =>
        f.active().cover?.elements?.find((e) => e.kind === "extra")?.content,
    )
    .toBeTruthy();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page.getByRole("button", { name: "Remove line", exact: true }).click();
  await expect(extra).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(extra).toHaveText("A personal introduction");
});
test("cover logo pointer drag snaps to center and undo restores its previous position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 50;
    c.getContext("2d")!.fillRect(0, 0, 100, 50);
    return c.toDataURL("image/png");
  });
  await f.editRemote({
    cover: { ...defaultCover(), logo: src, logo_height: 50 },
  });
  await page.goto(`/proposals/${f.draft.id}`);
  const logo = page.locator(".document-cover .cover-logo"),
    img = logo.locator("img");
  const box = (await logo.boundingBox())!,
    b = (await img.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, b.y + b.height / 2, {
    steps: 12,
  });
  await expect(
    page.locator(".cover-snap-guide[data-snap=center]"),
  ).toBeVisible();
  await page.mouse.up();
  await expect
    .poll(
      () => f.active().cover?.elements?.find((e) => e.kind === "logo")?.align,
    )
    .toBe("center");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => f.active().cover?.elements).toBeUndefined();
  await img.click();
  await page.getByRole("button", { name: "Align", exact: true }).click();
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await expect
    .poll(
      () => f.active().cover?.elements?.find((e) => e.kind === "logo")?.align,
    )
    .toBe("right");
  await expect
    .poll(async () => {
      const bar = (await page
          .getByRole("toolbar", { name: "Image actions" })
          .boundingBox())!,
        paper = (await page.locator(".page-sheet").first().boundingBox())!;
      return bar.x + bar.width <= paper.x + paper.width;
    })
    .toBe(true);
  await f.editRemote({
    cover: {
      ...f.active().cover!,
      elements: f
        .active()
        .cover!.elements!.map((e) =>
          e.kind === "logo" ? { ...e, x: 400, align: "left" } : e,
        ),
    },
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect
    .poll(async () => {
      const r = (await page.locator(".cover-logo img").boundingBox())!,
        c = (await page.locator(".cover-logo").boundingBox())!;
      return r.x + r.width <= c.x + c.width + 1;
    })
    .toBe(true);
  expect(f.active().cover?.elements?.find((e) => e.kind === "logo")?.x).toBe(
    400,
  );
});
test("independent large header geometry agrees with the actual PDF and every editor page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1200 });
  const f = await editorFixture(page);
  const hf = {
    ...defaultHeaderFooter(),
    headerSpacing: BandSpacingSchema.parse({ distanceIn: 0.4, heightIn: 0.6 }),
    footerSpacing: BandSpacingSchema.parse({
      distanceIn: 0.25,
      heightIn: 0.25,
    }),
  };
  const src = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 100;
    c.getContext("2d")!.fillRect(0, 0, 300, 100);
    return c.toDataURL("image/png");
  });
  bandImages(hf.shared.header)[0].node.attrs = {
    src,
    alt: "Large header logo",
    height: 57.6,
  };
  await f.editRemote({ header_footer: hf });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator("[data-layout-settled=true]").waitFor();
  const g = pageGeometry(resolveStyles(f.settings), hf, 1);
  expect(g.margins.top).toBeCloseTo(111, 8);
  expect(
    await page
      .locator("[data-band-frame=header] img")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).height)),
  ).toBeCloseTo(57.6, 1);
  const areas = await page
    .locator(".editor-page-sheets .page-sheet")
    .evaluateAll((es) =>
      es.map((el) => {
        const s = getComputedStyle(el);
        return (
          el.getBoundingClientRect().height -
          parseFloat(s.paddingTop) -
          parseFloat(s.paddingBottom)
        );
      }),
    );
  for (const area of areas) expect(area).toBeCloseTo(g.content.height, 0);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBeGreaterThan(0);
  for (const sheet of f.renders.at(-1)!.layout.sheets!)
    expect(sheet.content_area!.height).toBeCloseTo(g.content.height, 0);
  const height = await page.evaluate(
    (html) =>
      parseFloat(
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector<HTMLImageElement>("[data-page-band=header] img")!.style
          .height,
      ),
    f.renders.at(-1)!.layout.sheets![1].html,
  );
  expect(height).toBeCloseTo(57.6, 1);
});
test("cover fields insert at the cursor and hiding its title preserves proposal metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const client = page.getByRole("textbox", {
    name: "Cover client name",
    exact: true,
  });
  await client.fill("Dear ");
  await client.press("End");
  await page.getByRole("button", { name: "Insert field", exact: true }).click();
  await page
    .locator(".cover-controls-popover")
    .getByRole("button", { name: /Client first name/ })
    .click();
  await expect(client.locator('[data-field="client.first_name"]')).toHaveText(
    "Jane",
  );
  await page.keyboard.press("Escape");
  const title = f.active().title;
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page.getByRole("button", { name: "Remove line", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Proposal title", exact: true }),
  ).toHaveCount(0);
  expect(f.active().title).toBe(title);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(
    page.getByRole("textbox", { name: "Proposal title", exact: true }),
  ).toHaveText(title);
  const titleInput = page.getByRole("textbox", {
    name: "Proposal title",
    exact: true,
  });
  await titleInput.fill("x".repeat(300));
  await titleInput.press("End");
  await titleInput.pressSequentially("x");
  await expect(titleInput).toHaveText("x".repeat(300));
  await expect.poll(() => f.active().title).toBe("x".repeat(300));
});
test("375px cover formatting follows the visual viewport with reachable controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  const bar = page.getByRole("toolbar", { name: "Cover text formatting" });
  await expect(bar).toHaveCSS("position", "fixed");
  await expect(
    page.getByRole("navigation", { name: "Proposal tools", exact: true }),
  ).toBeHidden();
  const more = bar.getByRole("button", { name: "More cover actions" });
  expect(
    await more.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        document
          .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          ?.closest("button") === el
      );
    }),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 550,
    });
    Object.defineProperty(window.visualViewport!, "offsetTop", {
      configurable: true,
      value: 5,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () =>
      Math.round(
        (await bar.boundingBox())!.y + (await bar.boundingBox())!.height,
      ),
    )
    .toBe(555);
  for (const button of await bar.getByRole("button").all()) {
    const r = (await button.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  await bar.getByRole("button", { name: "More cover actions" }).click();
  await expect(
    page.getByRole("button", { name: "Add line below", exact: true }),
  ).toBeVisible();
});
test("Quote disclosures point right/down with a distinct heavy 10px icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const row = page.locator(".quote-row-toggle").first(),
    chevron = row.locator(".disclosure-chevron");
  await expect(chevron).toHaveAttribute("data-open", "true");
  await expect(chevron).toHaveCSS("width", "10px");
  await expect(chevron).toHaveAttribute("viewBox", "0 0 320 512");
  await expect(chevron).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
  await row.click();
  await expect(chevron).toHaveAttribute("data-open", "false");
  await expect(chevron).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Text styles", { exact: true }).click();
  const dropdown = page.locator(".proposal-styles select").first();
  const snapshot = await dropdown.evaluate((el) => ({
    image: getComputedStyle(el).backgroundImage,
    width: getComputedStyle(el).backgroundSize,
  }));
  expect(snapshot.image).toContain("viewBox='0 0 512 512'");
  expect(snapshot.width).toContain("12px");
});
