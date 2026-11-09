import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { setup } from "../tests/helpers";
import { MockMailer } from "../src/lib/jobs";
import { sendPasswordChangedEmail, sendTeamEmail } from "../src/lib/team-email";
import { StaffMemberSchema } from "../src/lib/team-model";

const dir = "docs/screenshots/staff-password-reset";
const email = "jamie@example.test";

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_STAFF_RESET !== "1") return;
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${dir}/${name}.png`, animations: "disabled" });
}

for (const width of [1440, 375])
  test(`self-service reset and resend are accessible at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    const reset = page.getByRole("heading", { name: "Reset your password" });
    await expect(reset).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await capture(page, `reset-your-password-${width}`);
    await page.getByRole("textbox", { name: "Email address" }).fill(email);
    const posted = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === "/api/auth/reset-password" &&
        res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send reset link" }).click();
    expect(await (await posted).json()).toEqual({
      accepted: true,
      expires_in_minutes: 60,
    });
    const confirmation = page.getByRole("heading", {
      name: "Check your email",
    });
    await expect(confirmation).toBeFocused();
    await expect(
      page.getByText(
        `If an account exists for ${email}, we’ve sent a link to reset your password. It expires in 60 minutes.`,
      ),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    if (width === 1440) await capture(page, "check-your-email-1440");
    const resend = page.waitForRequest(
      (req) => new URL(req.url()).pathname === "/api/auth/reset-password",
    );
    await page
      .getByRole("button", { name: "Didn’t get it? Send again" })
      .click();
    expect((await resend).postDataJSON()).toEqual({ email });
    await expect(page.getByRole("status")).toHaveText(
      "Reset link requested again.",
    );
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

test("staff recovery and security notice use the shared email layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { repo, settings } = await setup();
  const mailer = new MockMailer();
  const member = StaffMemberSchema.parse({
    user_id: "00000000-0000-4000-8000-000000000012",
    workspace_id: repo.workspaceId,
    display_name: "Jamie",
    role: "member",
  });
  await sendTeamEmail(
    repo,
    mailer,
    {
      actor: "system",
      staff_name: "Yeswell",
      staff_email: "staff@example.test",
      ip: "",
      user_agent: "",
    },
    {
      member,
      email,
      token: "example-only-recovery",
      type: "recovery",
      replyTo: settings.email,
    },
  );
  await sendPasswordChangedEmail(repo, mailer, member, email);
  const [recovery, notice] = [...mailer.sent.values()] as { html: string }[];
  await page.setContent(recovery.html);
  const button = page.getByRole("link", {
    name: "Set your password",
    exact: true,
  });
  await expect(button).toHaveAttribute(
    "href",
    /\/set-password#token_hash=example-only-recovery&type=recovery$/,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await capture(page, "reset-email-1440");

  await page.goto(
    "/set-password#token_hash=example-only-recovery&type=recovery",
  );
  await expect(
    page.getByRole("button", { name: "Save password & sign in" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await capture(page, "choose-new-password-1440");

  await page.goto("about:blank");
  await page.setContent(notice.html);
  await expect(
    page.getByRole("heading", { name: "Your Yeswell password was changed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Not you? Contact your workspace admin right away."),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await capture(page, "password-changed-email-1440");
});
