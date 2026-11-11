import { test, expect, type Locator, type Page } from "@playwright/test";
import { emailEditorFixture } from "./email-editor-fixture";
import { randomUUID } from "node:crypto";
test.beforeEach(({ page }) => page.setDefaultTimeout(15000));
async function adjacent(
  page: Page,
  trigger: Locator,
  menu: Locator,
  sheet = false,
) {
  await expect(menu).toBeVisible();

  await expect
    .poll(async () => {
      const t = await trigger.boundingBox(),
        m = await menu.boundingBox();
      if (!t || !m) return false;
      const viewport = page.viewportSize()!;
      if (
        m.x < -1 ||
        m.x + m.width > viewport.width + 1 ||
        m.y < -1 ||
        m.y + m.height > viewport.height + 1
      )
        return false;
      if (sheet) return Math.abs(m.y + m.height - viewport.height) <= 1;
      const vertical = Math.min(
        Math.abs(m.y - t.y - t.height),
        Math.abs(t.y - m.y - m.height),
      );
      return (
        vertical <= 8 && m.x <= t.x + t.width + 1 && m.x + m.width >= t.x - 1
      );
    })
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
}
for (const width of [1440, 1024, 375])
  test(`header, row and toolbar menus stay with their triggers at ${width}`, async ({
    page,
  }) => {
    const f = await emailEditorFixture(page);
    await page.setViewportSize({ width, height: 1000 });
    const template = (await f.repo.entities<any>("templates"))[0];
    await f.repo.put("templates", {
      ...template,
      starter_key: "website-design-build",
    });
    const block = {
      id: randomUUID(),
      name: "Reusable introduction",
      block: {
        id: randomUUID(),
        type: "paragraph",
        text: "A reusable introduction.",
      },
    };
    await f.repo.put("content_library", block);
    await page.route("**/api/team", (r) =>
      r.fulfill({
        json: {
          members: f.members.map((m) => ({ ...m, status: "active" })),
          recent: [],
        },
      }),
    );
    await page.goto(`/studio/templates/${template.id}`);
    let trigger = page.getByRole("button", {
      name: "More editor actions",
      exact: true,
    });
    await trigger.click();
    await adjacent(
      page,
      trigger,
      width < 700
        ? page.locator("dialog.tools-sheet[open]")
        : page.locator(".studio-template-actions"),
      width < 700,
    );
    await page.goto("/studio/templates");
    trigger = page.getByRole("button", {
      name: `Actions for ${template.name}`,
      exact: true,
    });
    await trigger.click();
    await adjacent(
      page,
      trigger,
      page.locator(".toolbar-popover.starter-actions-menu"),
    );
    await page.goto(`/proposals/${f.draft.id}`);
    trigger = page.getByRole("button", {
      name: "More editor actions",
      exact: true,
    });
    await trigger.click();
    await adjacent(
      page,
      trigger,
      page.locator(".toolbar-popover.phone-editor-menu"),
    );
    const frame = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
    await frame.locator(".tiptap").click();
    for (const [name, selector] of [
      ["Text style", ".text-style-popover"],
      ["Size", ".inline-size-popover"],
      ["More block actions", ".block-more-menu"],
    ] as const) {
      trigger = frame.getByRole("button", {
        name: name === "Size" ? /^Size (Default|Mixed|[0-9]+)$/ : name,
        exact: true,
      });
      await trigger.click();
      const popup =
        name === "More block actions"
          ? page.locator(".toolbar-popover.edit-dark-menu")
          : page.locator(`.toolbar-popover${selector}`);
      await adjacent(page, trigger, popup);
    }
    await f.editRemote({
      content: [
        ...f.content,
        { id: randomUUID(), type: "signature_block", role: "company" },
      ],
    });
    const sent = await f.sendRemote();
    for (const path of [`/proposals/${sent.id}`, "/proposals"]) {
      await page.goto(path);
      trigger = page
        .getByRole("button", {
          name:
            path === "/proposals"
              ? "More actions"
              : `More actions for ${sent.client.company}`,
          exact: true,
        })
        .first();
      await trigger.click();
      await adjacent(
        page,
        trigger,
        page.locator("dialog.foundation-action-menu[open]"),
        width < 700,
      );
    }
    await page.goto("/studio/workspace?view=team");
    trigger = page.getByRole("button", {
      name: `Actions for ${f.members[0].display_name}`,
      exact: true,
    });
    await trigger.click();
    await adjacent(
      page,
      trigger,
      page.locator("dialog.foundation-action-menu[open]"),
      width < 700,
    );
    await page.goto(`/studio/blocks/${block.id}`);
    if (width < 700) {
      trigger = page.getByRole("button", {
        name: "More editor actions",
        exact: true,
      });
      await trigger.click();
      await adjacent(
        page,
        trigger,
        page.locator("dialog.tools-sheet[open]"),
        true,
      );
    }
    await page.goto("/studio/emails/proposal_sent");
    if (width < 700) {
      trigger = page.getByRole("button", {
        name: "More email tools",
        exact: true,
      });
      await trigger.click();
      await adjacent(
        page,
        trigger,
        page.locator("dialog.tools-sheet[open]"),
        true,
      );
    } else {
      await page
        .getByRole("textbox", { name: "Email body", exact: true })
        .click();
      trigger = page.getByRole("button", {
        name: "More formatting",
        exact: true,
      });
      await trigger.click();
      await adjacent(page, trigger, page.locator(".email-format-more"));
    }
  });
