import { test, expect } from "@playwright/test";
import { setup, staff, signature, clientActor } from "../tests/helpers";
import { templateDefaultQuote } from "../src/lib/template-quote";
import { sealedPdf } from "../src/lib/pdf";
import { previewProposal } from "../src/lib/preview";
import { freezeStyles } from "../src/lib/proposal-styles";
import { pdfPreview } from "../src/lib/pdf-preview";
import type { Block } from "../src/lib/model";
import { editorFixture as fixture } from "./editor-fixture";
// Live browser / PDF source positions are covered in live-pagination.spec.ts.
test("sidebar rails open every tab, remember collapse and support both shortcuts", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".quote-workspace")).toHaveAttribute(
    "data-panels-ready",
    "true",
  );
  await page
    .getByRole("button", {
      name: /^Collapse (Pages|Sections) sidebar$/,
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Collapse tools sidebar", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: /^Expand (Pages|Sections) sidebar$/,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand tools sidebar", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+Backslash");
  await expect(
    page.getByRole("button", {
      name: /^Collapse (Pages|Sections) sidebar$/,
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Control+Backslash");
  await expect(
    page.getByRole("button", { name: "Collapse tools sidebar", exact: true }),
  ).toBeVisible();
  for (const width of [1440, 1100, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width < 1100)
      await expect(
        page.getByRole("button", { name: "Expand tools sidebar", exact: true }),
      ).toBeVisible();
    for (const name of ["Quote", "Fields", "Styles", "Send"]) {
      if (
        await page
          .getByRole("button", { name: "Collapse tools sidebar", exact: true })
          .isVisible()
      )
        await page
          .getByRole("button", { name: "Collapse tools sidebar", exact: true })
          .click();
      await page
        .getByRole("button", { name: `Open ${name}`, exact: true })
        .click();
      await expect(
        page.getByRole("tab", { name, exact: true }).filter({ visible: true }),
      ).toHaveAttribute("aria-selected", "true");
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.getByRole("tablist", { name: "Proposal tools" }) });
      if (await dialog.isVisible())
        await dialog
          .getByRole("button", {
            name: /^(Done|Collapse tools sidebar)$/,
            exact: true,
          })
          .click();
    }
  }
});

test("template creation stays reachable with collapsed Pages at desktop, tablet and phone widths", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.addInitScript(
    (user) =>
      localStorage.setItem(
        `proposal-editor-panels:${user}`,
        JSON.stringify({ left: false, right: false }),
      ),
    staff.actor,
  );
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/studio/templates");
    const create = page.getByRole("button", {
      name: "New template",
      exact: true,
    });
    await expect(create).toBeVisible();
    await create.click();
    const name = page.getByRole("textbox", {
      name: "Template name",
      exact: true,
    });
    await expect(name).toHaveValue("Untitled template");
    await name.fill(`New template at ${width}`);
    if (width >= 700) {
      await expect(page.locator(".sidebar")).toBeVisible();
      await expect(page.locator(".sidebar")).toHaveCSS(
        "width",
        width >= 1100 ? "232px" : "64px",
      );
    }
  }
});

