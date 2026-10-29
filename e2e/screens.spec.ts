import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { setup, staff, clientActor, signature } from "../tests/helpers";
import { publicResult } from "../src/lib/service";
import type { Proposal } from "../src/lib/model";
test("all screen states in both themes, with explicit visual fixtures", async ({
  page,
}) => {
  test.setTimeout(240000);
  const { repo, service, draft } = await setup();
  draft.workspace_settings = {
    ...draft.workspace_settings!,
    company_name: "Example Studio",
    owner: "Alex Morgan",
    email: "alex@example.test",
    email_sender_name: "Example Studio",
    email_sender_address: "proposals@example.test",
    client_url: "http://127.0.0.1:3100",
  };
  draft.title = "A better website for Acme";
  draft.brief = "Refresh the website and establish a clear monthly care plan.";
  draft.ai_unreviewed = true;
  draft.ai_connector = "Example assistant";
  await repo.save(draft, draft.revision);
  const sent = await service.send(draft.id, staff, true);
  const viewed = await service.view(sent.token!, "", clientActor);
  const signed = await service.sign(
    draft.id,
    signature(viewed.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const completed = await service.sign(
    draft.id,
    signature(signed.revision, "alex@example.test"),
    "company",
    staff,
  );
  const archive: Proposal = {
    ...completed,
    id: "00000000-0000-4000-8000-000000000099",
    source: "proposify_import",
    status: "archived",
    token: null,
    search_text:
      "Historical agreement. Website strategy, delivery and ongoing support.",
    jobs: [],
    billing_links: [],
  };
  let active: Proposal = draft,
    clientState = "reading";
  const entities: Record<string, unknown> = {
    clients: [draft.client],
    pricing_items: await repo.entities("pricing_items"),
    templates: await repo.entities("templates"),
    content_library: [
      {
        id: "00000000-0000-4000-8000-000000000088",
        name: "Delivery approach",
        block: {
          type: "paragraph",
          text: "We review progress together at each milestone.",
        },
      },
    ],
    custom_families: [],
    workspace_documents: [
      {
        id: "00000000-0000-4000-8000-000000000077",
        name: "Pricing reference",
        version: "v1",
        format: "markdown",
        content: "Use entered prices. Always review custom scope.",
      },
    ],
    assistants: [
      {
        id: "00000000-0000-4000-8000-000000000066",
        name: "Example assistant",
        scopes: ["proposals:read", "proposals:draft"],
        last_used: new Date().toISOString(),
        revoked: false,
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.split("/").filter(Boolean).slice(1);
    let value: unknown = {},
      status = 200;
    if (path[0] === "public") {
      if (path[2] === "brand")
        value = {
          name: "Example Studio",
          email: "alex@example.test",
          accent_colour: "#365c4a",
          logo: null,
        };
      else if (clientState === "password") {
        value = { error: "Password required" };
        status = 401;
      } else if (clientState === "ended") {
        value = { error: "Link expired" };
        status = 410;
      } else if (path[2] === "quote" && clientState === "stale") {
        value = { error: "Quote changed; reload" };
        status = 409;
      } else {
        const p = structuredClone(
          clientState === "completed"
            ? completed
            : ["signed", "billing"].includes(clientState)
              ? signed
              : viewed,
        );
        if (clientState === "billing")
          p.billing_links = [
            {
              provider: "stripe",
              status: "succeeded",
              attempts: 1,
              metadata: {
                requires_checkout: true,
                checkout: [
                  {
                    id: "cs_fixture",
                    url: "https://checkout.stripe.com/test-fixture",
                    line_ids: [],
                  },
                ],
              },
            },
          ];
        if (clientState === "signed")
          p.billing_links = [
            {
              provider: "stripe",
              status: "succeeded",
              attempts: 1,
              metadata: {
                added_existing: [
                  { id: "sub_fixture", monthly_total: 20000, line_ids: [] },
                ],
              },
            },
          ];
        value = publicResult(p);
      }
    } else if (path[0] === "auth")
      value = { user: staff, settings: draft.workspace_settings };
    else if (path[0] === "proposals")
      value = path[1]
        ? active
        : {
            items: [signed, draft, viewed, completed, archive].map((p, i) => ({
              ...p,
              id: `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
            })),
            total: 5,
          };
    else value = entities[path[0]] ?? [];
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
  const root = ".data/evidence/screens";
  await mkdir(root, { recursive: true });
  const files: string[] = [];
  async function capture(
    name: string,
    url: string,
    phone = false,
    prepare?: () => Promise<void>,
  ) {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize(
        phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await page.addInitScript(
        (t) => localStorage.setItem("proposal-theme", t),
        theme,
      );
      await page.goto(url);
      await expect(page.getByText("Loading your workspace…")).toHaveCount(0);
      await expect(page.getByText("Opening your proposal…")).toHaveCount(0);
      if (prepare) await prepare();
      await page.evaluate(() => document.fonts.ready);
      const file = `${name}-${phone ? "phone" : "desktop"}-${theme}.png`;
      await page.screenshot({ path: `${root}/${file}`, fullPage: true });
      files.push(file);
      expect(await page.locator("body").innerText()).not.toContain(
        "Application error",
      );
    }
  }
  await capture("login", "/login");
  for (const [name, url] of [
    ["dashboard", "/"],
    ["proposals", "/proposals"],
    ["new", "/proposals/new"],
    ["editor", `/proposals/${draft.id}/edit`],
    ["send", `/proposals/${draft.id}/send`],
    ["clients", "/clients"],
    ["client-detail", `/clients/${draft.client.id}`],
    ["catalogue", "/catalogue"],
    ["templates", "/templates"],
    ["template-editor", `/templates/${draft.template_id}/edit`],
    ["content-library", "/library"],
    ["imports", "/imports"],
    ["settings", "/settings"],
    ["assistants", "/settings/ai"],
    ["integrations", "/integrations"],
  ])
    await capture(name, url);
  active = signed;
  await capture("record", `/proposals/${draft.id}`);
  await capture("countersign", `/proposals/${draft.id}/countersign`);
  active = completed;
  await capture("audit", `/proposals/${draft.id}/audit`);
  active = archive;
  await capture("archive", `/archives/${archive.id}`);
  for (const state of [
    "password",
    "reading",
    "stale",
    "sign",
    "billing",
    "signed",
    "completed",
    "ended",
  ]) {
    clientState = state;
    for (const phone of [true, false])
      await capture(`client-${state}`, `/p/${sent.token}`, phone, async () => {
        if (state === "sign")
          await page.getByRole("button", { name: "Accept & sign" }).click();
        if (state === "stale") {
          await page.getByRole("checkbox").first().uncheck();
          await expect(
            page.getByText("This proposal changed while you were reading it"),
          ).toBeVisible();
        }
      });
  }
  await writeFile(
    `${root}/manifest.json`,
    JSON.stringify(
      {
        note: "Visual fixtures rendered by the real application; provider-specific states are mocked, not evidence of provider acceptance.",
        files,
      },
      null,
      2,
    ),
  );
});
