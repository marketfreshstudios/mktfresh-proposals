import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { setup, staff, companyConsent } from "../tests/helpers";
import { documents, saveDocument, refreshDocument } from "../src/lib/documents";
test("linked reference save, refresh failure, dashboard status and hidden saved credentials", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { repo, settings, members } = await setup();
  const key = Buffer.alloc(32, 9).toString("base64");
  let fail = false;
  const fetcher = async () => {
    if (fail) throw Error("Reference fetch failed (HTTP 503)");
    return "PLAYBOOK_VERSION = 'v7'\n<script>window.referenceExecuted=true</script>";
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: unknown = [];
    if (path === "/api/auth/session")
      value = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    else if (path === "/api/proposals") value = { items: [], total: 0 };
    else if (path.endsWith("/refresh"))
      value = await refreshDocument(repo, path.split("/")[3], fetcher, key);
    else if (path === "/api/workspace_documents")
      value =
        route.request().method() === "GET"
          ? await documents(repo)
          : await saveDocument(
              repo,
              route.request().postDataJSON(),
              fetcher,
              key,
            );
    await route.fulfill({ json: value });
  });
  await page.goto("/studio/connections?view=reference");
  await page
    .getByRole("combobox", { name: "Source", exact: true })
    .selectOption("linked");
  await page
    .getByRole("textbox", { name: "Reference name", exact: true })
    .fill("Linked pricing");
  await page
    .getByRole("textbox", { name: "Reference URL", exact: true })
    .fill("https://pricing.example.test/reference.txt");
  await page
    .getByRole("textbox", { name: "Basic auth username", exact: true })
    .fill("private-user");
  await page
    .getByLabel("Basic auth password", { exact: true })
    .fill("private-password");
  await page
    .getByRole("button", { name: "Save reference", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Pricing reference status" }),
  ).toContainText("v7");
  await page
    .getByRole("button", { name: "Edit Linked pricing", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Basic auth username", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByLabel("Basic auth password", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByText("Credentials saved. Leave both fields blank to keep them."),
  ).toBeVisible();
  fail = true;
  await page.getByRole("button", { name: "Refresh now", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTTP 503" }),
  ).toContainText("last good version");
  await page.getByText("Linked pricing · v7", { exact: true }).last().click();
  await expect(page.locator("pre")).toContainText("<script>");
  expect(await page.evaluate(() => "referenceExecuted" in window)).toBe(false);
  await page.goto("/");
  const status = page.getByRole("region", { name: "Pricing reference status" });
  await expect(status).toContainText("v7");
  await expect(status).toContainText("Last successful refresh:");
  await expect(status).toContainText("HTTP 503");
  await mkdir(".data/evidence/screens", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const [screen, url] of [
      ["references-dashboard", "/"],
      ["references-settings", "/studio/connections?view=reference"],
    ]) {
      await page.goto(url);
      await expect(
        page.getByRole("region", { name: "Pricing reference status" }),
      ).toContainText("HTTP 503");
      if (url.includes("view=reference"))
        await page
          .getByRole("button", { name: "Edit Linked pricing", exact: true })
          .click();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `.data/evidence/screens/${screen}-desktop-${theme}.png`,
        fullPage: true,
      });
    }
  }
  expect(await page.locator("body").innerText()).not.toContain(
    "private-password",
  );
});
