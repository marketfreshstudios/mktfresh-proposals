import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { mkdirSync, writeFileSync } from "node:fs";
const shots = "docs/screenshots/owner-review3";
test("review3 before evidence", async ({ page }) => {
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
    ".data/review3-insets-before.json",
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
  for (const name of ["Align", "Spacing", "More cover actions"]) {
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
  expect(styles[0][0]).toBe("14px");
  expect(styles[0][1]).toContain("Instrument Sans");
  expect(styles[1]).toEqual(styles[0]);
  expect(styles[2]).toEqual(styles[0]);
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
