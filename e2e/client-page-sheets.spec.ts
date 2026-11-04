import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { editorFixture } from "./editor-fixture";
import { clientActor } from "../tests/helpers";
import { publicResult } from "../src/lib/service";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { sealedPdf } from "../src/lib/pdf";
import { PDFDocument } from "pdf-lib";
import type { Block, Quote } from "../src/lib/model";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const content: Block[] = [
  { id: "overview", type: "heading", text: "Overview", level: 1 },
  {
    id: "long",
    type: "paragraph",
    text: "Our thoughtful approach keeps the project clear and useful. ".repeat(
      90,
    ),
  },
  { id: "explicit", type: "page_break" },
  { id: "services", type: "heading", text: "Your services", level: 1 },
  { id: "prices", type: "pricing_table" },
  {
    id: "terms",
    type: "contract",
    text: "Agreement",
    clauses: [
      {
        id: "scope",
        heading: "Working together",
        body: "We will agree the milestones and work together on the project.",
        show_when: null,
      },
    ],
  },
  { id: "signature", type: "signature_block", role: "client" },
  { id: "company-signature", type: "signature_block", role: "company" },
];
async function fixture(
  page: import("@playwright/test").Page,
  quote?: (base: Quote) => Quote,
) {
  const f = await editorFixture(page, false, {
    content,
    quote:
      quote ??
      ((base) =>
        base.map((item) =>
          item.optional
            ? {
                ...item,
                name: "Optional workshop",
                selected: false,
                default_selected: false,
              }
            : item,
        )),
  });
  const optional = f.active().quote.at(-1)!;
  const withConditional = structuredClone(content);
  withConditional
    .find((b) => b.id === "terms")!
    .clauses!.push({
      id: "workshop",
      heading: "Workshop terms",
      body: "The optional workshop includes a shared planning session.",
      show_when: {
        kind: "item_selected",
        pricing_item_id: optional.pricing_item_id!,
      },
    });
  await f.editRemote({ content: withConditional });
  const hf = defaultHeaderFooter();
  hf.overrides.explicit = {
    header: {
      layout: "left",
      slots: [
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Services and agreement" }],
            },
          ],
        },
      ],
    },
    footer: "hidden",
  };
  await f.editRemote({ header_footer: hf });
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .locator('.editor-page-sheets[data-layout-settled="true"]')
    .waitFor();
  const plan = JSON.parse(
    (await page.locator(".editor-paper").getAttribute("data-pagination"))!,
  );
  await f.editRemote({ pagination: plan });
  const sent = await f.sendRemote();
  let current = publicResult(sent);
  await page.route("**/api/public/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/quote")) {
      const next = await f.service.toggle(
        sent.token!,
        "",
        route.request().postDataJSON(),
        clientActor,
      );
      current = publicResult(next);
    }
    await route.fulfill({
      json: path.endsWith("/brand")
        ? { ...current.company, contact: current.contact }
        : current,
    });
  });
  return { ...f, sent, plan, current: () => current };
}

test("desktop client sheets use frozen PDF breaks, bands and geometry, with crisp scaling and accessible choices", async ({
  page,
}) => {
  test.setTimeout(240000);
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  await expect(host).not.toHaveAttribute("data-layout-error");
  expect(f.plan.pages).toBeGreaterThanOrEqual(3);
  await expect(host.locator(".client-page-frame")).toHaveCount(f.plan.pages);
  expect(JSON.parse((await host.getAttribute("data-page-plan"))!)).toEqual(
    f.plan,
  );
  const v = f.sent.versions.at(-1)!;
  const rendered = await sealedPdf(
    v,
    [],
    [],
    f.sent.currency,
    { settings: f.settings },
    { preview: true },
  );
  expect((await PDFDocument.load(rendered.pdf)).getPageCount()).toBe(
    f.plan.pages,
  );
  const pdf = test.info().outputPath("client-sheets.pdf");
  await writeFile(pdf, rendered.pdf);
  const texts = execFileSync("pdftotext", ["-layout", pdf, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  for (let n = 0; n < f.plan.pages; n++) {
    const sheet = host.locator(".print-sheet").nth(n);
    const height = await sheet
      .locator(".client-sheet-content")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().height /
          Number(
            ((el.getRootNode() as ShadowRoot).host as HTMLElement).dataset
              .scale,
          ),
      );
    expect(
      Math.abs(height - rendered.layout.sheets![n].content_area!.height),
    ).toBeLessThanOrEqual(1);
    for (const band of await sheet.locator(".page-band").all())
      expect(texts[n].replace(/\s+/g, " ")).toContain(
        (await band.innerText()).replace(/\s+/g, " ").trim(),
      );
  }
  await expect(
    host.locator(".client-page-frame").first().locator(".page-band"),
  ).toHaveCount(0);
  await expect(
    host.locator(".field-chip,[contenteditable],button"),
  ).toHaveCount(0);
  await expect(host.locator('[data-page-band="header"]').last()).toContainText(
    "Services and agreement",
  );
  await expect(
    host
      .locator(".client-page-frame")
      .last()
      .locator('[data-page-band="footer"]'),
  ).toHaveCount(0);
  await expect(host.locator("details")).toHaveCount(0);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations).toEqual([]);
  for (const width of [1440, 1280, 1100]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect
      .poll(() =>
        host.evaluate((el) =>
          Math.abs(
            Number((el as HTMLElement).dataset.scale) -
              Math.min(1, el.clientWidth / 816),
          ),
        ),
      )
      .toBeLessThan(0.001);
    const metrics = await host.evaluate((el) => ({
      width: el.clientWidth,
      scale: Number((el as HTMLElement).dataset.scale),
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.scale).toBeCloseTo(Math.min(1, metrics.width / 816), 3);
    for (const control of await host.locator("input[data-client-item]").all()) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.9);
      expect(box!.height).toBeGreaterThanOrEqual(43.9);
    }
    if (process.env.CAPTURE_EDITOR_EVIDENCE === "1" && width !== 1280) {
      await mkdir("docs/screenshots/header-footer-pr4", { recursive: true });
      await page.screenshot({
        path: `docs/screenshots/header-footer-pr4/client-${width}.png`,
        fullPage: true,
      });
      if (width === 1440) {
        for (let n = 0; n < Math.min(3, f.plan.pages); n++)
          await host
            .locator(".client-page-frame")
            .nth(n)
            .screenshot({
              path: `docs/screenshots/header-footer-pr4/page-${n + 1}-1440.png`,
            });
        await host
          .locator(".print-pricing-card")
          .first()
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
        await page.screenshot({
          path: "docs/screenshots/header-footer-pr4/pricing-choices-1440.png",
        });
      }
    }
  }
  for (const width of [1099, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".client-document-sheets")).toHaveCount(0);
    await expect(page.locator(".flow-document")).toBeVisible();
    await expect(
      page.locator(".flow-body .page-band,.flow-body .client-page-frame"),
    ).toHaveCount(0);
    await expect(page.locator(".flow-contract details")).not.toHaveCount(0);
  }
});

