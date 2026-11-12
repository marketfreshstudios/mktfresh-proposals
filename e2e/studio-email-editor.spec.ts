import emailLayouts from "./ink-clay-email-layouts.json" with { type: "json" };
import { cssColorToken } from "./css-color-token";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { emailEditorFixture } from "./email-editor-fixture";
import {
  emailTemplates,
  emailDefaults,
  saveEmailTemplate,
} from "../src/lib/email-templates";
import { staff } from "../tests/helpers";
test.use({ actionTimeout: 10000 });
const dir = "docs/screenshots/studio-v3-email";
async function shot(page: Page, name: string) {
  if (process.env.STUDIO_EMAIL_CAPTURE === "1") {
    if (name === "email-dark-1440") {
      const search = page.getByRole("searchbox", { name: "Search fields" });
      await expect(search).toHaveCSS(
        "background-color",
        await cssColorToken(search, "--surface"),
      );
    }
    mkdirSync(dir, { recursive: true });
    await page.screenshot({
      path: `${dir}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function range(page: Page, label: string, start: number, end = start) {
  await page.getByRole("textbox", { name: label, exact: true }).evaluate(
    (el, span) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      const at = (offset: number): [Text, number] => {
        for (const node of texts) {
          if (offset <= node.length) return [node, offset];
          offset -= node.length;
        }
        const node = texts.at(-1)!;
        return [node, node.length];
      };
      const range = document.createRange();
      range.setStart(...at(span.start));
      range.setEnd(...at(span.end));
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      (el as HTMLElement).focus();
      document.dispatchEvent(new Event("selectionchange"));
    },
    { start, end },
  );
}
test("inline email subject/body keep cursor, marks, fields and explicit saves; reset has a persistent Undo", async ({
  page,
}) => {
  const f = await emailEditorFixture(page),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails/proposal_sent");
  const subject = page.getByRole("textbox", { name: "Subject", exact: true }),
    body = page.getByRole("textbox", { name: "Email body", exact: true });
  await expect(page.locator(".email-rendered h1.email-title")).toHaveText(
    "Your next project",
  );
  await expect(subject.locator('[data-field="proposal.title"]')).toHaveText(
    "Proposal title",
  );
  await subject.fill("Hello friend");
  await range(page, "Subject", 6, 12);
  await page
    .getByRole("button", {
      name: /^Client first name \{\{client\.first_name\}\}/,
    })
    .click();
  await expect(subject.locator('[data-field="client.first_name"]')).toHaveCount(
    1,
  );
  await expect(subject).toBeFocused();
  await body.fill("A clear plan for your team.");
  await range(page, "Email body", 2, 7);
  const bar = page.getByRole("toolbar", { name: "Email body formatting" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Bold", exact: true }).click();
  await bar.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(body.locator("strong em,em strong")).toHaveText("clear");
  await expect(body).toBeFocused();
  await body.press("ControlOrMeta+a");
  await bar
    .getByRole("button", { name: "More formatting", exact: true })
    .click();
  await page
    .locator(".email-format-more:popover-open")
    .getByRole("button", { name: /^Size (Default|Mixed|[0-9]+)$/, exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "24 px", exact: true }).click();
  await expect(body.locator('[data-inline-size="24"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  await body.press("ControlOrMeta+z");
  await expect(body.locator('[data-inline-size="24"]')).toHaveCount(0);
  await body.press("ControlOrMeta+Shift+z");
  await expect(body.locator('[data-inline-size="24"]').first()).toBeVisible();
  await body.fill("Hello team.");
  await range(page, "Email body", 6, 10);
  await page
    .getByRole("button", {
      name: /^Client company \{\{client\.company\}\}/,
    })
    .click();
  await expect(body.locator('[data-field="client.company"]')).toHaveCount(1);
  await expect(body).toBeFocused();
  await page
    .getByRole("textbox", { name: "Primary button label" })
    .fill("Read the proposal");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await emailTemplates(f.repo)).find((t) => t.key === "proposal_sent")!
          .subject,
    )
    .toBe("Hello {{client.first_name}}");
  const saved = (await emailTemplates(f.repo)).find(
    (t) => t.key === "proposal_sent",
  )!;
  expect(JSON.stringify(saved.body)).toContain('"path":"client.company"');
  await page
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  const confirm = page.getByRole("dialog", { name: "Reset email template?" });
  await expect(
    confirm.getByRole("button", { name: "Keep my edits" }),
  ).toBeFocused();
  await confirm
    .getByRole("button", { name: "Reset email template", exact: true })
    .click();
  await expect(subject.locator('[data-field="proposal.title"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(subject.locator('[data-field="client.first_name"]')).toHaveCount(
    1,
  );
  await expect
    .poll(
      async () =>
        (await emailTemplates(f.repo)).find((t) => t.key === "proposal_sent")!
          .button_label,
    )
    .toBe("Read the proposal");
  expect(errors).toEqual([]);
});
test("real renderer values, widths, dark, plain text and self-only test emails", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.goto("/studio/emails/proposal_sent");
  await expect(page.locator(".email-rendered .email-cta")).toHaveCount(1);
  await expect(page.locator(".email-rendered a[href]")).toHaveCount(0);
  await page.getByRole("button", { name: "Show values", exact: true }).click();
  await expect(page.getByLabel("Preview data")).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Email body", exact: true }),
  ).toContainText("Jamie");
  await page.getByLabel("Preview data").selectOption(f.active().id);
  await expect(
    page.getByRole("textbox", { name: "Email body", exact: true }),
  ).toContainText("Jane");
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(page.locator(".email-preview-frame")).toHaveCSS(
    "width",
    "375px",
  );
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".email-rendered")).toHaveCSS(
    "background-color",
    emailLayouts["proposal_sent · dark"].canvas,
  );
  await page.getByRole("tab", { name: "Plain text", exact: true }).click();
  await expect
    .poll(async () => page.getByLabel("Plain-text alternative").textContent())
    .toBe(f.preview()!.result.text);
  await page
    .getByRole("button", { name: "Send me a test", exact: true })
    .click();
  await expect.poll(() => f.mailer.sent.size).toBe(1);
  expect(([...f.mailer.sent.values()][0] as { to: string }).to).toBe(
    staff.staff_email,
  );
});
test("per-email pickers and read-only notifications follow existing permissions and current copy", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  for (const t of emailDefaults) {
    await page.goto(`/studio/emails/${t.key}`);
    await expect(
      page.getByRole("heading", { name: t.name, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".email-rendered .email-cta")).toHaveCount(1);
    if (
      t.staff &&
      !["staff_billing_failed", "team_invite", "team_password_reset"].includes(
        t.key,
      )
    ) {
      await expect(
        page.getByRole("tab", { name: "Fields", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Save", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Email body", exact: true }),
      ).toHaveAttribute("contenteditable", "false");
      await expect(page.locator(".email-rendered")).toContainText(
        "Yeswell notification for",
      );
    } else {
      const fields = await page
        .locator(".editor-sidepanel .field-option code")
        .allTextContents();
      expect(fields.length).toBeGreaterThan(0);
      if (t.key.startsWith("team_") || t.key === "staff_billing_failed") {
        const group = t.key.startsWith("team_") ? "Team" : "Job";
        const section = page
          .locator(".editor-sidepanel .field-option-group")
          .filter({ has: page.getByText(group, { exact: true }) });
        await expect(section).toHaveCount(1);
        expect(
          (await section.locator("code").allTextContents()).some((path) =>
            path.startsWith(`{{${group.toLowerCase()}.`),
          ),
        ).toBe(true);
      }
      if (t.key.startsWith("team_"))
        expect(
          fields.every((path) => /{{(?:team|sender|workspace)\./.test(path)),
        ).toBe(true);
      else if (t.key === "staff_billing_failed")
        expect(fields.every((path) => /{{(?:job|proposal)\./.test(path))).toBe(
          true,
        );
      else
        expect(fields.every((path) => !/team\.|job\./.test(path))).toBe(true);
      await expect(page.locator(".email-button-caption")).toHaveText(
        `Button label · opens ${t.key.startsWith("team_") ? "the set-password page" : t.staff ? "the proposal record" : "the secure proposal"}`,
      );
    }
  }
  f.member(true);
  await page.goto("/studio/emails/team_invite");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".email-readonly-note")).toContainText(
    "Only a super admin",
  );
});
test("phone docking, trapped tools sheets and tablet drawer keep Field visible", async ({
  page,
}) => {
  await emailEditorFixture(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/studio/emails/proposal_sent");
  const body = page.getByRole("textbox", { name: "Email body", exact: true });
  await body.click();
  const bar = page.getByRole("toolbar", { name: "Email body formatting" });
  await expect(bar).toBeVisible();
  const field = bar.getByRole("button", { name: "Insert field", exact: true });
  await expect(field).toContainText("Field");
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, "height", {
      configurable: true,
      get: () => 600,
    });
    visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const r = await bar.boundingBox();
      return Math.round(r!.y + r!.height);
    })
    .toBe(600);
  await bar
    .getByRole("button", { name: "More formatting", exact: true })
    .click();
  const more = page.locator(".email-format-more:popover-open");
  await expect(more).toBeVisible();
  const menuBox = await more.boundingBox();
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(600);
  await page.keyboard.press("Escape");
  const b = await field.boundingBox();
  expect(b).not.toBeNull();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(375);
  await page
    .getByRole("button", { name: "More email tools", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Email tools", exact: true });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", {
      name: /^Client first name \{\{client\.first_name\}\}/,
    })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(body).toBeFocused();
  await expect(body.locator('[data-field="client.first_name"]')).toHaveCount(2);
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.getByRole("button", { name: "Open Details", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Email tools", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Email tools", exact: true }),
  ).toHaveCount(0);
});

test("email editor references, accessible panels, save failure recovery and legacy URL", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/emails/proposal_sent");
  await expect(page).toHaveURL(/\/studio\/emails\/proposal_sent$/);
  const body = page.getByRole("textbox", { name: "Email body", exact: true });
  await body.click();
  await expect(
    page.getByRole("toolbar", { name: "Email body formatting" }),
  ).toBeVisible();
  await shot(page, "email-fields-1440");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Show values", exact: true }).click();
  await expect(body).toContainText("Jamie");
  await shot(page, "email-values-1440");
  for (const [tab, name] of [
    ["Details", "details"],
    ["Plain text", "plain-text"],
  ]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await shot(page, `email-${name}-1440`);
  }
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await expect(page.locator(".email-rendered")).toHaveCSS(
    "background-color",
    emailLayouts["proposal_sent · dark"].canvas,
  );
  await shot(page, "email-dark-1440");
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.goto("/studio/emails/staff_signed");
  await expect(page.locator(".email-rendered")).toContainText(
    "Yeswell notification for",
  );
  await shot(page, "email-readonly-1440");
  await page.goto("/studio/emails/team_invite");
  await expect(page.locator(".email-rendered h1.email-title")).toHaveText(
    "You're invited",
  );
  await shot(page, "email-team-invite-1440");
  await page.goto("/studio/emails/proposal_sent");
  f.failSave(true);
  await body.fill("This local edit survives a failed save.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator(".studio-email-editor").getByRole("alert"),
  ).toContainText("temporarily unavailable");
  await expect(body).toHaveText("This local edit survives a failed save.");
  f.failSave(false);
  await page.getByRole("button", { name: /Couldn.t save.*Retry/ }).click();
  await expect
    .poll(async () => JSON.stringify((await emailTemplates(f.repo))[0].body))
    .toContain("This local edit survives");
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.getByRole("button", { name: "Open Details", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Email tools", exact: true });
  await expect(drawer).toBeVisible();
  await shot(page, "email-tablet-drawer-768");
  await page.keyboard.press("Tab");
  expect(
    await drawer.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await saveEmailTemplate(f.repo, staff, "proposal_sent", {}, true);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/studio/emails/proposal_sent");
  await body.click();
  await shot(page, "email-phone-bar-375");
  await page
    .getByRole("button", { name: "More email tools", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Email tools", exact: true }),
  ).toBeVisible();
  await shot(page, "email-phone-sheet-375");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  const template = (await f.repo.entities<any>("templates"))[0];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/studio/templates/${template.id}`);
  await expect(
    page.getByRole("tab", { name: "Quote", exact: true }),
  ).toBeVisible();
  await shot(page, "template-quote-tabs-1440");
  const saved = {
    id: crypto.randomUUID(),
    name: "A reusable introduction",
    block: {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "A clear introduction for your next project.",
    },
  };
  await f.repo.put("content_library", saved);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/studio/blocks/${saved.id}`);
  await page.locator(".studio-blocks .tiptap").click();
  const field = page
    .getByRole("toolbar", { name: "Text tools", exact: true })
    .getByRole("button", { name: "Insert field", exact: true });
  await expect(field).toBeVisible();
  await expect(field).toContainText("Field");
  const rect = await field.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(375);
  await shot(page, "saved-block-phone-bar-375");
});

test("email fields use the shared highlight in both Names and Values; the sent renderer is plain", async ({
  page,
}) => {
  const f = await emailEditorFixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails/proposal_sent");
  const subject = page.getByRole("textbox", { name: "Subject", exact: true });
  const body = page.getByRole("textbox", { name: "Email body", exact: true });
  await body.fill("Hi {{client.first_name}}, from {{workspace.name}}.");
  await expect(body.locator(".field-chip")).toHaveCount(2);
  for (const mode of ["Show fields", "Show values"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    for (const root of [subject, body]) {
      const chip = root.locator(".field-chip").first();
      await expect(chip).toHaveCSS(
        "background-color",
        await cssColorToken(chip, "--field-chip-ground"),
      );
      await expect(root).not.toContainText("{{");
    }
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const stored = (await emailTemplates(f.repo)).find(
    (t) => t.key === "proposal_sent",
  )!;
  const { emailStudioPreview } = await import("../src/lib/email-studio");
  const preview = (
    await emailStudioPreview(
      f.repo,
      { get: async () => new Uint8Array(), put: async () => {} },
      staff,
      "proposal_sent",
      {},
    )
  ).result;
  expect(JSON.stringify(stored.body)).toContain("client.first_name");
  expect(preview.html).not.toContain("field-chip");
  expect(preview.html).not.toContain("{{");
});
