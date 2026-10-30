import { chooseItem, quoteSublines } from "../src/lib/quote-model";
import type { QuoteItem } from "../src/lib/model";
import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setup, staff, clientActor, signature } from "../tests/helpers";
import { publicResult } from "../src/lib/service";
import { mutate } from "../src/lib/repository";
import type { PublicProposal } from "../src/components/client-proposal";
test("client redesign: every responsive state, frozen legacy renderer, safe preview and signature retries", async ({
  page,
  context,
}) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(15000);
  const externalFonts: string[] = [];
  page.on("request", (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url()))
      externalFonts.push(r.url());
  });
  const { repo, service, draft, settings, members } = await setup();
  await mutate(repo, draft.id, (p) => {
    p.client.title = "Owner";
    p.content = [
      { type: "heading", text: "Overview" },
      {
        type: "paragraph",
        text: "Thank you for sharing your plans. We’ll design, build and launch a website for {{client.company}}.",
      },
      { type: "heading", text: "What we’ll do" },
      {
        type: "paragraph",
        text: "Design responsive pages, prepare your content and support the launch.",
      },
      { type: "pricing_table" },
      { type: "heading", text: "Statement of Work & Contract" },
      {
        type: "paragraph",
        text: "The agreed scope is the work described above. The investment is {{quote.one_time_total}} one-time and {{quote.monthly_total}} per month.",
      },
      { type: "signature_block", role: "client" },
      { type: "signature_block", role: "company" },
    ];
  });
  const sent = await service.send(draft.id, staff),
    signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  const read = publicResult(sent),
    accepted = publicResult(signed),
    original = JSON.stringify(await repo.get(sent.id));
  let current = structuredClone(read),
    scenario = "read",
    signPosts = 0,
    quotePosts = 0,
    gets = 0,
    release: (() => void) | undefined;
  const token = "x".repeat(43),
    dir = ".data/evidence/client-flow";
  await mkdir(dir, { recursive: true });
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/brand"))
      return route.fulfill({
        json: {
          ...read.company,

          contact: read.contact,
          ended:
            scenario === "expired"
              ? "expired"
              : scenario === "declined"
                ? "declined"
                : null,
        },
      });
    if (req.method() === "POST" && path.endsWith("/sign")) {
      signPosts++;
      if (scenario === "sealing")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (scenario === "offline") return route.abort("internetdisconnected");
      if (scenario === "stale-sign")
        return route.fulfill({
          status: 409,
          json: { error: "Revision changed" },
        });
      current = structuredClone(accepted);
      return route.fulfill({ json: current });
    }
    if (req.method() === "POST" && path.endsWith("/quote")) {
      quotePosts++;
      if (scenario === "stale")
        return route.fulfill({
          status: 409,
          json: { error: "Revision changed" },
        });
      const { item_id, selected } = req.postDataJSON();
      current.quote = chooseItem(
        current.quote as QuoteItem[],
        item_id,
        selected,
      );
      const { totals, money } = await import("../src/lib/presentation");
      current.totals = totals(current.quote as any);
      current.variables["quote.monthly_total"] = money(
        current.totals.monthly_total,
        current.currency,
      );
      return route.fulfill({ json: current });
    }
    if (req.method() === "POST" && path.endsWith("/decline"))
      return route.fulfill({ json: { ...current, status: "declined" } });
    if (path.includes("/files/") && path.endsWith("/verify"))
      return route.fulfill({ json: { valid: true } });
    gets++;
    if (scenario === "loading")
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    if (
      scenario === "password" &&
      req.headers()["x-proposal-password"] !== "correct-password"
    )
      return route.fulfill({
        status: 401,
        json: { error: "Proposal password required" },
      });
    if (["expired", "declined", "replaced"].includes(scenario))
      return route.fulfill({
        status: 410,
        json: { error: "Proposal unavailable" },
      });
    return route.fulfill({ json: current });
  });
  const captures: {
    file: string;
    width: number;
    theme: string;
    frames: string;
    state: string;
  }[] = [];
  async function capture(
    state: string,
    width: number,
    theme: string,
    frames: string,
  ) {
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const file = `${state}-${width}-${theme}.png`;
    await page.screenshot({ path: `${dir}/${file}`, fullPage: true });
    captures.push({ file, width, theme, frames, state });
    if (["review", "sign"].includes(state)) {
      const height =
        state === "review"
          ? width === 375
            ? 780
            : width === 768
              ? 1024
              : 960
          : width === 375
            ? 780
            : width === 768
              ? 1300
              : 980;
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `${dir}/${state}-frame-${width}-${theme}.png`,
      });
      await page.setViewportSize({ width, height: 1000 });
    }
  }
  async function open(state: string, value = read) {
    scenario = state;
    current = structuredClone(value);
    await page.goto(`/p/${token}`);
  }
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await open("read");
      await expect(
        page.getByRole("button", { name: "Review and sign", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Proposal totals", { exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByLabel("Proposal totals", { exact: true }),
      ).not.toContainText("Yearly");
      await expect(page.locator(".flow-document")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      if (width === 1440)
        await expect(page.locator(".flow-choices")).toHaveCSS("width", "340px");
      else {
        const h = await page
          .locator(".flow-choices")
          .evaluate((el) => el.getBoundingClientRect().height);
        expect(
          await page
            .locator(".flow-body")
            .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom)),
        ).toBeGreaterThanOrEqual(h);
      }
      await capture("review", width, theme, "1a/1c/5b/5a");
      const before = await page
        .getByLabel("Proposal totals", { exact: true })
        .innerText();
      await page.getByRole("checkbox").first().click();
      await expect(
        page.getByLabel("Proposal totals", { exact: true }),
      ).not.toHaveText(before, { useInnerText: true });
      await page.getByRole("checkbox").first().click();
      await expect(
        page.getByLabel("Proposal totals", { exact: true }),
      ).toHaveText(before, { useInnerText: true });
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Sign the proposal", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Email address", { exact: true }),
      ).toHaveAttribute("readonly", "");
      await expect(
        page.getByRole("button", { name: "Sign proposal", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("textbox", { name: "Title (optional)", exact: true }),
      ).toHaveValue("Owner");
      await capture("sign", width, theme, "1d/5d/5c");
      await page.getByRole("checkbox").check();
      scenario = "sealing";
      await page
        .getByRole("button", { name: "Sign proposal", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Sealing your signed copy…",
          exact: true,
        }),
      ).toBeDisabled();
      const submitted = signPosts;
      await page.keyboard.press("Enter");
      expect(signPosts).toBe(submitted);
      await capture("sealing", width, theme, "1d");
      release?.();
      await expect(
        page.getByText(
          "Your proposal is signed. Your copy will be sent to jane@example.test.",
          { exact: true },
        ),
      ).toBeVisible();
      const newBilling = structuredClone(accepted);
      newBilling.billing = [
        {
          status: "pending",
          requires_checkout: true,
          checkout: [{ url: "https://checkout.stripe.com/test_only" }],
          added_existing: [],
        },
      ];
      await open("billing", newBilling);
      await expect(
        page.getByRole("heading", {
          name: "One more step: set up your billing",
          exact: true,
        }),
      ).toBeVisible();
      await capture("billing", width, theme, "1e");
      await expect(
        page.getByRole("link", {
          name: "Continue to secure checkout",
          exact: true,
        }),
      ).toHaveAttribute("href", "https://checkout.stripe.com/test_only");
      await page
        .getByRole("button", { name: "I’ll do this later", exact: true })
        .click();
      await expect(
        page.getByText("Signed by you · awaiting countersignature", {
          exact: true,
        }),
      ).toBeVisible();
      await capture("signed", width, theme, "1g");
      const existing = structuredClone(accepted);
      existing.billing = [
        {
          status: "succeeded",
          requires_checkout: false,
          checkout: [],
          added_existing: [{ monthly_total: 34500, yearly_total: 0 }],
        },
      ];
      await open("existing", existing);
      await expect(
        page.getByRole("heading", {
          name: "Billing is already taken care of",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "Continue to secure checkout",
          exact: true,
        }),
      ).toHaveCount(0);
      await capture("existing", width, theme, "1f");
      const failed = structuredClone(newBilling);
      failed.billing[0].status = "needs_review";
      await open("failed-billing", failed);
      await expect(
        page.getByText("Your proposal is signed. Billing needs attention.", {
          exact: true,
        }),
      ).toBeVisible();
      await capture("failed-billing", width, theme, "8o");
      const complete = structuredClone(accepted);
      complete.status = "completed";
      complete.billing = [
        {
          status: "succeeded",
          requires_checkout: false,
          checkout: [],
          added_existing: [],
        },
      ];
      complete.files = [
        { id: "final", stage: "company", sha256: "a".repeat(64) },
      ];
      await open("completed", complete);
      await page
        .getByRole("button", { name: "Done", exact: true })
        .count()
        .then(async (n) => {
          if (n)
            await page
              .getByRole("button", { name: "Done", exact: true })
              .click();
        });
      await expect(
        page.getByText("Completed copy", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Download the final copy",
          exact: true,
        }),
      ).toBeVisible();
      await capture("completed", width, theme, "8r");
      await open("stale");
      await page.getByRole("checkbox").first().click();
      await expect(
        page.getByRole("button", { name: "Reload and review", exact: true }),
      ).toBeVisible();
      const staleGets = gets;
      await expect(
        page.getByRole("button", { name: "Review and sign", exact: true }),
      ).toHaveCount(0);
      await capture("stale", width, theme, "1h");
      expect(gets).toBe(staleGets);
      await open("password");
      await expect(
        page.getByRole("heading", {
          name: "Enter the password to open your proposal",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText(read.title, { exact: true })).toHaveCount(0);
      await page.getByLabel("Password", { exact: true }).fill("wrong");
      await page
        .getByRole("button", { name: "Open proposal", exact: true })
        .click();
      await expect(page.locator(".flow-state [role=alert]")).toContainText(
        "doesn’t match",
      );
      await capture("password", width, theme, "1b");
      for (const dead of ["expired", "declined", "replaced"]) {
        await open(dead);
        await expect(page.locator(".flow-state")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Email Alex Morgan", exact: true }),
        ).toBeVisible();
        await capture(dead, width, theme, dead === "replaced" ? "8p" : "1i");
      }
      await open("read");
      await page
        .getByRole("button", { name: "Decline this proposal", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Go back", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("textbox", { name: "Note (optional)", exact: true })
        .fill("Our launch moved to next year.");
      await capture("decline-confirm", width, theme, "8q");
      await page
        .getByRole("button", { name: "Decline proposal", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "This proposal was declined",
          exact: true,
        }),
      ).toBeVisible();
      await open("offline");
      await page
        .getByRole("button", { name: "Review and sign", exact: true })
        .click();
      await page
        .getByLabel("Your signature", { exact: true })
        .fill("Jane Preserved");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Sign proposal", exact: true })
        .click();
      await expect(
        page.getByText("Your signature is still here", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Your signature", { exact: true }),
      ).toHaveValue("Jane Preserved");
      await expect(page.getByRole("checkbox")).toBeChecked();
      await capture("offline", width, theme, "8n");
      await open("loading");
      await expect(
        page.getByRole("status", {
          name: "Opening your proposal…",
          exact: true,
        }),
      ).toBeVisible();
      await capture("loading", width, theme, "8m");
      scenario = "read";
      release?.();
      await expect(
        page.getByRole("button", { name: "Review and sign", exact: true }),
      ).toBeVisible();
    }
  }
  // Staff follow-ups share the foundation shell but do not change proposal behavior.
  await page.unroute("**/api/**");
  let staffRows = [sent];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const entity = path.split("/").at(-1)!;
    const value =
      path === "/api/auth/session"
        ? {
            user: staff,
            staff: members,
            settings,
            app_url: "http://127.0.0.1:3100",
          }
        : path === "/api/proposals"
          ? { items: staffRows, total: staffRows.length }
          : [
                "clients",
                "pricing_items",
                "templates",
                "content_library",
              ].includes(entity)
            ? await repo.entities(entity as any)
            : [];
    await route.fulfill({ json: value });
  });
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (t) => localStorage.setItem("proposal-theme", t),
      theme,
    );
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Recent proposals", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Yearly", exact: true }),
      ).toHaveCount(0);
      if (width >= 700) {
        for (const label of [
          theme === "dark" ? "Light mode" : "Dark mode",
          "Sign out",
        ])
          await expect(
            page
              .locator(".sidebar")
              .getByRole("button", { name: label, exact: true }),
          ).toHaveCSS("border-top-style", "solid");
      }
      await capture("home", width, theme, "3d/3e/3f");
      await page.getByRole("button", { name: "Studio", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture("studio-menu", width, theme, "04");
      await page.keyboard.press("Escape");
      await page.goto(`/clients/${sent.client.id}`);
      await expect(
        page.getByRole("textbox", { name: "Title (optional)", exact: true }),
      ).toBeVisible();
      await capture("client", width, theme, "6d/6e/6f");
    }
  }
  const withYear = structuredClone(sent);
  withYear.quote.push({
    ...withYear.quote[0],
    id: "00000000-0000-4000-8000-000000009999",
    sublines: [
      {
        ...withYear.quote[0].sublines[0],
        id: "00000000-0000-4000-8000-000000009998",
        interval: "year",
        amount: 0,
      },
    ],
  });
  staffRows = [withYear];
  await page.goto("/");
  await expect(
    page.getByRole("columnheader", { name: "Yearly", exact: true }),
  ).toBeVisible();
  expect(externalFonts).toEqual([]);
  expect(signPosts).toBe(12);
  expect(quotePosts).toBe(18);
  expect(JSON.stringify(await repo.get(sent.id))).toBe(original);
  await writeFile(
    `${dir}/manifest.json`,
    JSON.stringify(
      {
        scope:
          "Client flow Phase 2. Flat quote contract retained until Phase 3.",
        captures,
      },
      null,
      2,
    ),
  );
  const design = await context.newPage(),
    font = await readFile("public/fonts/InstrumentSans-Variable.woff2");
  await design.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({
      contentType: "text/css",
      body: `@font-face{font-family:'Instrument Sans';font-style:normal;font-weight:400 700;src:url(data:font/woff2;base64,${font.toString("base64")}) format('woff2');}`,
    }),
  );
  await design.route("https://fonts.gstatic.com/**", (r) => r.abort());
  for (const [file, frames] of [
    [
      "Redesign 01 - IA and Client Flow.dc.html",
      ["1a", "1b", "1c", "1d", "1e", "1f", "1g", "1h", "1i"],
    ],
    ["Redesign 05 - Tablet and Desktop.dc.html", ["5a", "5b", "5c", "5d"]],
    ["Redesign 08 - States.dc.html", ["8m", "8n", "8o", "8p", "8q", "8r"]],
  ] as const) {
    await design.setViewportSize({ width: 1540, height: 1200 });
    await design.goto("http://127.0.0.1:4176/" + encodeURIComponent(file));
    await design.evaluate(() => document.fonts.ready);
    for (const frame of frames) {
      const node = design
        .locator(`[id="${frame}"]`)
        .locator(":scope > div")
        .nth(1);
      await expect(node).toBeVisible();
      await node.screenshot({ path: `${dir}/reference-${frame}-light.png` });
    }
    if (file.startsWith("Redesign 01")) {
      await design.evaluate(() => {
        const w = window as any;
        w.__dcSetProps(w.__dcRootName(), { theme: "dark" });
      });
      for (const frame of frames)
        await design
          .locator(`[id="${frame}"]`)
          .locator(":scope > div")
          .nth(1)
          .screenshot({ path: `${dir}/reference-${frame}-dark.png` });
    }
  }
  await design.close();
});

