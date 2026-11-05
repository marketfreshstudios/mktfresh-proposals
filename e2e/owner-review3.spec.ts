import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { mkdirSync, writeFileSync } from "node:fs";
const shots = "docs/screenshots/owner-review3";
test("review3 before evidence", async ({ page }, testInfo) => {
  test.skip(process.env.REVIEW3_BEFORE !== "1", "One-time before evidence");
  mkdirSync(shots, { recursive: true });
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  await page.getByRole("button", { name: "Align", exact: true }).click();
  await page.screenshot({ path: `${shots}/cover-menu-before.png` });
  await page.goto(`/p/${f.draft.id}?preview=1`);
  const insets: any[] = [];
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".document-cover")).toBeVisible();
    insets.push(
      await page.locator(".document-cover").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: innerWidth, left: r.left, right: innerWidth - r.right };
      }),
    );
    if (width === 375) {
      await page.screenshot({ path: `${shots}/client-intro-before.png` });
      await page.locator(".flow-quote").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/client-pricing-before.png` });
    }
  }
  writeFileSync(
    testInfo.outputPath("review3-insets-before.json"),
    JSON.stringify(insets, null, 2),
  );
});
test("edit popovers use application typography inside the cover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Proposal title", exact: true })
    .click();
  const styles = [];
  for (const name of [
    "Align",
    "Spacing",
    "More cover actions",
    "Insert field",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const menu = page.locator(".cover-controls-popover");
    styles.push(
      await menu.evaluate((el) => {
        const s = getComputedStyle(el);
        return [
          s.fontSize,
          s.fontFamily,
          s.fontWeight,
          s.lineHeight,
          s.textAlign,
        ];
      }),
    );
    await page.keyboard.press("Escape");
  }
  expect(styles[0][0]).toBe("13px");
  expect(styles[0][1]).toContain("Instrument Sans");
  expect(styles[1]).toEqual(styles[0]);
  expect(styles[2]).toEqual(styles[0]);
  expect(styles[3]).toEqual(styles[0]);
  const paragraph = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
  await paragraph.locator(".tiptap").click();
  await paragraph
    .getByRole("button", { name: "More block actions", exact: true })
    .click();
  const body = await page.locator(".edit-more-menu").evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.fontSize, s.fontFamily];
  });
  expect(styles[0].slice(0, 2)).toEqual(body);
  await page.keyboard.press("Escape");
  const band = page.locator('[data-band-frame="header"]').first();
  await band.scrollIntoViewIfNeeded();
  await band.click();
  for (const name of ["Layout", "Insert band field", "Image"]) {
    await band.getByRole("button", { name, exact: true }).click();
    expect(
      await page.locator(".band-popover").evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.fontSize, s.fontFamily];
      }),
    ).toEqual(body);
    await page.keyboard.press("Escape");
  }
  await band.getByRole("button", { name: "Done", exact: true }).click();
  await band.hover();
  await band
    .getByRole("button", { name: "header actions", exact: true })
    .click();
  expect(
    await page.locator(".band-popover").evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.fontSize, s.fontFamily];
    }),
  ).toEqual(body);
});
async function middleWord(
  page: import("@playwright/test").Page,
  selector: string,
) {
  return page.locator(selector).evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      const match = /\b\w+\b/g;
      match.exec(text);
      const m = match.exec(text);
      if (!m) continue;
      const r = document.createRange();
      r.setStart(n, m.index);
      r.setEnd(n, m.index + m[0].length);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return m[0];
    }
    throw Error("Middle word unavailable");
  });
}
test("cover formatting retains the selected middle word through rerenders", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await f.editRemote({ title: "A thoughtful project proposal" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const title = page.getByRole("textbox", {
    name: "Proposal title",
    exact: true,
  });
  await title.click();
  const word = await middleWord(page, "#cover-title");
  for (const name of ["Bold", "Italic"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => getSelection()?.toString()))
      .toBe(word);
  }
  await expect(title.locator("strong em,em strong")).toHaveText(word);
  await expect(title).toHaveText("A thoughtful project proposal");
  await expect
    .poll(
      () =>
        f.active().cover?.elements?.find((e) => e.kind === "title")?.content,
    )
    .toBeTruthy();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(word);
});
test("cover field atoms have the same highlight as band fields", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const chip = page
    .locator('.document-cover [data-field="workspace.name"]')
    .first();
  await expect(chip).toHaveCSS("background-color", "rgb(240, 236, 228)");
  await expect(chip).toHaveCSS("border-radius", "4px");
});
test("phone client content has a single inset, full-width details and unwrapped prices", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    quote: (q) =>
      q.map((item, n) => ({
        ...item,
        name: n === 0 ? "Website Build" : item.name,
        description: "A full-width description for the agreed work.",
        sublines:
          n === 0
            ? [{ ...item.sublines[0], amount: 275000, interval: "one_time" }]
            : item.sublines,
      })),
  });
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/p/${f.draft.id}?preview=1`);
    const paper = page.locator(".flow-document");
    await expect(paper).toBeVisible();
    const inset = await paper.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el);
      return {
        left: r.left + parseFloat(s.paddingLeft),
        right: innerWidth - r.right + parseFloat(s.paddingRight),
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      };
    });
    expect(inset.left).toBeLessThanOrEqual(16);
    expect(inset.right).toBeLessThanOrEqual(16);
    expect(inset.scroll).toBe(inset.width);
    const totalsInset = await page
      .locator(".flow-choices .flow-totals > div > span")
      .first()
      .evaluate((el) => el.getBoundingClientRect().left);
    expect(totalsInset).toBeLessThanOrEqual(16);
    const row = page.locator(".flow-quote-line").first(),
      name = row.locator(".flow-line-title > strong").first(),
      price = row.locator(".amount");
    const a = (await name.boundingBox())!,
      b = (await price.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    await expect(price).toHaveText("$2,750");
    await expect(price).toHaveCSS("white-space", "nowrap");
    const desc = (await row.locator(".quote-description").boundingBox())!,
      r = (await row.boundingBox())!;
    expect(Math.abs(desc.x - r.x)).toBeLessThanOrEqual(1);
    if (process.env.REVIEW3_CAPTURE === "1" && width === 375) {
      await page.screenshot({ path: `${shots}/client-intro-after.png` });
      await row.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/client-pricing-after.png` });
    }
  }
  const AxeBuilder = (await import("@axe-core/playwright")).default;
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("cover lines add below, retain formatting/spacing across undo redo and reload", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  const title = page.getByRole("textbox", {
    name: "Proposal title",
    exact: true,
  });
  await title.click();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page
    .getByRole("button", { name: "Add line below", exact: true })
    .click();
  let extra = page.getByRole("textbox", {
    name: "Cover extra line",
    exact: true,
  });
  await expect(extra).toBeFocused();
  await extra.fill("Personal project note");
  await extra.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Space below", exact: true })
    .fill("32");
  await page.keyboard.press("Escape");
  await expect
    .poll(
      () =>
        f.active().cover?.elements?.find((e) => e.kind === "extra")
          ?.space_below,
    )
    .toBe(32);
  const original = f.active().cover?.elements?.find((e) => e.kind === "extra");
  expect(f.active().cover!.elements!.findIndex((e) => e.kind === "extra")).toBe(
    f.active().cover!.elements!.findIndex((e) => e.kind === "title") + 1,
  );
  await extra.click();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page.getByRole("button", { name: "Remove line", exact: true }).click();
  await expect(extra).toHaveCount(0);
  await expect(title).toBeFocused();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(extra).toHaveText("Personal project note");
  await expect(extra.locator("strong")).toHaveText("Personal project note");
  await expect
    .poll(() => f.active().cover?.elements?.find((e) => e.kind === "extra"))
    .toEqual(original);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(extra).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(extra).toBeVisible();
  await expect
    .poll(() => f.active().cover?.elements?.find((e) => e.kind === "extra"))
    .toEqual(original);
  await page.reload();
  await expect(extra).toHaveText("Personal project note");
});
test("cover sliders use available space, clamp with guidance, and support keyboard steps", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("textbox", { name: "Cover client name", exact: true })
    .click();
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  const slider = page.getByRole("slider", {
      name: "Space below slider",
      exact: true,
    }),
    number = page.getByRole("spinbutton", { name: "Space below", exact: true });
  const originalLimit = Number(await slider.getAttribute("max"));
  expect(originalLimit).toBeGreaterThan(200);
  const above = page.getByRole("spinbutton", {
      name: "Space above",
      exact: true,
    }),
    originalAbove = Number(await above.inputValue());
  await above.fill(String(originalAbove + 40));
  await expect(slider).toHaveAttribute("max", String(originalLimit - 40));
  await above.fill(String(originalAbove));
  await expect(slider).toHaveAttribute("max", String(originalLimit));
  await slider.focus();
  await slider.press("ArrowRight");
  const first = Number(await number.inputValue());
  await slider.press("Shift+ArrowRight");
  await expect(number).toHaveValue(String(first + 10));
  await number.fill("9999");
  const max = Number(await slider.getAttribute("max"));
  expect(max).toBe(originalLimit);
  await expect(number).toHaveValue(String(max));
  await expect(
    page.getByRole("status").filter({ hasText: `Max ${max} px on this page` }),
  ).toBeVisible();
});
test("every cover line spacing moves the editor and actual PDF content equally", async ({
  page,
}, testInfo) => {
  const { defaultCover, coverElements, coverText } =
    await import("../src/lib/cover");
  const { execFileSync } = await import("node:child_process");
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const logo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 24;
    return c.toDataURL("image/png");
  });
  const base = defaultCover(),
    elements = coverElements(base, f.draft.title)
      .filter((e) => e.kind !== "eyebrow")
      .map((e) => ({
        ...e,
        space_above: 0,
        space_below: 0,
        ...(e.kind === "logo" ? {} : { content: coverText(`${e.kind}Marker`) }),
      }));
  elements.push({
    id: "extra",
    kind: "extra",
    align: "left",
    space_above: 0,
    space_below: 0,
    content: coverText("extraMarker"),
  });
  await f.editRemote({ cover: { ...base, logo, logo_height: 24, elements } });
  await page.goto(`/proposals/${f.draft.id}`);
  const pdfY = async (marker: string) => {
    await page
      .getByRole("button", { name: "Preview PDF", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download preview", exact: true }),
    ).toBeVisible();
    const file = testInfo.outputPath(
      `cover-spacing-${crypto.randomUUID()}.pdf`,
    );
    writeFileSync(file, Buffer.from(f.renders.at(-1)!.pdf_base64, "base64"));
    const xml = execFileSync("pdftotext", ["-bbox", file, "-"], {
      encoding: "utf8",
    });
    const word = [
      ...xml.matchAll(/<word[^>]*yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g),
    ].find((m) => m[2] === marker);
    expect(word, marker).toBeTruthy();
    await page
      .getByRole("button", { name: "Close PDF preview", exact: true })
      .click();
    return (Number(word![1]) * 96) / 72;
  };
  for (const e of elements) {
    const marker = e.kind === "logo" ? "workspaceMarker" : `${e.kind}Marker`,
      target = page.locator(`[data-cover-element="${e.id}"]`);
    const beforePdf = await pdfY(marker),
      before = (await target.boundingBox())!.y;
    if (e.kind === "logo") await target.locator("img").click();
    else await target.locator(".tiptap").click();
    await page.getByRole("button", { name: "Spacing", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "Space above", exact: true })
      .fill("16");
    await page.keyboard.press("Escape");
    expect((await target.boundingBox())!.y - before).toBeCloseTo(16, 0);
    const afterPdf = await pdfY(marker);
    expect(afterPdf - beforePdf).toBeCloseTo(16, 0);
  }
});
test("independent line settings match editor and PDF geometry and hide only their own controls", async ({
  page,
}) => {
  const { defaultHeaderFooter } = await import("../src/lib/page-bands");
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1920, height: 1100 });
  await f.editRemote({ header_footer: defaultHeaderFooter() });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  const styles = page.locator(".proposal-styles"),
    header = styles
      .locator(".band-section")
      .filter({ has: page.locator("summary").filter({ hasText: /^Header$/ }) }),
    footer = styles
      .locator(".band-section")
      .filter({ has: page.locator("summary").filter({ hasText: /^Footer$/ }) });
  await expect(
    header.getByRole("slider", {
      name: "Spacing above line slider",
      exact: true,
    }),
  ).toBeVisible();
  await footer.getByRole("switch", { name: "Footer divider line" }).uncheck();
  await expect(
    footer.getByRole("slider", {
      name: "Spacing below line slider",
      exact: true,
    }),
  ).toHaveCount(0);
  for (const [h, fo] of [
    [false, true],
    [true, false],
  ]) {
    await header
      .getByRole("switch", { name: "Header divider line" })
      .setChecked(h);
    await footer
      .getByRole("switch", { name: "Footer divider line" })
      .setChecked(fo);
    await page
      .locator(".editor-page-sheets[data-layout-settled=true]")
      .waitFor();
    const heights = await page
      .locator(".editor-page-sheets .page-sheet")
      .evaluateAll((es) =>
        es.map((e) => Number(e.getAttribute("data-content-height"))),
      );
    const count = f.renders.length;
    await page
      .getByRole("button", { name: "Preview PDF", exact: true })
      .click();
    await expect.poll(() => f.renders.length).toBeGreaterThan(count);
    f.renders
      .at(-1)!
      .layout.sheets!.forEach((s, n) =>
        expect(s.content_area!.height).toBeCloseTo(heights[n], 0),
      );
    await page
      .getByRole("button", { name: "Close PDF preview", exact: true })
      .click();
  }
});
test("a continuous spacing drag is one document undo step", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const client = page.getByRole("textbox", {
    name: "Cover client name",
    exact: true,
  });
  await client.click();
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  const original = await page
      .getByRole("spinbutton", { name: "Space below", exact: true })
      .inputValue(),
    slider = page.getByRole("slider", {
      name: "Space below slider",
      exact: true,
    }),
    box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(
    page.getByRole("spinbutton", { name: "Space below", exact: true }),
  ).not.toHaveValue(original);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();
  await client.click();
  await page.getByRole("button", { name: "Spacing", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Space below", exact: true }),
  ).toHaveValue(original);
});
test("selected image toolbar keeps the same live controls across desktop and phone resize", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await editorFixture(page);
  const logo = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    c.getContext("2d")!.fillRect(0, 0, 24, 24);
    return c.toDataURL("image/png");
  });
  const { defaultCover } = await import("../src/lib/cover");
  await f.editRemote({ cover: { ...defaultCover(), logo, logo_height: 24 } });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".cover-logo img").click();
  const bar = page.getByRole("toolbar", { name: "Image actions", exact: true });
  await expect(bar).toBeVisible();
  await bar.evaluate((el) => {
    (window as any).__imageBar = el;
    (window as any).__imageActions = Array.from(el.querySelectorAll("button"));
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (let i = 0; i < 6; i++)
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      // Both the phone dock and the full-size attached desktop bar are fixed;
      // resizing must retain the same live action nodes and their handlers.
      await expect(bar).toHaveCSS("position", "fixed");
      const same = await bar.evaluate((el) => ({
        bar: el === (window as any).__imageBar,
        buttons: Array.from(el.querySelectorAll("button")).every(
          (b, n) =>
            b === (window as any).__imageActions[n] &&
            b.isConnected &&
            b.getClientRects().length > 0,
        ),
      }));
      expect(same).toEqual({ bar: true, buttons: true });
      for (const button of await bar.getByRole("button").all())
        await expect(button).toBeVisible();
    }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
});
test("undoing a rapid cover-line deletion preserves the preceding line edit", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.clock.setFixedTime(new Date());
  const previous = page.getByRole("textbox", {
    name: "Cover client name",
    exact: true,
  });
  await previous.fill("Keep this formatted line");
  await previous.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  const byline = page.getByRole("textbox", {
    name: "Cover byline",
    exact: true,
  });
  await byline.click();
  await page.getByRole("button", { name: "More cover actions" }).click();
  await page.getByRole("button", { name: "Remove line", exact: true }).click();
  await expect(byline).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(byline).toBeVisible();
  await expect(previous).toHaveText("Keep this formatted line");
  await expect(previous.locator("strong")).toHaveText(
    "Keep this formatted line",
  );
});