test("choices keep published breaks and selected PDF content; resizing preserves choices and a signature in progress", async ({
  page,
}) => {
  test.setTimeout(240000);
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  const control = host.getByRole("checkbox", { name: /Optional workshop/ });
  await expect(
    host.getByRole("heading", { name: "Workshop terms" }),
  ).toHaveCount(0);
  await control.check();
  await expect(control).toBeChecked();
  await expect(
    host.getByRole("heading", { name: "Workshop terms" }),
  ).toBeVisible();
  expect(JSON.parse((await host.getAttribute("data-page-plan"))!)).toEqual(
    f.plan,
  );
  const next = await f.service.byToken(f.sent.token!);
  expect(next.versions.at(-1)!.pagination).toEqual(f.plan);
  const rendered = await sealedPdf(
    next.versions.at(-1)!,
    [],
    [],
    next.currency,
    { settings: f.settings },
    { preview: true },
  );
  const path = test.info().outputPath("selected.pdf");
  await writeFile(path, rendered.pdf);
  const texts = execFileSync("pdftotext", ["-layout", path, "-"], {
    encoding: "utf8",
  })
    .split("\f")
    .filter((s) => s.trim());
  const browserText = await host
    .locator(".client-sheet-content")
    .allTextContents();
  expect(texts).toHaveLength(browserText.length);
  for (const word of ["Workshop terms", "shared planning session"])
    expect(texts.findIndex((t) => t.includes(word))).toBe(
      browserText.findIndex((t) => t.includes(word)),
    );
  // Crossing the breakpoint keeps the same section in view and does not reset selections.
  await host.locator('[data-print-block="terms"]').scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(page.locator(".flow-document")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Optional workshop/ }),
  ).toBeChecked();
  expect(
    await page.locator('[data-document-block="terms"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await host.waitFor();
  await expect(control).toBeChecked();
  expect(
    await host.locator('[data-print-block="terms"]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    }),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("tab", { name: "Type", exact: true }).click();
  const name = page.getByPlaceholder("Type your full name");
  await name.fill("Jane Doe");
  for (const width of [768, 375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(name).toHaveValue("Jane Doe");
  }
});

test("pricing controls keep their item identities across page splits and choice radios remain exclusive", async ({
  page,
}) => {
  const group = crypto.randomUUID();
  const f = await fixture(page, (base) => [
    base[0],
    ...Array.from({ length: 20 }, (_, n) => ({
      ...structuredClone(base[1]),
      id: crypto.randomUUID(),
      order: n + 1,
      name: `Service option ${n + 1}`,
      description: "A clear agreed scope for this service.",
      optional: true,
      selected: n === 0,
      default_selected: n === 0,
      choice_group_id: n < 2 ? group : null,
      sublines: base[1].sublines.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
      })),
    })),
  ]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  const last = host.getByRole("checkbox", {
    name: "Service option 20 · not included",
    exact: true,
  });
  await last.check();
  await expect(
    host.getByRole("checkbox", {
      name: "Service option 20 · included",
      exact: true,
    }),
  ).toBeChecked();
  expect(
    f.current().quote.find((i) => i.name === "Service option 20")!.selected,
  ).toBe(true);
  expect(
    f.current().quote.find((i) => i.name === "Service option 19")!.selected,
  ).toBe(false);
  const second = host.getByRole("radio", {
    name: "Service option 2 · not included",
    exact: true,
  });
  await second.check();
  await expect(
    host.getByRole("radio", {
      name: "Service option 2 · included",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    host.getByRole("radio", {
      name: "Service option 1 · not included",
      exact: true,
    }),
  ).not.toBeChecked();
  expect(
    f.current().quote.filter((i) => i.choice_group_id === group && i.selected),
  ).toHaveLength(1);
  expect(JSON.parse((await host.getAttribute("data-page-plan"))!)).toEqual(
    f.plan,
  );
  expect(
    await host
      .getByRole("checkbox", { name: /Service option 20/ })
      .evaluate(
        (el) => el.closest<HTMLElement>(".client-page-frame")!.dataset.page,
      ),
  ).not.toBe("1");
});
