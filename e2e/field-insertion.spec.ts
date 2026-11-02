import { test, expect, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import type { Block, RichText } from "../src/lib/model";
const raw = (n: RichText): string =>
  n.type === "variable"
    ? `{{${n.attrs?.path}}}`
    : (n.text ?? n.content?.map(raw).join("") ?? "");

test("field panel inserts at the remembered cursor, replaces selection and guides without a text target", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(8000);
  const { repo, service, draft, settings, members } = await setup();
  const heading = crypto.randomUUID(),
    paragraph = crypto.randomUUID(),
    pricing = crypto.randomUUID();
  const content: Block[] = [
    { id: heading, type: "heading", text: "Scope" },
    { id: paragraph, type: "paragraph", text: "Hello friend, welcome." },
    { id: pricing, type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let active = await service.edit(
    draft.id,
    { revision: draft.revision, content },
    staff,
  );
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH")
          active = await service.edit(active.id, req.postDataJSON(), staff);
        value = parts[1] ? active : { items: [active], total: 1 };
      } else value = await repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  const captures: any[] = [],
    dir = ".data/evidence/editor-followup-fields";
  const captureEvidence = process.env.CAPTURE_EDITOR_EVIDENCE === "1";
  if (captureEvidence) await mkdir(dir, { recursive: true });
  async function shot(state: string, width: number, theme: string) {
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, state, width, theme });
  }
  async function choices(width: number): Promise<Locator> {
    if (width < 1100) {
      await page.getByRole("button", { name: "Fields", exact: true }).click();
      return page.getByRole("dialog", { name: "Fields", exact: true });
    }
    return page.locator(".editor-outline .field-options");
  }
  async function setCursor(from: number, to = from) {
    const text = page.locator(`[data-block-id="block-${paragraph}"] .tiptap`);
    await text.click();
    await text.evaluate(
      (el, { from, to }) => {
        const node = el.querySelector("p")!.firstChild!,
          range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        const selection = getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      },
      { from, to },
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    return text;
  }
  async function reset(width: number) {
    active = await service.edit(
      active.id,
      { revision: active.revision, content: structuredClone(content) },
      staff,
    );
    await page.goto(`/proposals/${active.id}`);
    await expect(page.locator(".quote-workspace")).toBeVisible();
    if (width === 375)
      await page.locator(".phone-section-list button").first().click();
    await page.evaluate(() => document.fonts.ready);
  }

  await context.addInitScript(() =>
    localStorage.setItem("proposal-theme", "light"),
  );
  async function captureState(state: string, fieldPanel = false) {
    if (!captureEvidence) return;
    for (const theme of ["light", "dark"])
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        if (fieldPanel) await choices(width);
        await shot(state, width, theme);
        if (fieldPanel && width < 1100)
          await page
            .getByRole("dialog", { name: "Fields", exact: true })
            .getByRole("button", { name: "Done", exact: true })
            .click();
      }
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "light"),
    );
  }
  const savedText = () => {
    const b = active.content.find((b) => b.id === paragraph)!;
    return b.content ? raw(b.content) : (b.text ?? "");
  };
  await page.setViewportSize({ width: 375, height: 1000 });
  await reset(375);
  let panel = await choices(375);
  await expect(
    panel
      .getByRole("button", {
        name: "Client address — {{client.address}}",
        exact: true,
      })
      .locator(".field-option-value"),
  ).toHaveText("—");
  await panel
    .getByRole("searchbox", { name: "Search fields" })
    .fill("first name");
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Click into the text where you want the field" }),
  ).toBeVisible();
  expect(active.content).toHaveLength(content.length);
  await reset(375);
  await page
    .getByRole("button", { name: "Full document", exact: true })
    .click();
  const text = await setCursor(6);
  await captureState("fields-panel", true);
  panel = await choices(375);
  await panel
    .getByRole("searchbox", { name: "Search fields" })
    .fill("client.first_name");
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(text).toBeFocused();
  await expect
    .poll(savedText)
    .toBe("Hello {{client.first_name}}friend, welcome.");
  await captureState("field-at-cursor");
  await reset(375);
  await page
    .getByRole("button", { name: "Full document", exact: true })
    .click();
  const replacing = await setCursor(6, 12);
  panel = await choices(375);
  await panel
    .getByRole("button", {
      name: "Client company — {{client.company}}",
      exact: true,
    })
    .click();
  await expect(replacing).toBeFocused();
  await expect.poll(savedText).toBe("Hello {{client.company}}, welcome.");
  await captureState("field-replaces-selection");
  await replacing.press("End");
  await replacing.pressSequentially(" Saved after deselection.");
  await page.mouse.click(2, 900);
  await expect(page.locator('.block-frame[data-selected="true"]')).toHaveCount(
    0,
  );
  await expect.poll(savedText).toContain("Saved after deselection.");
  const price = page.locator(`[data-block-id="block-${pricing}"]`);
  await price.scrollIntoViewIfNeeded();
  await price.evaluate((el) =>
    (el as HTMLElement).focus({ preventScroll: true }),
  );
  panel = await choices(375);
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Click into the text where you want the field" }),
  ).toBeVisible();
  await captureState("field-no-cursor");
  // The never-focused selected text fallback also survives the phone sheet opening.
  await reset(375);
  await page
    .locator(`[data-block-id="block-${paragraph}"]`)
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  panel = await choices(375);
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect
    .poll(savedText)
    .toBe("Hello friend, welcome.{{client.first_name}}");
  expect(active.content).toHaveLength(content.length);
  // Desktop sidebar insertion has the same remembered-selection semantics.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await reset(1440);
  await setCursor(6, 12);
  panel = await choices(1440);
  await panel
    .getByRole("searchbox", { name: "Search fields" })
    .fill("client.company");
  await panel
    .getByRole("button", {
      name: "Client company — {{client.company}}",
      exact: true,
    })
    .click();
  await expect.poll(savedText).toBe("Hello {{client.company}}, welcome.");
  await page.setViewportSize({ width: 375, height: 1000 });
  await reset(375);
  await page
    .getByRole("button", { name: "Full document", exact: true })
    .click();
  const menuText = await setCursor(6, 12);
  await page
    .getByRole("toolbar", { name: "Document formatting", exact: true })
    .getByRole("button", { name: "Insert field", exact: true })
    .click();
  const menu = page.locator(".document-formatting-bar .field-picker");
  await menu
    .getByRole("searchbox", { name: "Search fields" })
    .fill("first name");
  await captureState("field-picker");
  await menu
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(menuText).toBeFocused();
  await expect.poll(savedText).toBe("Hello {{client.first_name}}, welcome.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await menuText.fill("Hello {{");
  await expect(menu).toBeVisible();
  await menu
    .getByRole("searchbox", { name: "Search fields" })
    .fill("client.company");
  await menu
    .getByRole("button", {
      name: "Client company — {{client.company}}",
      exact: true,
    })
    .click();
  await expect.poll(savedText).toBe("Hello {{client.company}}");
  // From the phone overview, last-cursor insertion reopens the owning section before focusing it.
  await page.setViewportSize({ width: 375, height: 1000 });
  await reset(375);
  const hiddenText = await setCursor(6);
  await page.getByRole("button", { name: "‹ Sections", exact: true }).click();
  await expect(hiddenText).not.toBeVisible();
  panel = await choices(375);
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(hiddenText).toBeFocused();
  await expect
    .poll(savedText)
    .toBe("Hello {{client.first_name}}friend, welcome.");
  await expect(
    hiddenText.locator('[data-field="client.first_name"]'),
  ).toHaveCount(1);
  await expect(hiddenText).toHaveText("Hello Janefriend, welcome.");
  // Hold the reopened section invisible/inert beyond the old nested RAFs.
  // Closing the native sheet must restore its trigger BEFORE editor focus wins.
  await reset(375);
  const delayedText = await setCursor(6, 12);
  await page.getByRole("button", { name: "‹ Sections", exact: true }).click();
  panel = await choices(375);
  await page.locator(".editor-paper").evaluate((paper) => {
    (paper as HTMLElement).style.visibility = "hidden";
    (paper as HTMLElement).inert = true;
  });
  await panel.evaluate((dialog) => {
    dialog.addEventListener(
      "close",
      () => {
        document
          .querySelector<HTMLButtonElement>("button[data-field-insert]")
          ?.focus();
        document.body.dataset.fieldSheetClosed = "true";
      },
      { once: true },
    );
  });
  await panel
    .getByRole("button", {
      name: "Client company — {{client.company}}",
      exact: true,
    })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(page.locator("body")).toHaveAttribute(
    "data-field-sheet-closed",
    "true",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(delayedText.locator("[data-field]")).toHaveCount(0);
  await expect(delayedText).not.toBeFocused();
  await page.locator(".editor-paper").evaluate((paper) => {
    (paper as HTMLElement).style.removeProperty("visibility");
    (paper as HTMLElement).inert = false;
  });
  await expect(delayedText).toBeVisible();
  await expect(
    delayedText.locator('[data-field="client.company"]'),
  ).toHaveCount(1);
  await expect.poll(savedText).toBe("Hello {{client.company}}, welcome.");
  await expect(delayedText).toBeFocused();
  // Subsequent typing proves the caret was restored just after the inserted atom.
  await page.keyboard.type(" dear");
  await expect.poll(savedText).toBe("Hello {{client.company}} dear, welcome.");
  // Escape cancels the phone sheet's temporary selected-block fallback.
  await page.setViewportSize({ width: 375, height: 1000 });
  await reset(375);
  await page
    .locator(`[data-block-id="block-${paragraph}"]`)
    .evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
  await choices(375);
  await page.keyboard.press("Escape");
  panel = await choices(375);
  await panel
    .getByRole("button", {
      name: "Client first name — {{client.first_name}}",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Click into the text where you want the field" }),
  ).toBeVisible();
  expect(savedText()).toBe("Hello friend, welcome.");
  // Removing the old bottom insertion row must not strand a completely empty draft.
  active = await service.edit(
    active.id,
    { revision: active.revision, content: [] },
    staff,
  );
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto(`/proposals/${active.id}`);
  await expect(
    page.getByRole("button", { name: "Add first block", exact: true }),
  ).toBeVisible();
  await captureState("empty-document");
  await page
    .getByRole("button", { name: "Add first block", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Add a block", exact: true })
    .getByRole("button", { name: "Heading", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Heading 1", exact: true }),
  ).toBeFocused();
  await expect.poll(() => active.content.length).toBe(1);
  if (captureEvidence)
    await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
