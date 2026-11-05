import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { editorFixture } from "./editor-fixture";
test.beforeEach(({ page }) => page.setDefaultTimeout(10000));
const shots = "docs/screenshots/manual-delivery-contact";
async function capture(page: Page, name: string) {
  if (process.env.MANUAL_CONTACT_CAPTURE !== "1") return;
  mkdirSync(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${shots}/${name}.png`,
    animations: "disabled",
  });
}
for (const width of [1440, 768, 375])
  test(`manual delivery contact edits in place and retains the email send state at ${width}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as any).__copiedEmail = value;
          },
        },
      });
    });
    const f = await editorFixture(page);
    f.members.push({
      user_id: crypto.randomUUID(),
      display_name: "Jamie",
      name: "Jamie",
      email: "jamie@example.test",
      role: "member",
    });
    const another = await f.service.create(
      {
        client_id: f.draft.client.id,
        template_id: f.draft.template_id!,
        title: "Another unsigned proposal",
      },
      (await import("../tests/helpers")).staff,
    );
    await f.editRemote({
      content: [
        ...f.content,
        { id: crypto.randomUUID(), type: "signature_block", role: "company" },
      ],
    });
    await page.goto(`/proposals/${f.draft.id}/send`);
    const from = page.getByRole("combobox", { name: "From", exact: true }),
      to = page.getByRole("textbox", { name: "To", exact: true });
    await expect(from).toBeVisible();
    await from.selectOption(f.members[1].user_id);
    await expect(to).toHaveValue("Jane Doe <jane@example.test>");
    const subject = page.getByRole("textbox", { name: "Subject", exact: true });
    await expect(subject).toBeEnabled();
    await subject.fill("Keep this personal subject");
    const note = page.getByRole("textbox", { name: "Note", exact: true });
    await note.fill("Keep this personal note");
    await page
      .getByRole("switch", { name: "Require a password", exact: true })
      .check();
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill("personal-secret-123");
    await page
      .getByRole("radio", { name: "I'll send it myself", exact: true })
      .check();
    await expect(from).toHaveCount(0);
    await expect(to).toHaveCount(0);
    await expect(subject).toHaveCount(0);
    await expect(note).toHaveCount(0);
    const contact = page.getByRole("region", {
      name: "Client contact",
      exact: true,
    });
    await expect(contact).toContainText("Acme & Sons");
    await expect(contact).toContainText("Jane Doe");
    await expect(contact).toContainText("jane@example.test");
    await expect(contact).toContainText(
      "Signs the proposal and receives the signed copy.",
    );
    const copy = contact.getByRole("button", {
      name: "Copy email: jane@example.test",
      exact: true,
    });
    await copy.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__copiedEmail))
      .toBe("jane@example.test");
    await expect(
      page.getByRole("status").filter({ hasText: /^Copied$/ }),
    ).toBeVisible();
    const toast = page.locator(".contact-toast");
    await expect(toast).toHaveAttribute("popover", "manual");
    expect(
      await toast.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    ).toBe(true);
    if (width !== 768) await capture(page, `manual-${width}`);
    const edit = contact.getByRole("button", {
      name: "Edit client",
      exact: true,
    });
    if (width === 375)
      for (const control of [copy, edit]) {
        const b = (await control.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
    await edit.click();
    const modal = page.getByRole("dialog", {
      name: "Edit Acme & Sons",
      exact: true,
    });
    await expect(modal).toBeVisible();
    if (width === 1440) await capture(page, "edit-client-1440");
    const cancel = modal.getByRole("button", { name: "Cancel", exact: true }),
      save = modal.getByRole("button", { name: "Save client", exact: true });
    expect((await cancel.boundingBox())!.x).toBeLessThan(
      (await save.boundingBox())!.x,
    );
    await modal
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("invalid");
    await modal
      .getByRole("textbox", { name: "First name", exact: true })
      .click();
    await expect(
      modal.getByRole("alert").filter({ hasText: /valid phone/ }),
    ).toBeVisible();
    await modal
      .getByRole("textbox", { name: "Phone", exact: true })
      .fill("7045550123");
    await modal
      .getByRole("textbox", { name: "First name", exact: true })
      .fill("Taylor");
    await modal
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("taylor@example.test");
    await save.click();
    await expect(modal).toHaveCount(0);
    await expect(contact).toContainText("Taylor Doe");
    await expect(contact).toContainText("taylor@example.test");
    await expect(
      page.getByRole("radio", { name: "I'll send it myself", exact: true }),
    ).toBeChecked();
    expect((await f.repo.get(another.id))!.client.email).toBe(
      "taylor@example.test",
    );
    expect(
      (await f.repo.entities<any>("clients")).find(
        (c) => c.id === f.draft.client.id,
      ).email,
    ).toBe("taylor@example.test");
    await expect(
      page.getByRole("textbox", { name: "Password", exact: true }),
    ).toHaveValue("personal-secret-123");
    await page
      .getByRole("radio", { name: "Email it from the app", exact: true })
      .check();
    await expect(from).toHaveValue(f.members[1].user_id);
    await expect(to).toHaveValue("Taylor Doe <taylor@example.test>");
    await expect(subject).toHaveValue("Keep this personal subject");
    await expect(note).toHaveText("Keep this personal note");
    await page
      .getByRole("radio", { name: "I'll send it myself", exact: true })
      .check();
    expect(
      (await new AxeBuilder({ page }).include(".send-panel").analyze())
        .violations,
    ).toEqual([]);
    await contact
      .getByRole("button", { name: "Edit client", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Edit Acme & Sons", exact: true })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(contact).toContainText("taylor@example.test");
  });

test("manual contact shows the proposal's copied recipient rather than silently choosing a different primary contact", async ({
  page,
}) => {
  const f = await editorFixture(page);
  await f.repo.put("clients", {
    ...f.draft.client,
    first_name: "Different",
    email: "primary@example.test",
    notes: "Keep the current client notes",
  });
  await page.goto(`/proposals/${f.draft.id}/send`);
  await page
    .getByRole("radio", { name: "I'll send it myself", exact: true })
    .check();
  const contact = page.getByRole("region", {
    name: "Client contact",
    exact: true,
  });
  await expect(contact).toContainText("jane@example.test");
  await expect(contact).not.toContainText("primary@example.test");
  await contact
    .getByRole("button", { name: "Edit client", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Edit Acme & Sons",
    exact: true,
  });
  await expect(
    modal.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveValue("jane@example.test");
  await modal
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("chosen@example.test");
  await modal.getByRole("button", { name: "Save client", exact: true }).click();
  await expect(contact).toContainText("chosen@example.test");
  expect(f.active().client.email).toBe("chosen@example.test");
  expect(
    (await f.repo.entities<any>("clients")).find(
      (c) => c.id === f.draft.client.id,
    ).notes,
  ).toBe("Keep the current client notes");
  expect(f.active().client.notes).toBe("Keep the current client notes");
});
