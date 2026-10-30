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
import type { Client } from "../src/lib/model";
import type { StripeTransport } from "../src/lib/catalog";
test("Clients polish: structured contacts, explicit billing choices, row focus and responsive evidence", async ({
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
          data: Array.from(
            {
              length:
                params.email === client.email
                  ? 3
                  : params.email === single.email
                    ? 1
                    : 0,
            },
            (_, i) => ({
              id: `cus_${params.email === client.email ? "acme" : "harbor"}${i}`,
              email: params.email,
              name:
                i === 0
                  ? "Main account"
                  : i === 1
                    ? "Previous account"
                    : "Marketing account",
              created: 1700000000 + i * 864000,
              livemode: false,
            }),
          ),
          has_more: false,
        } as T;
      if (path.startsWith("/v1/customers/"))
        return {
          id: path.split("/").at(-1),
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
  let billingUnavailable = false;
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
            items: (await repo.list()).map((p) => ({
              ...p,
              version_count: p.versions.length,
              versions: [],
            })),
            total: (await repo.list()).length,
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
  const dir = ".data/evidence/clients-polish";
  await mkdir(dir, { recursive: true });
  const captures: any[] = [];
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
      name + " fits",
    ).toBe(true);
    if (frame === "6f")
      frame = width === 1440 ? "6d" : width === 768 ? "6e" : "6f";
    const file = `${name}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage });
    captures.push({ file, frame, width, theme });
  }
  for (const width of [375, 768, 1440])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (t) => localStorage.setItem("proposal-theme", t),
        theme,
      );
      await page.goto("/clients");
      await expect(
        page.getByRole("link", { name: `Open ${client.company}`, exact: true }),
      ).toBeVisible();
      await expect(page.locator(".client-table-row").first()).toContainText(
        "(704) 555-0123",
      );
      const row = page.locator(".client-table-row").first(),
        link = page.getByRole("link", {
          name: `Open ${client.company}`,
          exact: true,
        });
      await row.hover();
      await expect(row).toHaveCSS(
        "background-color",
        theme === "light" ? "rgb(238, 236, 230)" : "rgb(44, 43, 39)",
      );
      await link.focus();
      await expect(row).toHaveCSS("outline-style", "solid");
      await capture(
        "clients",
        width === 1440 ? "6a" : width === 768 ? "6b" : "6c",
        width,
        theme,
      );
      await expect(
        row.getByRole("link", { name: client.email }),
      ).toHaveAttribute("href", `mailto:${client.email}`);
      await link.press("Enter");
      await expect(page.locator(".client-contact-card")).toContainText(
        "123 Main Street",
      );
      await expect(page.locator(".stripe-candidate")).toHaveCount(3);
      await expect(
        page.getByRole("button", { name: "Delete client", exact: true }),
      ).toBeDisabled();
      await capture(
        "contact-and-many-matches",
        width === 1440 ? "6d" : width === 768 ? "6e" : "6f",
        width,
        theme,
        true,
      );
      await page
        .getByRole("button", { name: "Link this customer", exact: true })
        .nth(1)
        .click();
      await expect(page.getByRole("dialog")).toContainText("cus_acme1");
      await capture("link-confirm", "6f", width, theme);
      await page
        .getByRole("button", { name: "Confirm link", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".stripe-customer-chooser")).toContainText(
        "Linked",
      );
      billingUnavailable = true;
      await page.reload();
      await expect(
        page.getByText("Current billing details unavailable", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Unlink customer", exact: true }),
      ).toBeVisible();
      await capture("linked-billing-error", "6f", width, theme);
      billingUnavailable = false;
      await page
        .getByRole("button", { name: "Unlink customer", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm unlink", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Edit client", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
        "(704) 555-0123",
      );
      await capture("edit-client", "6f", width, theme);
      await page.keyboard.press("Escape");
      await page.goto(`/clients/${single.id}`);
      await expect(page.locator(".stripe-candidate")).toHaveCount(1);
      await capture("one-match", "6f", width, theme, true);
      await page.goto(`/clients/${empty.id}`);
      await expect(
        page.getByText("No Stripe customer yet; one is created at checkout", {
          exact: true,
        }),
      ).toBeVisible();
      await capture("no-match", "6f", width, theme, true);
      await page
        .getByRole("button", { name: "Delete client", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(empty.company);
      await capture("delete-confirm", "6f", width, theme);
      await page.keyboard.press("Escape");
      await page.goto("/clients");
      await page
        .getByRole("button", { name: "New client", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add address", exact: true })
        .click();
      await page
        .getByLabel("Phone", { exact: true })
        .pressSequentially("7045550123");
      await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
        "(704) 555-0123",
      );
      await page.getByLabel("Phone", { exact: true }).press("Backspace");
      await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
        "(704) 555-012",
      );
      await page.getByLabel("Phone", { exact: true }).fill("123");
      await page.getByLabel("Company", { exact: true }).click();
      await expect(
        page.getByRole("dialog").locator("[role=alert]"),
      ).toContainText("valid phone");
      await capture("phone-error-and-address", "6f", width, theme);
      await page.getByLabel("Phone", { exact: true }).fill("+442079460018");
      await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
        "+44 20 7946 0018",
      );
      await page
        .getByLabel("Address line 1", { exact: true })
        .fill("42 Sample Road");
      await page.getByLabel("City", { exact: true }).fill("London");
      await page.getByLabel("Country", { exact: true }).selectOption("GB");
      await page
        .getByLabel("Country", { exact: true })
        .scrollIntoViewIfNeeded();
      await capture("address-fields", "6f", width, theme);
      await page.keyboard.press("Escape");
      await page.goto("/proposals");
      await expect(page.locator(".proposal-row")).toHaveCount(2);
      await page.locator(".proposal-row-link").first().focus();
      await capture(
        "proposals-focus",
        width === 1440 ? "6a" : width === 768 ? "6b" : "6c",
        width,
        theme,
      );
      await page.goto("/");
      await expect(page.locator(".home-v4")).toBeVisible();
      await page.locator(".home-primary-link").first().focus();
      await capture(
        "home-focus",
        width === 1440 ? "3d" : width === 768 ? "3e" : "3f",
        width,
        theme,
      );
      await page.goto(`/proposals/${editing.id}`);
      await expect(page.locator(".quote-workspace")).toBeVisible();
      if (width === 375)
        await page
          .locator(".phone-section-list")
          .getByRole("button", { name: /Your contact details/ })
          .click();
      const chip = page
        .locator('.tiptap [data-field="client.address"]')
        .filter({ visible: true });
      await expect(chip).toContainText("Charlotte");
      await expect(chip).toHaveCSS("white-space", "pre-line");
      await capture(
        "address-document-field",
        width === 1440 ? "2a" : width === 768 ? "5g" : "2c",
        width,
        theme,
      );
      if (width < 1100)
        await page
          .getByRole("button", { name: "Quote & totals", exact: true })
          .click();
      await page
        .getByRole("tab", { name: "Review & send", exact: true })
        .filter({ visible: true })
        .click();
      await expect(
        page
          .getByRole("link", { name: "Choose Stripe customer", exact: true })
          .filter({ visible: true }),
      ).toHaveAttribute("href", `/clients/${client.id}#stripe-customers`);
      await capture(
        "send-customer-blocker",
        width === 1440 ? "2b" : width === 768 ? "5h" : "2f",
        width,
        theme,
      );
      await page.goto("/studio/activity");
      await expect(
        page.locator(".activity-row.clickable-row").first(),
      ).toBeVisible();
      await page.locator(".activity-primary-link").first().focus();
      await capture("activity-focus", "7e", width, theme);
    }
  const refs = await context.newPage();
  for (const [file, frames] of [
    ["Redesign 02 - Editor.dc.html", ["2a", "2b", "2c", "2f"]],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5g", "5h"]],
    [
      "Redesign 06 - Proposals and Clients.dc.html",
      ["6a", "6b", "6c", "6d", "6e", "6f"],
    ],
    ["Redesign 03 - Record and Home.dc.html", ["3d", "3e", "3f"]],
    ["Redesign 07 - Studio.dc.html", ["7e"]],
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
