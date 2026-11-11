import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { clientActor, signature, staff } from "../tests/helpers";
import { sealedPdf } from "../src/lib/pdf";
import type { Item, Template } from "../src/lib/model";
import { editorFixture } from "./editor-fixture";
import { openEditorPanel } from "./editor-ui";

test.use({ actionTimeout: 10000 });

async function fixture(
  page: Page,
  template: boolean,
  variant?: "outer-first" | "conditional" | "oiot",
) {
  const group = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    quote: ([first, second]) => {
      const quote = [
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
        {
          ...second,
          id: crypto.randomUUID(),
          name: "Care Essentials",
          order: 3,
          optional: true,
          default_selected: false,
          choice_group_id: null,
          sublines: [
            { ...second.sublines[0], id: crypto.randomUUID(), amount: 2500 },
          ],
        },
      ];
      if (variant === "outer-first")
        return [quote[3], ...quote.slice(0, 3)].map((item, order) => ({
          ...item,
          order,
        }));
      if (variant === "conditional") {
        const care = crypto.randomUUID();
        return quote.map((item, index) =>
          index < 2
            ? item
            : {
                ...item,
                choice_group_id: care,
                choice_group_label: "Hosting + Care Options",
                show_when: { kind: "quote_item", id: first.id },
              },
        );
      }
      if (variant === "oiot") {
        quote[0].sublines[1].stripe_lookup_key = "oiot-monthly-175";
        quote[0].pricing_item_id = null;
      }
      return quote;
    },
  });
  const product = (await f.repo.entities<Item>("pricing_items")).find(
    (item) =>
      item.id ===
      f.active().quote.find((row) => row.name === "Own It Now")
        ?.pricing_item_id,
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

const evidence = "docs/screenshots/named-quote-groups";
const capture = process.env.CAPTURE_QUOTE_GROUPS === "1";
const center = ({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => ({ x: x + width / 2, y: y + height / 2 });
async function startDrag(page: Page, handle: Locator) {
  const point = center((await handle.boundingBox())!);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y + 10);
  await expect(page.locator("[data-quote-dragging]")).toHaveCount(1);
  await expect(page.locator(".quote-drag-overlay")).toBeVisible();
}
async function before(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(6, box.height / 4),
  );
}
async function shifted(row: Locator) {
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).transform), {
      intervals: [10, 15, 20],
      timeout: 1500,
    })
    .toMatch(/^matrix\(/);
}
async function panelShot(page: Page, panel: Locator) {
  const box = (await panel.boundingBox())!;
  return page.screenshot({
    clip: { ...box, height: Math.min(box.height, 725) },
    animations: "disabled",
  });
}
async function sideBySide(left: Buffer, right: Buffer, name: string) {
  await mkdir(evidence, { recursive: true });
  const a = await sharp(left).metadata(),
    b = await sharp(right).metadata();
  await sharp({
    create: {
      width: a.width + b.width + 12,
      height: Math.max(a.height, b.height),
      channels: 3,
      background: "#dce3e6",
    },
  })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: a.width + 12, top: 0 },
    ])
    .png()
    .toFile(`${evidence}/${name}.png`);
}

