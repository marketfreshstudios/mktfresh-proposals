import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { setup, staff, companyConsent } from "../tests/helpers";
import { previewResult } from "../src/lib/preview";
test("draft client preview has live local totals, branded steps and no client writes at desktop and phone widths", async ({
  page,
}) => {
  page.setDefaultTimeout(12000);
  const { repo, draft, settings, members } = await setup();
  settings.proposal_fonts = { heading: "mono", body: "sans" };
  const original = JSON.stringify(await repo.get(draft.id));
  const requests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(route.request().method() + " " + path);
    let value: unknown = [];
    if (path === `/api/proposals/${draft.id}/preview`)
      value = previewResult(draft, settings);
    else if (path === "/api/auth/session")
      value = {
        user: staff,
        settings,
        staff: members,
        app_url: "http://127.0.0.1:3100",
        signatory_version: companyConsent(0, settings).signatory_version,
      };
    else if (path === `/api/proposals/${draft.id}`) value = draft;
    else if (path === "/api/proposals") value = { items: [draft], total: 1 };
    else if (path === "/api/pricing_items")
      value = await repo.entities("pricing_items");
    await route.fulfill({ json: value });
  });
  await page.goto(`/proposals/${draft.id}`);
  await expect(
    page.getByRole("button", { name: "Preview as client", exact: true }),
  ).toBeEnabled();
  await page.goto(`/proposals/${draft.id}/edit`);
  await expect(
    page.getByRole("button", { name: "Preview as client", exact: true }),
  ).toBeEnabled();
  await mkdir(".data/evidence/screens", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 780 : 1000 });
      await page.goto(`/p/${draft.id}?preview=1`);
      await expect(
        page.getByText("Preview, not sent", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".client-header")).toContainText(
        settings.company_name,
      );
      await expect(
        page.locator(
          width >= 1100
            ? ".client-document-sheets .print-root"
            : ".flow-document",
        ),
      ).toHaveCSS("font-family", /Instrument Sans/);
      await expect(page.locator("#proposal-document h1")).toHaveCSS(
        "font-family",
        /IBM Plex Mono/,
      );
      if (width === 1440) {
        await page
          .getByRole("button", { name: "Phone width", exact: true })
          .click();
        await expect(page.locator(".flow-stage")).toHaveCSS("width", "375px");
        await page
          .getByRole("button", { name: "Desktop width", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: "Ask a question", exact: true })
        .first()
        .click();
      const ask = page.getByRole("dialog", { name: "Ask a question" });
      const message = ask.getByRole("textbox", {
        name: "Your question",
        exact: true,
      });
      await message.fill("Preview question");
      await expect(
        ask.getByText("Preview: questions aren’t sent from here."),
      ).toBeVisible();
      await expect(
        ask.getByRole("button", { name: "Send question" }),
      ).toBeDisabled();
      await message.evaluate((input: HTMLTextAreaElement) =>
        input.form?.requestSubmit(),
      );
      await expect(ask).toBeVisible();
      if (
        width < 700 &&
        theme === "light" &&
        process.env.CAPTURE_QUESTIONS === "1"
      ) {
        await mkdir(".data/evidence/r25-questions", { recursive: true });
        await page.screenshot({ path: ".data/evidence/r25-questions/1f.png" });
      }
      await ask.getByRole("button", { name: "Cancel" }).click();
      const optional = page.getByRole("checkbox").first();
      const before = await page
        .getByLabel("Proposal totals", { exact: true })
        .innerText();
      await optional.click();
      await expect(
        page.getByLabel("Proposal totals", { exact: true }),
      ).not.toHaveText(before, { useInnerText: true });
      await optional.check();
      for (const [step, button] of [
        ["read", "Reading"],
        ["sign", "Signing"],
        ["billing", "Billing"],
      ]) {
        if (width < 700)
          await page
            .getByRole("combobox", { name: "Preview step" })
            .selectOption(step);
        else
          await page.getByRole("button", { name: button, exact: true }).click();
        if (step === "sign") {
          await page.getByRole("checkbox").check();
          await page.getByRole("tab", { name: "Type", exact: true }).click();
          await page.getByPlaceholder("Type your full name").fill("Jane Doe");
          await expect(
            page.getByRole("button", { name: "Sign proposal", exact: true }),
          ).toBeDisabled();
          await page
            .getByRole("textbox", { name: "Full name", exact: true })
            .press("Enter");
        }
        if (step === "billing") {
          await expect(
            page.getByText("Set up your monthly subscription"),
          ).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: /Continue to secure checkout/,
            }),
          ).toBeDisabled();
        }
        await page.evaluate(() => document.fonts.ready);
        if (process.env.CAPTURE_EDITOR_EVIDENCE === "1")
          await page.screenshot({
            path: `.data/evidence/screens/preview-${step}-${width < 700 ? "phone" : "desktop"}-${theme}.png`,
            fullPage: true,
          });
      }
    }
  }
  expect(requests.filter((r) => !r.startsWith("GET "))).toEqual([]);
  expect(requests.filter((r) => r.includes("/api/public/"))).toEqual([]);
  expect(JSON.stringify(await repo.get(draft.id))).toBe(original);
});
