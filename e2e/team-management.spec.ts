import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { teamFixture } from "../tests/fixtures/team";
import { AppError } from "../src/lib/model";
import { emailTemplates, saveEmailTemplate } from "../src/lib/email-templates";
const shots = "docs/screenshots/team-management";
async function capture(page: Page, name: string) {
  if (process.env.TEAM_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
  }
}
async function fixture(page: Page) {
  const f = await teamFixture();
  let actor = f.admin;
  const invited = await f.team.invite(f.admin, {
    email: "taylor@example.test",
    display_name: "Taylor Example",
  });
  const former = await f.team.invite(f.admin, {
    email: "sam@example.test",
    display_name: "Sam Example",
  });
  await f.team.change(f.admin, former.user_id, { action: "deactivate" });
  const requests: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      parts = new URL(request.url()).pathname
        .split("/")
        .filter(Boolean)
        .slice(1);
    let value: unknown = [],
      status = 200;
    try {
      if (parts[0] === "auth" && parts[1] === "session")
        value = {
          user: actor,
          settings: f.settings,
          staff: (await f.team.list()).filter((m) => m.status === "active"),
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "team") {
        if (request.method() === "GET")
          value = {
            members: await f.team.list(),
            recent: await f.store.audit(),
          };
        else if (parts[1] === "invite") {
          value = await f.team.invite(actor, request.postDataJSON());
          status = 201;
        } else
          value = await f.team.change(actor, parts[1], request.postDataJSON());
      } else if (parts[0] === "auth" && parts[1] === "set-password") {
        const input = request.postDataJSON();
        const found = f.auth.links.find((l) => l.token === input.token_hash);
        if (input.token_hash && !found)
          throw new AppError(
            410,
            "This link is invalid or expired. Ask your admin to resend.",
          );
        const userId = found?.user_id ?? actor.actor.slice(6);
        await f.auth.password(userId, input.password);
        const person = await f.store.get(userId);
        await f.store.change(
          {
            ...actor,
            actor: "staff:" + userId,
            staff_name: person!.display_name,
          },
          userId,
          "password_changed",
        );
        const u = await f.auth.user(userId);
        actor = {
          ...actor,
          actor: "staff:" + userId,
          staff_role: person!.role,
          staff_name: person!.display_name,
          staff_email: u.email,
        };
        value = { authenticated: true };
      } else if (parts[0] === "email-templates") {
        if (request.method() === "GET") value = await emailTemplates(f.repo);
        else if (request.method() === "PUT")
          value = await saveEmailTemplate(
            f.repo,
            actor,
            parts[1],
            request.postDataJSON(),
          );
      } else if (parts[0] === "proposals") value = { items: [], total: 0 };
      else if (parts[0] === "connections")
        value = { stripe: false, qbo: false, email: true, mock: true };
      else if (parts[0] === "workspace-fonts") value = [];
      else if (
        parts[0] === "pricing_items" ||
        parts[0] === "templates" ||
        parts[0] === "clients"
      )
        value = await f.repo.entities(parts[0] as any);
      requests.push({ path: parts.slice(0, 2), status });
      await route.fulfill({ status, json: value });
    } catch (e) {
      await route.fulfill({
        status: e instanceof AppError ? e.status : 400,
        json: {
          error: (e as Error).message,
          ...("proposals" in (e as any)
            ? { unfinished_proposals: (e as any).proposals }
            : {}),
        },
      });
    }
  });
  return {
    ...f,
    invited,
    former,
    requests,
    setActor: (value: typeof actor) => {
      actor = value;
    },
  };
}
test("Super admin Team list, invite/resend and set-password acceptance use app email without revealing credentials", async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=team");
  await expect(
    page.getByRole("table", { name: "Workspace team" }),
  ).toContainText("Super admin");
  await expect(page.getByRole("table")).toContainText(
    "Invited, not accepted yet",
  );
  await expect(page.getByRole("table")).toContainText("Deactivated");
  await capture(page, "team-super-admin");
  await page.getByRole("button", { name: "Actions for Alex Morgan" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Set password", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Send password reset", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Actions for Jamie Example" }).click();
  await expect(
    page.getByRole("button", { name: "Set password", exact: true }),
  ).toBeVisible();
  await capture(page, "team-menu");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(
    page.getByLabel("Ask them to choose a new password at next sign-in"),
  ).toBeChecked();
  await capture(page, "set-password-dialog");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Private example password!");
  await page
    .getByLabel("Type new password again")
    .fill("Private example password!");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await f.store.get(f.member.actor.slice(6)))!.password_change_required,
    )
    .toBe(true);
  expect(JSON.stringify(await f.store.audit())).not.toContain(
    "Private example password!",
  );
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Role", exact: true }),
  ).toHaveValue("member");
  await capture(page, "invite-dialog");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("new@example.test");
  await page
    .getByRole("textbox", { name: "Display name", exact: true })
    .fill("New Example");
  await page.getByRole("button", { name: "Send invite", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("New Example");
  const added = (await f.team.list()).find(
    (m) => m.email === "new@example.test",
  )!;
  await page.getByRole("button", { name: "Actions for New Example" }).click();
  await page
    .getByRole("button", { name: "Resend invite", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resend invite", exact: true })
    .click();
  await expect
    .poll(
      () => f.store.history.filter((e) => e.action === "invite_resent").length,
    )
    .toBe(1);
  const mail = [...f.mailer.sent.values()].at(-1) as any;
  const link = mail.html
    .match(/class="email-cta" href="([^"]+)"/)[1]
    .replaceAll("&amp;", "&");
  const emailPage = await page.context().newPage();
  await emailPage.setViewportSize({ width: 1440, height: 1100 });
  await emailPage.setContent(mail.html);
  await capture(emailPage, "invite-email");
  await emailPage.close();
  await page.goto(
    link.replace("https://app.example.test", "http://127.0.0.1:3100"),
  );
  await expect(
    page.getByRole("heading", { name: "Set your password", exact: true }),
  ).toBeVisible();
  await capture(page, "set-password-page");
  await page
    .getByLabel("New password", { exact: true })
    .fill("New personal password!");
  await page
    .getByLabel("Type new password again")
    .fill("New personal password!");
  await page.getByRole("button", { name: "Save password & sign in" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/");
  expect((await f.store.get(added.user_id))!.status).toBe("active");
  await page.goto("/studio/workspace?view=team");
  await expect(
    page.getByRole("button", { name: "Invite user", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(
    0,
  );
  await expect(page.getByLabel(/^Display name for/)).toBeEditable();
  await capture(page, "team-staff");
  await page.setViewportSize({ width: 375, height: 900 });
  await capture(page, "team-phone");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("expired set-password link explains resend; blocked removal lists work and allows Deactivate instead", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const f = await fixture(page);
  await page.goto("/set-password#token_hash=expired&type=invite");
  await page
    .getByLabel("New password", { exact: true })
    .fill("Replacement password!");
  await page
    .getByLabel("Type new password again")
    .fill("Replacement password!");
  await page.getByRole("button", { name: "Save password & sign in" }).click();
  await expect(page.locator(".banner.danger")).toContainText(
    "Ask your admin to resend",
  );
  const p = (await f.repo.get(f.draft.id))!;
  p.created_by = f.member.actor;
  await f.repo.save(p, p.revision);
  await page.goto("/studio/workspace?view=team");
  await page.getByRole("button", { name: "Actions for Jamie Example" }).click();
  await page
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Jamie Example");
  await dialog
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  await expect(dialog.getByRole("link", { name: p.title })).toHaveAttribute(
    "href",
    `/proposals/${p.id}`,
  );
  await dialog.getByRole("button", { name: "Deactivate instead" }).click();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect
    .poll(async () => (await f.store.get(f.member.actor.slice(6)))!.status)
    .toBe("deactivated");
});
