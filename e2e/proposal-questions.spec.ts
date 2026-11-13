import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { setup } from "../tests/helpers";
import type { EmailLog } from "../src/lib/email-templates";
import type { Proposal } from "../src/lib/model";

test.use({ hasTouch: true });

const staff = { Authorization: "Bearer e2e-staff-secret-only" };
const client = { Origin: "http://127.0.0.1:3100" };
const shots = ".data/evidence/r25-questions";
async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_QUESTIONS !== "1") return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({
    path: `${shots}/${name}.png`,
    animations: "disabled",
  });
}

const scopeText =
  "A clear plan for the first milestone, followed by a review of the work together.";

async function sent(
  request: APIRequestContext,
  title: string,
  password?: string,
) {
  const { settings } = await setup();
  const uid = () => crypto.randomUUID();
  const clientId = uid(),
    template = uid(),
    item = uid(),
    scope = uid(),
    paragraph = uid();
  for (const [path, data] of [
    ["workspace_settings", settings],
    [
      "clients",
      {
        id: clientId,
        company: `Acme ${clientId.slice(0, 6)}`,
        first_name: "Jane",
        last_name: "Doe",
        email: `jane-${clientId}@example.test`,
      },
    ],
    [
      "pricing_items",
      {
        id: item,
        sku: `scope-${item}`,
        name: "Project planning",
        amount: 275000,
        interval: "one_time",
        qbo_item_ref: "mock-planning",
      },
    ],
    [
      "templates",
      {
        id: template,
        name: `Q&A fixture ${title}`,
        active: true,
        content: [
          { id: scope, type: "heading", text: "Scope", level: 1 },
          {
            id: paragraph,
            type: "paragraph",
            text: scopeText,
          },
          { id: uid(), type: "pricing_table" },
          { id: uid(), type: "signature_block", role: "client" },
          { id: uid(), type: "signature_block", role: "company" },
        ],
        default_quote: [
          { pricing_item_id: item, qty: 1, optional: false, selected: true },
        ],
      },
    ],
  ] as const) {
    const response = await request.post(`/api/${path}`, {
      headers: staff,
      data,
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const creation = await request.post("/api/proposals", {
    headers: staff,
    data: { client_id: clientId, template_id: template, title },
  });
  expect(creation.status(), await creation.text()).toBe(201);
  const p: Proposal = await creation.json();
  const response = await request.post(`/api/proposals/${p.id}/send`, {
    headers: staff,
    data: {
      revision: p.revision,
      delivery_method: "manual",
      ...(password ? { password } : {}),
      pagination: {
        format: 1,
        pages: 2,
        starts: [
          {
            page: 2,
            block: scope,
            marker: p.content[0].id,
            explicit: true,
            offset: 0,
          },
        ],
      },
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return { p: (await response.json()) as Proposal, scope, paragraph };
}

test("client question reaches staff, receives a plain-text reply on the same link, and leaves review and signing intact", async ({
  page,
  request,
}) => {
  page.setDefaultTimeout(12000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { p, scope, paragraph } = await sent(request, "Website project");
  const clientUrl = `/p/${p.token}`,
    staffUrl = `/proposals/${p.id}`;
  const log = async () =>
    (await (
      await request.get(`/api/proposals/${p.id}/emails`, { headers: staff })
    ).json()) as EmailLog[];
  await page.goto(clientUrl);
  await expect(
    page.getByRole("button", { name: "Ask a question", exact: true }),
  ).toBeVisible();
  const pageAsk = page
    .getByRole("button", { name: "Ask about this page", exact: true })
    .first();
  const sheet = page.getByRole("region", { name: "Page 1", exact: true });
  await expect(pageAsk).toBeVisible();
  const frame = (await sheet.boundingBox())!;
  const pageButton = (await pageAsk.boundingBox())!;
  expect(
    Math.abs(pageButton.x + pageButton.width / 2 - (frame.x + frame.width)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(pageButton.y + pageButton.height / 2 - frame.y),
  ).toBeLessThanOrEqual(1);
  const totals = page.getByRole("group", { name: "Proposal totals" });
  await expect(totals).toContainText("$2,750");
  await expect(totals.getByText("Monthly", { exact: true })).toHaveCount(0);
  await expect(
    page.locator("#proposal-document .signature-date").first(),
  ).toHaveText(`${p.client.company} | Date signed`);
  await capture(page, "client-ask-1440");
  const block = page.locator(`[data-document-block="${scope}"]`);
  await expect(block).toHaveAttribute("tabindex", "0");
  const frozenPlan = await page
    .locator("#proposal-document")
    .getAttribute("data-page-plan");
  await block.hover();
  const askBlock = page.getByRole("button", { name: "Ask about this heading" });
  await expect(askBlock).toBeVisible();
  expect((await askBlock.boundingBox())!.x).toBeGreaterThanOrEqual(
    (await block.boundingBox())!.x + (await block.boundingBox())!.width,
  );
  await capture(page, "r25-desktop-block");
  await block.focus();
  await block.press("Enter");
  const form = page.getByRole("dialog", { name: "Ask a question" });
  await expect(form.getByText("Scope", { exact: true })).toHaveCount(1);
  // The desktop panel docks over the right rail, never over the document.
  const rail = (await page.locator(".flow-reading-rail").boundingBox())!;
  const docked = (await page.locator(".client-ask-popover").boundingBox())!;
  expect(Math.abs(docked.x - rail.x)).toBeLessThanOrEqual(1);
  expect(docked.x).toBeGreaterThanOrEqual(
    (await block.boundingBox())!.x + (await block.boundingBox())!.width,
  );
  await page.mouse.wheel(0, 600);
  await expect(form).toBeVisible();
  await page.mouse.wheel(0, -600);
  await expect(form.locator(".question-excerpt")).toHaveCount(0);
  await form.getByRole("button", { name: "Change" }).click();
  await expect(form.getByRole("combobox", { name: "Section" })).toHaveValue(
    `section:${scope}`,
  );
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(block).toBeFocused();
  await page.locator(`[data-document-block="${paragraph}"]`).press("Enter");
  await expect(form.getByText("Scope", { exact: true })).toBeVisible();
  await expect(form.locator(".question-excerpt")).toHaveText(scopeText);
  await expect(form.getByLabel("Your email")).toHaveCount(0);
  const text = process.env.CAPTURE_QUESTIONS
    ? "Can we review the first milestone together before moving to the next phase?"
    : "Can we review the first milestone? <img src=x onerror=alert(1)>";
  await form.getByLabel("Your question", { exact: true }).fill(text);
  await capture(page, "r25-desktop-form");
  expect(
    (await new AxeBuilder({ page }).include(".client-ask-popover").analyze())
      .violations,
  ).toEqual([]);
  await form
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  const questions = page.getByRole("region", { name: "Your questions" });
  await expect(questions.getByText(text, { exact: true })).toBeVisible();
  await expect(questions.locator("img")).toHaveCount(0);
  await expect(
    page.getByText("Your question | waiting for a reply"),
  ).toBeVisible();
  await expect(page.locator("#proposal-document")).toHaveAttribute(
    "data-page-plan",
    frozenPlan!,
  );
  const threadData = await (
    await request.get(`/api/proposals/${p.id}/questions`, { headers: staff })
  ).json();
  const id = threadData.threads[0].id;
  expect(threadData.threads[0]).toMatchObject({
    block_id: paragraph,
    excerpt: scopeText,
  });
  await expect(
    page.getByRole("button", { name: "Review and sign", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(
      async () =>
        (await log()).filter(
          (e) => e.snapshot.template_key === "staff_question",
        ).length,
    )
    .toBe(1);
  expect(
    (await log()).find((e) => e.snapshot.template_key === "staff_question")
      ?.snapshot.to,
  ).toBe("staff@example.test");
  await page.goto("/proposals");
  await expect(
    page.getByText("New client question | 1 open question", { exact: true }),
  ).toBeVisible();
  await capture(page, "proposals-badge-1440");
  // Keep the client page open while staff replies: the reply arrives in place.
  const waitingPage = await page.context().newPage();
  await waitingPage.setViewportSize({ width: 1440, height: 1000 });
  await waitingPage.goto(clientUrl);
  await expect(
    waitingPage
      .getByRole("region", { name: "Your questions" })
      .getByText("Waiting for a reply"),
  ).toBeVisible();
  await page.goto(staffUrl);
  const panel = page.getByRole("region", { name: "Questions", exact: true });
  await expect(
    panel.getByText("New client question", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Reply", exact: true }).click();
  await panel
    .getByLabel("Your reply")
    .fill(
      "Yes. We’ll set up a call to review it and confirm the next phase together.",
    );
  await capture(page, "staff-questions-1440");
  await panel.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(panel.getByText("Answered", { exact: true })).toBeVisible();
  await waitingPage.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const answeredToast = waitingPage
    .getByRole("status")
    .filter({ hasText: "You have a reply to your question." });
  await expect(answeredToast).toBeVisible();
  // Replies are open by default, with no View reply toggle.
  await expect(
    waitingPage
      .getByRole("region", { name: "Your questions" })
      .getByText(/set up a call to review/),
  ).toBeVisible();
  await answeredToast.getByRole("button", { name: "View" }).click();
  await expect(answeredToast).toHaveCount(0);
  await waitingPage.close();
  for (const method of ["PATCH", "DELETE"]) {
    const response = await request.fetch(
      `/api/public/${p.token}/questions/${id}`,
      {
        method,
        headers: client,
        ...(method === "PATCH" ? { data: { text: "Too late" } } : {}),
      },
    );
    expect(response.status()).toBe(409);
  }
  await expect
    .poll(
      async () =>
        (await log()).filter(
          (e) => e.snapshot.template_key === "question_reply",
        ).length,
    )
    .toBe(1);
  const reply = (await log()).find(
    (e) => e.snapshot.template_key === "question_reply",
  )!.snapshot;
  expect(reply.to).toBe(p.client.email);
  expect(reply.button_label).toBe("View reply");
  expect(reply.text).not.toMatch(/2750|\$|milestone/);
  expect(new URL(reply.button_url).pathname).toBe(clientUrl);
  expect(new URL(reply.button_url).hash).toMatch(/^#question-/);
  await page.goto(reply.button_url);
  await expect(questions.getByText(/set up a call to review/)).toBeVisible();
  // The emailed link opens the question once, then leaves the address so
  // coming back from the sign step doesn't reopen it over the document.
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await capture(page, "client-reply-1440");
  // The client answers back in the same conversation; it reopens for staff.
  await questions.getByRole("button", { name: "Reply", exact: true }).click();
  await questions
    .getByLabel("Your reply")
    .fill("Thanks. Tuesday morning works for the call.");
  await questions
    .getByRole("button", { name: "Send reply", exact: true })
    .click();
  await expect(
    questions.getByText("Thanks. Tuesday morning works for the call."),
  ).toBeVisible();
  await expect(
    questions.locator(".question-reply.from-client").getByText("You"),
  ).toBeVisible();
  await expect(questions.getByText("Waiting for a reply")).toBeVisible();
  const reopened = (
    await (
      await request.get(`/api/proposals/${p.id}/questions`, { headers: staff })
    ).json()
  ).threads[0];
  expect(reopened.status).toBe("open");
  expect(reopened.replies.map((r: { from?: string }) => r.from)).toEqual([
    undefined,
    "client",
  ]);
  await expect
    .poll(
      async () =>
        (await log()).filter(
          (e) => e.snapshot.template_key === "staff_question",
        ).length,
    )
    .toBe(2);
  await page.setViewportSize({ width: 375, height: 780 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const header = page.locator(".flow-header");
  const progress = (await header
    .getByRole("navigation", { name: "Proposal progress" })
    .boundingBox())!;
  const headerButton = (await header
    .getByRole("button", { name: "Ask a question", exact: true })
    .boundingBox())!;
  expect(headerButton.y).toBeGreaterThan(progress.y + progress.height);
  await capture(page, "r25-phone-reading");
  await page.getByRole("link", { name: "Questions", exact: true }).click();
  const history = page.getByRole("dialog", { name: "Your questions" });
  await expect(history.getByText(/set up a call to review/)).toBeVisible();
  await capture(page, "r25-phone-history");
  await history.getByRole("button", { name: "Close", exact: true }).click();
  await expect(totals.getByText("Monthly", { exact: true })).toHaveCount(0);
  await expect(
    page.locator("#proposal-document .signature-date").first(),
  ).toHaveText(`${p.client.company} | Date signed`);
  const phoneHeading = page.locator(`[data-document-block="${scope}"]`);
  await phoneHeading.tap();
  await expect(phoneHeading).not.toHaveAttribute("tabindex", "0");
  await expect(
    page.getByRole("button", { name: "Ask about this heading" }),
  ).toHaveCount(0);
  await expect(form).toHaveCount(0);
  // The floating ask button sits above the bottom bar, where toasts appear.
  const toastDismiss = page
    .locator(".client-question-toast")
    .getByRole("button", { name: "Dismiss notification" });
  if (await toastDismiss.count()) await toastDismiss.first().tap();
  await header
    .getByRole("button", { name: "Ask a question", exact: true })
    .tap();
  await form.getByRole("button", { name: "Change" }).click();
  await form
    .getByRole("combobox", { name: "Section" })
    .selectOption(`section:${scope}`);
  await expect(form.getByText("Scope", { exact: true })).toHaveCount(1);
  await form.getByRole("button", { name: "Cancel" }).click();
  const phoneBlock = page.locator(`[data-document-block="${paragraph}"]`);
  await phoneBlock.tap();
  const phoneAsk = page.getByRole("button", {
    name: "Ask about this paragraph",
  });
  await expect(phoneAsk).toHaveCSS("height", "44px");
  await capture(page, "r25-phone-block");
  // A second tap on the same block clears the highlight; a third brings it back.
  await phoneBlock.tap();
  await expect(phoneAsk).toHaveCount(0);
  await expect(phoneBlock).not.toHaveAttribute("data-client-asking", /.+/);
  await phoneBlock.tap();
  await expect(phoneAsk).toHaveCSS("height", "44px");
  await phoneAsk.tap();
  await expect(form.getByLabel("Your question", { exact: true })).toBeVisible();
  await form
    .getByLabel("Your question", { exact: true })
    .fill("Can we make the review call in the morning?");
  await capture(page, "r25-phone-form");
  expect(
    (await new AxeBuilder({ page }).include(".client-question-sheet").analyze())
      .violations,
  ).toEqual([]);
  await form.getByRole("button", { name: "Send question" }).click();
  await expect(
    page
      .getByRole("status")
      .getByText("Question sent. We’ll email you when there’s a reply."),
  ).toBeVisible();
  await capture(page, "r25-phone-marker");
  await page.getByRole("link", { name: "Questions", exact: true }).click();
  await history.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit question" });
  await edit.getByLabel("Your question").fill("Can we meet on Tuesday?");
  await edit.getByRole("button", { name: "Save question" }).click();
  await expect(history.getByText("Can we meet on Tuesday?")).toBeVisible();
  await history.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete question?" })
    .getByRole("button", { name: "Delete question" })
    .click();
  await expect(history.getByText("Can we meet on Tuesday?")).toHaveCount(0);
  const stored: Proposal = await (
    await request.get(`/api/proposals/${p.id}`, { headers: staff })
  ).json();
  expect(stored.versions.map((v) => v.content_hash)).toEqual(
    p.versions.map((v) => v.content_hash),
  );
  expect(stored.revision).toBe(p.revision);
  expect(stored.first_viewed_at).toBeNull();
});

test("question endpoints honor passwords, the hourly limit, proposal isolation, and closed links", async ({
  request,
}) => {
  const { p } = await sent(request, "Protected proposal", "test-password");
  const url = `/api/public/${p.token}/questions`;
  const headers = { ...client, "x-proposal-password": "test-password" };
  expect((await request.get(url, { headers: client })).status()).toBe(401);
  expect(
    (
      await request.post(url, {
        headers: client,
        data: { id: crypto.randomUUID(), text: "Question" },
      })
    ).status(),
  ).toBe(401);
  const body = { id: crypto.randomUUID(), text: "Private question" };
  expect((await request.post(url, { headers, data: body })).status()).toBe(201);
  expect((await request.post(url, { headers, data: body })).status()).toBe(201);
  const { p: other } = await sent(request, "Other proposal");
  expect(
    (
      await request.delete(`/api/public/${other.token}/questions/${body.id}`, {
        headers: client,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.patch(`${url}/${body.id}`, {
        headers: client,
        data: { text: "Password required" },
      })
    ).status(),
  ).toBe(401);
  expect(
    await (await request.get(`/api/public/${other.token}/questions`)).json(),
  ).toMatchObject({ threads: [] });
  expect(
    (
      await request.post(`/api/proposals/${other.id}/questions/${body.id}`, {
        headers: staff,
        data: { action: "resolve" },
      })
    ).status(),
  ).toBe(404);
  for (let i = 0; i < 9; i++)
    expect(
      (
        await request.post(url, {
          headers,
          data: { ...body, id: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(201);
  const deleted = await request.delete(`${url}/${body.id}`, { headers });
  expect(deleted.status()).toBe(200);
  const limited = await request.post(url, {
    headers,
    data: { ...body, id: crypto.randomUUID() },
  });
  expect(limited.status()).toBe(429);
  expect(limited.headers()["retry-after"]).toBe("3600");
  const declined = await request.post(`/api/public/${p.token}/decline`, {
    headers,
    data: {},
  });
  expect(declined.ok(), await declined.text()).toBe(true);
  expect((await request.get(url, { headers })).status()).toBe(410);
  expect(
    (
      await request.post(url, {
        headers,
        data: { ...body, id: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(410);
  const result = await (
    await request.get(`/api/proposals/${p.id}/questions`, { headers: staff })
  ).json();
  expect(result).toMatchObject({
    can_reply: false,
    threads: expect.any(Array),
  });
  expect(result.threads).toHaveLength(9);
});