test("quote items open a live gap inside a group and in the outer list, then drop at the gap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, false, "outer-first");
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const group = panel.locator(".editor-choice-group");
  const care = panel.getByRole("button", {
    name: "Drag Care Standard",
    exact: true,
  });
  const essentials = panel
    .locator(".quote-drag-row")
    .filter({
      has: page.getByRole("button", {
        name: "Drag Care Essentials",
        exact: true,
      }),
    })
    .last();
  const second = group.locator(".quote-group-options > .quote-drag-row").nth(1);
  const gap = page.locator("[data-quote-drop-gap]");
  await expect(group.locator(".quote-row")).toHaveCount(2);
  await startDrag(page, care);
  const secondY = (await second.boundingBox())!.y;
  await before(page, second);
  await expect(group.locator("[data-quote-drop-gap]")).toBeVisible();
  await shifted(second);
  await expect
    .poll(async () => (await second.boundingBox())!.y)
    .toBeGreaterThan(secondY + 30);
  expect(
    f.active().quote.find((item) => item.name === "Care Standard")
      ?.choice_group_id,
  ).toBeNull();
  const dragIn = capture ? await panelShot(page, panel) : null;
  await page.mouse.up();
  await expect(group.locator(".quote-row")).toHaveCount(3);
  await expect
    .poll(() => {
      const quote = f.active().quote;
      return [
        quote[2].name,
        quote[2].choice_group_id === quote[1].choice_group_id,
        quote[2].optional,
        quote[2].default_selected,
      ];
    })
    .toEqual(["Care Standard", true, true, false]);

  const remaining = group
    .locator(".quote-group-options > .quote-drag-row")
    .last();
  const originalRemainingY =
    (await remaining.boundingBox())!.y - (await group.boundingBox())!.y;
  await startDrag(page, care);
  await before(page, essentials);
  await expect(
    panel.locator(".quote-drag-units > [data-quote-drop-gap]"),
  ).toBeVisible();
  await shifted(essentials);
  await expect
    .poll(
      async () =>
        (await remaining.boundingBox())!.y - (await group.boundingBox())!.y,
    )
    .toBeLessThan(originalRemainingY - 30);
  expect(f.active().quote[2].choice_group_id).not.toBeNull();
  if (dragIn)
    await sideBySide(dragIn, await panelShot(page, panel), "drag-in-and-out");
  await page.mouse.up();
  await expect(gap).toHaveCount(0);
  await expect
    .poll(() =>
      f.active().quote.map((item) => [item.name, !!item.choice_group_id]),
    )
    .toEqual([
      ["Care Standard", false],
      ["Care Essentials", false],
      ["Own It Over Time", true],
      ["Own It Now", true],
    ]);

  // A drop within the original group still reorders options.
  const first = group.getByRole("button", {
    name: "Drag Own It Over Time",
    exact: true,
  });
  await startDrag(page, first);
  const last = group.locator(".quote-group-options > .quote-drag-row").last();
  const lastBox = (await last.boundingBox())!;
  await page.mouse.move(
    lastBox.x + lastBox.width / 2,
    lastBox.y + lastBox.height - 4,
  );
  await page.mouse.up();
  await expect.poll(() => f.active().quote[2].name).toBe("Own It Now");
});

test("keyboard drag announces a named group's position, restores focus, and cancels cleanly", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, true);
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const name = panel.getByRole("textbox", { name: "Option group name" });
  await name.fill("Web Design Options");
  await name.press("Enter");
  const care = panel.getByRole("button", {
    name: "Drag Care Standard",
    exact: true,
  });
  await care.focus();
  await care.press("Space");
  await care.press("ArrowUp");
  await care.press("ArrowUp");
  await expect(
    panel.getByText("Moved into Web Design Options, position 2 of 3", {
      exact: true,
    }),
  ).toBeAttached();
  await care.press("Space");
  await expect(care).toBeFocused();
  await expect(panel.locator(".quote-group-options .quote-row")).toHaveCount(3);
  await care.press("Space");
  await care.press("ArrowLeft");
  await expect(
    panel.locator(".quote-drag-units > [data-quote-drop-gap]"),
  ).toBeVisible();
  await care.press("Escape");
  await expect(panel.locator(".quote-group-options .quote-row")).toHaveCount(3);
  await care.press("Space");
  await care.press("ArrowLeft");
  await care.press("Space");
  await expect(panel.locator(".quote-group-options .quote-row")).toHaveCount(2);
  const header = panel.getByRole("button", {
    name: "Drag Web Design Options",
    exact: true,
  });
  await header.focus();
  await header.press("Space");
  await header.press("ArrowDown");
  await header.press("Space");
  await expect
    .poll(async () => {
      const template = (await f.repo.entities<Template>("templates")).find(
        (entry) => entry.id === f.templateId,
      );
      return template?.default_items
        ?.slice(0, 3)
        .map((item) => item.choice_group_label ?? item.name);
    })
    .toEqual(["Care Standard", "Web Design Options", "Web Design Options"]);
});

