import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { clientActor, setup, signature, staff } from "../tests/helpers";
import { applyCoverLayout } from "../src/lib/cover";
import { publicResult } from "../src/lib/service";
import { previewResult } from "../src/lib/preview";
import { chooseItem } from "../src/lib/quote-model";
import { totals } from "../src/lib/presentation";
import { emailTemplates, renderTemplate } from "../src/lib/email-templates";
import type { PublicProposal } from "../src/components/client-proposal";
import type { QuoteItem } from "../src/lib/model";

const dir = "docs/screenshots/ink-and-clay-client-account";
const r25Dir = ".data/evidence/r25-client-layout";
const captureR25 = async (page: Page, frame: string) => {
  if (process.env.CAPTURE_R25_LAYOUT !== "1") return;
  await mkdir(r25Dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${r25Dir}/${frame}.png`,
    animations: "disabled",
  });
};
const capture = async (page: Page, name?: string) => {
  if (!name || process.env.INK_CLAY_STAGE4_CAPTURE !== "1") return;
  await mkdir(dir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${dir}/${name}.png`,
    animations: "disabled",
    fullPage: name.startsWith("client-sign-"),
  });
};
async function axe(page: Page, selector: string, state: string) {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  expect(
    results.violations.map((v) => [v.id, v.nodes.map((node) => node.target)]),
    state,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
}
const siteArt = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
<defs><linearGradient id="wall" x2="1" y2="1"><stop stop-color="#d2ddcc"/><stop offset="1" stop-color="#7f9e87"/></linearGradient></defs>
<rect width="480" height="720" fill="url(#wall)"/>
<circle cx="330" cy="170" r="104" fill="#edddad" opacity=".9"/>
<path fill="#577a64" d="M0 470 170 227 344 510 480 290V720H0Z"/>
<path fill="#375847" d="M0 551 189 420 310 496 480 406V720H0Z"/>
<path fill="#aac3a5" d="M0 677c145-92 242-112 480-133v176H0Z"/>
</svg>`;
async function clientFixture(page: Page) {
  const f = await setup();
  f.settings.company_name = "Cedar & Coast";
  f.settings.accent_colour = "#285847";
  f.settings.phone = "(704) 555-0100";
  f.settings.proposal_fonts = { heading: "serif", body: "sans" };
  f.settings.show_powered_by = false;
  f.settings.logo_icon = {
    path: "fixture/mark.png",
    name: "mark.png",
    size: 128,
    width: 1024,
  };
  await f.repo.put("workspace_settings", f.settings);
  const photo = await sharp(Buffer.from(siteArt))
    .jpeg({ quality: 85 })
    .toBuffer();
  const icon = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#285847"/><path d="M8 22 16 7l8 15Z" fill="#fff"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const cover = applyCoverLayout(f.draft.cover!, "side-photo");
  cover.background = {
    type: "image",
    image: `data:image/jpeg;base64,${photo.toString("base64")}`,
    focal: { x: 70, y: 45 },
    graphic: "none",
  };
  const [build, care] = f.draft.quote;
  const group = crypto.randomUUID();
  const draft = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      title: "A website built for new patients",
      cover,
      pagination: {
        format: 1,
        pages: 2,
        starts: [
          {
            page: 2,
            block: "investment",
            offset: 0,
            explicit: true,
            marker: "investment-page",
          },
        ],
      },
      content: [
        { type: "page_break", id: "investment-page" },
        {
          type: "heading",
          text: "Choose your plan",
          level: 1,
          id: "investment",
        },
        {
          type: "paragraph",
          id: "choose",
          text: "Choose how you’d like to pay for the website, then add a care plan if you’d like one.",
        },
        { type: "pricing_table", id: "pricing" },
        { type: "signature_block", role: "client", id: "client-signature" },
        { type: "signature_block", role: "company", id: "company-signature" },
      ],
      quote: [
        {
          ...build,
          name: "Own It Now",
          description: "Paid in full. The site is yours at launch.",
          optional: true,
          default_selected: false,
          choice_group_id: group,
        },
        {
          ...care,
          name: "Own It Over Time",
          description:
            "A lower kickoff cost, followed by predictable monthly payments.",
          optional: true,
          default_selected: true,
          choice_group_id: group,
          sublines: [
            {
              ...build.sublines[0],
              id: crypto.randomUUID(),
              label: "Kickoff",
              amount: 50000,
            },
            { ...care.sublines[0], label: "Monthly", amount: 17500 },
          ],
        },
        {
          ...care,
          id: crypto.randomUUID(),
          name: "Care Standard",
          description: "Updates, backups and support each month.",
          optional: true,
          default_selected: true,
          choice_group_id: null,
          sublines: [
            { ...care.sublines[0], id: crypto.randomUUID(), amount: 8500 },
          ],
        },
      ],
    },
    staff,
  );
  const sent = await f.service.send(draft.id, staff);
  const signed = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const read: PublicProposal = publicResult(sent);
  const signedState: PublicProposal = publicResult(signed);
  const billing: PublicProposal = {
    ...signedState,
    billing: [
      {
        status: "pending",
        requires_checkout: true,
        checkout: [{ url: "https://checkout.stripe.com/test_fixture" }],
        added_existing: [],
      },
    ],
  };
  const existing: PublicProposal = {
    ...signedState,
    billing: [
      {
        status: "succeeded",
        requires_checkout: false,
        checkout: [],
        added_existing: [{ monthly_total: 26000, yearly_total: 0 }],
      },
    ],
  };
  let value = structuredClone(read);
  let gate = false;
  let ended = false;
  let authorized = true;
  let stale = false;
  let requests = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.endsWith("/preview"))
      return authorized
        ? route.fulfill({
            json:
              new URL(req.url()).searchParams.get("mode") === "published"
                ? previewResult(sent, f.settings, "published")
                : previewResult(draft, f.settings),
          })
        : route.fulfill({
            status: 401,
            json: { error: "Staff authorization required" },
          });
    if (path.endsWith("/brand/icon") || path === "/api/workspace-icon")
      return route.fulfill({ contentType: "image/png", body: icon });
    if (path.endsWith("/brand"))
      return route.fulfill({
        json: {
          ...value.company,
          contact: value.contact,
          valid_until: sent.valid_until,
          timezone: value.timezone,
          show_powered_by: false,
          ended: ended ? "expired" : null,
        },
      });
    if (path.endsWith("/engagement"))
      return route.fulfill({ json: { ok: true } });
    if (path.endsWith("/questions"))
      return route.fulfill({
        json: { threads: [], can_ask: true, needs_contact: false },
      });
    if (path.endsWith("/quote")) {
      if (stale)
        return route.fulfill({
          status: 409,
          json: { error: "Revision changed" },
        });
      const { item_id, selected } = req.postDataJSON();
      value.quote = chooseItem(value.quote as QuoteItem[], item_id, selected);
      value.totals = totals(value.quote as QuoteItem[]);
      return route.fulfill({ json: value });
    }
    if (path === `/api/public/${sent.token}`) {
      requests++;
      if (ended)
        return route.fulfill({ status: 410, json: { error: "Expired" } });
      if (gate && req.headers()["x-proposal-password"] !== "fixture-password")
        return route.fulfill({
          status: 401,
          json: { error: "Password required" },
        });
      return route.fulfill({ json: value });
    }
    return route.fulfill({ json: {} });
  });
  async function open(
    state: "read" | "gate" | "billing" | "existing" | "expired",
    color?: string,
    recurringOnly = false,
  ) {
    value = structuredClone(
      state === "billing" ? billing : state === "existing" ? existing : read,
    );
    if (recurringOnly) {
      value.quote = value.quote.flatMap((item) => {
        const sublines = item.sublines.filter(
          (line) => line.interval !== "one_time",
        );
        return sublines.length ? [{ ...item, sublines }] : [];
      });
      value.totals = totals(value.quote as QuoteItem[]);
    }
    if (color) {
      value.company.accent_colour = color;
      value.company.name = "Violet Studio";
    }
    gate = state === "gate";
    ended = state === "expired";
    stale = false;
    await page.goto(`/p/${sent.token}`);
  }
  return {
    ...f,
    draft,
    sent,
    open,
    setStale: () => (stale = true),
    requests: () => requests,
    forbidPreview: () => (authorized = false),
  };
}

test("desktop client choices show visible spaces on both sides of a combined amount's plus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1060 });
  const f = await clientFixture(page);
  await f.open("read");
  const choices = page.getByRole("complementary", { name: "Your choices" });
  const combined = choices
    .getByRole("listitem")
    .filter({ hasText: "Own It Over Time" })
    .locator(".flow-choice-amounts");
  await expect(combined).toBeVisible();
  await expect(combined).toHaveText("$500 + $175/mo");
  const layout = await combined.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const text = el.textContent!;
    const plus = text.indexOf("+");
    function glyph(index: number) {
      walker.currentNode = el;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const length = node.textContent!.length;
        if (index < length) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const { top, width } = range.getBoundingClientRect();
          return { top, width };
        }
        index -= length;
      }
      throw new Error("Character missing from combined amount");
    }
    return {
      glyphs: [glyph(0), glyph(plus), glyph(text.length - 1)],
      spaces: [glyph(plus - 1).width, glyph(plus + 1).width],
    };
  });
  expect(new Set(layout.glyphs.map(({ top }) => top)).size).toBe(1);
  for (const width of layout.spaces) expect(width).toBeGreaterThan(0);
  await expect(
    choices
      .getByRole("listitem")
      .filter({ hasText: "Care Standard" })
      .locator(".flow-choice-amounts"),
  ).toHaveText("$85/mo");
});

test("the reading summary omits a zero one-time amount on desktop and phone", async ({
  page,
}) => {
  const fixture = await clientFixture(page);
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await fixture.open("read", undefined, true);
    const totals = page.getByRole("group", { name: "Proposal totals" });
    await expect(totals.getByText("One-time", { exact: true })).toHaveCount(0);
    await expect(totals).toContainText("$260/mo");
    await expect(
      page.getByRole("button", { name: "Review and sign" }),
    ).toBeVisible();
  }
});

for (const width of [1440, 1024, 768, 375]) {
  test(`tenant client screens, controls and flows are accessible at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1060 });
    const f = await clientFixture(page);
    const inspect = async (state: string) =>
      axe(page, ".client-flow", `${state} at ${width}px`);
    const name = (state: string) =>
      width === 1440 || width === 375 ? `${state}-${width}` : undefined;
    await f.open("read");
    await expect(page.locator(".flow-brand")).toContainText("Cedar & Coast");
    await expect(page.locator(".flow-brand img")).toBeVisible();
    await expect(page.locator("[class~='ink-clay']")).toHaveCount(0);
    await expect(page.locator(".client-flow")).toHaveCSS("--accent", "#285847");
    const choices = page.getByRole("complementary", { name: "Your choices" });
    if (width === 1440)
      await expect(
        page.locator('.client-document-sheets[data-layout-ready="true"]'),
      ).toBeVisible();
    await expect(
      width === 1440 ? page.locator(".flow-reading-rail") : choices,
    ).toHaveCSS("position", width === 1440 ? "sticky" : "fixed");
    await expect(
      page.getByRole("heading", { name: "Your investment", exact: true }),
    ).toHaveCount(1);
    if (width === 1440 || width === 1024) {
      const block = page.locator('[data-document-block="investment"]');
      await block.hover();
      const ask = page.getByRole("button", { name: "Ask about this heading" });
      await expect(ask).toBeVisible();
      expect((await ask.boundingBox())!.x).toBeGreaterThanOrEqual(
        (await block.boundingBox())!.x + (await block.boundingBox())!.width,
      );
      await expect(
        page.getByRole("link", { name: /Ask about this/ }),
      ).toHaveCount(0);
    }
    const sign = choices.getByRole("button", {
      name: "Review and sign",
      exact: true,
    });
    await expect(sign).toHaveCSS(
      "background-color",
      width < 700
        ? "rgb(255, 255, 255)"
        : "color(srgb 0.0988235 0.217412 0.175412)",
    );
    await expect(choices).toContainText("One-time");
    await expect(choices).toContainText("Monthly");
    const group = page.getByRole("radiogroup", { name: "Choose one" });
    const options = group.getByRole("radio");
    await expect(options).toHaveCount(2);
    const checked = group.locator(".flow-quote-line.selected");
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveCSS("box-shadow", /40, 88, 71.*3px.*inset/);
    await inspect("reading");
    if (width === 1440) {
      const ownIt = choices
        .locator(".flow-chosen li")
        .filter({ hasText: "Own It Over Time" });
      // One line is covered by the combined-amount spacing test above.
      await expect(ownIt.locator(".flow-choice-amounts")).toHaveText(
        "$500 + $175/mo",
      );
      const document = page.locator(".client-document-sheets");
      await expect(document).toHaveCSS("width", "720px");
      await expect(document.locator(".client-page-frame").first()).toHaveCSS(
        "border-radius",
        "20px",
      );
      const questions = page.getByRole("region", { name: "Your questions" });
      expect((await questions.boundingBox())!.y).toBeGreaterThan(
        (await choices.boundingBox())!.y +
          (await choices.boundingBox())!.height,
      );
      await expect(
        page.getByRole("link", { name: "Your questions (0)" }),
      ).toHaveAttribute("href", "#your-questions");
      await capture(page, "client-cover-1440");
      await captureR25(page, "1g");
      if (process.env.CAPTURE_R25_LAYOUT === "1") {
        await page.locator('[data-document-block="choose"]').press("Enter");
        const form = page.getByRole("dialog", { name: "Ask a question" });
        await form
          .getByRole("textbox", { name: "Your question" })
          .fill("Can we keep our current domain, harbordental.com?");
        await captureR25(page, "1h-questions");
        await form.getByRole("button", { name: "Cancel" }).click();
      }
    } else if (width === 375) {
      await expect(choices).toHaveCSS("width", "375px");
      await expect(
        page.getByRole("link", { name: "Questions", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".flow-header .flow-progress")).toBeVisible();
      await expect(sign).toHaveCSS("height", "52px");
      await expect(page.locator(".flow-review")).toHaveCSS("width", "375px");
      await expect(page.locator(".flow-document")).toHaveCSS("width", "343px");
      await captureR25(page, "1a");
    }
    await group.scrollIntoViewIfNeeded();
    await capture(page, name("client-choices"));
    if (width === 1440) await captureR25(page, "1h");
    if (width === 375) await captureR25(page, "1b");
    await options.nth(1).focus();
    await options.nth(1).press("ArrowLeft");
    await expect(options.first()).toBeChecked();
    await expect(options.last()).not.toBeChecked();
    await sign.click();
    await expect(
      page.getByRole("heading", { name: "Sign the proposal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Who is signing" }),
    ).toBeVisible();
    await inspect("sign");
    await capture(page, name("client-sign"));

    await f.open("gate");
    await expect(
      page.getByRole("heading", { name: /Enter the password/ }),
    ).toBeVisible();
    const pass = page.getByLabel("Password", { exact: true });
    await pass.fill("wrong password");
    await page.getByRole("button", { name: "Open proposal" }).click();
    await expect(page.locator(".flow-locked").getByRole("alert")).toContainText(
      "doesn’t match",
    );
    await expect(pass).toHaveValue("wrong password");
    await inspect("wrong password");
    if (width === 1440) await capture(page, "client-password-1440");

    await f.open("billing");
    await expect(
      page.getByRole("heading", { name: "Set up your monthly subscription" }),
    ).toBeVisible();
    await inspect("new billing");
    if (width === 1440) await capture(page, "client-billing-1440");
    await page
      .getByRole("button", { name: "I’ll do this later", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /You’re all set/ }),
    ).toBeVisible();
    await inspect("done");
    if (width === 1440) await capture(page, "client-done-1440");

    await f.open("existing");
    await expect(
      page.getByRole("heading", { name: "Billing is already taken care of" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /secure checkout/ }),
    ).toHaveCount(0);
    await inspect("existing subscription");
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await f.open("expired");
    await expect(
      page.getByRole("heading", { name: /This proposal expired/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ask for a new proposal" }),
    ).toHaveAttribute("href", "mailto:staff@example.test");
    await expect(page.locator(".flow-sender-card")).toContainText(
      "(704) 555-0100",
    );
    await inspect("expired");
    if (width === 1440) await capture(page, "client-expired-1440");

    if (width === 1440) {
      await f.open("read", "#634184");
      await expect(sign).toHaveCSS(
        "background-color",
        "color(srgb 0.244588 0.160588 0.326118)",
      );
      await group.scrollIntoViewIfNeeded();
      await capture(page, "client-choices-second-brand-1440");
      await page.goto(`/p/${f.draft.id}?preview=1`);
      const preview = page.getByRole("complementary", {
        name: "Preview controls",
      });
      await expect(
        preview.getByRole("link", { name: "Send", exact: true }),
      ).toHaveAttribute("href", `/proposals/${f.draft.id}?view=send`);
      await expect(preview).toHaveCSS("background-color", "rgb(19, 48, 58)");
      expect((await preview.boundingBox())!.height).toBeLessThan(120);
      await expect(page.locator(".flow-header")).toBeInViewport();
      await expect(
        preview.getByRole("link", { name: "Send", exact: true }),
      ).toHaveCSS("background-color", "rgb(180, 83, 42)");
      await inspect("staff preview");
      await capture(page, "client-preview-1440");
      await captureR25(page, "1i");
      await preview.getByRole("button", { name: "Phone width" }).click();
      await expect(page.locator(".flow-stage")).toHaveCSS("width", "375px");
      await expect(page.locator(".flow-choices")).toHaveCSS("width", "375px");
      await expect(preview).toHaveCSS("height", "60px");
      const stage = (await page.locator(".flow-stage").boundingBox())!;
      const art = (await page
        .locator(".flow-document .cover-decoration")
        .boundingBox())!;
      expect(art.x).toBeGreaterThanOrEqual(stage.x - 1);
      expect(art.x + art.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
      await expect(page.locator(".flow-header .flow-progress")).toBeVisible();
      await captureR25(page, "1j");
      await page.goto(`/p/${f.sent.id}?preview=published`);
      await expect(
        preview.getByText("Preview of published version"),
      ).toBeVisible();
      await expect(
        preview.getByRole("link", { name: "Back to proposal" }),
      ).toHaveAttribute("href", `/proposals/${f.sent.id}`);
      await expect(
        preview.getByRole("link", { name: "Send", exact: true }),
      ).toHaveCount(0);
      await page.goto(`/p/${f.draft.id}?preview=1`);
      f.forbidPreview();
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Preview unavailable" }),
      ).toBeVisible();
      await expect(preview).toHaveCount(0);
    }
  });
}

