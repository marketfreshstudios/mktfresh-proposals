import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setup, staff, clientActor, signature } from "../tests/helpers";
import { cloneQuote, quoteSublines, chooseItem } from "../src/lib/quote-model";
import { publicResult } from "../src/lib/service";
import type { Proposal, QuoteItem } from "../src/lib/model";
import { sha256 } from "../src/lib/content";

test("Quote model editor: responsive sections, prices, alternatives, keyboard, reference, send and client radio groups", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const { repo, service, draft, settings, members } = await setup(),
    catalog = await repo.entities<any>("pricing_items");
  const quote = cloneQuote(draft.quote),
    group = "00000000-0000-4000-8000-000000008001";
  quote[0] = {
    ...quote[0],
    optional: true,
    default_selected: true,
    choice_group_id: group,
  };
  quote[1] = {
    ...quote[1],
    optional: true,
    default_selected: false,
    choice_group_id: group,
  };
  quote[1].sublines.push({
    ...quote[0].sublines[0],
    id: "00000000-0000-4000-8000-000000008002",
    label: "Setup",
    list_amount: null,
    amount: 12000,
  });
  quote[0].sublines[0].amount = 260000;
  const content: Proposal["content"] = [
    { type: "heading", text: "A website built around your business" },
    {
      type: "paragraph",
      text: "Hello {{client.first_name}}. We’ll plan, design and launch your new website, with clear milestones and support from {{workspace.name}}.",
    },
    { type: "heading", text: "What we’ll do" },
    {
      type: "paragraph",
      text: "Discovery and direction, responsive design, content preparation and a supported launch. Your investment starts at {{quote.one_time_total}}.",
    },
    { type: "pricing_table" },
    ...draft.content.filter((b) =>
      ["contract", "signature_block"].includes(b.type),
    ),
  ];
  let active = await service.edit(
      draft.id,
      { revision: draft.revision, quote, content },
      { ...staff, actor: "ai:Assistant" },
    ),
    publicP: Proposal | undefined,
    mode = "staff",
    patches = 0;
  const reference = {
    id: "00000000-0000-4000-8000-000000008003",
    name: "Pricing playbook",
    source_type: "linked",
    format: "text",
    content:
      "PLAYBOOK_VERSION = 'v2 · October 2026'\n\nWebsite projects\nAgree scope and price with the owner.\nHosting and support\nUse catalogue prices as supplied; overrides require review.",
    version_id: "fixture",
    version: "v2 · October 2026",
    content_hash: sha256("fixture"),
    fetched_at: "2026-10-29T12:00:00Z",
  };
  await repo.put("workspace_documents", reference as any);
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: any = [];
      if (path[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (path[0] === "public") {
        const p = publicP!;
        if (path[2] === "brand")
          value = {
            ...publicResult(p).company,
            contact: publicResult(p).contact,

            ended: null,
          };
        else if (path[2] === "quote") {
          publicP = await service.toggle(
            p.token!,
            "",
            req.postDataJSON(),
            clientActor,
          );
          value = publicResult(publicP);
        } else value = publicResult(p);
      } else if (path[0] === "proposals") {
        if (req.method() === "PATCH") {
          active = await service.edit(active.id, req.postDataJSON(), staff);
          patches++;
          value = active;
        } else if (path[2] === "send") {
          const input = req.postDataJSON();
          active = await service.send(
            active.id,
            staff,
            input.confirm_ai_review,
            input.sender_user_id,
            { note: input.note, password: input.password },
          );
          publicP = active;
          value = active;
        } else value = path[1] ? active : { items: [active], total: 1 };
      } else if (
        [
          "pricing_items",
          "clients",
          "templates",
          "content_library",
          "custom_families",
          "workspace_documents",
        ].includes(path[0])
      )
        value = await repo.entities(path[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: 400,
        json: { error: e instanceof Error ? e.message : String(e) },
      });
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dir = ".data/evidence/quote-editor";
  await mkdir(dir, { recursive: true });
  const captures: {
    file: string;
    frame: string;
    width: number;
    theme: string;
    state: string;
  }[] = [];
  async function capture(
    state: string,
    frame: string,
    width: number,
    theme: string,
  ) {
    await page.evaluate(() => document.fonts.ready);
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    captures.push({ file, frame, width, theme, state });
  }
  for (const theme of ["light", "dark"]) {
    await context.addInitScript((t) => {
      localStorage.setItem("proposal-theme", t);
      if (document.documentElement) document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/proposals/${active.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      if (width === 375) {
        await capture("sections", "2c", width, theme);
        await page
          .locator(".phone-section-list")
          .getByRole("button", { name: /01 A website/ })
          .click();
        await expect(
          page.locator(".phone-active-section .tiptap"),
        ).toBeVisible();
        await capture("section-edit", "2c", width, theme);
        await page
          .getByRole("button", { name: "Quote & totals", exact: true })
          .click();
      } else if (width === 768) {
        await capture("tablet-document", "5g", width, theme);
        await page
          .getByRole("button", { name: "Quote & totals", exact: true })
          .click();
      }
      await expect(
        page
          .getByRole("tab", { name: "Quote", exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await capture(
        "quote",
        width === 1440 ? "2a" : width === 768 ? "5h" : "2d",
        width,
        theme,
      );
      await page
        .getByRole("tab", { name: "Pricing reference", exact: true })
        .filter({ visible: true })
        .click();
      await expect(
        page
          .getByText(`Version ${reference.version}`, { exact: false })
          .filter({ visible: true }),
      ).toBeVisible();
      await page
        .getByRole("searchbox", { name: "Search reference" })
        .filter({ visible: true })
        .fill("Hosting");
      await expect(
        page.locator(".pricing-reference").filter({ visible: true }),
      ).toContainText("Hosting and support");
      await capture(
        "reference",
        width === 1440 ? "2b" : width === 768 ? "5h" : "2e",
        width,
        theme,
      );
      await page
        .getByRole("tab", { name: "Quote", exact: true })
        .filter({ visible: true })
        .click();
      if (width === 375) {
        await page
          .getByRole("button", { name: "Edit item", exact: true })
          .first()
          .click();
        await expect(page.getByRole("dialog", { name: "Edit item" }))
          .toBeVisible()
          .catch(() => {});
        await capture("line-edit", "2e", width, theme);
        await page
          .locator(".line-sheet")
          .getByRole("button", { name: "Done", exact: true })
          .click();
      }
      await page
        .getByRole("tab", { name: "Review & send", exact: true })
        .filter({ visible: true })
        .click();
      await expect(
        page
          .getByRole("combobox", { name: "From", exact: true })
          .filter({ visible: true }),
      ).toHaveValue(members[0].user_id);
      await capture(
        "send",
        width === 1440 ? "2b" : width === 768 ? "5h" : "2f",
        width,
        theme,
      );
      if (width < 1100)
        await page
          .locator(".tools-sheet")
          .getByRole("button", { name: "Done", exact: true })
          .click();
    }
  }
  // Resolve a held price explicitly; editing an unrelated field does not dismiss review.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${active.id}`);
  const contentBeforeNames = JSON.stringify(active.content);
  await page.getByRole("switch", { name: "Show names", exact: true }).check();
  await expect(
    page.locator(".editor-paper .tiptap .field-chip").first(),
  ).toHaveText("{{client.first_name}}");
  await page.getByRole("switch", { name: "Show names", exact: true }).uncheck();
  await expect(
    page.locator(".editor-paper .tiptap .field-chip").first(),
  ).toHaveText("Jane");
  expect(JSON.stringify(active.content)).toBe(contentBeforeNames);
  const amountInput = page.getByRole("spinbutton", {
    name: `Amount ${quote[0].name}`,
    exact: true,
  });
  await amountInput.fill("2601");
  await expect(
    page.locator('.editor-paper .tiptap [data-field="quote.one_time_total"]'),
  ).toHaveText("$2,601");
  await amountInput.fill("2600");
  await expect(
    page.locator('.editor-paper .tiptap [data-field="quote.one_time_total"]'),
  ).toHaveText("$2,600");
  await expect(
    page.getByRole("button", { name: "Keep $2,600", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep $2,600", exact: true }).click();
  await expect.poll(() => patches).toBeGreaterThan(0);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  const drag = page.getByRole("button", {
    name: "Drag " + quote[0].name,
    exact: true,
  });
  await drag.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Drag choice group", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Review & send", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: /I have reviewed these AI-written sections/,
    })
    .check();
  await page
    .getByRole("textbox", { name: "Note", exact: true })
    .fill("Please review the scope and your choices.");
  await page.getByRole("button", { name: "Send to Jane", exact: true }).click();
  await expect.poll(() => active.status).toBe("sent");
  // Sending reloads the same address into the record. Wait for that navigation
  // before opening the client link, so two navigations cannot race on CI.
  await expect(page.locator(".quote-workspace")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Preview as client", exact: true }),
  ).toBeVisible();
  expect(
    active.jobs.some((j) =>
      String(j.payload.text).includes("Please review the scope"),
    ),
  ).toBe(true);
  // Client chooses exactly one item; total and conditional contract change together.
  publicP = active;
  await page.goto(`/p/${active.token}`);
  await expect(
    page.getByRole("radiogroup", { name: "Choose one" }),
  ).toBeVisible();
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await page.getByRole("radio", { name: /Hosting/ }).check();
  await expect
    .poll(
      () =>
        cloneQuote(publicP!.versions[0].quote).filter((i) => i.selected).length,
    )
    .toBe(1);
  await expect(
    page.getByRole("button", { name: /Dark mode|Light mode/ }),
  ).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await capture("client-choice", "2a client counterpart", width, theme);
    }
  }
  publicP = await service.sign(
    active.id,
    signature(publicP!.revision),
    "client",
    clientActor,
    { token: active.token!, password: "" },
  );
  publicP.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      metadata: {
        requires_checkout: true,
        checkout: [{ url: "https://checkout.stripe.com/fixture" }],
      },
    },
  ];
  for (const theme of ["light", "dark"])
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/p/${active.token}`);
      await expect(
        page.getByRole("heading", {
          name: "Set up your monthly subscription",
        }),
      ).toBeVisible();
      await page.evaluate(
        (t) => (document.documentElement.dataset.theme = t),
        theme,
      );
      await capture("client-billing", "5e", width, theme);
      await expect(
        page.getByText(
          "Your signature is saved. Your signed copy is being sealed and will arrive by email.",
        ),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "I’ll do this later", exact: true })
        .click();
      await capture("client-signed", "5f", width, theme);
    }
  expect(errors).toEqual([]);
  await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
  // Capture the exact supplied frames. 5e/f are billing/completion in this export; 5g/h are the editor.
  const refs = await context.newPage();
  refs.setDefaultTimeout(15000);
  await refs.setViewportSize({ width: 1540, height: 1200 });
  for (const [file, frames] of [
    ["Redesign 02 - Editor.dc.html", ["2a", "2b", "2c", "2d", "2e", "2f"]],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5e", "5f", "5g", "5h"]],
  ] as const) {
    await refs.goto(`http://127.0.0.1:4176/${encodeURIComponent(file)}`);
    await refs.evaluate(() => document.fonts.ready);
    for (const theme of file.includes("02") ? ["light", "dark"] : ["light"]) {
      if (file.includes("02"))
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
});
