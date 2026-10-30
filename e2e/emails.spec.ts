import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";
import {
  emailTemplates,
  saveEmailTemplate,
  proposalEmailLog,
  renderTemplate,
} from "../src/lib/email-templates";
import { emailStudioPreview, sendEmailTest } from "../src/lib/email-studio";
import { MockMailer, Worker } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { activity } from "../src/lib/studio";
import { plainBody } from "../src/lib/email-template-content";
test("Emails: workspace templates, responsive editor, fixed actions, fields, self-only tests, send defaults and immutable sent log", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const { repo, service, draft, settings, members } = await setup();
  settings.phone = "(704) 555-0123";
  settings.address = "123 Example Street";
  await repo.put("workspace_settings", settings);
  const mailer = new MockMailer(),
    storage = { put: async () => {}, get: async () => new Uint8Array() },
    providers = {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    };
  let current = draft;
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
      else if (path[0] === "email-templates") {
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
        } else if (path[2] === "test")
          value = await sendEmailTest(
            repo,
            storage,
            mailer,
            staff,
            path[1],
            req.postDataJSON(),
          );
        else
          value = await saveEmailTemplate(
            repo,
            staff,
            path[1],
            req.postDataJSON(),
            path[2] === "reset",
          );
      } else if (path[0] === "connections")
        value = { stripe: true, qbo: false, email: false, mock: true };
      else if (path[0] === "workspace_events") value = await activity(repo);
      else if (path[0] === "proposals") {
        if (!path[1]) value = { items: [current], total: 1 };
        else if (path[2] === "emails")
          value = await proposalEmailLog(repo, current.id);
        else if (path[2] === "ready") value = await service.checkReady(current);
        else if (path[2] === "send") {
          const input = req.postDataJSON();
          current = await service.send(
            current.id,
            staff,
            input.confirm_ai_review,
            input.sender_user_id,
            {
              subject: input.subject,
              body: input.body,
              note: input.note,
              password: input.password,
            },
          );
          value = current;
        } else if (req.method() === "PATCH") {
          current = await service.edit(current.id, req.postDataJSON(), staff);
          value = current;
        } else value = current;
      } else value = await repo.entities(path[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dir = ".data/evidence/emails";
  await mkdir(dir + "/html", { recursive: true });
  const captures: {
    file: string;
    state: string;
    width: number;
    theme: string;
  }[] = [];
  async function shot(state: string, width: number, theme: string) {
    await page.evaluate(() => document.fonts.ready);
    if (await page.locator('iframe[title="Email preview"]').count()) {
      const emailBody = page
        .frameLocator('iframe[title="Email preview"]')
        .locator("body");
      await expect(emailBody.locator("h1")).toBeVisible();
      if (state === "editor-live-preview") {
        await expect(emailBody).toHaveCSS(
          "background-color",
          theme === "dark" ? "rgb(22, 22, 20)" : "rgb(243, 241, 235)",
        );
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: dir + "/" + file, fullPage: false });
    captures.push({ file, state, width, theme });
  }
  // The new navigation item is shared by the desktop section, tablet popover and phone page.
  for (const theme of ["light", "dark"]) {
    await context.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/studio/emails");
      await expect(
        page.getByRole("heading", { name: "Client emails", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".email-list-row")).toHaveCount(13);
      await shot("emails-list", width, theme);
      if (width === 768) {
        await page.getByRole("button", { name: "Studio", exact: true }).click();
        await expect(
          page.getByRole("link", { name: "Emails", exact: true }),
        ).toBeVisible();
        await shot("studio-navigation", width, theme);
        await page.keyboard.press("Escape");
      }
      if (width === 375) {
        await page.goto("/studio");
        await expect(
          page
            .getByRole("navigation", { name: "Studio navigation" })
            .getByRole("link", { name: /Emails/ }),
        ).toBeVisible();
        await shot("studio-navigation", width, theme);
      }
      for (const template of await emailTemplates(repo)) {
        await page.goto(`/studio/emails/${template.key}`);
        await expect(
          page.getByRole("heading", { name: template.name, exact: true }),
        ).toBeVisible();
        const frame = page.frameLocator('iframe[title="Email preview"]');
        await expect(frame.locator("h1")).toHaveText("Your next project");
        await expect(frame.locator("a.email-cta")).toHaveCount(1);
        await expect(frame.locator("a[href]")).toHaveCount(0);
        await expect(
          page.getByRole("textbox", { name: "Primary button label" }),
        ).toHaveValue(template.button_label);
        if (template.staff) {
          await expect(
            page.getByRole("textbox", { name: "Subject", exact: true }),
          ).toHaveAttribute("readonly", "");
          await expect(
            page.getByRole("button", {
              name: "Save email template",
              exact: true,
            }),
          ).toHaveCount(0);
        } else
          await expect(
            page.getByRole("textbox", { name: "Email body", exact: true }),
          ).toBeVisible();
        await shot(`editor-${template.key}`, width, theme);
        if (template.key === "proposal_sent") {
          await page
            .locator(".email-preview-section")
            .evaluate((el) => el.scrollIntoView({ block: "start" }));
          await shot("editor-live-preview", width, theme);
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/emails/proposal_sent");
  const subject = page.getByRole("textbox", { name: "Subject", exact: true }),
    body = page.getByRole("textbox", { name: "Email body", exact: true });
  await subject.fill("{{client.frist_name}}");
  await expect(
    page.getByRole("alert").filter({ hasText: "Check this email" }),
  ).toContainText("Unknown email field: client.frist_name");
  await expect(
    page.getByRole("button", { name: "Save email template", exact: true }),
  ).toBeDisabled();
  await subject.fill("A personal proposal for {{client.company}}");
  await body.fill("Hi {{client.first_name}}, here is the scope we agreed.");
  await body.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(body.locator("strong")).toHaveCount(1);
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(body.locator("em")).toHaveCount(1);
  await page.getByRole("button", { name: "Link", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Link URL", exact: true })
    .fill("https://example.test/about");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await expect(body.locator("a")).toHaveAttribute(
    "href",
    "https://example.test/about",
  );
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(body.locator("ul li")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Numbered list", exact: true })
    .click();
  await expect(body.locator("ol li").first()).toBeVisible();
  await page.getByRole("button", { name: "Insert field", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Field", exact: true })
    .selectOption("workspace.name");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(body.locator('[data-field="workspace.name"]')).toHaveCount(1);
  // Replace the formatting exercise with the intended shared note for the send flow.
  await body.fill("Hi {{client.first_name}}, here is the scope we agreed.");
  await page
    .getByRole("textbox", { name: "Primary button label" })
    .fill("Read your proposal");
  await page
    .getByRole("button", { name: "Save email template", exact: true })
    .click();
  await expect(page.locator(".email-notice")).toContainText(
    "Email template saved",
  );
  const frame = page.frameLocator('iframe[title="Email preview"]');
  await expect(frame.locator("a.email-cta")).toHaveText("Read your proposal");
  await page
    .getByRole("button", { name: "Send me a test", exact: true })
    .click();
  await expect(page.locator(".email-notice")).toContainText(
    "Test captured for staff@example.test",
  );
  expect(
    [...mailer.sent.values()].every((m: any) => m.to === staff.staff_email),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Preview data", exact: true })
    .selectOption(draft.id);
  await expect(frame.locator("h1")).toHaveText(draft.title);
  await expect(page.locator(".email-preview-subject")).toContainText(
    draft.client.company,
  );
  await shot("editor-real-data-and-test", 1440, "dark");
  await page.goto(`/proposals/${draft.id}?view=send`);
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveValue("A personal proposal for Acme & Sons");
  await expect(
    page.getByRole("textbox", { name: "Note", exact: true }),
  ).toContainText("Jane");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Just for this send");
  await page
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("This is my per-send note.");
  await page.getByRole("button", { name: "Send to Jane", exact: true }).click();
  await expect.poll(() => current.status).toBe("sent");
  await page.waitForURL(
    (url) => url.pathname === `/proposals/${current.id}` && !url.search,
  );
  await expect(
    page.getByRole("heading", { name: "Email log", exact: true }),
  ).toBeVisible();
  expect((await emailTemplates(repo))[0].subject).toContain(
    "{{client.company}}",
  );
  await new Worker(repo, storage, mailer, providers).drain(current.id, "email");
  const sentLog = (await proposalEmailLog(repo, current.id))[0];
  expect(sentLog.snapshot.subject).toBe("Just for this send");
  expect(sentLog.snapshot.text).toContain("This is my per-send note.");
  await saveEmailTemplate(repo, staff, "proposal_sent", {
    subject: "Changed later",
    body: plainBody("Changed later"),
    button_label: "Open",
  });
  expect((await proposalEmailLog(repo, current.id))[0].snapshot).toEqual(
    sentLog.snapshot,
  );
  await page.goto(`/proposals/${current.id}`);
  await expect(
    page.getByRole("heading", { name: "Email log", exact: true }),
  ).toBeVisible();
  await page.getByText(/Just for this send ·/).click();
  await expect(
    page.locator('iframe[title="Sent email: Just for this send"]'),
  ).toBeVisible();
  await shot("proposal-email-log", 1440, "dark");
  await page.goto("/studio/emails/proposal_sent");
  await page
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Emails already sent keep their saved copy",
  );
  await page
    .getByRole("button", { name: "Reset email template", exact: true })
    .click();
  await expect(page.locator(".email-notice")).toContainText("reset to default");
  expect(
    (await activity(repo)).some((e) => e.type === "email_template_saved"),
  ).toBe(true);
  expect(errors).toEqual([]);
  // Every email has a portable, real HTML/text render, without claiming a native inbox screenshot.
  for (const t of await emailTemplates(repo)) {
    const { result } = await emailStudioPreview(
      repo,
      storage,
      staff,
      t.key,
      {},
    );
    await writeFile(`${dir}/html/${t.key}.html`, result.html);
    await writeFile(`${dir}/html/${t.key}.txt`, result.text);
    const emailPage = await context.newPage();
    for (const theme of ["light", "dark"] as const) {
      await emailPage.emulateMedia({ colorScheme: theme });
      for (const width of [375, 600]) {
        await emailPage.setViewportSize({ width, height: 950 });
        await emailPage.setContent(result.html);
        await expect(emailPage.locator("a.email-cta")).toHaveCount(1);
        expect(
          await emailPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const file = `render-${t.key}-${width}-${theme}.png`;
        await emailPage.screenshot({ path: `${dir}/${file}`, fullPage: true });
        captures.push({ file, state: `render-${t.key}`, width, theme });
      }
    }
    await emailPage.close();
  }
  await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
