import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { openQuoteRow } from "./editor-ui";

const shotDir = "docs/screenshots/ink-and-clay-editor-studio";
async function capture(page: Page, name: string) {
  if (process.env.INK_CLAY_STAGE3_CAPTURE !== "1") return;
  mkdirSync(shotDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${shotDir}/${name}.png`,
    animations: "disabled",
  });
}

async function scenario(page: Page) {
  const group = crypto.randomUUID();
  return editorFixture(page, false, {
    quote: ([first, second]) => [
      {
        ...first,
        name: "Website Build — Own It Now",
        optional: true,
        default_selected: false,
        choice_group_id: group,
      },
      {
        ...second,
        name: "Website Build — Own It Over Time",
        optional: true,
        default_selected: true,
        choice_group_id: group,
        sublines: [
          {
            ...first.sublines[0],
            id: crypto.randomUUID(),
            label: "Kickoff",
            amount: 50000,
          },
          { ...second.sublines[0], amount: 17500 },
        ],
      },
      {
        ...second,
        id: crypto.randomUUID(),
        name: "Hosting and care",
        optional: true,
        default_selected: false,
        choice_group_id: null,
        sublines: [
          { ...second.sublines[0], id: crypto.randomUUID(), amount: 8500 },
        ],
      },
    ],
    content: [
      {
        id: crypto.randomUUID(),
        type: "heading",
        level: 1,
        text: "A website built for new patients",
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "Most new patients find a dentist on their phone. We’ll design a site that shows {{client.company}} at its best and makes booking take less than a minute.",
        ai_review: { source: "assistant", reviewed: false },
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "You’ll work directly with our team from the first call to launch day. We’ll design, write and support every page.",
        ai_review: { source: "assistant", reviewed: false },
      },
      {
        id: crypto.randomUUID(),
        type: "paragraph",
        text: "The quote below shows two ways to pay for the website. Choose one, then add a care plan if you’d like one.",
      },
      {
        id: crypto.randomUUID(),
        type: "heading",
        level: 1,
        text: "Investment",
      },
      { id: crypto.randomUUID(), type: "pricing_table" },
      { id: crypto.randomUUID(), type: "signature_block", role: "client" },
    ],
  });
}

test("Ink and clay quote summary preserves the quote, toggles, keyboard focus, readiness and panel rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await scenario(page);
  await page.goto(`/proposals/${f.draft.id}`);
  const rows = page.locator(".editor-v2-panel .quote-row");
  await expect(rows).toHaveCount(3);
  await expect(
    rows.locator('.quote-row-toggle[aria-expanded="true"]'),
  ).toHaveCount(0);
  await expect(rows.first().locator(".quote-row-amount")).toContainText(
    "one-time",
  );
  await expect(rows.nth(1).locator(".quote-row-amount")).toContainText(
    "$175/mo",
  );
  const ai = page.locator('.block-frame[data-ai="true"]').first();
  await ai.scrollIntoViewIfNeeded();
  await ai.locator(".tiptap").click();
  const marker = await ai.evaluate((node) => ({
    color: getComputedStyle(node, "::before").backgroundColor,
    width: getComputedStyle(node, "::before").width,
    token: getComputedStyle(node.closest(".quote-workspace")!)
      .getPropertyValue("--ai")
      .trim(),
  }));
  expect(marker.width).toBe("3px");
  expect(marker.token).toBe("#b4532a");
  expect(marker.color).toBe("rgb(180, 83, 42)");
  await expect(
    ai.getByRole("button", { name: "Mark this AI-written block reviewed" }),
  ).toHaveCSS("color", marker.color);
  // Owner 10 Nov: the header Review & send is the screen's one clay action.
  await expect(page.locator(".quote-workspace .action:visible")).toHaveCount(1);
  await expect(page.locator(".quote-workspace .action:visible")).toHaveClass(
    /\beditor-header-send\b/,
  );
  await capture(page, "editor-quote-1440");

  const toggles = rows.locator(".quote-row-toggle");
  await toggles.nth(1).press("Enter");
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "true");
  const amount = rows
    .nth(1)
    .getByRole("spinbutton", { name: /^Amount/ })
    .first();
  await amount.fill("525");
  await amount.press("Escape");
  await expect(toggles.nth(1)).toBeFocused();
  await expect(toggles.nth(1)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => f.active().quote[1].sublines[0].amount).toBe(52500);
  expect(f.active().quote[1].sublines[0].qty).toBe(1);
  expect(f.active().quote[1].sublines[0].interval).toBe("one_time");

  await toggles.first().press("Space");
  await expect(rows.first().getByText("Make default selection")).toBeVisible();
  await rows
    .first()
    .getByRole("radio", { name: "Make default selection" })
    .check();
  await toggles.last().click();
  await expect(
    rows.locator('.quote-row-toggle[aria-expanded="true"]'),
  ).toHaveCount(1);
  await rows
    .last()
    .getByRole("checkbox", { name: "Make default selection" })
    .check();
  await rows
    .last()
    .getByRole("button", { name: "Done editing quote line", exact: true })
    .click();
  await expect(toggles.last()).toBeFocused();
  await expect
    .poll(() => f.active().quote.map((item) => item.default_selected))
    .toEqual([true, false, true]);

  // Owner 10 Nov: Review & send is the clay primary until the Send panel's
  // own clay Send button is on screen.
  if (
    !(
      await page
        .getByRole("tab", { name: "Send", exact: true })
        .getAttribute("aria-selected")
    )?.includes("true")
  )
    await expect(page.locator(".editor-header-send")).toHaveClass(/\baction\b/);
  await page.getByRole("tab", { name: "Send", exact: true }).click();
  const send = page.locator(".send-action-card");
  await expect(send.getByRole("button", { name: /^Send to/ })).toBeDisabled();
  await expect(send.getByRole("status")).not.toBeEmpty();
  await expect(page.getByRole("heading", { name: "Readiness" })).toBeVisible();
  await expect(page.locator(".editor-header-send")).not.toHaveClass(
    /\baction\b/,
  );
  if (process.env.INK_CLAY_STAGE3_CAPTURE === "1") {
    await page.setViewportSize({ width: 1440, height: 1250 });
    await capture(page, "editor-send-1440");
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("button", { name: "Collapse tools sidebar" }).click();
  await expect(page.locator(".editor-sidepanel.sidebar-rail")).toHaveCSS(
    "width",
    "56px",
  );
  await capture(page, "editor-rail-1440");
  await page.getByRole("button", { name: /^Open Quote\b/ }).click();
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

for (const width of [1440, 1024, 768]) {
  test(`expanded quote fields stay readable and totals don't cover rows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1050 });
    const f = await scenario(page);
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".quote-workspace")).toHaveAttribute(
      "data-panels-ready",
      "true",
    );
    const row = await openQuoteRow(page, "Website Build — Own It Over Time");
    const quote = page.locator(".quote-panel").filter({ visible: true });
    const next = quote.locator(".quote-row-toggle").filter({
      hasText: "Hosting and care",
    });
    const footer = quote.locator(":scope > footer");
    await expect(row.locator(".quote-row-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const label = row.getByRole("textbox", { name: /^Sub-line label/ }).last();
    const amount = row.getByRole("spinbutton", { name: /^Amount/ }).first();
    await expect(amount).toHaveValue("500");
    await expect(
      row.getByRole("spinbutton", { name: /^Amount/ }).last(),
    ).toHaveValue("175");
    await label.scrollIntoViewIfNeeded();
    if (width !== 1024 && process.env.INK_CLAY_STAGE3_CAPTURE === "1") {
      await page.setViewportSize({ width, height: 1190 });
      await capture(page, `editor-quote-expanded-${width}`);
      await page.setViewportSize({ width, height: 1050 });
    }
    for (const value of ["999999.99", "1000000"]) {
      await amount.fill(value);
      await expect(amount).toHaveValue(value);
      expect(
        await amount.evaluate((input) => input.scrollWidth - input.clientWidth),
      ).toBeLessThanOrEqual(0);
    }
    const line =
      "Subscription and support for the complete website plan, including monthly maintenance, hosting, and help with website updates";
    await label.fill(line);
    await expect(label).toHaveValue(line);
    expect(
      await label.evaluate((input) => input.scrollHeight - input.clientHeight),
    ).toBeLessThanOrEqual(0);
    await expect.poll(() => f.active().quote[1].sublines[1].label).toBe(line);

    await next.evaluate((element) => element.scrollIntoView({ block: "end" }));
    await expect(next).toBeInViewport({ ratio: 0.99 });
    expect((await footer.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await next.boundingBox())!.y + (await next.boundingBox())!.height - 1,
    );
    await next.click({ trial: true });
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport({ ratio: 0.99 });
  });
}

for (const width of [1440, 768, 375]) {
  test(`editor chrome passes axe in light and dark at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const f = await scenario(page);
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(
        (value) => localStorage.setItem("proposal-theme", value),
        theme,
      );
      await page.goto(`/proposals/${f.draft.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      if (width === 1440) {
        await page
          .locator('.block-frame[data-ai="true"]')
          .first()
          .scrollIntoViewIfNeeded();
        if (theme === "dark") await capture(page, "editor-dark-1440");
      } else if (theme === "light") await capture(page, `editor-${width}`);
      const audit = () =>
        new AxeBuilder({ page }).include(".quote-workspace").analyze();
      const clean = (result: Awaited<ReturnType<typeof audit>>) =>
        expect(
          result.violations.map((v) => [v.id, v.nodes.map((n) => n.target)]),
          `${width} ${theme}`,
        ).toEqual([]);
      clean(await audit());
      if (width < 960) {
        await page.getByRole("button", { name: /^Open Quote\b/ }).click();
        const tools = page.getByRole("dialog", { name: "Proposal tools" });
        await expect(tools).toBeVisible();
        clean(await audit());
        await page.keyboard.press("Escape");
        await expect(tools).toHaveCount(0);
      }
    }
  });
}
