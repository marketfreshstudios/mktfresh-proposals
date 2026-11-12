import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { planAwarePaymentPlanClause } from "../seed/oiot-clause";
import { marketFreshWebsiteChoices } from "../seed/oiot-quote";
import { starterId } from "../seed/starter-templates";
import type { Item } from "../src/lib/model";
import { pdfPreview } from "../src/lib/pdf-preview";
import { publicResult } from "../src/lib/service";
import { editorFixture } from "./editor-fixture";
import { clientActor, signature, staff } from "../tests/helpers";

const capture = process.env.CAPTURE_CONDITIONAL_OIOT === "1";
const dir = "docs/screenshots/conditional-oiot";

test("the conditional quote switches care groups on desktop and phone and freezes Pro terms in the PDF", async ({
  page,
}, info) => {
  page.setDefaultTimeout(12000);
  const f = await editorFixture(page, false, {
    content: [
      { id: "break", type: "page_break" },
      {
        id: "scope",
        type: "heading",
        text: "Website design and build",
        level: 1,
      },
      {
        id: "scope-detail",
        type: "paragraph",
        text: "Choose how to own your new website and the care that fits your team.",
      },
      { id: "price", type: "pricing_table" },
      { id: "term-break", type: "page_break" },
      {
        id: "terms",
        type: "contract",
        text: "Terms",
        clauses: [planAwarePaymentPlanClause],
      },
      { id: "client-signature", type: "signature_block", role: "client" },
      { id: "company-signature", type: "signature_block", role: "company" },
    ],
  });
  const catalog = await f.repo.entities<Item>("pricing_items");
  const quote = marketFreshWebsiteChoices(catalog, (key) =>
    starterId(f.draft.id, key),
  )!;
  const now = quote[0];
  const build = quote[1];
  const pro = quote.at(-1)!;
  await f.editRemote({
    quote: quote.map((item) =>
      item.id === build.id
        ? {
            ...item,
            oiot_purchase_price: 375000,
            sublines: [
              {
                id: starterId(f.draft.id, "kickoff"),
                label: "Kickoff",
                amount: 150000,
                qty: 1,
                interval: "one_time",
                oiot_kickoff: true,
                list_amount: null,
                stripe_lookup_key: null,
                qbo_item_ref: null,
              },
            ],
          }
        : item,
    ),
  });
  const sent = await f.sendRemote();
  const token = sent.token!;
  await page.route(`**/api/public/${token}/quote`, async (route) => {
    const p = await f.service.toggle(
      token,
      "",
      route.request().postDataJSON(),
      clientActor,
    );
    await route.fulfill({ json: publicResult(p) });
  });
  if (capture) mkdirSync(dir, { recursive: true });
  async function shot(name: string, width: number) {
    if (capture)
      await page.screenshot({
        path: `${dir}/${name}-${width}.png`,
        animations: "disabled",
      });
  }
  const nowOption = () =>
    page.getByRole("radio", { name: /^Website Build — Own It Now/ });
  const timeOption = () =>
    page.getByRole("radio", { name: /^Website Build — Own It Over Time/ });
  const essentials = () =>
    page.getByRole("radio", { name: /^Hosting & Care Essentials/ });
  const standard = () =>
    page.getByRole("radio", { name: /^Own It Over Time — Standard/ });
  const proOption = () =>
    page.getByRole("radio", { name: /^Own It Over Time — Pro/ });
  const terms = () =>
    page.getByRole("heading", { name: "4.4 Own It Over Time", exact: true });
  for (const width of [1440, 375]) {
    const current = await f.service.byToken(token);
    if (current.quote.find((i) => i.id === build.id)?.selected)
      await f.service.toggle(
        token,
        "",
        { revision: current.revision, item_id: now.id, selected: true },
        clientActor,
      );
    await page.setViewportSize({ width, height: width === 375 ? 900 : 1100 });
    await page.goto(`/p/${token}`);
    await expect(nowOption()).toBeChecked();
    await expect(essentials()).toBeVisible();
    await expect(standard()).toHaveCount(0);
    await expect(terms()).toHaveCount(0);
    await essentials().check();
    await expect(essentials()).toBeChecked();
    await expect
      .poll(
        async () =>
          publicResult(await f.service.byToken(token)).totals.monthly_total,
      )
      .toBe(2500);
    await essentials().scrollIntoViewIfNeeded();
    await shot("own-it-now", width);
    await timeOption().check();
    await expect(standard()).toBeChecked();
    await expect(essentials()).toHaveCount(0);
    await expect(terms()).toBeVisible();
    await proOption().check();
    await expect(proOption()).toBeChecked();
    await expect
      .poll(
        async () =>
          publicResult(await f.service.byToken(token)).totals.monthly_total,
      )
      .toBe(23900);
    await proOption().scrollIntoViewIfNeeded();
    await shot("own-it-over-time-pro", width);
    await terms().evaluate((heading) =>
      heading.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await expect(
      page
        .getByText(
          /Client pays a kickoff payment of \$1,500 and a monthly fee of \$239/,
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText(/from \$239 to \$164 per month/).first(),
    ).toBeVisible();
    await expect(terms().locator("xpath=ancestor::details")).toHaveCount(0);
    if (width === 1440) {
      // Each Terms clause can be asked about.
      await page.mouse.move(0, 0);
      await terms().hover();
      await expect(
        page.getByRole("button", { name: "Ask about this term" }),
      ).toBeVisible();
      // A line inside a choice group keeps its ask button while the pointer
      // travels to it across the group's frame.
      const line = page
        .locator("[data-client-item-id]")
        .filter({ hasText: "Own It Over Time — Pro" })
        .first();
      await page.mouse.move(0, 0);
      await line.hover({ position: { x: 20, y: 10 } });
      const lineAsk = page.getByRole("button", {
        name: "Ask about this quote line",
      });
      await expect(lineAsk).toBeVisible();
      const to = (await lineAsk.boundingBox())!;
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
        steps: 12,
      });
      await lineAsk.click();
      const ask = page.getByRole("dialog", { name: "Ask a question" });
      await expect(ask).toBeVisible();
      await ask.getByRole("button", { name: "Close" }).click();
    }
    await shot("pro-terms", width);
  }
  const chosen = await f.service.byToken(token);
  const signed = await f.service.sign(
    chosen.id,
    signature(chosen.revision),
    "client",
    clientActor,
    { token, password: "" },
  );
  expect(
    signed.versions.at(-1)?.quote.find((i) => i.id === pro.id)?.selected,
  ).toBe(true);
  expect(signed.versions.at(-1)?.variables_resolved["oiot.step_down"]).toBe(
    "$164",
  );
  const pdf = await pdfPreview(
    f.repo,
    {
      async get() {
        return new Uint8Array();
      },
      async put() {
        throw new Error("Preview does not save files");
      },
    },
    signed,
    f.settings,
  );
  const file = info.outputPath("chosen-pro.pdf");
  writeFileSync(file, Buffer.from(pdf.pdf_base64, "base64"));
  const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  const pages = text.split("\f");
  const termsPage =
    pages.findIndex((text) => text.includes("4.4 Own It Over Time")) + 1;
  expect(termsPage).toBeGreaterThan(0);
  expect(text.replace(/\s+/g, " ")).toContain("from $239 to $164 per month");
  expect(text).not.toContain("Hosting & Care Essentials");
  expect(text).not.toContain("Included with Own It Over Time");
  if (capture)
    execFileSync("pdftoppm", [
      "-f",
      String(termsPage),
      "-l",
      String(termsPage),
      "-scale-to-x",
      "1440",
      "-scale-to-y",
      "-1",
      "-png",
      "-singlefile",
      file,
      `${dir}/pro-terms-pdf-1440`,
    ]);
});
