import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import {
  setup,
  staff,
  signature,
  clientActor,
  companyConsent,
} from "../tests/helpers";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { defaultValidUntil } from "../src/lib/validity";
import { signatoryVersion } from "../src/lib/company-signatory";
import {
  activity,
  workspaceEvent,
  uploadFont,
  uploadedFonts,
} from "../src/lib/studio";
test("Phase 5 Studio, stored signature, fonts, defaults, recovery and state screenshots", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(10000);
  const { repo, service, draft, settings, members } = await setup();
  settings.company_signatory!.image = null;
  const memoryFiles = new Map<string, Uint8Array>(),
    storage = {
      put: async (p: string, b: Uint8Array) => {
        memoryFiles.set(p, b);
      },
      get: async (p: string) => memoryFiles.get(p)!,
    };
  const sent = await service.send(draft.id, staff),
    signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  const editing = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "New website scope",
    },
    staff,
  );
  const waiting = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "A proposal with the client",
    },
    staff,
  );
  await service.send(waiting.id, staff);
  const completedDraft = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "Completed agreement",
    },
    staff,
  );
  const completedSent = await service.send(completedDraft.id, staff);
  const completedClient = await service.sign(
    completedSent.id,
    signature(completedSent.revision),
    "client",
    clientActor,
    { token: completedSent.token!, password: "" },
  );
  await workspaceEvent(repo, staff, "templates_saved", {
    name: "Website agreement",
  });
  let scenario = "normal",
    rejectSave = false,
    release: (() => void) | undefined;
  const assistants = [
    {
      id: "fixture-assistant",
      name: "Example assistant",
      scopes: ["proposals:read", "proposals:draft"],
      last_used: "2026-10-10T12:00:00Z",
      revoked: false,
    },
  ];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    let value: unknown = [],
      status = 200;
    try {
      if (parts[0] === "auth") {
        if (scenario === "loading")
          await new Promise<void>((r) => (release = r));
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: signatoryVersion(settings),
        };
      } else if (parts[0] === "connections")
        value = { stripe: true, qbo: false, email: true, mock: false };
      else if (parts[0] === "workspace_settings") {
        Object.assign(
          settings,
          WorkspaceSettingsSchema.parse(req.postDataJSON()),
        );
        await repo.put("workspace_settings", settings);
        value = settings;
      } else if (parts[0] === "workspace-fonts") {
        if (req.method() === "POST")
          value = await uploadFont(repo, storage, staff, req.postDataJSON());
        else if (parts[1]) {
          const f = (await uploadedFonts(repo)).find((f) => f.id === parts[1])!;
          return route.fulfill({
            body: Buffer.from(await storage.get(f.path)),
            contentType: `font/${f.format}`,
          });
        } else value = await uploadedFonts(repo);
      } else if (parts[0] === "workspace_events") value = await activity(repo);
      else if (parts[0] === "assistants") value = assistants;
      else if (parts[0] === "proposals") {
        if (!parts[1] && req.method() === "POST")
          value = await service.create(req.postDataJSON(), staff);
        else if (!parts[1]) {
          const list =
            scenario === "first-run"
              ? []
              : scenario === "all-clear"
                ? [(await repo.get(waiting.id))!]
                : await repo.list();
          value = { items: list, total: list.length };
        } else if (req.method() === "PATCH") {
          if (rejectSave) {
            status = 409;
            value = {
              error: "A staff member saved this draft after you opened it.",
            };
          } else
            value = await service.edit(parts[1], req.postDataJSON(), staff);
        } else value = await service.forRead((await repo.get(parts[1]))!);
      } else if (parts[0] === "pricing_items" && scenario === "catalog-error") {
        status = 503;
        value = { error: "Catalog is temporarily unavailable" };
      } else if (req.method() === "POST") {
        const input = req.postDataJSON();
        value = { ...input, id: input.id ?? crypto.randomUUID() };
        await repo.put(parts[0] as any, value as any);
      } else value = await repo.entities(parts[0] as any);
    } catch (e) {
      status = (e as any).status ?? 400;
      value = { error: (e as Error).message };
    }
    await route.fulfill({ status, json: value });
  });
  // Real saved image path: draw in Workspace, save, reload, then open the countersign sheet.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/studio/workspace");
  const canvas = page.getByLabel("Draw stored company signature");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 50);
  await page.mouse.down();
  for (const [x, y] of [
    [45, 20],
    [35, 80],
    [70, 45],
    [90, 70],
    [115, 30],
    [135, 70],
    [180, 45],
    [220, 65],
    [270, 40],
  ])
    await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Use drawn signature", exact: true })
    .click();
  await page.getByLabel("Default link validity (days)").fill("45");
  await page
    .getByRole("button", { name: "Save workspace settings", exact: true })
    .click();
  await expect(
    page.getByText("Workspace settings saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save workspace settings", exact: true }),
  ).toBeEnabled();
  expect(settings.default_validity_days).toBe(45);
  expect(settings.company_signatory!.image!.length).toBeGreaterThan(1000);
  await page.reload();
  await expect(page.getByAltText("Stored company signature")).toHaveAttribute(
    "src",
    settings.company_signatory!.image!,
  );
  const raw = await readFile("public/fonts/InstrumentSans-Variable.woff2");
  await page
    .getByRole("checkbox", {
      name: "I confirm this font is licensed for PDF embedding.",
    })
    .check();
  await page
    .getByLabel("Upload a font file · WOFF2 or TTF, under 1 MB")
    .setInputFiles({
      name: "Studio Sans.woff2",
      mimeType: "font/woff2",
      buffer: raw,
    });
  await expect(
    page.getByRole("radio", { name: "Aa Studio Sans" }).last(),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save workspace settings", exact: true })
    .click();
  await expect(
    page.getByText("Workspace settings saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save workspace settings", exact: true }),
  ).toBeEnabled();
  expect(typeof settings.proposal_fonts?.body).toBe("object");
  const chosen = settings.proposal_fonts!.body;
  if (typeof chosen !== "string") {
    await page.locator("#fonts").scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page
        .locator(".font-preview p")
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily),
    ).toContain(`Proposal-${chosen.id}`);
  }
  await page.getByLabel("Accent color").fill("#aaddcc");
  await expect(
    page.getByRole("button", { name: "Save workspace settings", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /darker, same hue/ }).click();
  await expect(
    page.getByRole("button", { name: "Save workspace settings", exact: true }),
  ).toBeEnabled();
  await page.goto("/proposals?new=1");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Workspace validity default");
  await page
    .getByRole("combobox", { name: "Client", exact: true })
    .selectOption(draft.client.id);
  await page
    .getByRole("combobox", { name: "Template", exact: true })
    .selectOption(draft.template_id!);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.locator(".quote-workspace")).toBeVisible();
  const defaultDraft = (await repo.list()).find(
    (p) => p.title === "Workspace validity default",
  )!;
  expect(defaultDraft.valid_until).toBe(defaultValidUntil(settings));
  await page.goto(`/proposals/${signed.id}?action=countersign`);
  await expect(
    page.getByAltText("Alex Morgan's stored signature"),
  ).toHaveAttribute("src", settings.company_signatory!.image!);
  expect(
    await page
      .getByAltText("Alex Morgan's stored signature")
      .evaluate((el: HTMLImageElement) => el.naturalWidth),
  ).toBe(720);
  await page.keyboard.press("Escape");
  await page.goto("/studio/templates");
  await page
    .getByRole("button", { name: "+ New template", exact: true })
    .click();
  await page
    .getByLabel("Template name", { exact: true })
    .fill("Keep this template selected");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByText("Template saved", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Template name", { exact: true })).toHaveValue(
    "Keep this template selected",
  );
  const savedTemplate = (await repo.entities<any>("templates")).find(
    (t) => t.name === "Keep this template selected",
  );
  expect(savedTemplate).toBeTruthy();
  repo.catalog.get("templates")!.delete(savedTemplate.id);
  const dir = ".data/evidence/phase5";
  await mkdir(dir, { recursive: true });
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
  ) {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      name + " fits",
    ).toBe(true);
    const file = `${name}-${width}-${theme}.png`;
    await page.screenshot({
      path: `${dir}/${file}`,
      fullPage: name === "workspace",
    });
    captures.push({ file, frame, width, theme });
  }
  const image = settings.company_signatory!.image;
  const complete = await service.sign(
    completedClient.id,
    companyConsent(completedClient.revision, settings),
    "company",
    staff,
  );
  const failure = structuredClone(signed);
  failure.events = failure.events.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
  }));
  failure.id = crypto.randomUUID();
  failure.title = "A signed proposal with a PDF to retry";
  failure.jobs = [
    {
      id: crypto.randomUUID(),
      kind: "pdf",
      key: "fixture",
      payload: {},
      status: "failed",
      attempts: 2,
      last_error: "PDF rendering temporarily failed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any,
  ];
  await repo.save(failure, -1);
  const checkout = structuredClone(signed);
  checkout.events = checkout.events.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
  }));
  checkout.id = crypto.randomUUID();
  checkout.title = "A signed proposal awaiting payment setup";
  checkout.jobs = [];
  checkout.billing_links = [
    {
      provider: "stripe",
      status: "needs_review",
      attempts: 1,
      last_error: "Client has not completed Checkout",
      metadata: {
        requires_checkout: true,
        checkout_url: "https://checkout.stripe.com/test_fixture",
      },
    },
  ];
  await repo.save(checkout, -1);

  for (const theme of ["light", "dark"]) {
    await context.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      scenario = "normal";
      for (const [name, url, frame] of [
        ["templates", "/studio/templates", width === 768 ? "7f" : "7a"],
        ["catalog", "/studio/catalog", "7b"],
        ["connections", "/studio/connections", "7c"],
        ["workspace", "/studio/workspace", "7d"],
        ["activity", "/studio/activity", "7e"],
        ["studio", "/studio", "7g"],
      ]) {
        await page.goto(url);
        await expect(page.locator(".page-body .skeleton")).toHaveCount(0);
        await capture(name, frame, width, theme);
        if (name === "connections" && width === 1440) {
          const contrast = await page
            .locator(".sidebar footer > button.btn")
            .evaluateAll((buttons) =>
              buttons.map((button) => {
                const style = getComputedStyle(button),
                  parent = getComputedStyle(button.closest(".sidebar")!);
                const rgb = (value: string) =>
                  value
                    .match(/[\d.]+/g)!
                    .slice(0, 3)
                    .map(Number);
                const luminance = (rgb: number[]) => {
                  const c = rgb
                    .map((n) => n / 255)
                    .map((n) =>
                      n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
                    );
                  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
                };
                const front = luminance(rgb(style.color));
                const back = luminance(
                  rgb(
                    style.backgroundColor === "rgba(0, 0, 0, 0)"
                      ? parent.backgroundColor
                      : style.backgroundColor,
                  ),
                );
                return (
                  (Math.max(front, back) + 0.05) /
                  (Math.min(front, back) + 0.05)
                );
              }),
            );
          for (const ratio of contrast)
            expect(ratio).toBeGreaterThanOrEqual(4.5);
        }
        if (name === "templates") {
          await page.locator(".contract-clause-list button").last().click();
          await expect(
            page.getByRole("textbox", { name: "Clause body", exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole("textbox", { name: "Clause heading", exact: true }),
          ).toHaveValue("4.4 Own It Over Time");
          await expect(
            page.getByRole("radio", { name: "Only when…", exact: true }),
          ).toBeChecked();
          await capture(
            "template-clause",
            width === 768 ? "7f" : "7a",
            width,
            theme,
          );
          if (width < 1100) await page.keyboard.press("Escape");
        }
        if (name === "catalog") {
          await page
            .locator(".catalog-row")
            .filter({ hasText: "Over Time" })
            .first()
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await capture("catalog-terms", "7b", width, theme);
          await page.keyboard.press("Escape");
        }
        if (name === "workspace") {
          for (const section of ["fonts", "client-links", "team"]) {
            await page.locator(`#${section}`).scrollIntoViewIfNeeded();
            await capture(`workspace-${section}`, "7d", width, theme);
          }
        }
      }
      for (const [state, frame] of [
        ["first-run", "8a"],
        ["all-clear", "8b"],
      ]) {
        scenario = state;
        await page.goto("/");
        await expect(page.locator(".home-v4")).toBeVisible();
        await capture(state, frame, width, theme);
      }
      scenario = "loading";
      await page.goto("/proposals");
      await expect(
        page.getByRole("status", { name: "Loading your workspace…" }),
      ).toBeVisible();
      await capture("loading", "8c", width, theme);
      scenario = "normal";
      release?.();
      await page.goto(`/proposals/${editing.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      await context.setOffline(true);
      await page
        .getByLabel("Proposal title", { exact: true })
        .fill(`My offline title ${width} ${theme}`);
      await expect(
        page.getByText("Your changes are kept on this device.", {
          exact: false,
        }),
      ).toBeVisible();
      await capture("editor-offline", "8e", width, theme);
      await context.setOffline(false);
      await expect(
        page.getByText("All changes saved", { exact: true }),
      ).toBeVisible();
      rejectSave = true;
      await page
        .getByLabel("Proposal title", { exact: true })
        .fill(`My conflict title ${width} ${theme}`);
      await expect(
        page.getByText("This draft changed elsewhere", { exact: true }),
      ).toBeVisible();
      await capture("editor-conflict", "8f", width, theme);
      rejectSave = false;
      await page.getByRole("button", { name: "Reload and keep mine" }).click();
      await expect(
        page.getByText("Your unsaved edits were kept as a suggestion.", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Keep current draft", exact: true })
        .click();
      const aiDraft = (await repo.get(editing.id))!;
      aiDraft.ai_unreviewed = true;
      await repo.save(aiDraft, aiDraft.revision);
      await page.goto(`/proposals/${editing.id}`);
      await expect(
        page.getByText("Assistant draft — ready for your review", {
          exact: true,
        }),
      ).toBeVisible();
      await capture("ai-draft-review", "8d", width, theme);
      scenario = "catalog-error";
      await page.goto(`/proposals/${editing.id}`);
      await expect(
        page.getByText(
          "We couldn’t load the catalog. Your saved lines are unchanged.",
        ),
      ).toBeVisible();
      await capture("catalog-error", "8g", width, theme);
      scenario = "normal";
      for (const [name, p, frame] of [
        ["pdf-failed", failure, "8h"],
        ["checkout-pending", checkout, "8i"],
        ["already-countersigned", complete, "8j"],
      ] as const) {
        await page.goto(
          `/proposals/${p.id}${name === "already-countersigned" ? "?action=countersign" : ""}`,
        );
        await expect(page.locator(".record-v4")).toBeVisible();
        if (name === "already-countersigned")
          await expect(
            page.getByText(/already countersigned this at/),
          ).toBeVisible();
        await expect(page.locator(".timeline")).not.toContainText(
          "consent_given",
        );
        await expect(page.locator(".timeline")).toContainText(
          "Client gave consent",
        );
        await capture(name, frame, width, theme);
      }
      await page.goto("/studio/connections?view=assistants");
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture("assistant-offline", "8k", width, theme);
      await page.keyboard.press("Escape");
      await page.goto(`/proposals/${editing.id}?view=send`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      if (width < 1100)
        await page
          .getByRole("button", { name: "Review & send", exact: true })
          .click();
      await capture("send-checks", "8l", width, theme);
      if (width < 1100) await page.keyboard.press("Escape");
      await page.goto(`/proposals/${signed.id}?action=countersign`);
      await expect(
        page.getByAltText("Alex Morgan's stored signature"),
      ).toBeVisible();
      await capture("stored-signature", "7d", width, theme);
      await page.keyboard.press("Escape");
      settings.company_signatory!.image = null;
      await page.goto(`/proposals/${signed.id}?action=countersign`);
      await expect(
        page.getByText("No signature saved — add one in Workspace", {
          exact: true,
        }),
      ).toBeVisible();
      await capture("missing-signature", "7d", width, theme);
      await page.keyboard.press("Escape");
      settings.company_signatory!.image = image;
    }
  }
  const refs = await context.newPage();
  for (const [file, frames] of [
    [
      "Redesign 07 - Studio.dc.html",
      ["7a", "7b", "7c", "7d", "7e", "7f", "7g"],
    ],
    [
      "Redesign 08 - States.dc.html",
      Array.from({ length: 18 }, (_, i) => "8" + String.fromCharCode(97 + i)),
    ],
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
