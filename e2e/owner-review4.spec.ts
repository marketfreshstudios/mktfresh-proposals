import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { setup } from "../tests/helpers";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
test.beforeEach(({ page }) => {
  page.setDefaultTimeout(10000);
});
const headers = { Authorization: "Bearer e2e-staff-secret-only" };
const shots = "docs/screenshots/owner-review4";
async function shot(page: Page, name: string) {
  if (process.env.REVIEW4_CAPTURE === "1") {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({
      path: `${shots}/${name}.png`,
      animations: "disabled",
    });
  }
}
async function fixture(request: APIRequestContext) {
  const { settings } = await setup(),
    client = {
      id: crypto.randomUUID(),
      first_name: "Jane",
      last_name: "Doe",
      company: `Review ${crypto.randomUUID().slice(0, 8)}`,
      email: `jane-${crypto.randomUUID()}@example.test`,
    },
    product = {
      id: crypto.randomUUID(),
      sku: crypto.randomUUID(),
      name: "Planning",
      amount: 275000,
      interval: "one_time",
      qbo_item_ref: "mock-plan",
    },
    paragraph = crypto.randomUUID(),
    secondParagraph = crypto.randomUUID(),
    heading = crypto.randomUUID();
  const template = {
    id: crypto.randomUUID(),
    name: "Owner review specimen",
    active: true,
    content: [
      { id: heading, type: "heading", text: "Overview", level: 1 },
      {
        id: paragraph,
        type: "paragraph",
        text: "Hello world. This proposal sets out our agreed scope.",
      },
      {
        id: secondParagraph,
        type: "paragraph",
        text: "Second paragraph stays readable.",
      },
      { id: crypto.randomUUID(), type: "pricing_table" },
      { id: crypto.randomUUID(), type: "signature_block", role: "client" },
      { id: crypto.randomUUID(), type: "signature_block", role: "company" },
    ],
    default_quote: [
      { pricing_item_id: product.id, qty: 1, optional: false, selected: true },
    ],
  };
  for (const [path, data] of [
    ["workspace_settings", settings],
    ["clients", client],
    ["pricing_items", product],
    ["templates", template],
  ] as const) {
    const r = await request.post(`/api/${path}`, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
  }
  const response = await request.post("/api/proposals", {
    headers,
    data: {
      client_id: client.id,
      template_id: template.id,
      title: "A clear agreement",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return { p: await response.json(), paragraph, secondParagraph, heading };
}
async function selectText(
  page: Page,
  selector: string,
  start: number,
  end: number,
) {
  await page.locator(selector).evaluate(
    (el, { start, end }) => {
      (el as HTMLElement).focus();
      const texts: Text[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) texts.push(n as Text);
      const point = (at: number): [Text, number] => {
        for (const t of texts) {
          if (at <= t.length) return [t, at];
          at -= t.length;
        }
        return [texts.at(-1)!, texts.at(-1)!.length];
      };
      const a = point(start),
        b = point(end),
        r = document.createRange();
      r.setStart(...a);
      r.setEnd(...b);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { start, end },
  );
}
test("exact inline sizes, Default, Mixed, shortcuts, heading/band limits and PDF geometry", async ({
  page,
  request,
}, info) => {
  const { p, paragraph, secondParagraph, heading } = await fixture(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${p.id}`);
  await expect(
    page.locator('.editor-page-sheets[data-layout-settled="true"]'),
  ).toBeVisible();
  const headingFrame = page.locator(`[data-block-id="block-${heading}"] h2`);
  const typography = await headingFrame.evaluate((el) => {
    const parent = getComputedStyle(el),
      child = getComputedStyle(el.querySelector(".tiptap p")!);
    return {
      parent: [
        parent.fontSize,
        parent.fontWeight,
        parent.fontFamily,
        parent.lineHeight,
      ],
      child: [
        child.fontSize,
        child.fontWeight,
        child.fontFamily,
        child.lineHeight,
      ],
    };
  });
  expect(typography.child).toEqual(typography.parent);
  const selector = `[data-block-id="block-${paragraph}"] .tiptap`;
  await page.locator(selector).click();
  await selectText(page, selector, 6, 7);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "30 px", exact: true }).click();
  await expect(page.locator(`${selector} [data-inline-size="30"]`)).toHaveText(
    "w",
  );
  await expect(page.locator(`${selector} [data-inline-size="30"]`)).toHaveCSS(
    "font-size",
    "30px",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(`${selector} [data-inline-size]`)).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(`${selector} [data-inline-size="30"]`)).toHaveText(
    "w",
  );
  // Clipboard HTML uses the same parser for internal marks and outside styles.
  const originalText = await page.locator(selector).innerText();
  const paste = async (html: string, text: string) =>
    page.locator(selector).evaluate(
      (el, { html, text }) => {
        const data = new DataTransfer();
        data.setData("text/html", html);
        data.setData("text/plain", text);
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData: data,
            bubbles: true,
            cancelable: true,
          }),
        );
      },
      { html, text },
    );
  await selectText(page, selector, originalText.length, originalText.length);
  await paste(
    '<span data-inline-size="30" style="font-size:30px">w</span>',
    "w",
  );
  await expect(page.locator(`${selector} [data-inline-size="30"]`)).toHaveCount(
    2,
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(selector)).toHaveText(originalText);
  await selectText(page, selector, originalText.length, originalText.length);
  await paste('<span style="font-size:13px">outside</span>', "outside");
  await expect(page.locator(selector)).toHaveText(originalText + "outside");
  await expect(page.locator(`${selector} [data-inline-size]`)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator(selector)).toHaveText(originalText);
  await selectText(page, selector, originalText.length, originalText.length);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "20 px", exact: true }).click();
  await expect(page.locator(selector)).toBeFocused();
  await page.keyboard.type("X");
  await expect(page.locator(`${selector} [data-inline-size="20"]`)).toHaveText(
    "X",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(selector)).toHaveText(originalText);
  // A native range may cross independent rich-text blocks. One history step owns all fragments.
  const second = `[data-block-id="block-${secondParagraph}"] .tiptap`;
  await page.evaluate(
    ({ first, second }) => {
      const a = document.querySelector(first)!,
        b = document.querySelector(second)!;
      const walk = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      const start = walk.nextNode()!;
      const r = document.createRange();
      r.setStart(start, 2);
      r.setEnd(b.querySelector("p")!.firstChild!, 6);
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { first: selector, second },
  );
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "20 px", exact: true }).click();
  await expect(
    page.locator(`${selector} [data-inline-size="20"]`).first(),
  ).toBeVisible();
  await expect(page.locator(`${second} [data-inline-size="20"]`)).toHaveText(
    "Second",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(`${second} [data-inline-size]`)).toHaveCount(0);
  await expect(page.locator(`${selector} [data-inline-size="30"]`)).toHaveText(
    "w",
  );
  await selectText(page, selector, 0, 11);
  await expect(
    page
      .getByRole("button", { name: "Size", exact: true })
      .filter({ visible: true }),
  ).toContainText("Mixed");
  await selectText(page, selector, 6, 7);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  const sizeOptions = await page
    .getByRole("menuitemradio")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { width: r.width, height: r.height };
      }),
    );
  expect(sizeOptions.every((r) => r.width >= 180 && r.height >= 44)).toBe(true);
  await shot(page, "size-dropdown-1440");
  await page.keyboard.press("Escape");
  await expect
    .poll(async () =>
      JSON.stringify(
        (
          await (
            await request.get(`/api/proposals/${p.id}`, { headers })
          ).json()
        ).content,
      ),
    )
    .toContain('"fontSize"');
  const pdf = await request.get(`/api/proposals/${p.id}/preview-pdf`, {
    headers,
  });
  expect(pdf.ok(), await pdf.text().catch(() => "")).toBe(true);
  const file = info.outputPath("inline-size.pdf");
  writeFileSync(file, await pdf.body());
  const bbox = execFileSync("pdftotext", ["-bbox", file, "-"], {
    encoding: "utf8",
  });
  expect(bbox).toMatch(/>w<\/word>/);
  const match = bbox.match(
    /yMin="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>w<\/word>/,
  );
  expect(match).not.toBeNull();
  expect(Number(match![2]) - Number(match![1])).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect(
    page.getByLabel("PDF page 2", { exact: true }).last(),
  ).toBeVisible();
  await shot(page, "size-pdf-preview-1440");
  await page.getByRole("button", { name: "Close PDF preview" }).click();
  await selectText(page, selector, 6, 7);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Default", exact: true })
    .click();
  await expect(page.locator(`${selector} [data-inline-size]`)).toHaveCount(0);
  await selectText(page, selector, 6, 7);
  await page.keyboard.press("Control+Shift+>");
  await expect(page.locator(`${selector} [data-inline-size]`)).toBeVisible();
  await page.keyboard.press("Escape");
  const h = `[data-block-id="block-${heading}"] .tiptap`;
  await page.locator(h).click();
  await selectText(page, h, 0, 1);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "30 px", exact: true }).click();
  await expect(page.locator(`${h} [data-inline-size="30"]`)).toHaveText("O");
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "Header · Shared", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "header column 1" }).click();
  await page
    .locator(".band-edit-bar")
    .getByRole("button", { name: "Size", exact: true })
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: "30 px", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Maximum .* px in this band/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .locator(".band-edit-bar")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await page.locator(selector).click();
  await selectText(page, selector, 6, 7);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "30 px", exact: true }).click();
  await expect
    .poll(async () =>
      JSON.stringify(
        (
          await (
            await request.get(`/api/proposals/${p.id}`, { headers })
          ).json()
        ).content,
      ),
    )
    .toContain('"fontSize"');
  await expect(page.locator(".editor-save-status")).toContainText("Saved");
  const current = await (
    await request.get(`/api/proposals/${p.id}`, { headers })
  ).json();
  const sent = await request.post(`/api/proposals/${p.id}/send`, {
    headers,
    data: { revision: current.revision, delivery_method: "manual" },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  await page.goto(`/p/${(await sent.json()).token}`);
  await expect(
    page
      .locator('.client-flow [data-inline-size="30"]')
      .filter({ hasText: /^w$/ })
      .first(),
  ).toHaveCSS("font-size", "30px");
});
test("short copy links, visible record Edit, signature default and unchanged link after rename", async ({
  page,
  request,
}) => {
  const { p } = await fixture(request);
  expect(p.content.some((b: any) => b.text === "Signatures")).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${p.id}`);
  await expect(
    page.locator('.editor-page-sheets[data-layout-settled="true"]'),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /Heading/ })
    .last()
    .scrollIntoViewIfNeeded();
  await shot(page, "signatures-heading-1440");
  const latest = await (
    await request.get(`/api/proposals/${p.id}`, { headers })
  ).json();
  const sent = await request.post(`/api/proposals/${p.id}/send`, {
    headers,
    data: { revision: latest.revision, delivery_method: "manual" },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const published = await sent.json();
  expect(published.token).toHaveLength(12);
  await page.goto(`/proposals/${p.id}`);
  const record = page.locator(".record-toolbar");
  await expect(
    record.getByRole("link", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".record-link-header input")).toHaveValue(
    `http://127.0.0.1:3100/p/${published.token}`,
  );
  await shot(page, "record-short-link-1440");
  await page.setViewportSize({ width: 375, height: 1000 });
  await expect(
    record.getByRole("link", { name: "Edit", exact: true }),
  ).toBeVisible();
  await shot(page, "record-header-375");
  const patch = await request.patch(`/api/proposals/${p.id}`, {
    headers,
    data: { revision: published.revision, title: "Renamed agreement" },
  });
  expect(patch.ok(), await patch.text()).toBe(true);
  expect((await patch.json()).token).toBe(published.token);
});
test("unknown codes keep identical 404s and durable failed lookup limits return Retry-After", async ({
  request,
}) => {
  for (let n = 0; n < 30; n++) {
    const r = await request.get(
      `/api/public/ZZZZZZZZZZZ${n % 2 ? "2" : "3"}/state`,
      { headers: { "x-forwarded-for": "203.0.113.199" } },
    );
    expect(r.status()).toBe(404);
    expect(await r.json()).toEqual({ error: "Not found" });
  }
  const blocked = await request.get("/api/public/ZZZZZZZZZZZ2/state", {
    headers: { "x-forwarded-for": "203.0.113.199" },
  });
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
});

test("enlarging rich text reflows the frozen-width layout and PDF together and keeps Signatures with its pair", async ({
  page,
  request,
}, info) => {
  const { p, paragraph } = await fixture(request);
  const content = p.content.map((b: any) =>
    b.id === paragraph
      ? {
          ...b,
          text: Array.from({ length: 140 }, (_, n) => `Scope${n} detail`).join(
            " ",
          ),
        }
      : b,
  );
  const update = await request.patch(`/api/proposals/${p.id}`, {
    headers,
    data: { revision: p.revision, content },
  });
  expect(update.ok(), await update.text()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${p.id}`);
  const paper = page.locator('.editor-page-sheets[data-layout-settled="true"]');
  await expect(paper).toBeVisible();
  const initial = await page.locator(".editor-page-sheets .page-sheet").count();
  const selector = `[data-block-id="block-${paragraph}"] .tiptap`;
  await page.locator(selector).click();
  const length = (await page.locator(selector).innerText()).length;
  await selectText(page, selector, 0, length);
  await page
    .getByRole("button", { name: "Size", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("menuitemradio", { name: "30 px", exact: true }).click();
  await expect
    .poll(() => page.locator(".editor-page-sheets .page-sheet").count())
    .toBeGreaterThan(initial);
  await expect(paper).toBeVisible();
  await expect(page.locator(".editor-save-status")).toContainText("Saved");
  const response = await request.get(`/api/proposals/${p.id}/preview-pdf`, {
    headers,
  });
  expect(response.ok(), await response.text()).toBe(true);
  const file = info.outputPath("enlarged.pdf");
  const bytes = await response.body();
  writeFileSync(file, bytes);
  const { PDFDocument } = await import("pdf-lib");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(
    await page.locator(".editor-page-sheets .page-sheet").count(),
  );
  const pages = execFileSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
  }).split("\f");
  expect(pages.find((p) => p.includes("Signatures"))).toMatch(
    /CLIENT[\s\S]*COMPANY/,
  );
});
