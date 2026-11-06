import type { Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { staff } from "../tests/helpers";
import { emailTemplates, saveEmailTemplate } from "../src/lib/email-templates";
import { emailStudioPreview, sendEmailTest } from "../src/lib/email-studio";
import { MockMailer } from "../src/lib/jobs";
export async function emailEditorFixture(page: Page) {
  const f = await editorFixture(page),
    mailer = new MockMailer();
  let member = false,
    failSave = false,
    lastPreview: Awaited<ReturnType<typeof emailStudioPreview>> | null = null;
  const actor = () => ({
    ...staff,
    staff_role: member ? ("member" as const) : ("owner" as const),
  });
  const storage = { put: async () => {}, get: async () => new Uint8Array() };
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: {
        user: actor(),
        settings: f.settings,
        staff: f.members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: "fixture",
      },
    }),
  );
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: { stripe: true, qbo: false, email: false, mock: true },
    }),
  );
  await page.route("**/api/email-templates**", async (route) => {
    const request = route.request(),
      parts = new URL(request.url()).pathname.split("/").filter(Boolean);
    try {
      let value: unknown;
      if (request.method() === "GET") value = await emailTemplates(f.repo);
      else if (parts[3] === "preview") {
        const preview = await emailStudioPreview(
          f.repo,
          storage,
          actor(),
          parts[2],
          request.postDataJSON(),
        );
        lastPreview = preview;
        value = {
          ...preview.result,
          values: preview.values,
          context: {
            client_name: `${preview.p.client.first_name} ${preview.p.client.last_name}`,
            client_email: preview.p.client.email,
            sender_name: preview.p.sender?.display_name,
            sender_email: preview.p.sender?.email,
            workspace_name: preview.p.workspace_settings?.company_name,
          },
        };
      } else if (parts[3] === "test")
        value = await sendEmailTest(
          f.repo,
          storage,
          mailer,
          actor(),
          parts[2],
          request.postDataJSON(),
        );
      else {
        if (failSave)
          throw new Error("Email settings are temporarily unavailable");
        value = await saveEmailTemplate(
          f.repo,
          actor(),
          parts[2],
          request.postDataJSON(),
          parts[3] === "reset",
        );
      }
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: (e as any).status ?? 400,
        json: { error: (e as Error).message },
      });
    }
  });
  return {
    ...f,
    mailer,
    preview: () => lastPreview,
    member: (value: boolean) => (member = value),
    failSave: (value: boolean) => (failSave = value),
  };
}