test("create an empty named group, add an item, and block send until it has two options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, false);
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  await panel
    .getByText("Add from catalog or a custom item", { exact: true })
    .click();
  const menu = panel.locator(".quote-add-picker").last();
  const product = (await menu
    .getByRole("combobox", { name: "Add product" })
    .boundingBox())!;
  const create = menu.getByRole("button", { name: "Create an option group" });
  expect(product.width).toBeGreaterThan(100);
  expect((await create.boundingBox())!.y).toBeGreaterThan(product.y);
  if (capture) {
    await mkdir(evidence, { recursive: true });
    await panel
      .locator(".quote-add-picker")
      .last()
      .screenshot({
        path: `${evidence}/add-menu.png`,
        animations: "disabled",
      });
  }
  await create.click();
  const newGroup = panel.locator(".editor-choice-group").last();
  const name = newGroup.getByRole("textbox", { name: "Option group name" });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Choose one");
  await name.fill("Hosting + Care Options");
  await name.press("Enter");
  const reason = "Add at least two options to Hosting + Care Options";
  await expect
    .poll(
      async () => (await f.service.checkReady(f.active(), false, true)).errors,
    )
    .toContain(reason);
  const header = panel.getByRole("button", {
    name: "Drag Hosting + Care Options",
    exact: true,
  });
  await header.focus();
  await header.press("Space");
  await header.press("ArrowUp");
  await header.press("Space");
  await expect
    .poll(() => f.active().quote.at(-2)?.choice_group_placeholder)
    .toBe(true);
  await newGroup.getByText("Add item to this group", { exact: true }).click();
  await newGroup
    .getByRole("button", { name: "Custom item", exact: true })
    .click();
  await expect(newGroup.locator(".quote-row")).toHaveCount(1);
  await expect
    .poll(() => f.active().quote.some((item) => item.choice_group_placeholder))
    .toBe(false);
  await expect
    .poll(
      async () => (await f.service.checkReady(f.active(), false, true)).errors,
    )
    .toContain(reason);
});

