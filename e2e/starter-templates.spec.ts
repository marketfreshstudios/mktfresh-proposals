import { socialCatalog } from "../tests/social-catalog";
import { starterLogo } from "../tests/starter-logo";
import { authoringPreview } from "../src/lib/authoring-preview";
import { pdfPreview } from "../src/lib/pdf-preview";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { editorFixture } from "./editor-fixture";
import { starterTemplates } from "../seed/starter-templates";
import type { Item } from "../src/lib/model";
const shots = "docs/screenshots/starter-templates";
async function fixture(
  page: import("@playwright/test").Page,
  withState = false,
) {
  const f = await editorFixture(page);
  const logo = await starterLogo();
  f.settings.owner = "Alex Morgan";
  if (withState)
    f.settings.business_state = { name: "North Carolina", other: "" };
  f.settings.logo = `${f.repo.workspaceId}/logo.png`;
  await f.repo.put("workspace_settings", f.settings);
  await page.route("**/api/workspace-logo**", (route) =>
    route.fulfill({ body: logo, contentType: "image/png" }),
  );
  await page.route("**/api/document-preview", async (route) => {
    const p = authoringPreview(
      route.request().postDataJSON(),
      f.settings,
      f.repo.workspaceId,
    );
    const result = await pdfPreview(
      f.repo,
      { get: async () => logo, put: async () => {} },
      p,
      f.settings,
    );
    await route.fulfill({ json: result });
  });
  const templates = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog: await f.repo.entities<Item>("pricing_items"),
  });
  const old = (await f.repo.entities<any>("templates"))[0];
  await f.repo.put("templates", {
    ...old,
    name: "Website proposal sample (old)",
    active: false,
  });
  for (const t of templates) await f.repo.put("templates", t);
  let settings = { ...f.settings };
  await page.route("**/api/workspace_settings", async (route) => {
    if (route.request().method() === "POST") {
      settings = route.request().postDataJSON();
      await f.repo.put("workspace_settings", settings);
    }
    await route.fulfill({
      json: route.request().method() === "POST" ? settings : [settings],
    });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { ...f, logo, templates, getSettings: () => settings };
}
test("starter descriptions, order, approved covers and Terms remain readable in the template editor", async ({
  page,
}) => {
  const f = await fixture(page, true);
  mkdirSync(shots, { recursive: true });
  await page.goto("/studio/templates");
  await expect(page.locator(".studio-template-card")).toHaveCount(8);
  const names = await page.getByTestId("template-card-name").allTextContents();
  expect(names).toContain("General project proposal");
  await expect(
    page.getByText(
      "Starter terms are a starting point, not legal advice. Have an attorney review them before you use them.",
    ),
  ).toBeVisible();
  expect(names.slice(0, 7)).toEqual(f.templates.map((t) => t.name));
  await page.screenshot({
    path: `${shots}/templates-1440.png`,
    fullPage: true,
  });
  for (const number of [1, 0]) {
    const t = f.templates[number];
    await page.goto(`/studio/templates/${t.id}`);
    await expect(
      page.locator(".template-paged-paper .page-sheet").nth(1),
    ).toBeVisible();
    await expect(page.locator(".template-paged-paper")).toContainText(
      number === 1 ? "A new website for" : "Proposal title",
    );
    await expect(
      page.locator(".template-paged-paper .editor-page-sheets"),
    ).toHaveAttribute("data-layout-settled", "true");
    await expect(
      page.locator(".template-paged-paper .cover-logo img"),
    ).toBeVisible();
    await page.screenshot({
      path: `${shots}/template-${number === 1 ? 1 : 6}-cover-1440.png`,
    });
    await page
      .locator(".template-paged-paper .page-sheet")
      .nth(1)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${shots}/template-${number === 1 ? 1 : 6}-content-1440.png`,
    });
  }
  await page.goto(`/studio/templates/${f.templates[2].id}`);
  await page
    .locator(".template-paged-paper")
    .getByRole("heading", { name: "Terms", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/template-2-terms-1440.png` });
});
test("Business state autosaves, is available as a field, and readiness links to missing state and names bracketed sections", async ({
  page,
}) => {
  test.setTimeout(30000);
  const f = await fixture(page);
  await page.goto("/studio/workspace?view=brand#workspace-business-state");
  await page
    .getByRole("combobox", { name: "Business state", exact: true })
    .selectOption("North Carolina");
  await expect
    .poll(() => f.getSettings().business_state?.name)
    .toBe("North Carolina");
  await page.screenshot({
    path: `${shots}/business-state-1440.png`,
    fullPage: true,
  });
  delete f.getSettings().business_state;
  await f.repo.put("workspace_settings", f.getSettings());
  const active = (await f.repo.get(f.draft.id))!;
  // This fixture begins with the authored placeholder and an empty workspace state.
  const changed = await f.service.edit(
    active.id,
    {
      revision: active.revision,
      content: [
        { id: crypto.randomUUID(), type: "page_break" },
        { id: crypto.randomUUID(), type: "heading", text: "Overview" },
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          text: "[Describe the outcome] {{workspace.state}}",
        },
        ...active.content.filter(
          (b) => b.type !== "heading" && b.type !== "paragraph",
        ),
        { id: crypto.randomUUID(), type: "signature_block", role: "company" },
      ],
    },
    (await import("../tests/helpers")).staff,
  );
  await page.unroute("**/api/proposals/**");
  await page.route("**/api/proposals/**", (route) =>
    route.request().url().endsWith("/preview-logo")
      ? route.fulfill({ body: f.logo, contentType: "image/png" })
      : route.fulfill({ json: changed }),
  );
  await page.goto(`/proposals/${changed.id}/edit`);
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(
    page
      .locator(".field-option-label")
      .getByText("Business state", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Add business state", { exact: true }),
  ).toHaveAttribute(
    "href",
    "/studio/workspace?view=brand#workspace-business-state",
  );
  await expect(
    page.getByText(/Replace bracketed guidance in: Overview/),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Overview", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/readiness-1440.png` });
});

test("every starter field is highlighted in template and proposal editors, while client and PDF stay plain", async ({
  page,
}, testInfo) => {
  const f = await fixture(page, true);
  const template = f.templates[1];
  const tokens = (value: unknown): string[] => {
    if (typeof value === "string")
      return [...value.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((m) => m[1]);
    if (!value || typeof value !== "object") return [];
    const n = value as any;
    if (n.type === "variable") return [n.attrs.path];
    return Object.values(value).flatMap(tokens);
  };
  async function chips(
    root: import("@playwright/test").Locator,
    paths: string[],
  ) {
    for (const path of new Set(paths))
      await expect(root.locator(`[data-field="${path}"]`).first()).toHaveClass(
        /field-chip/,
      );
    const all = root.locator(".field-chip");
    await expect(all.first()).toBeAttached();
    expect(
      await all.evaluateAll((els) =>
        els.every(
          (el) => getComputedStyle(el).backgroundColor === "rgb(240, 236, 228)",
        ),
      ),
    ).toBe(true);
  }
  async function walk(
    prefix: string,
    content: typeof template.content,
    cover: typeof template.cover,
  ) {
    const paper = page.locator(
      prefix === "template" ? ".template-paged-paper" : ".editor-paper",
    );
    await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
      "data-layout-settled",
      "true",
    );
    for (const b of content) {
      const paths = tokens(b.content ?? b.text ?? "").concat(tokens(b.clauses));
      if (!paths.length) continue;
      await chips(
        paper.locator(`[data-block-id="${prefix}-${b.id}"]`).first(),
        paths,
      );
    }
    for (const e of cover?.elements ?? []) {
      if (
        e.hidden ||
        (cover?.layout &&
          cover.layout !== "custom" &&
          e.meta === "valid_until" &&
          prefix !== "template")
      )
        continue;
      const paths = tokens(e.content);
      if (paths.length)
        await chips(
          paper.locator(`[data-cover-element="${e.id}"]`).first(),
          paths,
        );
    }
    const header = paper.locator('[data-band-frame="header"]').first();
    await chips(header, ["proposal.title"]);
    // Owner-approved default: an uploaded wide logo replaces the name field.
    await expect(header.locator("img")).toBeVisible();
    await expect(header.locator('[data-field="workspace.name"]')).toHaveCount(
      0,
    );
    const raw = await paper.evaluate((root) => {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      const found: string[] = [];
      while ((n = walk.nextNode()))
        if (
          !n.parentElement?.closest(
            "[data-editor-chrome],style,script,textarea",
          ) &&
          /{{\s*[\w.-]+\s*}}/.test(n.textContent ?? "")
        )
          found.push(n.textContent!);
      return found;
    });
    expect(raw).toEqual([]);
    if (cover?.layout && cover.layout !== "custom") {
      // Owner-approved new layouts use a date-only slot and hide it when indefinite.
      if (prefix === "template")
        await expect(
          paper.locator('[data-field="proposal.valid_until"]').first(),
        ).toHaveText("January 31, 2026");
      else
        await expect(
          paper.locator('.document-cover [data-field="proposal.valid_until"]'),
        ).toHaveCount(0);
    } else {
      await expect(
        paper.locator('[data-field="proposal.validity"]').first(),
      ).toHaveText("Validity sentence");
    }
    if (
      content.some(
        (b) => b.type === "heading" && b.text === "Why {{workspace.name}}",
      )
    )
      await expect(page.locator(".sections-nav")).toContainText(
        "Why Example Studio",
      );
    await expect(page.locator(".sections-nav")).not.toContainText("{{");
  }
  for (const starter of f.templates) {
    await page.goto(`/studio/templates/${starter.id}`);
    await walk("template", starter.content, starter.cover);
  }
  await page.goto(`/studio/templates/${template.id}`);
  await walk("template", template.content, template.cover);
  const bandSheet = page.locator(".template-paged-paper .page-sheet").nth(1);
  await page.setViewportSize({
    width: 1440,
    height:
      Math.ceil(
        await bandSheet.evaluate((el) => (el as HTMLElement).offsetHeight),
      ) + 200,
  });
  await bandSheet.scrollIntoViewIfNeeded();
  await expect(
    page.locator(".template-paged-paper .editor-page-sheets"),
  ).toHaveAttribute("data-layout-settled", "true");
  await page.screenshot({ path: `${shots}/highlighted-bands-1440.png` });
  const { staff } = await import("../tests/helpers");
  let active = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: template.id,
      title: "Field proof",
      valid_until: null,
    },
    staff,
  );
  const choice = active.quote.find((i) => i.pricing_item_id?.endsWith("103"))!;
  active = await f.service.edit(
    active.id,
    {
      revision: active.revision,
      quote: active.quote.map((i) => ({
        ...i,
        selected: i.id === choice.id,
        default_selected: i.id === choice.id,
      })),
    },
    staff,
  );
  const { previewResult } = await import("../src/lib/preview");
  await page.route("**/api/proposals/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith("/preview-logo"))
      return route.fulfill({ body: f.logo, contentType: "image/png" });
    if (path.endsWith("/preview"))
      return route.fulfill({ json: previewResult(active, f.settings) });
    if (req.method() === "PATCH")
      active = await f.service.edit(active.id, req.postDataJSON(), staff);
    return route.fulfill({ json: active });
  });
  await page.goto(`/proposals/${active.id}/edit`);
  await page
    .locator(".editor-paper details")
    .evaluateAll((nodes) =>
      nodes.forEach((n) => ((n as HTMLDetailsElement).open = true)),
    );
  await walk("block", active.content, active.cover);
  // Pasted complete tokens become atoms without waiting for a save/blur.
  const text = page.locator(
    `[data-block-id="block-${active.content.find((b) => b.type === "paragraph")!.id}"] .tiptap`,
  );
  await text.fill("Typed {{workspace.name}}.");
  await expect(text.locator('[data-field="workspace.name"]')).toHaveText(
    "Example Studio",
  );
  await page.goto(`/p/${active.id}?preview=1`);
  await expect(page.locator(".client-flow")).toBeVisible();
  await expect(
    page.locator(".client-flow .field-chip,[data-field]"),
  ).toHaveCount(0);
  await expect(page.locator(".client-flow")).not.toContainText("{{");
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(
    page.locator(".client-flow .field-chip,[data-field]"),
  ).toHaveCount(0);
  await expect(page.locator(".client-flow")).not.toContainText("{{");
  const { pdfPreview } = await import("../src/lib/pdf-preview");
  const rendered = await pdfPreview(
    f.repo,
    { get: async () => f.logo, put: async () => {} },
    active,
    f.settings,
  );
  const { writeFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const pdfPath = testInfo.outputPath("field-proof.pdf");
  await writeFile(pdfPath, Buffer.from(rendered.pdf_base64, "base64"));
  const plain = execFileSync("pdftotext", [pdfPath, "-"], {
    encoding: "utf8",
  }).replace(/\s+/g, " ");
  expect(plain).toContain("Why Example Studio");
  expect(plain).toContain("State of North Carolina");
  expect(plain).not.toContain("{{");
  expect(
    rendered.layout.sheets!.every(
      (sheet) => !sheet.html.includes("field-chip"),
    ),
  ).toBe(true);
});

