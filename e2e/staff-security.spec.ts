import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
import { setup, staff } from "../tests/helpers";

const gallery = "docs/screenshots/r22-security";
async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_R22_SECURITY !== "1") return;
  await mkdir(gallery, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${gallery}/${name}.png`,
    animations: "disabled",
  });
}

test("account security dialogs, off-domain email, backup codes and sessions at desktop and mobile sizes", async ({
  page,
}) => {
  const { settings } = await setup();
  settings.email = "hello@example.test";
  const sessions = [
    {
      id: "00000000-0000-4000-8000-000000000010",
      current: true,
      device: "Mac | Chrome",
      location: "Miami, FL",
      last_active: "2026-11-09T18:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000011",
      current: false,
      device: "iPhone | Safari",
      location: "Miami, FL",
      last_active: "2026-11-09T15:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000012",
      current: false,
      device: "iPad | Safari",
      location: null,
      last_active: "2026-11-02T16:00:00Z",
    },
  ];
  let signedInEmail = staff.staff_email,
    enabled = false,
    changedPassword = "2026-08-14T12:00:00Z";
  let pending: { email: string; expires_at: string } | null = null;
  let resent = 0;
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const qr = await QRCode.toDataURL(
    "otpauth://totp/Yeswell%3Ademo%40example.test?secret=" + secret,
  );
  const codes = [
    "AAAA-ABCD-EFGH-JKLM",
    "BBBB-NPQR-STUV-WXYZ",
    "CCCC-ABCD-EFGH-JKLM",
    "DDDD-NPQR-STUV-WXYZ",
    "EEEE-ABCD-EFGH-JKLM",
    "FFFF-NPQR-STUV-WXYZ",
    "GGGG-ABCD-EFGH-JKLM",
    "HHHH-NPQR-STUV-WXYZ",
  ];

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const input = method === "POST" ? route.request().postDataJSON() : {};
    const ok = (json: unknown) => route.fulfill({ json });
    if (url === "/api/auth/session")
      return ok({
        user: { ...staff, staff_email: signedInEmail },
        settings,
        staff: [],
        account: {
          first_name: "Alex",
          last_name: "Morgan",
          job_title: "Owner",
          phone: "",
          notifications: {},
        },
      });
    if (url === "/api/account/security")
      return ok({
        sessions,
        two_step: enabled,
        backup_codes_remaining: enabled ? 8 : 0,
        password_changed_at: changedPassword,
      });
    if (url.endsWith("/security/password")) {
      if (input.current_password !== "the current password")
        return route.fulfill({
          status: 400,
          json: { error: "Current password is incorrect" },
        });
      expect(input.password).toBe("a new password");
      sessions.splice(1);
      changedPassword = "2026-11-09T18:00:00Z";
      return ok({ changed: true });
    }
    if (url.endsWith("/security/two-step")) {
      if (input.action === "start") return ok({ secret, qr });
      if (input.action === "prepare" || input.action === "regenerate") {
        expect(input.code).toBe("287082");
        return ok({ codes });
      }
      if (input.action === "disable") expect(input.code).toBe(codes[0]);
      enabled = input.action === "enable";
      return ok({ enabled });
    }
    if (url.endsWith("/security/sessions")) {
      if (input.action === "one")
        sessions.splice(
          sessions.findIndex((s) => s.id === input.id),
          1,
        );
      else sessions.splice(1);
      return ok({ signed_out: true });
    }
    if (url.endsWith("/security/email")) {
      if (method === "GET")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(pending),
        });
      if (input.action === "cancel") {
        pending = null;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "null",
        });
      }
      if (input.action === "request") {
        expect(input.password).toBe("the current password");
        pending = {
          email: input.email,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        };
      } else resent++;
      return ok(pending);
    }
    if (url === "/api/auth/confirm-email") {
      expect(input.token).toBe("example-token");
      signedInEmail = pending!.email;
      pending = null;
      return ok({ email: signedInEmail, signed_in: true });
    }
    return ok([]);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/account/security");
  await expect(page.getByText("Mac | Chrome", { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include(".staff-account-page").analyze())
      .violations,
  ).toEqual([]);
  await capture(page, "1a2-security-1440");
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByText("This device")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    expect(
      (await new AxeBuilder({ page }).include(".staff-account-page").analyze())
        .violations,
    ).toEqual([]);
    await capture(page, `security-${width}`);
  }

  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole("button", { name: "Change password" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Change password" }),
  ).toBeVisible();
  await capture(page, "1a2-change-password-1440");
  await dialog
    .getByLabel("Current password", { exact: true })
    .fill("incorrect");
  await dialog
    .getByLabel("New password", { exact: true })
    .fill("a new password");
  await dialog.getByLabel("Confirm new password").fill("a new password");
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(dialog.getByText("Current password is incorrect")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  await page
    .getByRole("button", { name: "Sign out iPhone | Safari", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Sign out iPhone | Safari?" }),
  ).toBeVisible();
  await capture(page, "1a2-sign-out-device-1440");
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("iPhone | Safari")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Sign out everywhere else", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("iPad | Safari")).toHaveCount(0);
  await expect(page.getByText("This device")).toBeVisible();

  await page.getByRole("button", { name: "Turn on", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(
    dialog.getByRole("img", { name: "Authenticator setup QR code" }),
  ).toBeVisible();
  await capture(page, "1e-authenticator-1440");
  await dialog.getByLabel("Enter the 6-digit code from the app").fill("287082");
  await dialog.getByRole("button", { name: "Verify" }).click();
  await expect(dialog.locator(".staff-backup-codes li")).toHaveCount(8);
  await expect(
    dialog.getByRole("button", { name: "Turn on", exact: true }),
  ).toBeDisabled();
  await capture(page, "1e-backup-codes-1440");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("yeswell-backup-codes.txt");
  await dialog
    .getByRole("checkbox", { name: "I’ve saved these codes" })
    .check();
  await dialog.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(page.getByText("8 of 8 backup codes left")).toBeVisible();
  await expect(page.getByText(codes[0], { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Regenerate backup codes" }).click();
  await dialog.getByLabel("Authenticator or backup code").fill("287082");
  await dialog.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(dialog.locator(".staff-backup-codes li")).toHaveCount(8);
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Turn off" }).click();
  await dialog.getByLabel("Authenticator or backup code").fill(codes[0]);
  await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Turn on", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Change password" }).click();
  await dialog
    .getByLabel("Current password", { exact: true })
    .fill("the current password");
  await dialog
    .getByLabel("New password", { exact: true })
    .fill("a new password");
  await dialog.getByLabel("Confirm new password").fill("a new password");
  await dialog.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Password changed. Other devices were signed out."),
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/account");
  async function changeEmail() {
    await page.getByRole("button", { name: "Change email" }).click();
    await dialog.getByLabel("New email").fill("alex@other.test");
    await expect(
      dialog.getByText(
        "Proposals will be sent from hello@example.test with replies going to alex@other.test.",
      ),
    ).toBeVisible();
    await capture(page, "1d-change-email-1440");
    await dialog.getByLabel("Your password").fill("the current password");
    await dialog.getByRole("button", { name: "Send confirmation" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Check your new inbox" }),
    ).toBeVisible();
  }
  await changeEmail();
  await capture(page, "1d2-inbox-1440");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Email change pending")).toBeVisible();
  await capture(page, "1d-pending-1440");
  await page.getByRole("button", { name: "Resend", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(resent).toBe(1);
  await page.getByRole("button", { name: "Cancel change" }).click();
  await expect(page.getByText("Email change pending")).toHaveCount(0);
  await changeEmail();
  await page.goto("/login/confirm-email#token=example-token");
  await page.getByRole("button", { name: "Confirm email" }).click();
  await expect(
    page.getByRole("heading", { name: "Email changed" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await capture(page, "1d2-confirmed-1440");
  await page.getByRole("link", { name: "Done" }).click();
  await expect(
    page.getByText(/alex@other.test \| used to sign in/),
  ).toBeVisible();
});

test("sign-in states render with or without a previously known workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let state = "paused";
  await page.route("**/api/auth/account-state", (route) =>
    route.fulfill({
      json: {
        state,
        workspace: "Example Studio",
        timezone: "America/New_York",
        at: "2026-11-06T16:00:00Z",
        admin: { name: "Alex Morgan", email: "staff@example.test" },
      },
    }),
  );
  for (const [value, heading] of [
    ["paused", "Your account is paused"],
    ["removed", "You no longer have access"],
    ["signed-out", "You were signed out"],
    ["two-step", "Verify your sign-in"],
  ]) {
    state = value;
    await page.goto("/login?state=" + state);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    if (state === "paused" || state === "removed")
      await expect(
        page.getByRole("link", { name: "staff@example.test" }),
      ).toBeVisible();
    await capture(page, `1h-${state}-1440`);
  }
  await page.getByRole("button", { name: "Use a backup code" }).click();
  await page.getByLabel("Backup code").fill("AAAA-ABCD-EFGH-JKLM");
  await page.route("**/api/auth/two-step", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      code: "AAAA-ABCD-EFGH-JKLM",
    });
    return route.fulfill({
      status: 400,
      json: { error: "This backup code is invalid or has already been used" },
    });
  });
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator(".account-frame").getByRole("alert")).toContainText(
    "already been used",
  );
});

test("a real pending Auth session cannot load account or proposal APIs and is sent to two-step sign-in", async ({
  page,
  context,
  request,
}) => {
  const fixture = await request.post("http://127.0.0.1:3112/fixture", {
    data: { two_step: true },
  });
  const session = await fixture.json();
  await context.clearCookies();
  await context.addCookies([
    {
      name: "proposal_session",
      value: session.access_token,
      domain: "127.0.0.1",
      path: "/",
    },
    {
      name: "proposal_refresh",
      value: session.refresh_token,
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  for (const path of [
    "/api/auth/session",
    "/api/account/security",
    "/api/proposals",
  ]) {
    expect((await page.request.get(path)).status(), path).toBe(403);
  }
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login\?.*state=two-step/);
  await expect(
    page.getByRole("heading", { name: "Verify your sign-in" }),
  ).toBeVisible();
});