for (const width of [1440, 768, 375]) {
  test(`centered staff account states are accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 403,
        json: { error: "Staff access deactivated. Contact your super admin." },
      }),
    );
    await page.route("**/api/auth/set-password", (route) =>
      route.fulfill({
        status: 410,
        json: {
          error: "This link is invalid or expired. Ask your admin to resend.",
        },
      }),
    );
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Email me a sign-in link" }),
    ).toHaveCount(0);
    await axe(page, ".account-screen", "sign in");
    if (width === 1440) await capture(page, "staff-sign-in-1440");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await axe(page, ".account-screen", "forgot password");
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await page.getByLabel("Email address").fill("former@example.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your account is paused" }),
    ).toBeVisible();
    await axe(page, ".account-screen", "deactivated");
    for (const type of ["invite", "recovery"]) {
      await page.goto("/login");
      await page.goto(`/set-password#token_hash=fixture-expired&type=${type}`);
      await expect(
        page.getByRole("heading", {
          name:
            type === "invite" ? "Set your password" : "Choose a new password",
        }),
      ).toBeVisible();
      await axe(page, ".account-screen", type);
      await page
        .getByLabel("New password", { exact: true })
        .fill("fixture password");
      await page.getByLabel("Type new password again").fill("fixture password");
      await page
        .getByRole("button", { name: "Save password & sign in" })
        .click();
      await expect(
        page.getByRole("heading", { name: "Link expired" }),
      ).toBeVisible();
      await axe(page, ".account-screen", "link expired");
    }
    if (width === 1440) await capture(page, "staff-link-expired-1440");
  });
}

