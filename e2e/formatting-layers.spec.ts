import { test, expect, type Locator } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import { emailTemplates, saveEmailTemplate } from "../src/lib/email-templates";
import { emailStudioPreview } from "../src/lib/email-studio";
import type { Block } from "../src/lib/model";

test("formatting rows stay above content and every button is reachable in all editors at desktop and phone widths", async ({
  page,
}) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(8000);
  const { repo, service, draft, settings, members } = await setup();
  const textId = crypto.randomUUID(),
    clauseId = crypto.randomUUID();
  const content: Block[] = [
    { id: crypto.randomUUID(), type: "heading", text: "Scope" },
    {
      id: textId,
      type: "paragraph",
      text: "A paragraph with enough words to expose wrapped formatting controls.",
    },
    {
      id: crypto.randomUUID(),
      type: "contract",
      clauses: [
        {
          id: clauseId,
          heading: "Agreement",
          body: "The agreed terms for this project.",
          show_when: null,
        },
      ],
    },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let current = await service.edit(
    draft.id,
    { revision: draft.revision, content },
    staff,
  );
  const template = (await repo.entities<any>("templates"))[0];
  template.content = structuredClone(content);
  await repo.put("templates", template);
  const storage = { put: async () => {}, get: async () => new Uint8Array() };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (path[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (path[0] === "proposals") {
        if (req.method() === "PATCH")
          current = await service.edit(current.id, req.postDataJSON(), staff);
        if (path[2] === "ready") value = await service.checkReady(current);
        else value = path[1] ? current : { items: [current], total: 1 };
      } else if (path[0] === "email-templates") {
        if (req.method() === "GET") value = await emailTemplates(repo);
        else if (path[2] === "preview") {
          const result = await emailStudioPreview(
            repo,
            storage,
            staff,
            path[1],
            req.postDataJSON(),
          );
          value = { ...result.result, values: result.values };
        } else
          value = await saveEmailTemplate(
            repo,
            staff,
            path[1],
            req.postDataJSON(),
          );
      } else if (path[0] === "connections")
        value = { stripe: true, qbo: false, email: false, mock: true };
      else value = await repo.entities(path[0] as any);
      await route.fulfill({ json: value });
    } catch (error) {
      await route.fulfill({ status: 400, json: { error: String(error) } });
    }
  });
  async function check(body: Locator, bar: Locator, name: string) {
    await body.fill(
      `Formatting in ${name}: text that wraps over several lines on a phone.`,
    );
    await body.press("ControlOrMeta+a");
    for (const label of ["Bold", "Italic"])
      await bar.getByRole("button", { name: label, exact: true }).click();
    await expect(body.locator("em strong, strong em")).toHaveCount(1);
    // This fails on the old 44px row even when a later z-index happens to hide its overflow.
    const geometry = await bar.evaluate((el, selector) => {
      const toolbar = el.getBoundingClientRect(),
        buttons = Array.from(el.querySelectorAll(".formatting-button")).map(
          (b) => b.getBoundingClientRect(),
        );
      const editor = el.closest(".field-editor");
      const text = editor?.querySelector(selector)?.getBoundingClientRect();
      return {
        height: toolbar.height,
        overflow: Math.max(...buttons.map((b) => b.bottom)) - toolbar.bottom,
        gap: text ? text.top - toolbar.bottom : null,
      };
    }, ".tiptap");
    expect(
      geometry.overflow,
      `${name}: ${JSON.stringify(geometry)}`,
    ).toBeLessThanOrEqual(1);
    if (geometry.gap !== null)
      expect(
        geometry.gap,
        `${name}: content must start below formatting`,
      ).toBeGreaterThanOrEqual(0);
    await bar.getByRole("button", { name: "Undo", exact: true }).click();
    await bar.getByRole("button", { name: "Redo", exact: true }).click();
    for (const label of [
      "Bold",
      "Italic",
      "List",
      "Numbered list",
      "Link",
      "Insert field",
    ]) {
      const button = bar.getByRole("button", { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          target = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
        return {
          own: target === el || el.contains(target),
          target: target?.tagName,
          button: target?.closest("button")?.getAttribute("aria-label"),
        };
      });
      expect(hit.own, `${name} ${label}: ${JSON.stringify(hit)}`).toBe(true);
      await button.click();
      if (label === "Link" || label === "Insert field") {
        await expect(
          page.locator(
            label === "Link"
              ? ".email-link-picker:popover-open"
              : ".field-picker:popover-open",
          ),
        ).toBeVisible();
        if (label === "Link") {
          await page
            .getByRole("textbox", { name: "Link URL", exact: true })
            .fill("https://example.test/about");
          await page
            .getByRole("button", { name: "Apply link", exact: true })
            .click();
        } else {
          await page
            .locator(".field-picker:popover-open .field-option")
            .first()
            .click();
        }
        await expect(page.locator(".toolbar-popover:popover-open")).toHaveCount(
          0,
        );
        await body.click();
      }
    }
  }
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/studio/emails/proposal_sent");
    await check(
      page.getByRole("textbox", { name: "Email body", exact: true }),
      page.locator(".email-edit-fields .rich-toolbar"),
      `Emails ${width}`,
    );
    await page.goto(`/proposals/${current.id}`);
    if (width === 375)
      await page.locator(".phone-section-list button").first().click();
    const pinned = page.getByRole("toolbar", {
      name: "Document formatting",
      exact: true,
    });
    await check(
      page.locator(`[data-block-id="block-${textId}"] .tiptap`),
      pinned,
      `proposal ${width}`,
    );
    if (width === 375) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page
        .getByRole("button", { name: "Full document", exact: true })
        .click();
    }
    const clause = page.locator(".contract-editor details").first();
    await clause.locator("summary").click();
    await expect(clause.locator("p")).toBeVisible();
    await expect(
      pinned.getByRole("button", { name: "Bold", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Review & send", exact: true })
      .first()
      .click();
    const note = page.locator(".send-email-note .tiptap:visible");
    await check(
      note,
      page.locator(".send-email-note:visible .rich-toolbar"),
      `send note ${width}`,
    );
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.goto(`/studio/templates/${template.id}`);
    await page
      .locator(".studio-block-card")
      .nth(1)
      .locator(".block-open")
      .click();
    await page
      .locator(".studio-block-card")
      .nth(1)
      .getByRole("button", { name: "Block settings", exact: true })
      .click();
    const inspector =
      width === 375
        ? page.getByRole("dialog", { name: "Edit block", exact: true })
        : page.locator(".studio-inspector");
    await check(
      inspector.locator(".tiptap"),
      pinned,
      `template inspector ${width}`,
    );
  }
  expect(errors).toEqual([]);
});
