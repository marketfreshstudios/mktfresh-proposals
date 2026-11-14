import { expect, test } from "@playwright/test";

test("signing in forgets the last person's remembered workspace", async ({
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(() =>
    localStorage.setItem(
      "yeswell:shell-identity",
      JSON.stringify({
        workspace: { company_name: "Other Studio", logo_icon: null },
        name: "Someone Else",
        email: "someone@example.test",
      }),
    ),
  );
  let submitted = false;
  await page.route("**/api/auth/login", async (route) => {
    submitted = true;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Email or password is incorrect" }),
    });
  });
  await page.getByLabel("Email address").fill("staff@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => submitted).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("yeswell:shell-identity")),
  ).toBeNull();
});
