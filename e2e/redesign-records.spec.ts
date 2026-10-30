import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setup, staff, clientActor, signature } from "../tests/helpers";
import { companyConsent } from "../tests/helpers";
import { signatoryVersion } from "../src/lib/company-signatory";
import { proposalAction } from "../src/lib/proposal-actions";
import { saveClient, DuplicateClient } from "../src/lib/clients";
import { publicResult } from "../src/lib/service";
import type { Proposal, Client } from "../src/lib/model";
import { defaultValidUntil } from "../src/lib/validity";
test("Phase 4: records, guarded countersign, list actions, clients, indefinite dates and Studio across widths/themes", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(12000);
  const { repo, service, draft, settings, members } = await setup();
  const delegate = {
    ...staff,
    actor: "staff:00000000-0000-4000-8000-000000000002",
    staff_name: "Riley Adams",
    staff_email: "riley@example.test",
  };
  settings.company_signatory!.authorized_user_ids.push(delegate.actor.slice(6));
  await repo.put("workspace_settings", settings);
  members.push({
    user_id: delegate.actor.slice(6),
    display_name: delegate.staff_name,
    name: delegate.staff_name,
    email: delegate.staff_email,
    role: "member",
  });
  let sent = await service.send(draft.id, staff),
    signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  signed.billing_links = [
    {
      provider: "qbo",
      status: "needs_review",
      attempts: 0,
      last_error: "Invoice manually: no QuickBooks mapping",
      metadata: { action: "Invoice manually" },
    },
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      metadata: { requires_checkout: false },
    },
  ];
  await repo.save(signed, signed.revision);
  const create = async (
    title: string,
    valid_until: string | null | undefined = undefined,
  ) =>
    service.create(
      {
        client_id: draft.client.id,
        template_id: draft.template_id!,
        title,
        valid_until,
      },
      staff,
    );
  let ai = await create("A care plan to review");
  ai.ai_unreviewed = true;
  ai.events[0].actor = "ai:Example assistant";
  await repo.save(ai, ai.revision);
  const waiting = await service.send(
    (await create("Hosting renewal")).id,
    staff,
  );
  await service.view(waiting.token!, "", clientActor);
  const indefinite = await service.send(
    (await create("An open-ended proposal", null)).id,
    staff,
  );
  const unused: Client = {
    ...draft.client,
    id: randomUUID(),
    company: "Unused Client",
    email: "unused@example.test",
  };
  await repo.put("clients", unused);
  let stale = false,
    rejectInvoice = false,
    signCalls = 0,
    createCalls = 0;
  const billing = {
    available: true,
    subscriber: true,
    items: [
      {
        id: "si_1",
        name: "Managed hosting",
        amount: 10000,
        currency: "USD",
        interval: "month",
        interval_count: 1,
        qty: 1,
      },
      {
        id: "si_2",
        name: "Website care",
        amount: 8500,
        currency: "USD",
        interval: "month",
        interval_count: 1,
        qty: 1,
      },
    ],
    card: "Visa ending 4242",
    next_invoice: "2026-11-29T12:00:00Z",
    stripe_url: "https://dashboard.stripe.com/test/customers/cus_fixture",
    qbo_url: null,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
        .split("/")
        .filter(Boolean)
        .slice(1);
    let value: unknown = {},
      status = 200;
    try {
      if (path[0] === "auth")
        value = {
          user: delegate,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: signatoryVersion(settings),
        };
      else if (path[0] === "proposals") {
        if (!path[1]) {
          if (request.method() === "POST") {
            createCalls++;
            value = await service.create(request.postDataJSON(), delegate);
            status = 201;
          } else
            value = {
              items: (await repo.list()).map((p) => ({
                ...p,
                version_count: p.versions.length,
                versions: [],
              })),
              total: (await repo.list()).length,
            };
        } else if (path[2] === "actions") {
          if (
            rejectInvoice &&
            request.postDataJSON().action === "invoice_manually"
          ) {
            status = 409;
            value = { error: "Proposal changed; reload and try again" };
          } else
            value = await proposalAction(
              repo,
              path[1],
              request.postDataJSON().revision,
              request.postDataJSON().action,
              delegate,
              request.postDataJSON().note,
              new Date(),
              service,
            );
        } else if (path[2] === "countersign") {
          signCalls++;
          if (stale) {
            status = 409;
            value = { error: "Proposal changed; reload before signing" };
          } else
            value = await service.sign(
              path[1],
              request.postDataJSON(),
              "company",
              delegate,
            );
        } else if (path[2] === "preview") {
          const { previewResult } = await import("../src/lib/preview");
          value = previewResult((await repo.get(path[1]))!, settings);
        } else if (request.method() === "PATCH")
          value = await service.edit(path[1], request.postDataJSON(), delegate);
        else value = await service.forRead((await repo.get(path[1]))!);
      } else if (path[0] === "clients") {
        if (path[2] === "billing") value = billing;
        else if (request.method() === "DELETE") {
          await repo.deleteClient(path[1], delegate);
          value = { deleted: true };
        } else if (request.method() === "POST")
          value = await saveClient(repo, {
            ...request.postDataJSON(),
            id: request.postDataJSON().id ?? randomUUID(),
          });
        else value = await repo.entities("clients");
      } else if (path[0] === "public") {
        const p = (await repo.byToken(path[1]))!;
        value =
          path[2] === "brand"
            ? {
                ...publicResult(p).company,
                contact: publicResult(p).contact,
                ended: null,
              }
            : publicResult(p);
      } else if (
        [
          "pricing_items",
          "templates",
          "content_library",
          "custom_families",
          "workspace_documents",
          "workspace_events",
        ].includes(path[0])
      )
        value = await repo.entities(path[0] as any);
      else value = [];
    } catch (e) {
      status = (e as any).status ?? 400;
      value = {
        error: (e as Error).message,
        ...(e instanceof DuplicateClient
          ? { existing_client: e.existing }
          : {}),
      };
    }
    await route.fulfill({ status, json: value });
  });
  const dir = ".data/evidence/phase4";
  await mkdir(dir, { recursive: true });
  const captures: any[] = [];
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
      name + " fits " + width,
    ).toBe(true);
    const file = `${name}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: false });
    captures.push({ file, frame, width, theme });
  }
  for (const theme of ["light", "dark"]) {
    await context.addInitScript((t) => {
      localStorage.setItem("proposal-theme", t);
      if (document.documentElement) document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, url, frame] of [
        ["home", "/", width === 1440 ? "3d" : width === 768 ? "3e" : "3f"],
        [
          "proposals",
          "/proposals",
          width === 1440 ? "6a" : width === 768 ? "6b" : "6c",
        ],
        [
          "client",
          `/clients/${draft.client.id}`,
          width === 1440 ? "6d" : width === 768 ? "6e" : "6f",
        ],
        [
          "record",
          `/proposals/${signed.id}`,
          width === 1440 ? "3a" : width === 768 ? "3b" : "3c",
        ],
      ]) {
        await page.goto(url);
        await expect(
          page.getByText("Loading your workspace…", { exact: true }),
        ).toHaveCount(0);
        await capture(name, frame, width, theme);
        if (name === "proposals") {
          await page
            .locator(".proposal-row")
            .first()
            .getByRole("button", { name: /More actions/ })
            .click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await capture("proposal-menu", frame, width, theme);
          await page.keyboard.press("Escape");
        }
        if (name === "record") {
          await page
            .getByRole("button", { name: "Mark as invoiced", exact: true })
            .click();
          await expect(
            page.getByRole("dialog", { name: "Mark as invoiced", exact: true }),
          ).toBeVisible();
          await capture("manual-invoice", frame, width, theme);
          await page.keyboard.press("Escape");
        }
      }
      await page.goto(`/proposals/${signed.id}?action=countersign`);
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("heading", { level: 2 })).toBeFocused();
      await expect(
        sheet.getByRole("button", { name: "Countersign as Alex Morgan" }),
      ).toBeDisabled();
      await expect(
        sheet.getByText("Signing on behalf of Alex Morgan", { exact: true }),
      ).toBeVisible();
      await capture("countersign", "3a–3c countersign sheet", width, theme);
      await sheet.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await capture(
        "countersign-consent",
        "3a–3c authorization and consent",
        width,
        theme,
      );
      await page.keyboard.press("Escape");
      await expect(page).not.toHaveURL(/action=countersign/);
      await page.goto("/proposals?new=1");
      await expect(
        page.getByRole("dialog", { name: "New proposal", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Title", { exact: true }).fill("Keep this title");
      await page
        .getByRole("combobox", { name: "Template", exact: true })
        .selectOption(draft.template_id!);
      await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue(
        defaultValidUntil(settings).slice(0, 10),
      );
      await page
        .getByRole("button", { name: "Clear valid until; never expires" })
        .click();
      await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue(
        "",
      );
      await capture("indefinite-new", "New proposal validity", width, theme);
      await page
        .getByRole("button", { name: "Create new client instead" })
        .click();
      const nested = page.getByRole("dialog", {
        name: "New client",
        exact: true,
      });
      await expect(nested).toBeVisible();
      await capture(
        "inline-client",
        "Nested client modal / phone sheet",
        width,
        theme,
      );
      await nested
        .getByLabel("Company", { exact: true })
        .fill("Duplicate check");
      await nested
        .getByLabel("Email", { exact: true })
        .fill(draft.client.email);
      await nested
        .getByRole("button", { name: "Create client", exact: true })
        .click();
      await expect(
        nested.getByRole("button", { name: "Use the existing client" }),
      ).toBeVisible();
      await nested
        .getByRole("button", { name: "Use the existing client" })
        .click();
      await expect(
        page.getByRole("combobox", { name: "Client", exact: true }),
      ).toHaveValue(draft.client.id);
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        "Keep this title",
      );
      await expect(
        page.getByRole("combobox", { name: "Template", exact: true }),
      ).toHaveValue(draft.template_id!);
      await expect(page.getByLabel("Valid until", { exact: true })).toHaveValue(
        "",
      );
      expect(createCalls).toBe(0);
      await page
        .getByRole("button", { name: "Create new client instead" })
        .click();
      await expect(
        page.getByRole("dialog", { name: "New client", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "New proposal", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
        "Keep this title",
      );
      await page.keyboard.press("Escape");
      if (width === 375) {
        await page.getByRole("link", { name: "Studio", exact: true }).click();
        await expect(page.locator(".studio-page")).toBeVisible();
      } else if (width === 768) {
        await page
          .getByRole("button", { name: "Studio", exact: true })
          .filter({ visible: true })
          .click();
        await expect(page.locator(".studio-popover")).toBeVisible();
      } else await expect(page.locator(".desktop-studio")).toBeVisible();
      await capture("studio", "Responsive Studio navigation", width, theme);
      await page.goto(`/clients/${unused.id}`);
      await expect(
        page.getByText("Loading your workspace…", { exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "More actions for Unused Client" })
        .click();
      await page
        .getByRole("button", { name: "Delete client", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Delete Unused Client?" }),
      ).toBeVisible();
      await capture(
        "delete-client",
        "Client detail actions extension",
        width,
        theme,
      );
      await page.keyboard.press("Escape");
      await page.goto(`/p/${indefinite.token}`);
      await expect(page.locator(".client-flow")).toBeVisible();
      await expect(page.getByText(/Valid until/)).toHaveCount(0);
      await capture(
        "indefinite-client",
        "1a–1c / indefinite state",
        width,
        theme,
      );
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await expect(page.getByText(/Valid until/)).toHaveCount(0);
      await capture(
        "indefinite-sign",
        "Client sign summary without expiry",
        width,
        theme,
      );
    }
  }
  await page.goto("/proposals?new=1");
  await page
    .getByLabel("Title", { exact: true })
    .fill("Keep entries after creating client");
  await page.getByRole("button", { name: "Create new client instead" }).click();
  const createDialog = page.getByRole("dialog", {
    name: "New client",
    exact: true,
  });
  await createDialog
    .getByLabel("Company", { exact: true })
    .fill("New inline company");
  await createDialog
    .getByLabel("Email", { exact: true })
    .fill("inline@example.test");
  await createDialog
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(createDialog).toHaveCount(0);
  const inlineClient = (await repo.entities<Client>("clients")).find(
    (c) => c.email === "inline@example.test",
  )!;
  await expect(
    page.getByRole("combobox", { name: "Client", exact: true }),
  ).toHaveValue(inlineClient.id);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep entries after creating client",
  );
  expect(createCalls).toBe(0);
  await page.keyboard.press("Escape");
  // Stale legal action stays blocked until explicit close/review; never silently retries.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${signed.id}?action=countersign`);
  stale = true;
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("checkbox").nth(0).check();
  await sheet.getByRole("checkbox").nth(1).check();
  await sheet
    .getByRole("button", { name: "Countersign as Alex Morgan" })
    .click();
  await expect(
    sheet.getByText(
      "This proposal changed. Review the current record before signing.",
    ),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Countersign as Alex Morgan" }),
  ).toBeDisabled();
  expect(signCalls).toBe(1);
  await capture("countersign-stale", "3a guarded stale sheet", 1440, "dark");
  await page.keyboard.press("Escape");
  stale = false;
  await page.goto("/proposals?view=needs-countersign");
  const signLink = page.getByRole("link", { name: /^Sign Acme/ });
  await expect(signLink).toHaveAttribute(
    "href",
    `/proposals/${signed.id}?action=countersign`,
  );
  await signLink.click();
  await expect(page.locator(".record-v4")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("checkbox").nth(0).check();
  await page.getByRole("dialog").getByRole("checkbox").nth(1).check();
  await page
    .getByRole("button", { name: "Countersign as Alex Morgan" })
    .click();
  await expect(
    page.getByText("Sealing the final copy…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  signed = (await repo.get(signed.id))!;
  expect(signed.signers.find((s) => s.role === "company")?.actor).toBe(
    delegate.actor,
  );
  await page
    .getByRole("link", { name: "Back to proposals", exact: false })
    .click();
  await expect(page).toHaveURL(/view=needs-countersign/);
  await expect(page.getByRole("link", { name: /^Sign Acme/ })).toHaveCount(0);
  await page.goto(`/proposals/${signed.id}?action=countersign`);
  await expect(
    page.getByText(/Riley Adams already countersigned this at/),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(signCalls).toBe(2);
  await page.goto(`/proposals/${signed.id}`);
  await page
    .getByRole("button", { name: "Mark as invoiced", exact: true })
    .click();
  const invoiceDialog = page.getByRole("dialog", {
    name: "Mark as invoiced",
    exact: true,
  });
  await invoiceDialog
    .getByLabel("Invoice reference (optional)")
    .fill("INV-KEEP");
  rejectInvoice = true;
  await invoiceDialog
    .getByRole("button", { name: "Mark as invoiced", exact: true })
    .click();
  await expect(
    invoiceDialog.getByText("Proposal changed; reload and try again", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    invoiceDialog.getByLabel("Invoice reference (optional)"),
  ).toHaveValue("INV-KEEP");
  rejectInvoice = false;
  await invoiceDialog
    .getByRole("button", { name: "Mark as invoiced", exact: true })
    .click();
  await expect(invoiceDialog).toHaveCount(0);
  // Archived rows disappear from All but the undo toast survives their removal.
  await page.goto("/proposals?view=drafts");
  await page
    .getByRole("button", { name: `More actions for ${ai.client.company}` })
    .click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator(".phase4-toast")).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Open ${ai.client.company}: ${ai.title}` }),
  ).toHaveCount(0);
  await page
    .locator(".phase4-toast")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: `Open ${ai.client.company}: ${ai.title}` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `More actions for ${ai.client.company}` })
    .click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.goto("/proposals?view=archived");
  await page
    .getByRole("link", { name: `Open ${ai.client.company}: ${ai.title}` })
    .click();
  await expect(page.locator(".record-v4")).toBeVisible();
  await expect(page.locator(".quote-workspace")).toHaveCount(0);
  await page
    .getByRole("button", { name: `More actions for ${ai.client.company}` })
    .click();
  await page.getByRole("button", { name: "Unarchive", exact: true }).click();
  await expect(page.locator(".quote-workspace")).toBeVisible();
  await page.goto(`/clients/${draft.client.id}`);
  await page
    .locator(".client-detail-v4 > header")
    .getByRole("button", { name: `More actions for ${draft.client.company}` })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete client", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Has 4 proposals — archive them or keep the client/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/proposals?view=viewed");
  await page
    .getByRole("button", { name: `More actions for ${draft.client.company}` })
    .click();
  await page.getByRole("button", { name: "Mark as lost", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.goto("/proposals?view=lost");
  await page
    .getByRole("button", { name: `More actions for ${draft.client.company}` })
    .click();
  const reopen = page.getByRole("button", { name: /^Mark as sent again/ });
  await expect(reopen).toBeEnabled();
  await reopen.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(async () => (await repo.get(waiting.id))!.status)
    .toBe("sent");
  const refs = await context.newPage();
  for (const [file, frames] of [
    [
      "Redesign 03 - Record and Home.dc.html",
      ["3a", "3b", "3c", "3d", "3e", "3f"],
    ],
    [
      "Redesign 06 - Proposals and Clients.dc.html",
      ["6a", "6b", "6c", "6d", "6e", "6f"],
    ],
  ] as const) {
    await refs.goto(`http://127.0.0.1:4176/${encodeURIComponent(file)}`);
    await expect(refs.locator(`[id="${frames[0]}"]`)).toBeVisible();
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
      if (file.includes("03")) {
        await refs
          .locator('[id="3a"]')
          .getByRole("button", { name: "Countersign", exact: true })
          .click();
        for (const frame of ["3a", "3b", "3c"])
          await refs
            .locator(`[id="${frame}"]`)
            .locator(":scope > div")
            .nth(1)
            .screenshot({
              path: `${dir}/reference-countersign-${frame}-${theme}.png`,
            });
        await refs
          .getByRole("button", { name: "Close", exact: true })
          .first()
          .click();
      }
    }
  }
  await refs.close();
  await writeFile(`${dir}/manifest.json`, JSON.stringify(captures, null, 2));
  await writeFile(
    `${dir}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Phase 4 review</title><style>body{font:15px system-ui;margin:24px;background:#e7e3db;color:#1c1b18}section{margin:30px 0}.pair{display:flex;gap:16px;align-items:flex-start;overflow:auto}.pair img{max-width:min(100%,720px);border:1px solid #aaa}h2{margin:0 0 8px}small{display:block}</style><h1>Phase 4: implementation and matching design frames</h1><p>Fixture data only. Each implementation at 375/768/1440, light and dark, with reference frame beside it. Validity, inline client and Studio extend the specified frames.</p>${captures.map((c) => `<section><h2>${c.file}</h2><small>${c.frame}</small><div class="pair"><img src="${c.file}">${/^[36][a-f]$/.test(c.frame) ? `<img src="reference-${c.frame}-${c.theme}.png">` : ""}</div></section>`).join("")}`,
  );
});
