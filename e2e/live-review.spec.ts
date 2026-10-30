import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setup, staff } from "../tests/helpers";
import {
  saveClient,
  DuplicateClient,
  linkStripeCustomer,
} from "../src/lib/clients";
import { clientBilling } from "../src/lib/client-billing";
import { activity } from "../src/lib/studio";
import { ProposalService } from "../src/lib/service";
import { signatoryVersion } from "../src/lib/company-signatory";
import { ItemSchema } from "../src/lib/model";
import { curatedFonts } from "../src/lib/proposal-fonts";
import type { Client } from "../src/lib/model";
import type { StripeTransport } from "../src/lib/catalog";
test("Live review: customer, contacts, setup, shared controls, products and font evidence", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(12000);
  const { repo, service, draft, settings, members } = await setup();
  const address = {
    line1: "123 Main Street",
    line2: "Suite 2",
    city: "Charlotte",
    region: "NC",
    postal_code: "28202",
    country: "US",
  };
  const client = await saveClient(repo, {
    ...draft.client,
    title: "Director",
    phone: "7045550123",
    address,
  });
  const single = await saveClient(repo, {
    ...client,
    id: randomUUID(),
    company: "Harbor Dental",
    email: "dana@example.test",
    first_name: "Dana",
    last_name: "Okafor",
    phone: "+44 20 7946 0018",
  });
  const empty = await saveClient(repo, {
    ...client,
    id: randomUUID(),
    company: "New Company",
    email: "pat@example.test",
    first_name: "Pat",
    last_name: "Lee",
    phone: "",
    address: {},
  });
  const sent = await service.send(draft.id, staff);
  await service.view(sent.token!, "", {
    actor: "client",
    ip: "203.0.113.10",
    user_agent: "Test",
  });
  const api: StripeTransport = {
    get: async <T>(path: string, params: Record<string, string>) => {
      if (path === "/v1/customers")
        return {
          data: [
            { email: client.email, prefix: "acme", count: 3 },
            { email: single.email, prefix: "harbor", count: 1 },
          ].flatMap((group) =>
            Array.from({ length: group.count }, (_, i) => ({
              id: `cus_${group.prefix}${i}`,
              email: group.email,
              name:
                i === 0
                  ? "Main account"
                  : i === 1
                    ? "Previous account"
                    : "Marketing account",
              created: 1700000000 + i * 864000,
              livemode: false,
            })),
          ),
          has_more: false,
        } as T;
      if (path.startsWith("/v1/customers/"))
        return {
          id: path.split("/").at(-1),
          name: "Main account",
          created: 1700000000,
          email: path.includes("harbor") ? single.email : client.email,
          livemode: false,
          invoice_settings: {
            default_payment_method: {
              card: {
                brand: "Visa",
                last4: path.endsWith("0") ? "4242" : "1881",
              },
            },
          },
        } as T;
      return {
        data: [
          {
            id: "sub_one",
            livemode: false,
            status: "active",
            current_period_end: 1796000000,
            items: {
              data: [
                {
                  id: "si_one",
                  quantity: 1,
                  price: {
                    unit_amount: 10000,
                    currency: "usd",
                    lookup_key: "hosted-standard-100",
                    nickname: "Managed hosting",
                    recurring: { interval: "month", interval_count: 1 },
                  },
                },
              ],
            },
          },
        ],
        has_more: false,
      } as T;
    },
    post: async () => {
      throw new Error("No provider writes in UI checks");
    },
  };
  const editing = await service.create(
    {
      client_id: client.id,
      template_id: draft.template_id!,
      title: "Contact address field",
      content: [
        { type: "heading", text: "Your contact details" },
        { type: "paragraph", text: "{{client.address}}" },
        { type: "pricing_table" },
        { type: "signature_block", role: "client" },
        { type: "signature_block", role: "company" },
      ],
    },
    staff,
  );
  const checkedService = new ProposalService(
    repo,
    undefined,
    async () => members,
    api,
  );
  let billingUnavailable = false,
    firstRun = false,
    setupMode = "partial",
    qbo = false;
  const products = [
    ["Design project", "one_time", null, null],
    ["Consulting session", "one_time", null, "qbo_design"],
    ["Managed hosting", "month", "hosting", null],
    ["Support plan", "month", null, null],
  ].map(([name, interval, stripe_lookup_key, qbo_item_ref], n) =>
    ItemSchema.parse({
      id: randomUUID(),
      sku: `review-${n}`,
      name,
      interval,
      stripe_lookup_key,
      qbo_item_ref,
      amount: 10000,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
        .split("/")
        .filter(Boolean)
        .slice(1);
    let value: unknown = [],
      status = 200;
    try {
      if (path[0] === "auth")
        value = {
          user: staff,
          settings,
          staff: members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: signatoryVersion(settings),
        };
      else if (path[0] === "connections")
        value = {
          stripe: setupMode !== "empty",
          qbo,
          email: true,
          mock: false,
        };
      else if (path[0] === "assistants")
        value =
          setupMode === "complete"
            ? [
                {
                  id: "review-assistant",
                  name: "Studio assistant",
                  revoked: false,
                  scopes: [],
                },
              ]
            : [];
      else if (path[0] === "pricing_items")
        value = setupMode === "empty" ? [] : products;
      else if (path[0] === "workspace-fonts") value = [];
      else if (path[0] === "templates")
        value = (await repo.entities<any>("templates")).map((t) => ({
          ...t,
          default_quote: [],
          default_items: [],
        }));
      else if (path[0] === "clients") {
        const c = (await repo.entities<Client>("clients")).find(
          (c) => c.id === path[1],
        );
        if (path[2] === "billing") {
          if (billingUnavailable)
            throw new Error("Test fixture: billing read unavailable");
          value = await clientBilling(repo, c!, api);
        } else if (path[2] === "stripe-customer") {
          const input = request.postDataJSON();
          value = await linkStripeCustomer(
            repo,
            c!.id,
            input.customer_id,
            input.expected_customer_id,
            staff,
            api,
          );
        } else if (request.method() === "POST")
          value = await saveClient(repo, {
            ...request.postDataJSON(),
            id: request.postDataJSON().id ?? randomUUID(),
          });
        else if (request.method() === "DELETE") {
          await repo.deleteClient(path[1], staff);
          value = { deleted: true };
        } else value = await repo.entities("clients");
      } else if (path[0] === "proposals") {
        if (!path[1])
          value = {
            items: (firstRun ? [] : await repo.list()).map((p) => ({
              ...p,
              version_count: p.versions.length,
              versions: [],
            })),
            total: firstRun ? 0 : (await repo.list()).length,
          };
        else if (path[2] === "ready")
          value = await checkedService.checkReady((await repo.get(path[1]))!);
        else value = await service.forRead((await repo.get(path[1]))!);
      } else if (path[0] === "workspace_events") value = await activity(repo);
      else if (
        [
          "pricing_items",
          "templates",
          "content_library",
          "custom_families",
          "workspace_documents",
        ].includes(path[0])
      )
        value = await repo.entities(path[0] as any);
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
  const dir = ".data/evidence/live-review";
  await mkdir(dir, { recursive: true });
  const captures: {
    file: string;
    frame: string;
    width: number;
    theme: string;
  }[] = [];
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  async function capture(
    name: string,
    frame: string,
    width: number,
    theme: string,
    fullPage = false,
  ) {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${name} fits ${width}`,
    ).toBe(true);
    const file = `${name}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage });
    captures.push({ file, frame, width, theme });
  }
  async function alignedControls() {
    const result = await page
      .locator(
        'label:has(> input:is([type="checkbox"],[type="radio"],[role="switch"]))',
      )
      .evaluateAll((labels) =>
        labels
          .filter((l) => l.getBoundingClientRect().width)
          .map((l) => {
            const input = l.querySelector("input")!,
              a = input.getBoundingClientRect(),
              b = l.getBoundingClientRect(),
              style = getComputedStyle(l);
            return {
              gap: style.gap,
              align: style.alignItems,
              height: b.height,
              left: a.left >= b.left,
              width: a.width,
              inputHeight: a.height,
            };
          }),
      );
    expect(result.length).toBeGreaterThan(0);
    for (const r of result) {
      expect(r.gap).toBe("8px");
      expect(r.align).toBe("center");
      expect(r.left).toBe(true);
      expect(r.inputHeight).toBe(18);
      if (page.viewportSize()!.width < 700)
        expect(r.height).toBeGreaterThanOrEqual(44);
    }
  }
  for (const width of [375, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) => localStorage.setItem("proposal-theme", t),
        theme,
      );
      firstRun = false;
      setupMode = "partial";
      qbo = false;
      await page.goto("/clients");
      const row = page
        .locator(".client-table-row")
        .filter({ hasText: client.company });
      await row
        .getByRole("button", {
          name: `Copy email ${client.email}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Copied" }),
      ).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        client.email,
      );
      await expect(
        row.getByRole("link", { name: `Open in Mail: ${client.email}` }),
      ).toHaveAttribute("href", `mailto:${client.email}`);
      await page.evaluate(() => navigator.clipboard.writeText(""));
      await row
        .getByRole("button", {
          name: `Copy email: ${client.email}`,
          exact: true,
        })
        .click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        client.email,
      );
      if (width >= 700) {
        await row
          .getByRole("button", {
            name: "Copy phone (704) 555-0123",
            exact: true,
          })
          .click();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
          "(704) 555-0123",
        );
        await expect(
          row.getByRole("link", { name: "Dial phone: (704) 555-0123" }),
        ).toHaveAttribute("href", "tel:+17045550123");
      } else {
        await expect(row.locator(".phone-dial")).toBeVisible();
        await expect(row.locator(".phone-dial")).toHaveAttribute(
          "href",
          "tel:+17045550123",
        );
        await expect(
          row.getByRole("button", { name: /Copy phone/ }),
        ).toBeHidden();
      }
      const search = page.getByRole("textbox", { name: "Search clients" });
      expect((await search.boundingBox())!.height).toBe(44);
      expect(
        (await page
          .getByRole("button", { name: "New client", exact: true })
          .boundingBox())!.height,
      ).toBe(44);
      await capture(
        "contact-list-copy",
        width === 1440 ? "6a" : width === 768 ? "6b" : "6c",
        width,
        theme,
      );
      await page.goto(`/clients/${client.id}`);
      await expect(page.locator(".stripe-candidate")).toHaveCount(3);
      await page
        .getByRole("button", { name: "Link this customer", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Confirm link", exact: true })
        .click();
      await expect(page.locator(".stripe-candidate")).toHaveCount(1);
      await expect(page.locator(".stripe-candidate")).toContainText(
        "cus_acme0",
      );
      await expect(page.locator(".stripe-candidate")).toContainText("4242");
      await expect(page.locator(".stripe-candidate")).not.toContainText(
        "cus_acme1",
      );
      await page
        .getByRole("button", {
          name: `Copy email ${client.email}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Copied" }),
      ).toBeVisible();
      await capture(
        "linked-customer-and-contact-copy",
        width === 1440 ? "6d" : width === 768 ? "6e" : "6f",
        width,
        theme,
        true,
      );
      await page
        .getByRole("button", { name: "Unlink customer", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("cus_acme0");
      await capture(
        "unlink-confirm",
        width === 1440 ? "6d" : width === 768 ? "6e" : "6f",
        width,
        theme,
      );
      await page
        .getByRole("button", { name: "Confirm unlink", exact: true })
        .click();
      await expect(page.locator(".stripe-candidate")).toHaveCount(3);
      expect(
        (await activity(repo)).some((e) => e.type === "client_stripe_unlinked"),
      ).toBe(true);
      firstRun = true;
      for (const mode of ["empty", "partial", "complete"]) {
        setupMode = mode;
        await page.goto("/");
        await expect(page.locator(".first-run")).toBeVisible();
        if (mode === "complete") {
          await expect(
            page.getByRole("heading", { name: "Send your first proposal" }),
          ).toBeVisible();
          await expect(page.locator(".setup-checklist")).toHaveCount(0);
        } else {
          await expect(page.locator(".setup-checklist li")).toHaveCount(5);
          await expect(
            page.locator('.setup-checklist li[data-complete="true"] .btn'),
          ).toHaveCount(0);
          await expect(page.locator(".setup-checklist")).toContainText(
            "one-time items invoice manually",
          );
          if (mode === "partial")
            await expect(page.locator(".setup-checklist")).toContainText(
              "Configured (test mode)",
            );
        }
        await capture(`home-setup-${mode}`, "8a", width, theme, width < 700);
      }
      firstRun = false;
      setupMode = "partial";
      await page.goto("/studio/catalog");
      await expect(page).toHaveURL(/\/studio\/products$/);
      await expect(
        page.getByRole("heading", { name: "Products", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".catalog-row")).toHaveCount(4);
      await alignedControls();
      await expect(
        page.locator(".catalog-row").filter({ hasText: "Design project" }),
      ).toContainText("Invoice manually");
      await expect(
        page.locator(".catalog-row").filter({ hasText: "Consulting session" }),
      ).toContainText("QuickBooks");
      await expect(
        page.locator(".catalog-row").filter({ hasText: "Support plan" }),
      ).toContainText("Needs Stripe price");
      const mapped = page
        .locator(".catalog-row")
        .filter({ hasText: "Managed hosting" });
      await mapped.focus();

      await expect(mapped.locator(".mapping-tooltip")).toBeVisible();
      await capture("products-and-mapping", "7b", width, theme);
      await page
        .locator(".catalog-row")
        .filter({ hasText: "Design project" })
        .click();
      await expect(
        page.getByRole("dialog").locator(".product-mapping-details"),
      ).toContainText("Invoice manually");
      await page
        .getByRole("dialog")
        .locator(".product-mapping-details")
        .scrollIntoViewIfNeeded();
      await capture("product-detail-manual", "7b", width, theme);
      await page.keyboard.press("Escape");
      qbo = true;
      await page.reload();
      await expect(
        page.locator(".catalog-row").filter({ hasText: "Design project" }),
      ).toContainText("Needs QuickBooks item");
      await page
        .locator(".catalog-row")
        .filter({ hasText: "Design project" })
        .click();
      await expect(
        page.getByRole("dialog").locator(".product-mapping-details"),
      ).toContainText("Needs QuickBooks item");
      await page
        .getByRole("dialog")
        .locator(".product-mapping-details")
        .scrollIntoViewIfNeeded();
      await capture("product-detail-qbo-warning", "7b", width, theme);
      await page.keyboard.press("Escape");
      qbo = false;
      await page.goto("/studio/templates");
      await expect(
        page.getByLabel("Template name", { exact: true }),
      ).toBeVisible();
      const input = await page
        .getByLabel("Template name", { exact: true })
        .boundingBox();
      const save = await page
        .getByRole("button", { name: "Save template", exact: true })
        .boundingBox();
      expect(input!.height).toBe(44);
      expect(save!.height).toBe(44);
      if (width >= 768)
        expect(
          Math.abs(input!.y + input!.height - save!.y - save!.height),
        ).toBeLessThanOrEqual(2);
      await alignedControls();
      await capture(
        "template-inline-controls",
        width === 768 ? "7f" : "7a",
        width,
        theme,
      );
      await page.goto("/studio/workspace");
      await expect(page.locator("#fonts")).toBeVisible();
      await page.locator("#fonts").scrollIntoViewIfNeeded();
      await alignedControls();
      for (const f of curatedFonts) {
        await expect(
          page.getByRole("radio", { name: `Aa ${f.name}`, exact: true }),
        ).toHaveCount(2);
        expect(
          await page
            .locator(".font-name")
            .filter({ hasText: `Aa ${f.name}` })
            .first()
            .evaluate((el) => getComputedStyle(el).fontFamily),
        ).toContain(f.family.split(",")[0].replaceAll('"', ""));
      }
      await expect(
        page.getByRole("group", { name: "Headings · Serif", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("group", { name: "Body text · Sans", exact: true }),
      ).toBeVisible();
      // Full picker capture covers both grouped lists, including the upload/licence adjacency.
      await capture("workspace-fonts", "7d", width, theme, true);
      const licence = page.getByRole("checkbox", {
        name: "I confirm this font is licensed for PDF embedding.",
        exact: true,
      });
      await licence.scrollIntoViewIfNeeded();
      expect(
        await licence.evaluate(
          (el) =>
            el
              .closest("label")!
              .previousElementSibling!.querySelector('input[type="file"]') !==
            null,
        ),
      ).toBe(true);
      await licence.check();
      await expect(
        page.getByLabel("Upload a font file · WOFF2 or TTF, under 1 MB"),
      ).toBeEnabled();
      await capture("font-upload-license", "7d", width, theme);
      await page.goto(`/proposals/${editing.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      if (width < 1100)
        await page
          .getByRole("button", { name: "Quote & totals", exact: true })
          .click();
      await expect(
        page
          .getByRole("combobox", { name: "Add from products", exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      await capture(
        "editor-products-picker",
        width === 1440 ? "2a" : width === 768 ? "5h" : "2d",
        width,
        theme,
      );
      if (width < 700) {
        await page
          .getByRole("button", { name: "Edit item", exact: true })
          .filter({ visible: true })
          .first()
          .click();
      } else {
        await page
          .getByRole("switch", { name: "Optional", exact: true })
          .filter({ visible: true })
          .first()
          .scrollIntoViewIfNeeded();
      }
      await alignedControls();
      await capture(
        "editor-shared-switch",
        width === 1440 ? "2a" : width === 768 ? "5h" : "2e",
        width,
        theme,
      );
      await page.keyboard.press("Escape");
      await page.goto("/studio");
      await capture("studio-products-navigation", "7g", width, theme);
    }
  const refs = await context.newPage();
  for (const [file, frames] of [
    [
      "Redesign 06 - Proposals and Clients.dc.html",
      ["6a", "6b", "6c", "6d", "6e", "6f"],
    ],
    ["Redesign 07 - Studio.dc.html", ["7a", "7b", "7d", "7f", "7g"]],
    ["Redesign 08 - States.dc.html", ["8a"]],
    ["Redesign 02 - Editor.dc.html", ["2a", "2d", "2e"]],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5h"]],
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