test("touch signature drawing is preserved after failure; one-time acceptance skips billing and stale signing never reloads", async ({
  browser,
}) => {
  const { service, draft } = await setup();
  const sent = await service.send(draft.id, staff),
    value = publicResult(sent);
  value.quote = value.quote.filter((i) =>
    i.sublines.every((s) => s.interval === "one_time"),
  );
  value.totals.monthly_total = 0;
  const mobile = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 375, height: 800 },
    }),
    page = await mobile.newPage();
  page.setDefaultTimeout(15000);
  let calls = 0,
    reads = 0,
    fail = true,
    stale = false;
  await page.route("**/api/**", async (route) => {
    if (route.request().url().endsWith("/brand"))
      return route.fulfill({
        json: {
          ...value.company,

          contact: value.contact,
        },
      });
    if (route.request().method() === "POST") {
      calls++;
      expect(route.request().postDataJSON().email).toBe("jane@example.test");
      expect(route.request().postDataJSON().kind).toBe("drawn");
      if (stale)
        return route.fulfill({ status: 409, json: { error: "Changed" } });
      if (fail) return route.abort("internetdisconnected");
      return route.fulfill({
        json: {
          ...value,
          status: "signed_by_client",
          signers: [
            {
              role: "client",
              name: "Jane Doe",
              title: "Owner",
              company: null,
              signed_at: new Date().toISOString(),
              kind: "drawn",
              typed_name: null,
              image: null,
            },
          ],
        },
      });
    }
    reads++;
    return route.fulfill({ json: value });
  });
  await page.goto(`/p/${"y".repeat(43)}`);
  await page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Draw", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("tab", { name: "Draw", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Type", exact: true }),
  ).toBeFocused();
  await page.getByRole("tab", { name: "Type", exact: true }).press("ArrowLeft");
  const pad = page.getByLabel("Draw your signature", { exact: true });
  await pad.scrollIntoViewIfNeeded();
  const rect = (await pad.boundingBox())!;
  await page.mouse.move(rect.x + 20, rect.y + 30);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + 70, { steps: 12 });
  await page.mouse.up();
  const drawn = await pad.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Sign proposal", exact: true })
    .click();
  await expect(
    page.getByText("Your signature is still here", { exact: true }),
  ).toBeVisible();
  expect(await pad.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
    drawn,
  );
  stale = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reload and review", exact: true }),
  ).toBeVisible();
  const before = reads;
  expect(await pad.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
    drawn,
  );
  expect(reads).toBe(before);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeDisabled();
  stale = false;
  fail = false;
  await page
    .getByRole("button", { name: "Reload and review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review and sign", exact: true })
    .click();
  await page.getByRole("tab", { name: "Type", exact: true }).click();
  await page.getByRole("checkbox").check();
  // Verify the normal mouse-friendly typed path with an independent handler.
  await page.unroute("**/api/**");
  await page.route("**/api/**", (r) =>
    r.fulfill({
      json: { ...value, status: "signed_by_client", signers: [], billing: [] },
    }),
  );
  await page
    .getByRole("button", { name: "Sign proposal", exact: true })
    .click();
  await expect(
    page.getByText("Signed by you · awaiting countersignature", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "One more step: set up your billing",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(calls).toBe(2);
  await mobile.close();
});
