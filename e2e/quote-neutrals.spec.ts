import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { harborQuoteNeutrals } from "../src/lib/proposal-styles";

test("Harbor quote colors paint the editor, client page and PDF without changing page geometry", async ({
  page,
}, info) => {
  const group = crypto.randomUUID();
  const f = await editorFixture(page, false, {
    content: [
      { id: "cover-break", type: "page_break" },
      { id: "investment", type: "heading", text: "Investment", level: 1 },
      {
        id: "intro",
        type: "paragraph",
        text: "Choose the website plan that works for your team.",
      },
      { id: "pricing", type: "pricing_table" },
      { id: "client-signature", type: "signature_block", role: "client" },
      { id: "company-signature", type: "signature_block", role: "company" },
    ],
    quote: (base) =>
      base.slice(0, 2).map((item, index) => ({
        ...item,
        name: index ? "Website and monthly support" : "Website build",
        optional: true,
        default_selected: index === 0,
        selected: undefined,
        choice_group_id: group,
      })),
  });
  await f.editRemote({
    header_footer: {
      ...defaultHeaderFooter(),
      showHeader: false,
      showFooter: false,
    },
  });
  const evidence = "docs/screenshots/quote-neutrals";
  const capture = process.env.CAPTURE_QUOTE_NEUTRALS === "1";
  if (capture) mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  const paper = page.locator(".editor-paper");
  const editor = paper.locator(".flow-choice-group").first();
  await expect(editor).toHaveCSS("background-color", "rgb(241, 244, 245)");
  await expect(editor).toHaveCSS("border-top-color", "rgb(220, 227, 230)");
  await editor.scrollIntoViewIfNeeded();
  if (capture)
    await page.screenshot({
      path: `${evidence}/editor-1440.png`,
      animations: "disabled",
    });

  const plan = JSON.parse((await paper.getAttribute("data-pagination"))!);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const pdf = f.renders[0];
  expect(pdf.layout.pages).toBe(plan.pages);
  const quotePage =
    pdf.layout.sheets!.findIndex(({ html }) =>
      html.includes("print-choice-group"),
    ) + 1;
  expect(quotePage).toBeGreaterThan(0);
  if (capture) {
    const file = info.outputPath("harbor-quote.pdf");
    writeFileSync(file, Buffer.from(pdf.pdf_base64, "base64"));
    execFileSync("pdftoppm", [
      "-f",
      String(quotePage),
      "-l",
      String(quotePage),
      "-scale-to-x",
      "1440",
      "-scale-to-y",
      "-1",
      "-png",
      "-singlefile",
      file,
      `${evidence}/pdf-1440`,
    ]);
  }

  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Styles", exact: true }).click();
  await page.getByText("Page & margins", { exact: true }).click();
  await page.getByText("Quote colors", { exact: true }).click();
  const colorControl = page.getByRole("button", {
    name: "Edit choice group background color",
  });
  await expect(colorControl).toContainText(
    harborQuoteNeutrals.group_fill.toUpperCase(),
  );
  await colorControl.click();
  await page.getByRole("textbox", { name: "Hex color" }).fill("#e4eaed");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(() => f.active().style_overrides?.quote_neutrals?.group_fill)
    .toBe("#e4eaed");
  await expect(editor).toHaveCSS("background-color", "rgb(228, 234, 237)");
  await page.getByRole("button", { name: "Use Harbor defaults" }).click();
  await expect
    .poll(() => f.active().style_overrides?.quote_neutrals?.group_fill)
    .toBe(harborQuoteNeutrals.group_fill);
  const sent = await f.sendRemote();
  expect(sent.versions.at(-1)?.resolved_styles?.layout?.quote_neutrals).toEqual(
    harborQuoteNeutrals,
  );
  await page.goto(`/p/${sent.token}`);
  const client = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await client.waitFor();
  expect(JSON.parse((await client.getAttribute("data-page-plan"))!)).toEqual(
    plan,
  );
  const clientGroup = client.locator(".flow-choice-group").first();
  await expect(clientGroup).toHaveCSS("background-color", "rgb(241, 244, 245)");
  await expect(clientGroup).toHaveCSS("border-top-color", "rgb(220, 227, 230)");
  await expect(clientGroup.getByRole("radio").first()).toBeChecked();
  await clientGroup.scrollIntoViewIfNeeded();
  if (capture)
    await page.screenshot({
      path: `${evidence}/client-1440.png`,
      animations: "disabled",
    });
});
