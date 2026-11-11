import { expect, test, type Page } from "@playwright/test";
import type { Item, Template } from "../src/lib/model";
import { editorFixture } from "./editor-fixture";
import { openEditorPanel } from "./editor-ui";

test.use({ actionTimeout: 10000 });

async function fixture(page: Page, template: boolean) {
  const group = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    quote: ([first, second]) => [
      {
        ...second,
        name: "Own It Over Time",
        order: 0,
        optional: true,
        default_selected: true,
        choice_group_id: group,
        sublines: [
          { ...first.sublines[0], id: crypto.randomUUID(), amount: 50000 },
          { ...second.sublines[0], amount: 17500 },
        ],
      },
      {
        ...first,
        name: "Own It Now",
        order: 1,
        description:
          "Design and build, paid upfront. The site is yours at launch.",
        optional: true,
        default_selected: false,
        choice_group_id: group,
        sublines: [{ ...first.sublines[0], amount: 275000 }],
      },
      {
        ...second,
        id: crypto.randomUUID(),
        name: "Care Standard",
        order: 2,
        optional: true,
        default_selected: true,
        choice_group_id: null,
        sublines: [
          { ...second.sublines[0], id: crypto.randomUUID(), amount: 8500 },
        ],
      },
    ],
  });
  const product = (await f.repo.entities<Item>("pricing_items")).find(
    (item) => item.id === f.active().quote[1].pricing_item_id,
  )!;
  await f.repo.put("pricing_items", {
    ...product,
    display_name: "Website build",
  });
  const t = (await f.repo.entities<Template>("templates"))[0];
  if (template) {
    t.default_items = structuredClone(f.active().quote);
    await f.repo.put("templates", t);
  }
  await page.goto(
    template ? `/studio/templates/${t.id}` : `/proposals/${f.draft.id}`,
  );
  await expect(
    page
      .getByRole("tab", { name: "Quote", exact: true })
      .or(page.getByRole("button", { name: /^Open Quote\b/ }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await openEditorPanel(page, "Quote");
  return { ...f, templateId: t.id };
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 12, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}
const center = (b: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

test("drag a quote line into a Choose one group and back out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, false);
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const group = panel.locator(".editor-choice-group");
  await expect(group.locator(".quote-row")).toHaveCount(2);

  // Join: drop Care Standard on the group card.
  const care = panel.getByRole("button", {
    name: "Drag Care Standard",
    exact: true,
  });
  const target = (await group.boundingBox())!;
  await page.mouse.move(
    center((await care.boundingBox())!).x,
    center((await care.boundingBox())!).y,
  );
  await drag(page, center((await care.boundingBox())!), {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  });
  await expect(group.locator(".quote-row")).toHaveCount(3);
  await expect
    .poll(
      () => {
        const q = f.active().quote;
        const care = q.find((i) => i.name === "Care Standard")!;
        return [
          care.choice_group_id === q[0].choice_group_id,
          care.optional,
          care.default_selected,
          q.at(-1)!.name,
        ];
      },
      { timeout: 10000 },
    )
    .toEqual([true, true, false, "Care Standard"]);

  // Leave: drag it out below the group.
  const inner = group.getByRole("button", {
    name: "Drag Care Standard",
    exact: true,
  });
  const box = (await group.boundingBox())!;
  await drag(page, center((await inner.boundingBox())!), {
    x: box.x + box.width / 2,
    y: box.y + box.height + 60,
  });
  await expect(group.locator(".quote-row")).toHaveCount(2);
  await expect
    .poll(
      () =>
        f.active().quote.find((i) => i.name === "Care Standard")!
          .choice_group_id,
      { timeout: 10000 },
    )
    .toBeNull();

  // Reordering inside the group still works and does not ungroup.
  const rows = group.locator(".quote-row");
  const first = group.getByRole("button", {
    name: "Drag Own It Over Time",
    exact: true,
  });
  await drag(
    page,
    center((await first.boundingBox())!),
    center((await rows.nth(1).boundingBox())!),
  );
  await expect(group.locator(".quote-row")).toHaveCount(2);
});

test("Remove from group and Link as alternative work without dragging", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, false);
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const group = panel.locator(".editor-choice-group");
  await group.locator(".quote-row").first().click();
  await panel
    .getByRole("button", { name: "Remove from group", exact: true })
    .click();
  // A group with one option left dissolves.
  await expect(panel.locator(".editor-choice-group")).toHaveCount(0);
  await expect
    .poll(() => f.active().quote.every((i) => !i.choice_group_id), {
      timeout: 10000,
    })
    .toBe(true);
});
