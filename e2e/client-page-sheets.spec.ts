import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { editorFixture } from "./editor-fixture";
import { clientActor, testSignatureImage } from "../tests/helpers";
import { publicResult } from "../src/lib/service";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { sealedPdf } from "../src/lib/pdf";
import { PDFDocument } from "pdf-lib";
import type { Block, Quote } from "../src/lib/model";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test.beforeEach(async ({ page }) => {
  if (process.env.CLIENT_SHEETS_CPU_RATE === "4") {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
});

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
  beforeToggle?: () => Promise<void>,
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
      await beforeToggle?.();
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
  // The logo is served by the existing public brand route, including in bands.
  f.current().company.logo = `${f.repo.workspaceId}/fixture-logo.png`;
  await page.route("**/api/public/**/brand/logo", (route) =>
    route.fulfill({
      body: Buffer.from(testSignatureImage.split(",")[1], "base64"),
      contentType: "image/png",
    }),
  );
  await page.reload();
  await host.waitFor();
  const bandLogo = host.locator(".page-band img").first();
  await expect(bandLogo).toHaveJSProperty("naturalWidth", 1);
  expect(
    await bandLogo.evaluate((el) => (el as HTMLElement).offsetHeight),
  ).toBeLessThanOrEqual(18);
  f.current().company.logo = null;
  await page.reload();
  await host.waitFor();
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
    for (const area of await host.locator(".client-sheet-content").all())
      expect(
        await area.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
    expect(metrics.scale).toBeCloseTo(Math.min(1, metrics.width / 816), 3);
    for (const control of await host.locator("input[data-client-item]").all()) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.9);
      expect(box!.height).toBeGreaterThanOrEqual(43.9);
    }
    if (process.env.CAPTURE_EDITOR_EVIDENCE === "1" && width !== 1280) {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        return new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      });
      await mkdir("docs/screenshots/header-footer-pr4", { recursive: true });
      if (width === 1100)
        await page.screenshot({
          path: "docs/screenshots/header-footer-pr4/client-1100.png",
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
    const terms = page.locator(".flow-contract");
    await expect(terms.locator("details, summary")).toHaveCount(0);
    await expect(terms.locator("h3").first()).toBeVisible();
    await expect(terms.locator("section > p").first()).toBeVisible();
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

function manyOptions(base: Quote): Quote {
  const group = crypto.randomUUID();
  return [
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
  ];
}

test("pricing controls keep their item identities across page splits and choice radios remain exclusive", async ({
  page,
}) => {
  const f = await fixture(page, manyOptions);
  const group = f.sent.quote.find((i) => i.choice_group_id)!.choice_group_id!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  const last = host.getByRole("checkbox", {
    name: "Service option 20 | not included",
    exact: true,
  });
  await last.check();
  await expect(
    host.getByRole("checkbox", {
      name: "Service option 20 | included",
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
    name: "Service option 2 | not included",
    exact: true,
  });
  await second.check();
  await expect(
    host.getByRole("radio", {
      name: "Service option 2 | included",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    host.getByRole("radio", {
      name: "Service option 1 | not included",
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

test("ready client sheets retain their native controls and stay stable through a slow choice save", async ({
  page,
}) => {
  const cpu = await page.context().newCDPSession(page);
  await cpu.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = await fixture(page, manyOptions, () => pending);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  const option = host.getByRole("checkbox", { name: /Service option 20/ });
  const native = await option.elementHandle();
  expect(native).not.toBeNull();
  async function stable() {
    const result = await host.evaluate(async (el) => {
      const root = el.shadowRoot!;
      const pages = [
        ...root.querySelectorAll<HTMLElement>(".client-page-frame"),
      ];
      const papers = [
        ...root.querySelectorAll<HTMLElement>(".client-letter-sheet"),
      ];
      const originals = [...pages, ...papers];
      const geometry = () =>
        originals.map((node) => {
          const r = node.getBoundingClientRect();
          return [
            r.x + scrollX,
            r.y + scrollY,
            r.width,
            r.height,
            node.getAttribute("style"),
          ];
        });
      const before = JSON.stringify(geometry());
      let writes = 0,
        moved = false;
      const observer = new MutationObserver((records) => {
        writes += records.filter((r) =>
          originals.includes(r.target as HTMLElement),
        ).length;
      });
      observer.observe(root, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
      });
      // A late font signal must not rebuild a published PagePlan projection.
      document.fonts.dispatchEvent(new Event("loadingdone"));
      for (let n = 0; n < 20; n++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        if (
          JSON.stringify(geometry()) !== before ||
          originals.some((node) => !node.isConnected)
        )
          moved = true;
      }
      observer.disconnect();
      return { writes, moved, ready: (el as HTMLElement).dataset.layoutReady };
    });
    expect(result).toEqual({ writes: 0, moved: false, ready: "true" });
  }
  await stable();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/quote") && r.request().method() === "POST",
  );
  try {
    await option.check();
    await expect(option).toBeDisabled();
    expect(
      await native!.evaluate((el) => ({
        connected: el.isConnected,
        checked: (el as HTMLInputElement).checked,
      })),
    ).toEqual({ connected: true, checked: true });
    await host.waitFor();
    await expect(option).toBeInViewport();
    await stable();
  } finally {
    release();
  }
  expect((await response).status()).toBe(200);
  await expect(option).toBeEnabled();
  await host.waitFor();
  expect(
    await native!.evaluate((el) => ({
      connected: el.isConnected,
      checked: (el as HTMLInputElement).checked,
    })),
  ).toEqual({ connected: true, checked: true });
  await expect(option).toBeInViewport();
  await stable();
  await page.setViewportSize({ width: 1100, height: 1000 });
  await host.waitFor();
  await stable();
  expect(await native!.evaluate((el) => el.isConnected)).toBe(true);
  expect(JSON.parse((await host.getAttribute("data-page-plan"))!)).toEqual(
    f.plan,
  );
});

test("a choice that makes a frozen page overflow breaks the pages afresh on the client and in the PDF", async ({
  page,
}) => {
  test.setTimeout(240000);
  let workshop = "";
  const f = await fixture(page, (base) => {
    const optional = base.find((item) => item.optional)!;
    workshop = optional.id;
    const longScope = {
      ...structuredClone(base.find((item) => !item.optional)!),
      id: crypto.randomUUID(),
      order: base.length,
      name: "Workshop programme",
      description: "A detailed session plan for each workshop day. ".repeat(60),
      show_when: { kind: "quote_item" as const, id: optional.id },
      sublines: [
        {
          id: crypto.randomUUID(),
          qty: 1,
          amount: 0,
          interval: "one_time" as const,
          list_amount: null,
          stripe_lookup_key: null,
          qbo_item_ref: null,
        },
      ],
    };
    return [
      ...base.map((item) =>
        item.optional
          ? {
              ...item,
              name: "Optional workshop",
              selected: false,
              default_selected: false,
            }
          : item,
      ),
      longScope,
    ];
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/p/${f.sent.token}`);
  const host = page.locator(
    '.client-document-sheets[data-layout-ready="true"]',
  );
  await host.waitFor();
  await expect(host.locator(".client-page-frame")).toHaveCount(f.plan.pages);
  const overflowing = () =>
    host
      .locator(".client-sheet-content")
      .evaluateAll(
        (sheets) =>
          sheets.filter((s) => s.scrollHeight > s.clientHeight + 1).length,
      );
  expect(await overflowing()).toBe(0);
  await host.getByRole("checkbox", { name: /Optional workshop/ }).check();
  await expect(host.getByText("Workshop programme").first()).toBeVisible();
  await expect
    .poll(() => host.locator(".client-page-frame").count())
    .toBeGreaterThan(f.plan.pages);
  expect(await overflowing()).toBe(0);
  const chosen = await f.service.byToken(f.sent.token!);
  expect(chosen.quote.find((i) => i.id === workshop)?.selected).toBe(true);
  const v = f.sent.versions.at(-1)!;
  const rendered = await sealedPdf(
    { ...v, quote: chosen.quote },
    [],
    [],
    f.sent.currency,
    { settings: f.settings },
    { preview: true },
  );
  expect(rendered.layout.overflow_pages ?? []).toEqual([]);
  expect((await PDFDocument.load(rendered.pdf)).getPageCount()).toBeGreaterThan(
    f.plan.pages,
  );
});