test("every email template preserves its content and uses accessible light and dark layouts", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 920 });
  const f = await setup();
  const p = await f.service.send(f.draft.id, staff);
  p.workspace_settings!.accent_colour = "#285847";
  p.workspace_settings!.proposal_fonts = { heading: "serif", body: "sans" };
  const templates = await emailTemplates(f.repo);
  const snapshot: Record<string, unknown> = {};
  for (const template of templates) {
    const rendered = renderTemplate(template, p);
    expect(rendered.text).toContain(template.button_label);
    expect(rendered.html).toContain(rendered.body_html);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.setContent(rendered.html);
      const action = page.getByRole("link", {
        name: template.button_label,
        exact: true,
      });
      await expect(action).toHaveCount(1);
      await expect(action).toHaveCSS("border-radius", "9999px");
      await expect(page.locator(".email-action")).toHaveCSS(
        "background-color",
        template.staff
          ? colorScheme === "dark"
            ? "rgb(224, 122, 74)"
            : "rgb(180, 83, 42)"
          : "rgb(40, 88, 71)",
      );
      expect(
        (await page.locator(".email-card").boundingBox())!.width,
      ).toBeLessThanOrEqual(600);
      await axe(page, "body", `${template.key} ${colorScheme}`);
      snapshot[`${template.key} · ${colorScheme}`] = await page.evaluate(() => {
        const style = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!);
        return {
          canvas: style(".email-bg").backgroundColor,
          card: style(".email-card").backgroundColor,
          brand: style(".email-card").borderTopColor,
          title: style(".email-title").color,
          headingFont: style(".email-title").fontFamily,
          // Chromium serializes the same Apple system fallback differently on Linux.
          bodyFont: style(".email-body").fontFamily.replace(
            /, BlinkMacSystemFont,|, "system-ui",/,
            ", system-ui,",
          ),
          button: style(".email-action").backgroundColor,
          buttonText: style(".email-cta").color,
        };
      });
      if (["proposal_sent", "staff_question"].includes(template.key)) {
        await capture(page, `email-${template.key}-${colorScheme}`);
      }
    }
  }
  const fixture = "e2e/ink-clay-email-layouts.json";
  if (process.env.INK_CLAY_STAGE4_CAPTURE === "1")
    await writeFile(fixture, JSON.stringify(snapshot, null, 2) + "\n");
  expect(snapshot).toEqual(JSON.parse(await readFile(fixture, "utf8")));
});
