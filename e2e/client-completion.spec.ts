import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "../tests/helpers";
import { mutate } from "../src/lib/repository";
import { publicResult } from "../src/lib/service";
import { sealedPdf } from "../src/lib/pdf";
import { emailHtml } from "../src/lib/branding";
import { PDFDocument } from "pdf-lib";
import type { QuoteItem } from "../src/lib/model";

test("client completion: exact charges, one contact footer, reading width, emails and single-page certificate", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(12000);
  const { repo, service, draft, settings } = await setup();
  settings.timezone = "America/New_York";
  // Draw without starting the staff app: its sign-in redirect can race the first fixture navigation.
  await page.goto("about:blank");
  // Synthetic test signature, never an owner's real stored image.
  settings.company_signatory!.image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 720;
    c.height = 180;
    const x = c.getContext("2d")!;
    x.fillStyle = "#202820";
    x.font = "italic 58px Georgia";
    x.fillText("Alex Morgan", 25, 110);
    return c.toDataURL("image/png");
  });
  const delegate = {
    ...staff,
    actor: "staff:00000000-0000-4000-8000-000000000002",
    staff_name: "Taylor Lee",
    staff_email: "taylor@example.test",
    ip: "203.0.113.42",
    staff_role: "member" as const,
  };
  settings.company_signatory!.authorized_user_ids.push(delegate.actor.slice(6));
  await repo.put("workspace_settings", settings);
  const base = draft.quote[0];
  const item = (
    name: string,
    interval: "one_time" | "month" | "year",
    amount: number,
    order: number,
  ): QuoteItem => ({
    ...base,
    id: randomUUID(),
    order,
    name,
    description: "Agreed service scope",
    optional: false,
    default_selected: true,
    selected: true,
    schedule: null,
    min_term_months: null,
    plan_terms: {},
    sublines: [
      {
        ...base.sublines[0],
        id: randomUUID(),
        interval,
        amount,
        list_amount: amount,
        qty: 1,
        stripe_lookup_key: null,
        qbo_item_ref: null,
      },
    ],
  });
  const monthly = item("Store Care — Pro", "month", 32500, 0),
    yearly = item("Annual licence", "year", 12000, 1),
    oneTime = item("Website setup", "one_time", 250000, 2),
    extra = item("Additional support", "month", 5000, 3);
  await mutate(repo, draft.id, (p) => {
    p.title = "Website care and launch";
    p.quote = [monthly, yearly, oneTime, extra];
    p.content = [
      { type: "heading", text: "Overview" },
      {
        type: "paragraph",
        text: "We’ll prepare the launch and care for your website. Your signed scope and selected services are recorded below.",
      },
      { type: "heading", text: "Services" },
      { type: "pricing_table" },
      {
        type: "paragraph",
        text: "We’ll agree the delivery dates together and keep you informed throughout the work.",
      },
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    ];
  });
  // Explicit fixture mappings replace provider reads; no provider calls or writes.
  monthly.pricing_item_id = null;
  const p0 = (await repo.get(draft.id))!;
  await mutate(repo, draft.id, (p) => {
    p.quote = p.quote.map((i) => ({ ...i, pricing_item_id: null }));
  });
  // Use the ordinary staff send checks with manually entered recurring prices represented by fixture product mappings.
  for (const q of (await repo.get(draft.id))!.quote)
    for (const sub of q.sublines)
      if (sub.interval !== "one_time") {
        const lookup = `fixture-${sub.id}`;
        sub.stripe_lookup_key = lookup;
        await repo.put("pricing_items", {
          ...base,
          id: randomUUID(),
          sku: lookup,
          name: q.name,
          amount: sub.amount,
          interval: sub.interval,
          stripe_lookup_key: lookup,
          active: true,
          legacy: false,
        } as any);
      }
  await mutate(repo, draft.id, (p) => {
    p.quote = p0.quote.map((i) => ({
      ...i,
      pricing_item_id: null,
      sublines: i.sublines.map((s) => ({
        ...s,
        stripe_lookup_key: s.interval === "one_time" ? null : `fixture-${s.id}`,
      })),
    }));
  });
  const sent = await service.send(draft.id, staff, false, undefined, {
    note: "Hi Jane,\nHere’s the scope we discussed. Thank you for the opportunity.",
  });
  const viewed = await service.view(sent.token!, "", clientActor);
  const signed = await service.sign(
    sent.id,
    signature(viewed.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const completed = await service.sign(
    sent.id,
    {
      ...companyConsent(signed.revision, settings),
      authorization: true,
      authorization_text: `I'm authorized to sign on behalf of ${settings.company_signatory!.name} for ${settings.company_name}.`,
    },
    "company",
    delegate,
  );
  const dir = ".data/evidence/client-completion";
  await mkdir(dir, { recursive: true });
  const before = JSON.stringify(completed);
  const rendered = await sealedPdf(
    completed.versions.at(-1)!,
    completed.signers,
    completed.events,
    completed.currency,
    { settings, document: { id: completed.id, title: completed.title } },
  );
  expect(JSON.stringify(completed)).toBe(before);
  const body = await PDFDocument.load(rendered.body),
    pdf = await PDFDocument.load(rendered.pdf);
  expect(pdf.getPageCount()).toBe(body.getPageCount() + 1);
  await writeFile(`${dir}/completed-proposal.pdf`, rendered.pdf);
  execFileSync("pdftoppm", [
    "-f",
    String(pdf.getPageCount()),
    "-singlefile",
    "-scale-to",
    "1400",
    "-png",
    `${dir}/completed-proposal.pdf`,
    `${dir}/certificate-final`,
  ]);
  const certificatePng = await readFile(`${dir}/certificate-final.png`);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(rendered.pdf),
    useSystemFonts: true,
  });
  const doc = await loading.promise;
  const cert = await doc.getPage(doc.numPages),
    certText = (await cert.getTextContent()).items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ")
      .replace(/\s+/g, " ");
  for (const text of [
    "Certificate of completion",
    completed.id,
    completed.title,
    completed.versions.at(-1)!.content_hash,
    "Signed on behalf of Alex Morgan by Taylor Lee",
    "203.0.113.42",
    "America/New_York",
    "First viewed",
  ])
    expect(certText).toContain(text);
  expect(certText).not.toMatch(
    /Events|webhook|subscription_created|email_sent|pdf_generated|User agent/,
  );
  await loading.destroy();
  const initial = publicResult(sent),
    accepted = publicResult(signed),
    finished = publicResult(completed);
  let current = structuredClone(initial),
    writes = 0,
    verifies = 0;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() !== "GET") writes++;
    if (path.includes("/verify")) verifies++;
    if (path.endsWith("/brand"))
      return route.fulfill({
        json: { ...current.company, contact: current.contact },
      });
    if (path.includes("/files/"))
      return route.fulfill({
        body: rendered.pdf,
        contentType: "application/pdf",
      });
    return route.fulfill({ json: current });
  });
  const captures: {
    file: string;
    frame: string;
    width: number;
    theme: string;
  }[] = [];
  async function capture(
    name: string,
    frame: string,
    width: number,
    theme: string,
    fullPage = false,
  ) {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      name + " fits",
    ).toBe(true);
    const file = `${name}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage });
    captures.push({ file, frame, width, theme });
  }
  const line = (i: QuoteItem) => i.sublines[0].id;
  const checkout = (
    items: QuoteItem[],
    mode: "subscription" | "setup" = "subscription",
  ): (typeof initial.billing)[number] => ({
    status: "succeeded",
    requires_checkout: true,
    checkout: items.map((i) => ({
      url: `https://checkout.stripe.com/test_${line(i)}`,
      line_ids: [line(i)],
      items: [{ line_id: line(i), name: i.name }],
      mode,
    })),
    added_existing: [],
  });
  async function open(p: typeof initial) {
    current = structuredClone(p);
    await page.goto(`/p/${sent.token}`);
    await expect(page.locator(".flow-sender-contact")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Verify this document" }),
    ).toHaveCount(0);
  }
  for (const width of [375, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) => localStorage.setItem("proposal-theme", t),
        theme,
      );
      await open(initial);
      const readingWidth = (await page.locator(".flow-document").boundingBox())!
        .width;
      await page.locator(".flow-sender-contact").scrollIntoViewIfNeeded();
      await expect(
        page
          .locator(".flow-sender-contact")
          .getByRole("link", { name: "Alex Morgan", exact: true }),
      ).toHaveAttribute("href", "mailto:staff@example.test");
      await page
        .getByRole("button", {
          name: "Copy sender email: staff@example.test",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Copied" }),
      ).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "staff@example.test",
      );
      await capture("sender-contact-reading", "1a", width, theme);
      await page.goto(`/p/${sent.token}`);
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await capture(
        "sign-contact-footer",
        width === 1440 ? "5c" : width === 768 ? "5d" : "1d",
        width,
        theme,
        true,
      );
      const monthlyOnly = structuredClone(accepted);
      monthlyOnly.quote = monthlyOnly.quote.filter(
        (i) => i.id !== yearly.id && i.id !== extra.id,
      );
      monthlyOnly.billing = [checkout([monthly])];
      await open(monthlyOnly);
      await expect(
        page.getByRole("heading", {
          name: "Set up your monthly subscription",
          exact: true,
        }),
      ).toBeVisible();
      const charges = page.locator(".flow-checkout-group");
      await expect(charges).toContainText("Store Care — Pro");
      await expect(charges).toContainText("$325/month");
      await expect(charges).not.toContainText("Website setup");
      await expect(
        page.getByRole("link", {
          name: "Continue to secure checkout — $325/month",
          exact: true,
        }),
      ).toHaveAttribute(
        "href",
        `https://checkout.stripe.com/test_${line(monthly)}`,
      );
      await expect(page.locator(".flow-separate-invoice")).toContainText(
        "Website setup",
      );
      await expect(page.locator(".flow-separate-invoice")).toContainText(
        "We'll send you an invoice",
      );
      await expect(page.locator(".flow-totals")).toHaveCount(0);
      await capture("billing-monthly-manual", "1e", width, theme, true);
      await page
        .getByRole("button", { name: "View the signed proposal", exact: true })
        .click();
      expect((await page.locator(".flow-document").boundingBox())!.width).toBe(
        readingWidth,
      );
      await page.locator(".flow-document").scrollIntoViewIfNeeded();
      await capture(
        "billing-signed-reading-width",
        width === 1440 ? "5a" : width === 768 ? "5b" : "1a",
        width,
        theme,
      );
      const mixed = structuredClone(accepted);
      mixed.invoice_method = "quickbooks";
      mixed.billing = [checkout([monthly, yearly])];
      mixed.billing[0].added_existing = [
        {
          monthly_total: 5000,
          yearly_total: 0,
          line_ids: [line(extra)],
          items: [{ line_id: line(extra), name: extra.name }],
        },
      ];
      await open(mixed);
      await expect(page.locator(".flow-checkout-group")).toHaveCount(2);
      await expect(page.locator(".flow-added-items")).toContainText(
        "Additional support",
      );
      await expect(page.locator(".flow-separate-invoice")).toContainText(
        "You'll receive a QuickBooks invoice",
      );
      await expect(
        page.getByRole("link", {
          name: "Continue to secure checkout — $120/year",
          exact: true,
        }),
      ).toBeVisible();
      await capture("billing-mixed-qbo", "1e", width, theme, true);
      const existing = structuredClone(accepted);
      existing.billing = [
        {
          status: "succeeded",
          requires_checkout: false,
          checkout: [],
          added_existing: [
            {
              monthly_total: 42500,
              yearly_total: 12000,
              line_ids: [line(monthly), line(yearly), line(extra)],
            },
          ],
        },
      ];
      await open(existing);
      await expect(
        page.getByRole("heading", {
          name: "Added to your subscription",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /Continue to secure checkout/ }),
      ).toHaveCount(0);
      await capture("existing-subscriber", "1f", width, theme, true);
      const setupOnly = structuredClone(monthlyOnly);
      setupOnly.billing = [checkout([monthly], "setup")];
      await open(setupOnly);
      await expect(
        page.getByText(
          /No charge is taken in this card-saving step|no charge today; your first invoice will be emailed/,
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Monthly subscription rate", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Monthly total today", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /Continue to secure card setup/ }),
      ).toBeVisible();
      await capture("card-setup-explanation", "1e", width, theme, true);
      await open(finished);
      await expect(
        page.getByRole("heading", { name: "Your completed copy", exact: true }),
      ).toBeVisible();
      await capture("completed", "1g", width, theme, true);
      await page
        .getByRole("button", { name: "View the signed proposal", exact: true })
        .click();
      expect((await page.locator(".flow-document").boundingBox())!.width).toBe(
        readingWidth,
      );
      await page.locator(".flow-document").scrollIntoViewIfNeeded();
      await capture(
        "completed-signed-reading-width",
        width === 1440 ? "5a" : width === 768 ? "5b" : "1g",
        width,
        theme,
      );
      for (const kind of ["proposal-email", "reminder-email"]) {
        const html = emailHtml(
          sent,
          String(sent.jobs.find((j) => j.payload.send_version)!.payload.text),
          true,
          "Hi Jane,\nHere’s the scope we discussed. Thank you for the opportunity.",
        );
        await page.setContent(
          `<html data-theme="${theme}"><head><style>body{margin:0;padding:16px;background:${theme === "dark" ? "#131311" : "#f3f0ea"};font:14px Arial}header{color:${theme === "dark" ? "white" : "#222"};margin:0 auto 16px;max-width:600px}</style></head><body><header>${kind === "proposal-email" ? "Proposal email" : "Reminder email"} · HTML preview</header>${html}</body></html>`,
        );
        await expect(page.getByRole("link")).toHaveCount(1);
        await expect(
          page.getByRole("link", { name: "View proposal", exact: true }),
        ).toBeVisible();
        await expect(page.locator("body")).not.toContainText("https://");
        await capture(kind, "1a", width, theme, true);
      }
      await page.setContent(
        `<html data-theme="${theme}"><body style="margin:0;padding:12px;box-sizing:border-box;background:${theme === "dark" ? "#131311" : "#f3f0ea"};color:${theme === "dark" ? "white" : "#222"};font:14px Arial"><p>Certificate of completion · final PDF page</p><img alt="Rendered completion certificate" src="data:image/png;base64,${certificatePng.toString("base64")}" style="display:block;max-width:100%;width:816px;height:auto;margin:auto"></body></html>`,
      );
      await capture("completion-certificate", "1g", width, theme, true);
    }
  expect(writes).toBe(0);
  expect(verifies).toBe(0);
  expect(JSON.stringify(completed)).toBe(before);
  const refs = await context.newPage();
  for (const [file, frames] of [
    [
      "Redesign 01 - IA and Client Flow.dc.html",
      ["1a", "1d", "1e", "1f", "1g"],
    ],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5a", "5b", "5c", "5d"]],
  ] as const) {
    await refs.goto(`http://127.0.0.1:4176/${encodeURIComponent(file)}`);
    for (const theme of ["light", "dark"]) {
      await refs.evaluate((t) => {
        const w = window as any;
        w.__dcSetProps(w.__dcRootName(), { theme: t });
      }, theme);
      for (const frame of frames)
        await refs
          .locator(`[id="${frame}"]`)
          .locator(":scope > div")
          .nth(1)
          .screenshot({ path: `${dir}/reference-${frame}-${theme}.png` });
    }
  }
  await refs.close();
  await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
});
