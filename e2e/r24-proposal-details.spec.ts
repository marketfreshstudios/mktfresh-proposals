import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "../tests/helpers";
import { previewResult } from "../src/lib/preview";
import type { Proposal } from "../src/lib/model";
import { signatoryVersion } from "../src/lib/company-signatory";
import type { StaffQuestionsResult } from "../src/lib/proposal-questions";

const capture = process.env.CAPTURE_R24 === "1";
const captureResponsive = process.env.CAPTURE_R24_RESPONSIVE === "1";
const screenshotDir = "docs/screenshots/proposal-details-r24";

async function compareFrame(page: Page, reference: Page, frame: string) {
  const design = reference.locator(`[id="${frame}"] > div`).nth(1);
  const before = await design.screenshot({ animations: "disabled" });
  const after = await page.screenshot({
    fullPage: !/^5[a-f]$/.test(frame),
    animations: "disabled",
  });
  const [left, right] = await Promise.all([
    sharp(before).metadata(),
    sharp(after).metadata(),
  ]);
  const gap = 16;
  await sharp({
    create: {
      width: left.width! + right.width! + gap,
      height: Math.max(left.height!, right.height!),
      channels: 3,
      background: "#e8edef",
    },
  })
    .composite([
      { input: before, left: 0, top: 0 },
      { input: after, left: left.width! + gap, top: 0 },
    ])
    .png()
    .toFile(`${screenshotDir}/${frame}.png`);
}

async function geometry(heading: Locator, amounts: Locator) {
  const top = (await heading.boundingBox())!.y;
  for (const amount of await amounts.all())
    expect(Math.abs((await amount.boundingBox())!.y - top)).toBeLessThanOrEqual(
      1,
    );
}