test("named groups and conditional visibility render in the editor, client preview, public link and sealed PDF", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page, false, "conditional");
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const name = panel
    .getByRole("textbox", { name: "Option group name" })
    .first();
  await name.fill("Web Design Options");
  await name.press("Enter");
  await expect
    .poll(() => f.active().quote[0].choice_group_label)
    .toBe("Web Design Options");
  const trigger = f.active().quote[0].id;
  const hiddenTrigger = f.active().quote[1].id;
  await expect(
    page
      .locator(".editor-paper")
      .getByText("Hosting + Care Options | Shows when Own It Now is chosen", {
        exact: true,
      }),
  ).toBeAttached();
  const care = panel.locator(".editor-choice-group").last();
  await care.getByText("Choice group settings", { exact: true }).click();
  await expect(
    care
      .locator('optgroup[label="Web Design Options"] option')
      .filter({ hasText: "Own It Now is chosen" }),
  ).toHaveCount(1);
  const latest = await f.service.edit(
    f.active().id,
    {
      revision: f.active().revision,
      content: [
        ...f.active().content,
        { type: "signature_block", id: crypto.randomUUID(), role: "company" },
      ],
    },
    staff,
  );
  const doc = await f.service.send(latest.id, staff);
  await page.route(`**/api/public/${doc.token}/questions`, (route) =>
    route.fulfill({
      json: { threads: [], can_ask: true, needs_contact: false },
    }),
  );
  expect(doc.versions.at(-1)?.quote[0].choice_group_label).toBe(
    "Web Design Options",
  );
  const heading = page.getByRole("heading", {
    name: "Web Design Options",
    exact: true,
  });
  await page.goto(`/p/${doc.token}`);
  await expect(heading).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hosting + Care Options", exact: true }),
  ).toHaveCount(0);
  await heading.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await expect(
    page.getByText("No questions yet.", { exact: true }),
  ).toBeVisible();
  const desktop = capture
    ? await page.screenshot({ animations: "disabled" })
    : null;
  await page.setViewportSize({ width: 375, height: 840 });
  await page.reload();
  await expect(heading).toBeVisible();
  await heading.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  if (desktop)
    await sideBySide(
      desktop,
      await page.screenshot({ animations: "disabled" }),
      "named-client-desktop-and-phone",
    );
  const revealed = await f.service.toggle(
    doc.token!,
    "",
    {
      revision: doc.revision,
      item_id: hiddenTrigger,
      selected: true,
    },
    clientActor,
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Hosting + Care Options", exact: true }),
  ).toBeVisible();
  const restored = await f.service.toggle(
    doc.token!,
    "",
    {
      revision: revealed.revision,
      item_id: trigger,
      selected: true,
    },
    clientActor,
  );
  await page.goto(`/p/${doc.id}?preview=1`);
  await expect(heading).toBeVisible();
  const signed = await f.service.sign(
    restored.id,
    signature(restored.revision),
    "client",
    clientActor,
    { token: doc.token!, password: "" },
  );
  expect(
    signed.versions.at(-1)?.quote.find((item) => item.id === trigger)
      ?.choice_group_label,
  ).toBe("Web Design Options");
  const sealed = await sealedPdf(
    signed.versions.at(-1)!,
    signed.signers,
    signed.events,
    signed.currency,
    {
      settings: f.settings,
      document: { id: signed.id, title: signed.title },
    },
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(sealed.pdf),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const contents: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const text = await (await pdf.getPage(n)).getTextContent();
    contents.push(
      text.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
  }
  await loading.destroy();
  expect(contents.join(" ")).toMatch(/Web Design Options/i);
  expect(contents.join(" ")).not.toMatch(/Hosting \+ Care Options/i);
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
    .poll(() => f.active().quote.every((i) => !i.choice_group_id))
    .toBe(true);
  const undo = page.getByRole("button", { name: "Undo", exact: true }).first();
  await undo.click();
  await expect(panel.locator(".editor-choice-group .quote-row")).toHaveCount(2);
  await expect
    .poll(() => f.active().quote.filter((item) => item.choice_group_id).length)
    .toBe(2);
  await page.getByRole("button", { name: "Redo", exact: true }).first().click();
  await expect(panel.locator(".editor-choice-group")).toHaveCount(0);
  const done = panel.getByRole("button", { name: "Done editing quote line" });
  if (await done.isVisible()) await done.click();
  const care = panel.locator(".quote-row").filter({ hasText: "Care Standard" });
  await care.locator(".quote-row-toggle").click();
  await care.getByLabel("Link as alternative").selectOption({
    label: "Own It Now",
  });
  await expect(panel.locator(".editor-choice-group .quote-row")).toHaveCount(2);
});

test("a protected Own It Over Time group rejects join and leave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  const f = await fixture(page, false, "oiot");
  const panel = page.locator(".editor-v2-panel:not(.sidebar-rail)");
  const group = panel.locator(".editor-choice-group");
  await expect(group.getByText("Add item to this group")).toHaveCount(0);
  const option = group.getByRole("button", {
    name: "Drag Own It Now",
    exact: true,
  });
  await option.focus();
  await option.press("Space");
  await option.press("ArrowLeft");
  await expect(group.locator("[data-quote-drop-gap]")).toBeVisible();
  await option.press("Space");
  await expect(group.locator(".quote-row")).toHaveCount(2);
  const outside = panel.getByRole("button", {
    name: "Drag Care Standard",
    exact: true,
  });
  await outside.focus();
  await outside.press("Space");
  await outside.press("ArrowRight");
  await expect(
    panel.locator(".quote-drag-units > [data-quote-drop-gap]"),
  ).toBeVisible();
  await outside.press("Space");
  expect(f.active().quote.filter((item) => item.choice_group_id)).toHaveLength(
    2,
  );
});
