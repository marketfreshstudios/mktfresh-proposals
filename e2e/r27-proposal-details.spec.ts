import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
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

const capture = process.env.CAPTURE_R27;

test("R27 proposal details: every state at 1440 and the phone frames at 375", async ({
  page,
  context,
}) => {
  test.setTimeout(240000);
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
  const draftInvoice: Proposal = {
    ...completed,
    billing_links: completed.billing_links.map((link) =>
      link.provider === "qbo"
        ? {
            ...link,
            metadata: {
              invoice: {
                number: "1038",
                status: "Draft",
                url: "https://app.sandbox.qbo.intuit.com/app/invoice?txnId=1038",
              },
            },
          }
        : link,
    ),
  };
  const oneTimeOnly = (quote: Proposal["quote"]) =>
    quote
      .map((item) => ({
        ...item,
        sublines: item.sublines.filter((line) => line.interval === "one_time"),
      }))
      .filter((item) => item.sublines.length);
  const noBilling: Proposal = {
    ...completed,
    billing_links: [],
    quote: oneTimeOnly(completed.quote),
    versions: completed.versions.map((version) => ({
      ...version,
      quote: oneTimeOnly(version.quote),
    })),
  };
  const lost: Proposal = {
    ...closed("declined", "marked_lost", {
      reason: "The client chose another agency.",
    }),
    marked_lost_by: staff.actor,
  };
  const resolvedQuestion = {
    ...question,
    id: crypto.randomUUID(),
    status: "resolved" as const,
    question: "When can we get started?",
  };
  type Fixture = {
    frame: string;
    proposal: Proposal;
    question?: boolean;
    resolved?: boolean;
    connected?: boolean;
    visits?: "none" | "one" | "many";
    ready?: { ready: boolean; errors: string[]; warnings: string[] };
  };
  const fixtures: Fixture[] = [
    {
      frame: "2d",
      proposal: draft,
      ready: {
        ready: false,
        errors: ["An unfinished note is still in the text on page 2"],
        warnings: [],
      },
    },
    { frame: "2a", proposal: sent, visits: "none" },
    { frame: "2b3", proposal: viewed },
    { frame: "2b5", proposal: viewed, visits: "one" },
    { frame: "2b4", proposal: viewed, question: true, resolved: true },
    { frame: "2e", proposal: signedWaiting, resolved: true },
    { frame: "2c", proposal: draftInvoice, resolved: true },
    {
      frame: "3a",
      proposal: { ...draft, ai_unreviewed: true },
      ready: {
        ready: false,
        errors: [
          "Confirm review of AI changes before sending: Overview, Scope, Timeline",
          "Care Standard: review AI price with Use list price or Keep",
        ],
        warnings: [],
      },
    },
    { frame: "3b", proposal: work },
    { frame: "3c", proposal: work, question: true },
    { frame: "3d", proposal: billingIssue },
    { frame: "3e", proposal: noBilling, connected: false },
    {
      frame: "3f",
      proposal: closed("declined", "declined", {
        note: "We're going with a smaller option for now.",
      }),
      resolved: true,
    },
    { frame: "3g", proposal: closed("expired", "expired") },
    { frame: "3h", proposal: lost, resolved: true },
    {
      frame: "3i",
      proposal: { ...lost, archived_at: now, archived_by: staff.actor },
    },
    {
      frame: "3j",
      proposal: {
        ...completed,
        source: "proposify_import",
        token: null,
        billing_links: [],
        files: [{ ...sealed[0], kind: "import" }],
      },
      connected: false,
    },
  ];
  const session = (index: number, ms: number, device = "desktop") => ({
    id: crypto.randomUUID(),
    recipient: "Jane Doe",
    device,
    active_ms: ms,
    started_at: new Date(Date.now() - (5 - index) * 3600000).toISOString(),
  });
  let currentActor = staff;
  let current: Fixture = fixtures[0];
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
          threads: [
            ...(current.question ? [question] : []),
            ...(current.resolved ? [resolvedQuestion] : []),
          ],
          notified: [],
          can_reply: true,
        } satisfies StaffQuestionsResult;
      } else if (parts[2] === "ready") {
        value = current.ready ?? { ready: true, errors: [], warnings: [] };
      } else if (parts[2] === "engagement") {
        const visits = current.visits ?? (p.first_viewed_at ? "many" : "none");
        const sessions =
          visits === "none"
            ? []
            : visits === "one"
              ? [session(4, 12000, "phone")]
              : [
                  session(0, 26000),
                  session(1, 24000),
                  session(2, 4000),
                  session(3, 3000),
                  session(4, 10000),
                ];
        const total = sessions.reduce((sum, s) => sum + s.active_ms, 0);
        const targets = [
          ["cover", "Cover", visits === "one" ? 12000 : 39000],
          ["included", "What’s included", visits === "one" ? 0 : 16000],
          ["why", "Why us", visits === "one" ? 0 : 7000],
          ["investment", "Investment", 0],
        ].map(([key, label, ms]) => ({
          key,
          label,
          kind: "section",
          ms,
          percent: ms ? 100 : 0,
        }));
        value = {
          views: sessions.length,
          first_viewed_at: sessions.length ? sessions[0].started_at : null,
          last_viewed_at: sessions.at(-1)?.started_at ?? null,
          unique_viewers: sessions.length ? 1 : 0,
          total_ms: total,
          downloads: 0,
          questions: current.question ? 1 : 0,
          sessions,
          targets: sessions.length ? targets : [],
        };
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
  if (capture) await mkdir(capture, { recursive: true });
  const hero = page.locator(".record-hero");
  const details = page.locator(".record-details-values");
  const status = hero.getByRole("list", { name: "Proposal lifecycle" });
  const clay = "rgb(224, 122, 74)";
  for (const fixture of fixtures) {
    current = fixture;
    await test.step(fixture.frame, async () => {
      await page.goto(`/proposals/${fixture.proposal.id}?view=record`);
      await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
        fixture.proposal.title,
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Loading engagement" }),
      ).toHaveCount(0);
      if (capture) {
        await page.waitForTimeout(3800);
        await page.screenshot({
          path: `${capture}/${fixture.frame}.png`,
          fullPage: true,
        });
      }
      await page.mouse.move(0, 0);
      const signed = !!fixture.proposal.client_signed_at;
      const native = fixture.proposal.source === "native";
      // Review and countersign (or Review AI draft) is the only clay button.
      const clayButtons = await page
        .locator(".btn, button")
        .evaluateAll(
          (buttons, color) =>
            buttons.filter(
              (b) =>
                (b as HTMLElement).offsetParent &&
                getComputedStyle(b).backgroundColor === color,
            ).length,
          clay,
        );
      expect(clayButtons).toBe(["2e", "3a"].includes(fixture.frame) ? 1 : 0);
      // Header and hero never show the same action twice.
      const headerActions = await page
        .locator(".record-primary-actions")
        .locator("a, button")
        .allTextContents();
      const heroActions = await hero
        .locator(".record-next-actions")
        .locator("a, button")
        .allTextContents();
      for (const action of heroActions)
        expect(headerActions.map((a) => a.trim())).not.toContain(action.trim());
      // Details facts by state (§3).
      const facts = await details.locator("dt").allTextContents();
      if (native && signed) {
        expect(facts).not.toContain("Reminders");
        expect(facts).not.toContain("Expires");
        await expect(
          details.getByRole("link", { name: "Client-signed PDF" }),
        ).toBeVisible();
        await expect(
          details.getByRole("link", { name: "Final sealed PDF" }),
        ).toHaveCount(
          fixture.proposal.signers.some((s) => s.role === "company") ? 1 : 0,
        );
      }
      if (["2d", "3a"].includes(fixture.frame)) {
        expect(facts).toEqual([
          "Client",
          "Created",
          "Expires",
          "Reminders",
          "Client link",
        ]);
        await expect(details).toContainText("Goes live when you send");
        await expect(details).toContainText("Start after you send");
        await expect(
          page.getByRole("heading", { name: "Ready to send" }),
        ).toBeVisible();
      }
      if (["2a", "2b3", "2b5", "2b4"].includes(fixture.frame))
        expect(facts).toEqual([
          "Client",
          "Sent",
          "Expires",
          "Reminders",
          "Client link",
        ]);
      if (native && !signed && fixture.frame !== "3j")
        expect(facts).not.toContain("Documents");
      await expect(page.getByText("View signed proposal")).toHaveCount(0);
      // Lifecycle.
      if (native) {
        await expect(status.getByRole("listitem")).toHaveCount(5);
        if (["3f", "3g", "3h", "3i"].includes(fixture.frame))
          await expect(status.locator('[data-step="closed"]')).toHaveCount(1);
      } else await expect(status).toHaveCount(0);
      // Header main button.
      const toolbar = page.locator(".record-primary-actions");
      if (fixture.frame === "2e") {
        const edit = toolbar.getByRole("button", { name: /^Edit/ });
        await expect(edit).toBeDisabled();
        await expect(edit).toHaveAttribute(
          "title",
          "Signed proposals are locked.",
        );
      }
      if (["2c", "3d", "3e"].includes(fixture.frame))
        await expect(
          toolbar.getByRole("link", { name: "Download sealed PDF" }),
        ).toBeVisible();
      if (fixture.frame === "3i")
        await expect(
          toolbar.getByRole("button", { name: "Unarchive" }),
        ).toBeVisible();
      if (fixture.frame === "3j") {
        await expect(
          toolbar.getByRole("link", { name: "View proposal" }),
        ).toHaveCount(0);
        await expect(
          toolbar.getByRole("link", { name: "Download PDF" }),
        ).toBeVisible();
      }
      // Client questions: shown with its heading from Sent onward.
      const questions = page.locator(".record-questions");
      if (["2d", "3a", "3j"].includes(fixture.frame))
        await expect(questions).toHaveCount(0);
      if (["2a", "2b3", "2b5", "3b"].includes(fixture.frame)) {
        await expect(
          questions.getByRole("heading", { name: "Client questions" }),
        ).toBeVisible();
        await expect(questions.getByText("No questions yet")).toBeVisible();
      }
      if (["2e", "2c"].includes(fixture.frame)) {
        await expect(questions).toHaveAttribute("data-collapsed", "true");
        await expect(questions.getByText("All resolved")).toBeVisible();
        await expect(
          questions.getByText("When can we get started?"),
        ).toHaveCount(0);
      }
      if (fixture.frame === "2b4") {
        await expect(questions.getByText("1 waiting on you")).toBeVisible();
        await expect(
          questions.getByText("Can we review the scope in a call?"),
        ).toBeVisible();
        await questions
          .getByRole("button", { name: "Client questions" })
          .click();
        await expect(questions).toHaveAttribute("data-collapsed", "true");
        await expect(
          questions.getByText("Can we review the scope in a call?"),
        ).toHaveCount(0);
        await expect(questions.getByText("1 waiting on you")).toBeVisible();
        if (capture)
          await page.screenshot({
            path: `${capture}/2b6.png`,
            fullPage: true,
          });
        // The collapsed choice is remembered for this person.
        await page.reload();
        await expect(questions).toHaveAttribute("data-collapsed", "true");
        await questions
          .getByRole("button", { name: "Client questions" })
          .click();
        await hero.getByRole("button", { name: "Reply to question" }).click();
        await expect(
          page.getByRole("textbox", { name: "Your reply" }),
        ).toBeFocused();
      }
      // Beside Engagement, the Timeline matches its height and scrolls.
      const activity = page.locator(".record-row:has(.engagement-panel)");
      if (
        fixture.frame !== "4a" &&
        fixture.frame !== "4b" &&
        (await activity.count())
      ) {
        const [engagement, timeline] = await Promise.all(
          [".engagement-panel", ".timeline"].map((selector) =>
            activity
              .locator(selector)
              .first()
              .evaluate((el) =>
                (el.closest(".record-section") ?? el).getBoundingClientRect(),
              ),
          ),
        );
        expect(Math.abs(engagement.height - timeline.height)).toBeLessThan(2);
        await expect(activity.locator(".record-timeline-list")).toHaveCSS(
          "overflow-y",
          "auto",
        );
      }
      // Details dividers run the full height of the bar.
      if (fixture.frame !== "4a" && fixture.frame !== "4b") {
        const heights = await page
          .locator(".record-details-values > .record-fact")
          .evaluateAll((els) =>
            els.map((el) => el.getBoundingClientRect().height),
          );
        expect(new Set(heights.map(Math.round)).size).toBe(1);
      }
      // Billing fits its content.
      const billing = page.locator(".record-billing-card");
      if (["2c", "2e"].includes(fixture.frame)) {
        // The Billing card follows its content, never the Quote's height.
        const [content, card] = await billing.evaluate((el) => [
          [...el.children].reduce(
            (sum, child) => sum + child.getBoundingClientRect().height,
            0,
          ),
          el.getBoundingClientRect().height,
        ]);
        expect(card - content).toBeLessThan(4);
      }
      if (fixture.frame === "2c") {
        await expect(billing.getByText("Draft invoice")).toBeVisible();
        await expect(
          billing.getByText("Created after both signed"),
        ).toHaveCount(0);
        // Each billing disclosure lists the chosen lines behind its total.
        await billing.getByText("$25/mo through Stripe").click();
        await expect(
          billing.locator(".record-billing-items li", {
            hasText: "Hosting + Essentials",
          }),
        ).toBeVisible();
        await billing.getByText(/QuickBooks invoice/).click();
        await expect(
          billing.locator(".record-billing-items li", {
            hasText: "Website Build",
          }),
        ).toBeVisible();
        if (capture)
          await billing.screenshot({ path: `${capture}/2c-billing-open.png` });
        await expect(
          billing.getByRole("link", { name: "Open in QuickBooks" }),
        ).toBeVisible();
      }
      if (fixture.frame === "2e")
        await expect(billing.getByText("After you countersign")).toBeVisible();
      if (fixture.frame === "3e")
        await expect(
          page.getByRole("heading", { name: "Billing", exact: true }),
        ).toHaveCount(0);
      await expect(page.locator(".record-v4")).not.toContainText("·");
    });
  }
  // Phone frames (375).
  await page.setViewportSize({ width: 375, height: 812 });
  for (const fixture of [
    { frame: "4a", proposal: viewed, question: true, resolved: true },
    { frame: "4b", proposal: signedWaiting, resolved: true },
  ] satisfies Fixture[]) {
    current = fixture;
    await test.step(fixture.frame, async () => {
      await page.goto(`/proposals/${fixture.proposal.id}?view=record`);
      await expect(hero.getByRole("heading", { level: 1 })).toHaveText(
        fixture.proposal.title,
      );
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(375);
      await expect(hero.locator(".record-next-actions")).toHaveCount(0);
      const dock = page.getByRole("group", { name: "Next actions" });
      await expect(
        dock.getByRole("link", { name: "View proposal" }),
      ).toBeVisible();
      await expect(dock.locator("[data-primary] .btn")).toHaveText(
        fixture.frame === "4a" ? "Reply" : "Review and countersign",
      );
      await expect(
        details.getByRole("button", { name: "Copy client link" }),
      ).toHaveCSS("height", "44px");
      if (capture)
        await page.screenshot({
          path: `${capture}/${fixture.frame}.png`,
          fullPage: true,
        });
    });
  }
});