test("R24 record states use saved proposal, publication, and signing data at all widths", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const { repo, service, draft, settings, members } = await setup();
  settings.company_signatory!.image = await page.evaluate((name) => {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 60;
    const ink = canvas.getContext("2d")!;
    ink.fillStyle = "#13303a";
    ink.font = "italic 42px Georgia, serif";
    ink.fillText(name, 3, 46, 294);
    return canvas.toDataURL("image/png");
  }, settings.company_signatory!.name);
  await repo.put("workspace_settings", settings);
  const sent = await service.send(draft.id, staff);
  const viewed = await service.view(sent.token!, "", clientActor);
  const signed = await service.sign(
    viewed.id,
    signature(viewed.revision),
    "client",
    clientActor,
    {
      token: viewed.token!,
      password: "",
    },
  );
  const countersigned = await service.sign(
    signed.id,
    companyConsent(signed.revision, settings),
    "company",
    staff,
  );
  const now = new Date().toISOString();
  const originalEdit = {
    id: crypto.randomUUID(),
    type: "edited",
    ...staff,
    created_at: now,
    metadata: {},
  };
  const reasons = [
    "Add a pricing table",
    "Add the kickoff amount",
    "Complete the bracketed note",
    "Add the business state",
    "Review the final text",
  ];
  const work = {
    ...viewed,
    live_blockers: reasons,
    quote: viewed.quote.map((item, index) =>
      index ? item : { ...item, name: "Working quote item" },
    ),
    events: [...viewed.events, originalEdit],
  };
  const sealed: Proposal["files"] = ["client", "company"].map((stage) => ({
    id: crypto.randomUUID(),
    kind: "sealed",
    storage_path: `fixture/${stage}.pdf`,
    sha256: "a".repeat(64),
    bytes: 320,
    created_at: now,
    stage,
  }));
  const nextCharge = new Date(Date.now() + 30 * 86400000).toISOString();
  const completed: Proposal = {
    ...countersigned,
    status: "completed",
    jobs: [],
    files: sealed,
    billing_links: [
      {
        provider: "stripe",
        status: "succeeded",
        attempts: 1,
        external_object_id: "sub_fixture",
        metadata: {
          completed_checkout: [
            {
              session_id: "cs_test_fixture",
              mode: "subscription",
              collection_method: "charge_automatically",
              completed_at: now,
              currency: "USD",
              items: [],
              card: { brand: "visa", last4: "4242" },
              subscriptions: [
                {
                  id: "sub_fixture",
                  status: "active",
                  next_billing_at: nextCharge,
                },
              ],
            },
          ],
        },
      },
      {
        provider: "qbo",
        status: "succeeded",
        attempts: 1,
        external_object_id: "invoice_fixture",
        metadata: {
          invoice: {
            number: "1042",
            status: "Sent",
            url: "https://sandbox.qbo.intuit.com/app/invoice?txnId=1042",
          },
        },
      },
    ],
  };
  const question = {
    id: crypto.randomUUID(),
    proposal_id: viewed.id,
    created_at: now,
    revision: 0,
    status: "open" as const,
    contact: { name: "Jane Doe", email: viewed.client.email },
    section: { key: "fixture-investment", label: "Investment" },
    question: "Can we review the scope in a call?",
    replies: [],
    notify_users: [],
  };
  const signedWaiting: Proposal = { ...signed, files: [sealed[0]] };
  const billingIssue: Proposal = {
    ...completed,
    billing_links: [
      {
        provider: "stripe",
        status: "failed",
        attempts: 1,
        metadata: { requires_checkout: true },
      },
      {
        provider: "qbo",
        status: "needs_review",
        attempts: 1,
        metadata: { action: "Invoice manually" },
      },
    ],
  };
  const closed = (
    status: "declined" | "expired",
    event: string,
    metadata: Record<string, unknown> = {},
  ): Proposal => ({
    ...viewed,
    status,
    events: [
      ...viewed.events,
      {
        id: crypto.randomUUID(),
        type: event,
        ...clientActor,
        created_at: now,
        metadata,
      },
    ],
  });
  const fixtures: {
    frame: string;
    proposal: Proposal;
    question?: boolean;
    connected?: boolean;
  }[] = [
    { frame: "4a", proposal: sent },
    { frame: "4b", proposal: viewed, question: true },
    { frame: "4c", proposal: viewed },
    { frame: "4e", proposal: signedWaiting },
    { frame: "4f", proposal: completed },
    {
      frame: "4g",
      // The manual-only frame has no recurring charge. A recurring quote
      // without a subscription now has a Needs linking Billing row.
      proposal: {
        ...completed,
        billing_links: [],
        quote: completed.quote
          .map((item) => ({
            ...item,
            sublines: item.sublines.filter(
              (line) => line.interval === "one_time",
            ),
          }))
          .filter((item) => item.sublines.length),
        versions: completed.versions.map((version) => ({
          ...version,
          quote: version.quote
            .map((item) => ({
              ...item,
              sublines: item.sublines.filter(
                (line) => line.interval === "one_time",
              ),
            }))
            .filter((item) => item.sublines.length),
        })),
      },
      connected: false,
    },
    { frame: "4h", proposal: billingIssue },
    {
      frame: "4i",
      proposal: closed("declined", "declined", {
        note: "Can we revisit in January?",
      }),
    },
    { frame: "4j", proposal: closed("expired", "expired") },
    {
      frame: "4k",
      proposal: {
        ...closed("declined", "marked_lost", {
          reason: "The client chose another agency.",
        }),
        marked_lost_by: staff.actor,
      },
    },
    {
      frame: "4l",
      proposal: { ...completed, archived_at: now, archived_by: staff.actor },
    },
    {
      frame: "4m",
      proposal: {
        ...completed,
        source: "proposify_import",
        token: null,
        signers: [],
        billing_links: [],
        files: [{ ...sealed[0], kind: "import" }],
      },
      connected: false,
    },
    { frame: "4n", proposal: work },
    { frame: "4n2", proposal: work, question: true },
  ];
  const delegate = {
    ...staff,
    actor: "staff:00000000-0000-4000-8000-000000000021",
    staff_name: "Fran Weber",
    staff_email: "fran@example.test",
  };
  const countersignRequests: Record<string, unknown>[] = [];
  let currentActor = staff;
  let current = fixtures[0];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split("/").filter(Boolean).slice(1);
    const p = current.proposal;
    let value: unknown = [];
    if (parts[0] === "auth")
      value = {
        user: currentActor,
        settings,
        signatory_version: signatoryVersion(settings),
        staff: members,
        app_url: "http://127.0.0.1:3100",
      };
    if (parts[0] === "connections")
      value = {
        stripe: current.connected !== false,
        qbo: current.connected !== false,
        email: true,
        mock: true,
      };
    if (parts[0] === "proposals") {
      if (parts[2] === "questions") {
        value = {
          threads: current.question ? [question] : [],
          notified: [],
          can_reply: true,
        } satisfies StaffQuestionsResult;
      } else if (parts[2] === "engagement") {
        const views = p.first_viewed_at ? 3 : 0;
        value = {
          views,
          first_viewed_at: p.first_viewed_at,
          last_viewed_at: p.first_viewed_at,
          unique_viewers: views ? 1 : 0,
          total_ms: views ? 540000 : 0,
          downloads: 0,
          questions: current.question ? 1 : 0,
          sessions: [],
          targets: views
            ? [
                {
                  key: "investment",
                  label: "Investment",
                  kind: "section",
                  ms: 252000,
                  percent: 100,
                },
                {
                  key: "scope",
                  label: "Statement of work",
                  kind: "section",
                  ms: 185000,
                  percent: 100,
                },
                {
                  key: "process",
                  label: "Our process",
                  kind: "section",
                  ms: 103000,
                  percent: 100,
                },
              ]
            : [],
        };
      } else if (parts[2] === "countersign") {
        countersignRequests.push(route.request().postDataJSON());
        current = { ...current, proposal: { ...completed, title: p.title } };
        value = current.proposal;
      } else if (parts[2] === "emails") value = [];
      else if (parts[2] === "preview")
        value = previewResult(
          p,
          settings,
          url.searchParams.get("mode") === "published"
            ? "published"
            : "working",
        );
      else value = parts[1] ? p : { items: [p], total: 1 };
    }
    await route.fulfill({ json: value });
  });

  let reference: Page | undefined;
  if (capture || captureResponsive) {
    await mkdir(screenshotDir, { recursive: true });
    reference = await context.newPage();
    await reference.setViewportSize({ width: 1600, height: 1100 });
    await reference.route("https://fonts.googleapis.com/**", (route) =>
      route.abort(),
    );
    await reference.goto(
      pathToFileURL(
        resolve(
          process.env.R24_REFERENCE ??
            "design/ink-and-clay/Redesign 24 - Proposal Details.dc.html",
        ),
      ).href,
    );
    const [serif, sans] = await Promise.all([
      readFile("public/fonts/DMSerifDisplay-Regular.woff2"),
      readFile("public/fonts/InstrumentSans-Variable.woff2"),
    ]);
    await reference.addStyleTag({
      content: `
      @font-face {font-family: "DM Serif Display"; src: url(data:font/woff2;base64,${serif.toString("base64")}) format("woff2");}
      @font-face {font-family: "Instrument Sans"; font-weight: 100 900; src: url(data:font/woff2;base64,${sans.toString("base64")}) format("woff2");}
    `,
    });
    await reference.evaluate(() => document.fonts.ready);
  }

  const hero = page.locator(".record-hero");
  const details = page.locator(".record-details-values");
  const quote = page.locator(".record-quote");
  const status = hero.getByRole("list", { name: "Proposal lifecycle" });
  for (const fixture of fixtures) {
    current = fixture;
    await test.step(fixture.frame, async () => {
      await page.goto(`/proposals/${fixture.proposal.id}?view=record`);
      await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
        fixture.proposal.title,
      );
      await expect(
        hero.getByText("Prepared by", { exact: false }),
      ).toBeVisible();
      await expect(hero.getByRole("heading", { level: 1 })).toHaveCSS(
        "color",
        "rgb(255, 255, 255)",
      );
      await expect(page.locator(".record-columns")).toHaveCSS(
        "grid-template-columns",
        /px 340px$/,
      );
      if (fixture.frame !== "4m") {
        await expect(status.getByRole("listitem")).toHaveCount(5);
        await expect(status.locator('[aria-current="step"]')).toHaveCount(1);
        if (
          fixture.proposal.signers.some((signer) => signer.role === "company")
        ) {
          await expect(status.locator('[data-step="done"]')).toHaveCount(5);
          await expect(status.locator('[data-step="current"]')).toHaveCount(0);
        }
        await geometry(
          hero.getByRole("heading", { level: 1 }),
          hero.locator(".record-hero-amounts dd"),
        );
        const connectorGaps = await status
          .getByRole("listitem")
          .evaluateAll((steps) =>
            steps.slice(0, -1).map((step, index) => {
              const connector = getComputedStyle(step, "::after");
              const bounds = step.getBoundingClientRect();
              const dot = step
                .querySelector(".record-step-marker")!
                .getBoundingClientRect();
              const nextDot = steps[index + 1]
                .querySelector(".record-step-marker")!
                .getBoundingClientRect();
              return [
                bounds.left +
                  parseFloat(connector.insetInlineStart) -
                  dot.right,
                nextDot.left -
                  (bounds.right - parseFloat(connector.insetInlineEnd)),
              ];
            }),
          );
        for (const [start, end] of connectorGaps) {
          expect(start).toBeCloseTo(8, 0);
          expect(end).toBeCloseTo(8, 0);
        }
      }
      await expect(
        page.getByRole("region", { name: "Timeline events" }),
      ).toHaveAttribute("tabindex", "0");
      expect(
        (await page
          .getByRole("region", { name: "Timeline events" })
          .boundingBox())!.height,
      ).toBeLessThanOrEqual(260);
      // Reminders text sits on the same line as the other detail values.
      if (await page.locator(".record-reminders").count()) {
        const centers = await details.evaluate((el) =>
          [...el.querySelectorAll(":scope > div > dd")].map((dd) => {
            const text =
              [...dd.children].find((c) => c.tagName === "SPAN") ?? dd;
            const r = (
              text.firstChild && text !== dd ? text : dd
            ).getBoundingClientRect();
            return [dd.parentElement!.className, Math.round(r.top + 11)];
          }),
        );
        const reminder = centers.find(([c]) => c === "record-reminders")!;
        const expires = centers.find(([c]) => c === "record-details-expires");
        if (expires && (page.viewportSize()?.width ?? 0) >= 1200)
          expect(
            Math.abs(Number(reminder[1]) - Number(expires[1])),
          ).toBeLessThanOrEqual(2);
      }
      if (fixture.question) {
        await expect(
          page.getByRole("heading", { name: "Client questions", exact: true }),
        ).toBeVisible();
        await expect(
          hero.getByRole("button", { name: "Reply to question" }),
        ).toBeVisible();
        await expect(page.locator(".record-question-meta")).toContainText(
          "Jane Doe | Investment | ",
        );
        // Same heading-to-card gap as every other record section, so the
        // questions card lines up with the card beside it.
        await expect(
          page.locator(".record-section > .questions-panel"),
        ).toHaveCSS("margin-top", "0px");
        await expect(
          page.getByRole("button", { name: "Refresh questions" }),
        ).toHaveCount(0);
      } else {
        await expect(
          page.getByRole("region", { name: "Questions", exact: true }),
        ).toHaveCount(0);
      }
      // A sent, unsigned proposal's contact can be corrected from here;
      // signed ones keep the contact they were signed with.
      if (fixture.frame === "4a")
        await expect(
          details.getByRole("button", { name: "Edit contact" }),
        ).toBeVisible();
      if (["4e", "4f"].includes(fixture.frame))
        await expect(
          details.getByRole("button", { name: "Edit contact" }),
        ).toHaveCount(0);
      if (["4e", "4f", "4g", "4h", "4l", "4m"].includes(fixture.frame)) {
        await expect(
          quote.getByRole("link", { name: "Edit", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText("Edits not live", { exact: true }),
        ).toHaveCount(0);
      }
      if (["4a", "4b", "4c", "4e", "4n", "4n2"].includes(fixture.frame))
        await expect(
          details.getByText("Documents", { exact: true }),
        ).toHaveCount(0);
      if (["4f", "4g", "4h", "4l"].includes(fixture.frame)) {
        await expect(details.getByText("Expires", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          details.getByRole("link", { name: "Final sealed PDF" }),
        ).toBeVisible();
        await expect(
          details.getByRole("link", { name: "Client-signed PDF" }),
        ).toBeVisible();
      }
      if (fixture.frame === "4e")
        await expect(
          details.getByText("Expires", { exact: true }),
        ).toBeVisible();
      if (["4a", "4f"].includes(fixture.frame)) {
        const labelPositions = await details
          .locator("dt")
          .evaluateAll((labels) =>
            labels.map((label) => label.getBoundingClientRect().top),
          );
        expect(
          Math.max(...labelPositions) - Math.min(...labelPositions),
        ).toBeLessThanOrEqual(1);
      }
      if (fixture.frame === "4f") {
        const billing = page.locator(".record-billing-card");
        await expect(billing.locator(".record-billing-row")).toHaveCount(2);
        await expect(billing).toContainText("| Stripe");
        await expect(billing.locator(".record-billing-next")).toHaveText(
          /^Next charge \w{3}, \w{3} \d{1,2}$/,
        );
        await expect(billing).toContainText("QuickBooks invoice 1042");
        await expect(
          page.locator(".record-signature-box").last(),
        ).toContainText("applied by");
        await expect(page.locator(".record-signature-card")).not.toContainText(
          /@/,
        );
        await expect(details.locator(".record-link-url")).toHaveCSS(
          "white-space",
          "nowrap",
        );
        await expect(details.locator(".record-link-url")).toHaveCSS(
          "text-overflow",
          "ellipsis",
        );
        await expect(
          details.getByRole("link", { name: "Final sealed PDF" }),
        ).toHaveCSS("text-decoration-line", "underline");
      }
      if (fixture.frame === "4h") {
        await expect(
          page
            .locator(".record-billing > header")
            .getByRole("button", { name: "Retry billing" }),
        ).toBeVisible();
        await expect(
          page
            .locator(".record-billing-row")
            .first()
            .getByRole("button", { name: "Email payment link" }),
        ).toBeVisible();
        await expect(
          page
            .locator(".record-billing-row")
            .last()
            .getByRole("button", { name: "Mark as invoiced" }),
        ).toBeVisible();
      }
      await expect(
        page
          .locator(".record-timeline-list")
          .getByRole("link", { name: "View evidence" }),
      ).toHaveCount(0);
      await expect(page.locator(".record-email-log[open]")).toHaveCount(0);
      if (fixture.frame === "4g") {
        await expect(hero.locator(".record-hero-billing")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Billing", exact: true }),
        ).toHaveCount(0);
      }
      if (fixture.frame === "4n") {
        await expect(
          hero.locator(".record-publication-reasons li"),
        ).toHaveCount(3);
        await expect(hero.getByText("and 2 more")).toBeVisible();
        await expect(
          hero.getByRole("link", { name: "Fix in editor" }),
        ).toHaveAttribute("href", /view=send&focus=readiness/);
        await expect(
          hero.getByRole("link", { name: "Preview what the client sees" }),
        ).toHaveAttribute("href", /preview=published$/);
        await expect(status.locator('[aria-current="step"]')).toContainText(
          "Viewed",
        );
      }
      if (fixture.frame === "4n2") {
        await expect(
          hero.getByText("Edits not live", { exact: true }),
        ).toHaveCount(0);
        await expect(page.locator(".record-publication-banner")).toContainText(
          "Add a pricing table, and 4 more",
        );
      }
      if (fixture.frame.startsWith("4n")) {
        await expect(
          details.getByText(/^Shows the version from /),
        ).toBeVisible();
        await expect(quote.getByText("Working quote item")).toBeVisible();
        await expect(
          quote.getByRole("link", { name: "View live version" }),
        ).toHaveAttribute("href", /preview=published$/);
        await expect(
          page.locator(".record-timeline-list .timeline-entry").first(),
        ).toContainText("Edited, not live yet");
      }
      if (fixture.frame === "4m") {
        await expect(status).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Engagement" }),
        ).toHaveCount(0);
        await expect(
          details.getByRole("link", { name: "Imported PDF" }),
        ).toBeVisible();
      }
      if (reference && capture) {
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.getByRole("status").filter({ hasText: "Loading engagement" }),
        ).toHaveCount(0);
        await compareFrame(page, reference, fixture.frame);
      }
    });
  }
  await hero.getByRole("button", { name: "Reply to question" }).click();
  await expect(page.getByRole("textbox", { name: "Your reply" })).toBeFocused();

  // A signed record must not surface a stale blocker list.
  current = {
    frame: "4e",
    proposal: { ...signedWaiting, live_blockers: reasons },
  };
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Countersign to finish/ }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".record-publication-banner,.record-quote-notice,.record-publication-reasons",
    ),
  ).toHaveCount(0);
  const responsive = [
    { frame: "5a", proposal: viewed, question: true },
    { frame: "5b", proposal: viewed, question: true },
    { frame: "5c", proposal: signedWaiting },
    { frame: "5d", proposal: signedWaiting },
    { frame: "5e", proposal: completed },
    { frame: "5f", proposal: billingIssue },
    { frame: "5g", proposal: viewed, question: true },
    { frame: "5h", proposal: signedWaiting },
  ];
  settings.company_signatory!.authorized_user_ids.push(delegate.actor.slice(6));
  for (const fixture of responsive) {
    await test.step(fixture.frame, async () => {
      const isPhone = fixture.frame < "5g";
      const signed = !!fixture.proposal.client_signed_at;
      currentActor = fixture.frame === "5d" ? delegate : staff;
      current = {
        ...fixture,
        proposal: {
          ...fixture.proposal,
          title: "A website built for new patients",
        },
      };
      const width = isPhone ? 375 : 768;
      const height = isPhone ? 812 : 1024;
      await page.setViewportSize({ width, height });
      await page.goto(`/proposals/${fixture.proposal.id}?view=record`);
      await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
        current.proposal.title,
      );
      await expect(
        page.getByRole("navigation", { name: "Phone navigation" }),
      ).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width);
      const layout = page.locator(".record-v4");
      const sectionOrder = await layout
        .locator(
          ".record-quote, .record-details, .record-signatures, .record-billing",
        )
        .evaluateAll((sections) =>
          sections.map((section) => section.className.split(" ")[0]),
        );
      expect(sectionOrder).toEqual(
        !isPhone || fixture.frame === "5e"
          ? [
              "record-details",
              "record-quote",
              "record-signatures",
              "record-billing",
            ]
          : [
              "record-quote",
              "record-signatures",
              "record-details",
              "record-billing",
            ],
      );
      await expect(details.getByText("Expires", { exact: true })).toHaveCount(
        (signed && isPhone) || fixture.frame === "5e" || fixture.frame === "5f"
          ? 0
          : 1,
      );
      if (signed)
        await expect(
          details.getByText("Expires", { exact: true }),
        ).toBeHidden();
      if (!signed)
        await expect(
          details.getByText("Expires", { exact: true }),
        ).toBeVisible();

      if (isPhone) {
        const dock = page.getByRole("group", {
          name: "Next actions",
          exact: true,
        });
        await expect(dock).toBeVisible();
        const primary = dock.locator("[data-primary] .btn");
        await expect(primary).toHaveCSS("height", "48px");
        const fixed = (await dock.boundingBox())!;
        expect(fixed.y + fixed.height).toBe(height);
        await expect(hero.locator(".record-toolbar")).toBeVisible();
        await expect(hero.locator(".record-toolbar .more-control")).toHaveCSS(
          "height",
          "44px",
        );
        await expect(hero.locator(".record-step-summary")).toHaveText(
          fixture.frame === "5e" || fixture.frame === "5f"
            ? "Step 5 of 5 | Countersigned"
            : signed
              ? "Step 4 of 5 | Client signed"
              : "Step 3 of 5 | Viewed",
        );
        await expect(details).toHaveCSS(
          "grid-template-columns",
          /px [\d.]+px$/,
        );
        await expect(details.locator(".record-details-client")).toHaveCSS(
          "grid-column",
          "1 / -1",
        );
        await expect(
          details.getByRole("button", { name: "Copy client link" }),
        ).toHaveCSS("height", "44px");
        await expect(layout.locator(".record-disclosure")).toHaveCount(2);
        await expect(layout.locator(".record-disclosure[open]")).toHaveCount(0);
        if (fixture.frame === "5a") {
          await expect(primary).toHaveText("Reply");
          await expect(
            dock.getByRole("button", { name: "Send reminder" }),
          ).toBeVisible();
          await hero.locator(".more-control").click();
          await expect(
            page
              .getByRole("dialog")
              .getByRole("link", { name: "Preview as client" }),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await dock
            .getByRole("button", { name: "Reply", exact: true })
            .click();
          const reply = page.getByRole("textbox", { name: "Your reply" });
          await expect(reply).toBeFocused();
          await page
            .getByRole("region", { name: "Questions" })
            .getByRole("button", { name: "Cancel" })
            .click();
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        if (fixture.frame === "5b") {
          const timelineDisclosure = layout.locator(
            ".timeline .record-disclosure",
          );
          await timelineDisclosure.locator("summary").click();
          await expect(
            timelineDisclosure.getByRole("region", { name: "Timeline events" }),
          ).toBeVisible();
          await expect(
            timelineDisclosure.getByRole("link", { name: "Evidence" }),
          ).toBeVisible();
          await timelineDisclosure.locator("summary").click();
          await quote.evaluate((node) =>
            window.scrollBy(0, node.getBoundingClientRect().top - 58),
          );
          expect((await dock.boundingBox())!.y).toBe(fixed.y);
        }
        if (fixture.frame === "5c" || fixture.frame === "5d") {
          await expect(primary).toHaveText("Review and countersign");
          await expect(primary).toHaveCSS(
            "background-color",
            "rgb(180, 83, 42)",
          );
          await primary.click();
          const dialog = page.getByRole("dialog", {
            name: "Countersign",
            exact: true,
          });
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveCSS("border-top-left-radius", "22px");
          const footer = (await dialog
            .locator(".record-countersign-actions")
            .boundingBox())!;
          const sheet = (await dialog.boundingBox())!;
          expect(Math.abs(footer.width - sheet.width)).toBeLessThanOrEqual(2);
          const authorization = dialog.getByRole("checkbox", {
            name: /on behalf of/,
          });
          const consent = dialog.getByRole("checkbox", {
            name: /reviewed the agreement and consent/,
          });
          const submit = dialog.getByRole("button", {
            name: "Countersign",
            exact: true,
          });
          await expect(dialog.getByRole("checkbox")).toHaveCount(
            fixture.frame === "5d" ? 2 : 1,
          );
          await expect(consent).toBeVisible();
          await expect(submit).toBeDisabled();
          if (fixture.frame === "5d") {
            await authorization.check();
            await expect(submit).toBeDisabled();
            await dialog.evaluate((element) => {
              element.scrollTop = 0;
            });
          } else {
            await consent.check();
            await expect(submit).toBeEnabled();
            await dialog
              .getByRole("button", { name: "Close", exact: true })
              .click();
            await page.waitForURL((url) => !url.searchParams.has("action"));
          }
        }
        if (fixture.frame === "5e") {
          await expect(primary).toHaveText("Download sealed PDF");
          await expect(
            details.getByRole("link", { name: "Final sealed PDF" }),
          ).toBeVisible();
        }
        if (fixture.frame === "5f") {
          await expect(primary).toHaveText("Email link");
          await expect(
            dock.getByRole("button", { name: "Invoice manually" }),
          ).toBeVisible();
        }
      } else {
        await expect(page.locator(".shell-tablet-header")).toHaveCSS(
          "height",
          "64px",
        );
        await expect(hero.locator(".record-step-content").first()).toHaveCSS(
          "width",
          "84px",
        );
        await expect(hero.locator(".record-hero-amounts dd").first()).toHaveCSS(
          "font-size",
          "32px",
        );
        await expect(details).toHaveCSS(
          "grid-template-columns",
          /^(?:[\d.]+px ){3}[\d.]+px$/,
        );
        await expect(layout.locator(".record-next-actions")).toHaveCSS(
          "flex-direction",
          "column",
        );
        await expect(layout.locator(".record-support")).toHaveCSS(
          "grid-template-columns",
          /px [\d.]+px$/,
        );
        await expect(layout.locator(".record-phone-actions")).toHaveCount(0);
      }
      if (reference && captureResponsive) {
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.getByRole("status").filter({ hasText: "Loading engagement" }),
        ).toHaveCount(0);
        await compareFrame(page, reference, fixture.frame);
      }
      if (fixture.frame === "5d") {
        const dialog = page.getByRole("dialog", {
          name: "Countersign",
          exact: true,
        });
        await dialog
          .getByRole("checkbox", { name: /reviewed the agreement and consent/ })
          .check();
        await dialog
          .getByRole("button", { name: "Countersign", exact: true })
          .click();
        await expect.poll(() => countersignRequests.length).toBe(1);
        expect(countersignRequests[0]).toMatchObject({
          revision: signedWaiting.revision,
          reviewed_hash: signedWaiting.versions.at(-1)?.content_hash,
          signatory_version: signatoryVersion(settings),
          authorization: true,
          consent: true,
        });
        await expect(dialog).toBeHidden();
      }
    });
  }
  await reference?.close();
});