test("seventh Social media starter shows the four plans, keeps Growth selected and stays read-only", async ({
  page,
}) => {
  const f = await fixture(page, true),
    catalog = [
      ...(await f.repo.entities<Item>("pricing_items")),
      ...socialCatalog(),
    ];
  f.settings.company_name = "MarketFresh Studios";
  f.getSettings().company_name = f.settings.company_name;
  await f.repo.put("workspace_settings", f.getSettings());
  for (const product of socialCatalog())
    await f.repo.put("pricing_items", product);
  const social = starterTemplates(f.repo.workspaceId, {
    marketfresh: true,
    catalog,
  }).at(-1)!;
  await f.repo.put("templates", social);
  await page.goto("/studio/templates");
  await expect(page.locator("[data-starter-status]")).toHaveCount(7);
  await expect(
    page.locator(".starter-pill").filter({ hasText: "Starter" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(social.description!, { exact: true }),
  ).toBeVisible();
  if (process.env.CAPTURE_SOCIAL_STARTER) {
    mkdirSync("docs/screenshots/social-starter", { recursive: true });
    await page.screenshot({
      path: "docs/screenshots/social-starter/templates-1440.png",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto(`/studio/templates/${social.id}`);
  const paper = page.locator(".template-paged-paper");
  await expect(paper.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  await expect(paper).toContainText("A social media plan for");
  await expect(paper.locator(".cover-logo img")).toBeVisible();
  if (process.env.CAPTURE_SOCIAL_STARTER)
    await page.screenshot({
      path: "docs/screenshots/social-starter/cover-1440.png",
    });
  await paper
    .getByRole("heading", { name: "Investment", exact: true })
    .scrollIntoViewIfNeeded();
  const investmentPage = await paper.evaluate((root) => {
    const heading = [...root.querySelectorAll("h1,h2,h3")].find(
      (el) => el.textContent === "Investment",
    )!;
    const y = heading.getBoundingClientRect().top;
    return [
      ...root.querySelectorAll<HTMLElement>(".page-sheet[data-editor-page]"),
    ].find((sheet) => {
      const r = sheet.getBoundingClientRect();
      return y >= r.top && y < r.bottom;
    })!.dataset.editorPage;
  });
  await paper
    .locator(`.page-sheet[data-editor-page="${investmentPage}"]`)
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(paper).toContainText("Social Media Management Growth");
  expect(social.default_items!.map((q) => q.default_selected)).toEqual([
    false,
    true,
    false,
    false,
  ]);
  if (process.env.CAPTURE_SOCIAL_STARTER)
    await page.screenshot({
      path: "docs/screenshots/social-starter/investment-1440.png",
    });
  const text = paper.locator(".tiptap").first();
  await text.scrollIntoViewIfNeeded();
  await text.click();
  await text.fill("My attempted customization");
  await expect(page.locator(".starter-edit-notice")).toBeVisible();
  expect(
    (await f.repo.entities<any>("templates")).find((t) => t.id === social.id),
  ).toEqual(social);
});