test("every popover pair replaces the previous surface; outside, Escape and insertion close it", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page
    .getByRole("button", { name: "Collapse tools sidebar", exact: true })
    .click();
  const block = page.locator(`[data-block-id="block-${f.content[1].id}"]`),
    text = block.locator(".tiptap"),
    bar = page.getByRole("toolbar", {
      name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
      exact: true,
    });
  const visible = page.locator(
    ".toolbar-popover:popover-open,.block-popover:popover-open",
  );
  const open = [
    () => bar.getByRole("button", { name: "Link", exact: true }).click(),
    () =>
      bar.getByRole("button", { name: "Insert field", exact: true }).click(),
    () => bar.locator('button[aria-label="Text style"]').click(),
    () =>
      block
        .getByRole("button", { name: /^Add (a )?block below$/, exact: true })
        .click(),
  ];
  for (let a = 0; a < open.length; a++)
    for (let b = 0; b < open.length; b++)
      if (a !== b) {
        await page.keyboard.press("Escape");
        await text.click();
        await open[a]();
        await expect(visible, `first ${a}`).toHaveCount(1);
        if (b === 0)
          await expect(
            bar.getByRole("button", { name: "Link", exact: true }),
            `${a} -> ${b} retains the text editor`,
          ).toBeEnabled();
        await open[b]();
        await expect(visible, `${a} -> ${b}`).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(visible, `${a} -> ${b} closes on Escape`).toHaveCount(0);
        await expect(
          bar.locator('button[aria-label="Text style"]'),
        ).toHaveAttribute("aria-expanded", "false");
      }
  await text.click();
  await open[1]();
  await page
    .getByRole("button", { name: /Client first name.*client.first_name/ })
    .filter({ visible: true })
    .click();
  await expect(visible).toHaveCount(0);
  await open[0]();
  await page.locator(".quote-editor-top").click({ position: { x: 5, y: 5 } });
  await expect(visible).toHaveCount(0);
  const style = bar.locator('button[aria-label="Text style"]');
  await text.click();
  await style.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Text styles" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(style.locator(".text-style-label")).toHaveText("Heading 1");
  await expect(visible).toHaveCount(0);
  await style.click();
  await page.keyboard.press("Escape");
  await expect(style).toBeFocused();
  await expect(visible).toHaveCount(0);
});
test("pricing moves as a whole when it fits; tall quotes split only at intact card/group boundaries; density and margins affect page count", async () => {
  const f = await setup(),
    base = previewProposal(f.draft, f.settings).versions[0],
    quote = f.draft.quote.map((i, n) => ({
      ...i,
      description: "A clear scope and monthly care plan. ".repeat(3),
      id: crypto.randomUUID(),
    }));
  const content: Block[] = [
    {
      id: "filler",
      type: "paragraph",
      text: "A clear and useful plan. ".repeat(135),
    },
    { id: "pricing", type: "pricing_table" },
  ];
  const render = async (q = quote, styles = freezeStyles()) =>
    sealedPdf(
      { ...base, content, quote: q, resolved_styles: styles },
      [],
      [],
      "USD",
      {
        settings: f.settings,
        document: { id: f.draft.id, title: f.draft.title },
      },
      { preview: true },
    );
  let fits = await render();
  let straddles = false;
  for (let length = 40; length <= 120; length += 5) {
    content[0].text = "A clear and useful plan. ".repeat(length);
    fits = await render();
    const at = fits.layout.sheets!.findIndex((s) =>
      s.fragments.some((f) => f.block === "pricing"),
    );
    if (at < 1) continue;
    const previous = fits.layout.sheets![at - 1],
      pricing = fits.layout.sheets![at].fragments.filter(
        (f) => f.block === "pricing",
      );
    const free =
      previous.content_area!.top +
      previous.content_area!.height -
      Math.max(...previous.fragments.map((f) => f.bottom ?? f.y + f.height));
    const table = pricing.find((f) => !f.unit)!,
      card = pricing.find((f) => !!f.unit)!;
    if (table && card && free > card.height + 80 && free < table.height - 10) {
      straddles = true;
      break;
    }
  }
  expect(
    straddles,
    "fixture leaves room for one card, but not the complete table",
  ).toBe(true);
  expect(fits.layout.pricing_pages).toBe(1);
  expect(
    fits.layout.sheets!.findIndex((s) =>
      s.fragments.some((a) => a.block === "pricing"),
    ),
  ).toBeGreaterThan(0);
  const choiceId = crypto.randomUUID();
  const many = Array.from({ length: 14 }, (_, n) => ({
    ...quote[0],
    id: crypto.randomUUID(),
    order: n,
    choice_group_id: n < 2 ? choiceId : null,
    optional: n < 2,
    default_selected: n === 0 || n >= 2,
    selected: n === 0 || n >= 2,
  }));
  const tall = await render(many);
  expect(tall.layout.pricing_pages).toBeGreaterThan(1);
  for (const unit of [many[0].id, ...many.slice(2).map((i) => i.id)])
    expect(
      tall.layout.sheets!.filter((s) =>
        s.fragments.some((f) => f.unit === unit),
      ),
    ).toHaveLength(1);
  const long = {
    ...base,
    content: [
      {
        id: "long",
        type: "paragraph" as const,
        text: "Clear scope, thoughtful work, and useful results. ".repeat(650),
      },
    ],
  };
  const pages = [];
  for (const override of [
    { density: "standard" },
    { density: "comfortable" },
    {
      density: "comfortable",
      margins: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
    },
  ] as const) {
    const result = await sealedPdf(
      {
        ...long,
        resolved_styles: freezeStyles(undefined, undefined, override),
      },
      [],
      [],
      "USD",
      { settings: f.settings },
      { preview: true },
    );
    pages.push(result.layout.pages);
  }
  expect(pages[1]).toBeGreaterThan(pages[0]);
  expect(pages[2]).toBeGreaterThan(pages[1]);
});
test("page add/delete and undo use normal authoring history; templates use the same sheets and Pages sidebar", async ({
  page,
}) => {
  const f = await fixture(page, true);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const before = JSON.stringify(f.active().content);
  await page.getByRole("button", { name: "+ Add page", exact: true }).click();
  await expect
    .poll(
      () => f.active().content.filter((b) => b.type === "page_break").length,
    )
    .toBe(2);
  const added = f.active().content.at(-1)!;
  await expect(
    page.locator(`[data-block-id="block-${added.id}"] .tiptap`),
  ).toBeFocused();
  const bar = page.getByRole("toolbar", {
    name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
    exact: true,
  });
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(before);
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Redo", exact: true })
    .click();
  await expect
    .poll(
      () => f.active().content.filter((b) => b.type === "page_break").length,
    )
    .toBe(2);
  await page
    .getByRole("button", { name: /^Delete page / })
    .last()
    .click();
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(before);
  await expect(
    page.getByRole("status").filter({ hasText: "Page deleted" }),
  ).toBeVisible();
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect
    .poll(
      () => f.active().content.filter((b) => b.type === "page_break").length,
    )
    .toBe(2);
  await page.goto("/studio/templates");
  await page.locator(".studio-template-card").first().click();
  await expect(
    page.getByRole("navigation", { name: "Sections", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".template-paged-paper .editor-page-sheets"),
  ).toHaveAttribute("data-layout-settled", "true");
  expect(
    Number(
      await page
        .locator(".template-paged-paper .editor-page-sheets")
        .getAttribute("data-layout-max-error"),
    ),
    (await page
      .locator(".template-paged-paper")
      .getAttribute("data-layout-errors")) ?? "template layout",
  ).toBeLessThanOrEqual(1);
  await expect
    .poll(() => page.locator(".template-paged-paper .page-sheet").count())
    .toBeGreaterThan(3);
});

test("whole pages and sections move through normal undo without moving the following explicit page", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  const before = JSON.stringify(f.active().content),
    second = f.content[3].id!;
  const pageHandle = page.getByRole("button", {
    name: "Drag page 2",
    exact: true,
  });
  await pageHandle.focus();
  await pageHandle.press("Space");
  await expect(pageHandle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await page.keyboard.press("ArrowUp");
  await expect(
    page
      .locator('[id^="DndLiveRegion"]')
      .filter({ hasText: `over droppable area page:start.` }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(() => f.active().content[0]?.id).toBe(second);
  const bar = page.getByRole("toolbar", {
    name: /^(Document formatting|Text tools|Pricing table tools|Signatures tools|Image tools|Contract tools|Clause tools)$/,
    exact: true,
  });
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(before);
  const section = page.getByRole("button", {
    name: "Drag section First section",
    exact: true,
  });
  await section.focus();
  await section.press("Space");
  await expect(section).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
  await page.keyboard.press("ArrowDown");
  await expect(
    page
      .locator('[id^="DndLiveRegion"]')
      .filter({ hasText: `over droppable area page:${f.content[2].id}.` }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(() => f.active().content[0]?.type).toBe("page_break");
  await page
    .locator(
      '.editor-v2-header, [role="toolbar"][aria-label="Document formatting"]',
    )
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => JSON.stringify(f.active().content)).toBe(before);
});
test("real signatures retain their authored page positions in new PDFs", async () => {
  const f = await setup(),
    client = crypto.randomUUID(),
    after = crypto.randomUUID();
  const p = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      content: [
        { id: client, type: "signature_block", role: "client" },
        { id: crypto.randomUUID(), type: "page_break" },
        { id: after, type: "paragraph", text: "After the client signature." },
        { id: crypto.randomUUID(), type: "signature_block", role: "company" },
        { id: crypto.randomUUID(), type: "pricing_table" },
      ],
    },
    staff,
  );
  const sent = await f.service.send(p.id, staff),
    signed = await f.service.sign(
      p.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  const version = signed.versions.at(-1)!,
    before = JSON.stringify(version);
  const result = await sealedPdf(
    version,
    signed.signers,
    signed.events,
    "USD",
    {
      settings: signed.workspace_settings,
      document: { id: p.id, title: p.title },
    },
  );
  const at = (id: string) =>
    result.layout.sheets!.findIndex((s) =>
      s.fragments.some((f) => f.block === id),
    );
  expect(at(client)).toBe(0);
  expect(at(after)).toBeGreaterThan(at(client));
  expect(JSON.stringify(version)).toBe(before);
});

test("review-only changes retain page geometry and page decorations never enter saved content", async ({
  page,
}) => {
  const f = await fixture(page, true);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const frame = page.locator(`[data-block-id="block-${f.content[1].id}"]`);
  await frame.locator(".tiptap").click();
  const boxes = () =>
    page.locator(".draft-block").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-block-id"),
          top:
            r.top +
            scrollY +
            (el.closest<HTMLElement>(".editor-document-region")?.scrollTop ??
              0),
          height: r.height,
        };
      }),
    );
  const before = await boxes();
  await frame
    .getByRole("button", {
      name: /^(Mark reviewed|Mark this AI-written block reviewed)$/,
      exact: true,
    })
    .click();
  await expect.poll(() => f.active().content[1].ai_review?.reviewed).toBe(true);
  expect(await boxes()).toEqual(before);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-approximate",
    "false",
  );
  expect(JSON.stringify(f.active().content)).not.toContain("paginationSpacer");
  expect(JSON.stringify(f.active().content)).not.toContain("pdf-source-spacer");
});
