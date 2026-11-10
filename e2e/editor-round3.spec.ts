import { test, expect, type Page } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import type { Block, Proposal } from "../src/lib/model";
import { pdfPreview, type PdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
async function fixture(page: Page, long = false) {
  page.setDefaultTimeout(10000);
  const f = await setup(),
    id = crypto.randomUUID();
  const content: Block[] = [
    {
      id: crypto.randomUUID(),
      type: "heading",
      level: 1,
      text: "The approach",
    },
    {
      id,
      type: "paragraph",
      text: "Hello Jane. We build thoughtful things together.",
    },
    ...(long
      ? Array.from({ length: 22 }, (_, n) => ({
          id: crypto.randomUUID(),
          type: "paragraph" as const,
          text: `Paragraph ${n + 1}. ${"A clear plan and careful work lead to a useful result. ".repeat(24)}`,
        }))
      : []),
    { id: crypto.randomUUID(), type: "page_break" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "Next steps and milestones.",
    },
    ...(long
      ? [
          {
            id: crypto.randomUUID(),
            type: "contract" as const,
            text: "Terms",
            clauses: [
              {
                id: crypto.randomUUID(),
                heading: "Working together",
                body: Array.from(
                  { length: 75 },
                  (_, n) =>
                    `Clause line ${n + 1}. Plain terms for this project.`,
                ).join("\n"),
                show_when: null,
              },
            ],
          },
        ]
      : []),
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  let active = await f.service.edit(
    f.draft.id,
    { revision: f.draft.revision, content },
    staff,
  );
  const results: PdfPreview[] = [];
  const writes: string[] = [];
  await f.repo.put("workspace_documents", {
    id: crypto.randomUUID(),
    name: "Pricing playbook",
    version: "v1",
    content: "Hosting and support\nCustom work needs review",
    content_hash: "a".repeat(64),
    source_type: "pasted",
  } as any);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings: f.settings,
          staff: f.members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH") {
          writes.push("edit");
          active = await f.service.edit(active.id, req.postDataJSON(), staff);
        }
        if (parts[2] === "preview-pdf") {
          const p =
            req.method() === "POST"
              ? { ...active, ...req.postDataJSON() }
              : active;
          const result = await pdfPreview(
            f.repo,
            {
              put: async () => {
                throw new Error("Preview wrote a file");
              },
              get: async () => new Uint8Array(),
            },
            p,
            f.settings,
          );
          results.push(result);
          if (req.method() === "GET") {
            await route.fulfill({
              body: Buffer.from(result.pdf_base64, "base64"),
              contentType: "application/pdf",
            });
            return;
          }
          value = result;
        } else if (parts[2] === "preview")
          value = previewResult(active, f.settings);
        else value = parts[1] ? active : { items: [active], total: 1 };
      } else value = await f.repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  return { ...f, id, current: () => active, results, writes };
}
async function fields(page: Page) {
  if (
    !(await page.getByRole("tab", { name: "Fields", exact: true }).isVisible())
  )
    await page
      .getByRole("button", {
        name: /^(Expand|Collapse) tools sidebar$/,
        exact: true,
      })
      .click();
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  return page.locator(".field-options").filter({ visible: true });
}
test("one-line icon formatting, responsive sheets, panel preferences and overlays at all requested widths", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  for (const width of [1440, 1100, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const text = page.locator(`[data-block-id="block-${f.id}"] .tiptap`);
    await text.click();
    const bar = page.getByRole("toolbar", {
      name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
      exact: true,
    });
    const rows = await bar
      .locator(".formatting-button:visible,select:visible")
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: r.top, height: r.height };
        }),
      );
    expect(
      Math.max(...rows.map((r) => r.top)) - Math.min(...rows.map((r) => r.top)),
    ).toBeLessThanOrEqual(1);
    expect(await bar.locator(".formatting-label").first().isVisible()).toBe(
      false,
    );
    await expect(
      bar.getByRole("button", { name: "Bold", exact: true }),
    ).toHaveAttribute("title", /Bold \(/);
    const paper = page.locator(".editor-paper");
    expect(
      await paper.evaluate((e) => (e as HTMLElement).offsetWidth),
    ).toBeLessThanOrEqual(848);
    expect(
      parseFloat(await paper.evaluate((e) => getComputedStyle(e).paddingLeft)),
    ).toBeGreaterThanOrEqual(64);
    expect(await paper.evaluate((e) => getComputedStyle(e).transform)).toBe(
      "none",
    );
    expect(
      await paper.evaluate((e) => e.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(width);
    await expect(page.getByLabel("Editor zoom")).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page
    .getByRole("button", {
      name: /^(Expand|Collapse) tools sidebar$/,
      exact: true,
    })
    .click();
  await expect(
    page.locator(".editor-sidepanel:not(.sidebar-rail)"),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.locator(".editor-sidepanel:not(.sidebar-rail)"),
  ).toHaveCount(0);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-panels-ready",
    "true",
  );
  await page.keyboard.press("Control+Backslash");
  await expect(
    page.locator(".editor-sidepanel:not(.sidebar-rail)"),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: /^(Expand|Collapse) (Pages|Sections) sidebar$/,
      exact: true,
    })
    .click();
  await expect(page.locator(".editor-outline:not(.sidebar-rail)")).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator(".editor-outline:not(.sidebar-rail)")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 768, height: 1000 });
  await page
    .getByRole("button", {
      name: /^(Expand|Collapse) (Pages|Sections) sidebar$/,
      exact: true,
    })
    .click();
  const sections = page.getByRole("dialog", {
    name: /^(Pages|Sections)$/,
    exact: true,
  });
  await expect(sections).toBeVisible();
  await sections
    .getByRole("button", { name: "The approach", exact: true })
    .click();
  await expect(sections).toHaveCount(0);
});
test("collapsed tools open all four tabs and close at 1440, 1100 and 768", async ({
  page,
}) => {
  const f = await fixture(page);
  for (const width of [1440, 1100, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".quote-workspace")).toHaveAttribute(
      "data-panels-ready",
      "true",
    );
    const toggle = page.getByRole("button", {
      name: /^(Expand|Collapse) tools sidebar$/,
      exact: true,
    });
    if (await page.locator(".editor-sidepanel:not(.sidebar-rail)").isVisible())
      await toggle.click();
    const open = page.getByRole("button", {
      name: "Open Quote",
      exact: true,
    });
    await expect(open).toBeVisible();
    await open.click();
    for (const name of ["Quote", "Fields", "Styles", "Send"]) {
      const tab = page
        .getByRole("tab", { name, exact: true })
        .filter({ visible: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("tabpanel").filter({ visible: true }),
      ).toBeVisible();
    }
    const sheet = page
      .getByRole("dialog")
      .filter({ has: page.getByRole("tablist", { name: "Proposal tools" }) });
    if (await sheet.isVisible())
      await sheet
        .getByRole("button", {
          name: /^(Done|Collapse tools sidebar)$/,
          exact: true,
        })
        .click();
    else await toggle.click();
    await expect(
      page
        .getByRole("tablist", { name: "Proposal tools" })
        .filter({ visible: true }),
    ).toHaveCount(0);
    // The send shortcut must also reopen tools when width alone cannot dock them.
    await page
      .locator(".quote-editor-top")
      .getByRole("button", { name: "Review & send", exact: true })
      .click();
    await expect(
      page
        .getByRole("tab", { name: "Send", exact: true })
        .filter({ visible: true }),
    ).toHaveAttribute("aria-selected", "true");
    if (await sheet.isVisible())
      await sheet
        .getByRole("button", {
          name: /^(Done|Collapse tools sidebar)$/,
          exact: true,
        })
        .click();
    else await toggle.click();
  }
});
test("compact toolbar selects share chevrons, focus, hover and disabled states in both themes", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".editor-paper")).toBeVisible();
    await page.locator(`[data-block-id="block-${f.id}"] .tiptap`).click();
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.className = "toolbar";
      host.style.cssText = "position:fixed;top:55px;left:10px;z-index:100";
      host.innerHTML =
        '<select class="select-compact" aria-label="Compact select specimen"><option>Paragraph</option></select>';
      document.body.append(host);
    });
    const select = page.getByRole("combobox", {
      name: "Compact select specimen",
    });
    await expect(select).toHaveClass("select-compact");
    await page.mouse.move(0, 0);
    await expect(select).toHaveCSS("appearance", "none");
    await expect(select).toHaveCSS("padding-right", "20px");
    await expect(select).toHaveCSS("background-size", "12px 12px");
    await expect(select).toHaveCSS(
      "background-position",
      "calc(100% - 8px) 50%",
    );
    await expect(select).toHaveCSS(
      "background-image",
      await select.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--select-chevron").trim(),
      ),
    );
    await select.hover();
    await expect(select).toHaveCSS(
      "background-image",
      await select.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--select-chevron-hover").trim(),
      ),
    );
    await select.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(select).toBeFocused();
    await expect(select).toHaveCSS("outline-style", "solid");
    await expect(select).toHaveCSS("outline-width", "2px");
    await select.evaluate((el: HTMLButtonElement) => {
      el.disabled = true;
    });
    await expect(select).toHaveCSS("cursor", "not-allowed");
    await expect(select).toHaveCSS(
      "background-image",
      await select.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--select-chevron").trim(),
      ),
    );
    await select.evaluate((el: HTMLButtonElement) => {
      el.disabled = false;
    });
  }
});
test("Fields tab remembers cursor across tabs and closes tablet drawer before restoring text focus; reference UI stays removed", async ({
  page,
}) => {
  const f = await fixture(page);
  for (const width of [1440, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    const text = page.locator(`[data-block-id="block-${f.id}"] .tiptap`);
    await text.fill("Hello friend.");
    await text.click();
    await text.evaluate((el) => {
      const r = document.createRange();
      r.setStart(el.querySelector("p")!.firstChild!, 6);
      r.setEnd(el.querySelector("p")!.firstChild!, 12);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const panel = await fields(page);
    await expect(panel).toContainText("{{client.first_name}}");
    await panel
      .getByRole("button", {
        name: "Client first name — {{client.first_name}}",
        exact: true,
      })
      .click();
    await expect(text).toBeFocused();
    await expect(text.locator('[data-field="client.first_name"]')).toHaveText(
      "Jane",
    );
    await expect(
      page.getByRole("tab", { name: "Pricing reference", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".editor-outline .field-options")).toHaveCount(0);
    if (
      !(await page.getByRole("tab", { name: "Quote", exact: true }).isVisible())
    )
      await page
        .getByRole("button", {
          name: /^(Expand|Collapse) tools sidebar$/,
          exact: true,
        })
        .click();
    await page.getByRole("tab", { name: "Quote", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Look up", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Pricing reference", exact: true }),
    ).toHaveCount(0);
    if (width === 768)
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: /^(Done|Collapse tools sidebar)$/,
          exact: true,
        })
        .click();
  }
});
test("actual preview PDF follows the browser page starts, with no sealing or file writes", async ({
  page,
}) => {
  test.setTimeout(120000);
  const f = await fixture(page, true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".document-page-count")).toHaveAttribute(
    "data-document-pages",
    /\d+/,
  );
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.results.length).toBeGreaterThan(0);
  const result = f.results.at(-1)!;
  expect(result.layout.pages).toBeGreaterThan(3);
  await expect(page.locator(".editor-page-sheet")).toHaveCount(
    result.layout.pages,
  );
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(Buffer.from(result.pdf_base64, "base64")),
    useSystemFonts: true,
  });
  const pdf = await loading.promise;

  expect(pdf.numPages).toBe(result.layout.pages);
  for (const b of result.layout.boundaries) {
    const content = await (await pdf.getPage(b.page)).getTextContent();
    const value = content.items
      .map((i) => ("str" in i ? i.str : ""))
      .join("")
      .replace(/\s/g, "")
      .replaceAll("Preview—notsigned", "");
    expect(
      value.startsWith(b.start_text!.replace(/\s/g, "").slice(0, 70)),
    ).toBe(true);
  }
  // Round 4 replaces marker paint with real sheets. The long source-line and
  // clause alignment remains checked through the shared page projection.
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  expect(
    Number(
      await page
        .locator(".editor-page-sheets")
        .getAttribute("data-layout-max-error"),
    ),
    (await page.locator(".editor-paper").getAttribute("data-layout-errors")) ??
      "page anchors",
  ).toBeLessThanOrEqual(1);
  await expect(page.locator(".editor-page-sheet")).toHaveCount(pdf.numPages);
  const firstText = (await (await pdf.getPage(1)).getTextContent()).items
    .map((i) => ("str" in i ? i.str : ""))
    .join("")
    .replace(/\s/g, "");
  expect(firstText).toContain("Preview—notsigned");
  expect(firstText).not.toContain("Certificateofcompletion");
  const before = JSON.stringify(await f.repo.get(f.draft.id));

  const viewer = page.getByRole("dialog", { name: "Preview PDF", exact: true });
  await expect(
    viewer.getByRole("navigation", { name: "Page thumbnails" }),
  ).toBeVisible();
  await expect(viewer.locator("main canvas")).toHaveCount(pdf.numPages);
  await expect
    .poll(() =>
      viewer
        .locator("main canvas")
        .first()
        .evaluate((el) => {
          const canvas = el as HTMLCanvasElement,
            bytes = canvas
              .getContext("2d")!
              .getImageData(0, 0, canvas.width, canvas.height).data;
          for (let n = 0; n < bytes.length; n += 64)
            if (
              bytes[n + 3] > 0 &&
              bytes[n] < 200 &&
              bytes[n + 1] < 200 &&
              bytes[n + 2] < 200
            )
              return true;
          return false;
        }),
    )
    .toBe(true);
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(viewer.getByLabel("PDF zoom")).toHaveText("125%");
  await expect(
    viewer.getByRole("link", { name: "Download preview", exact: true }),
  ).toHaveAttribute("href", /^blob:/);
  await expect(
    viewer.getByRole("link", { name: "Open in new tab", exact: true }),
  ).toHaveAttribute("href", /^blob:/);
  expect(JSON.stringify(await f.repo.get(f.draft.id))).toBe(before);
  expect(f.current().files).toHaveLength(0);
  expect(f.current().jobs).toHaveLength(0);
  await viewer
    .getByRole("button", { name: "Close PDF preview", exact: true })
    .click();
  await loading.destroy();
});
