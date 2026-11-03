import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import type { Block } from "../src/lib/model";

function aiContent(): Block[] {
  return [
    { id: crypto.randomUUID(), type: "heading", text: "Scope" },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      text: "The agreed scope.",
      ai_review: { source: "assistant", reviewed: false },
    },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
    { id: crypto.randomUUID(), type: "signature_block", role: "company" },
  ];
}

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

for (const scenario of [
  "review response pending",
  "autosave already in flight",
  "new edits while reviewing",
] as const)
  test(`immediate Send waits for the latest revision: ${scenario}`, async ({
    page,
  }) => {
    const saved = gate(),
      reviewed = gate(),
      reviewApplied = gate();
    let reviewedRevision = 0;
    const f = await editorFixture(page, false, {
      content: aiContent(),
      beforeSave: async () => {
        if (scenario === "autosave already in flight") await saved.promise;
      },
      onReview: async (result) => {
        reviewedRevision = result.revision;
        reviewApplied.release();
        // The server has committed the review; its response has not reached the editor.
        await reviewed.promise;
      },
    });
    const sends: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === `/api/proposals/${f.draft.id}/send`
      )
        sends.push(request.postDataJSON());
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/proposals/${f.draft.id}`);
    await page.getByRole("tab", { name: "Send", exact: true }).click();
    const title = page.getByRole("textbox", {
      name: "Proposal title",
      exact: true,
    });
    try {
      if (scenario === "autosave already in flight") {
        await title.fill("Save this title before sending");
        await expect.poll(() => f.patches.length).toBe(1);
      }
      await page
        .getByRole("checkbox", {
          name: /I've reviewed these AI-written sections/,
        })
        .check();
      if (scenario === "review response pending") await reviewApplied.promise;
      if (scenario === "new edits while reviewing") {
        await reviewApplied.promise;
        await title.fill("Keep the edit made during review");
      }
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          new URL(r.url()).pathname === `/api/proposals/${f.draft.id}/send`,
      );
      // Do not wait for the review checkbox to disappear or for autosave to finish.
      await page
        .getByRole("button", { name: "Send to Jane", exact: true })
        .click();
      if (scenario === "autosave already in flight") {
        expect(reviewedRevision).toBe(0);
        expect(sends).toHaveLength(0);
      }
      saved.release();
      await reviewApplied.promise;
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(sends).toHaveLength(0);
      reviewed.release();
      const sent = await response;
      expect(sent.status()).toBe(200);
      await expect.poll(() => f.active().status).toBe("sent");
      expect(sends).toHaveLength(1);
      expect(sends[0].revision).toBe(f.active().revision - 1);
      expect(sends[0].revision).toBeGreaterThanOrEqual(reviewedRevision);
      expect(f.active().content[1].ai_review?.reviewed).toBe(true);
      if (scenario === "autosave already in flight") {
        expect(f.active().title).toBe("Save this title before sending");
        expect(f.patches).toHaveLength(1);
      }
      if (scenario === "new edits while reviewing") {
        expect(f.active().title).toBe("Keep the edit made during review");
        expect(f.patches).toHaveLength(1);
        expect(f.patches[0].revision).toBe(reviewedRevision);
      }
    } finally {
      saved.release();
      reviewed.release();
    }
  });

test("Send retains the 409 protection for another session's edit after review", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content: aiContent() });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.getByRole("tab", { name: "Send", exact: true }).click();
  const checkbox = page.getByRole("checkbox", {
    name: /I've reviewed these AI-written sections/,
  });
  await checkbox.check();
  await expect(checkbox).toHaveCount(0);
  const reviewedRevision = f.active().revision;
  await f.editRemote({ title: "Another staff member's newer title" });
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `/api/proposals/${f.draft.id}/send`,
  );
  await page.getByRole("button", { name: "Send to Jane", exact: true }).click();
  const rejected = await response;
  expect(rejected.request().postDataJSON().revision).toBe(reviewedRevision);
  expect(rejected.status()).toBe(409);
  expect(f.active().status).toBe("draft");
  expect(f.active().title).toBe("Another staff member's newer title");
  expect(f.active().events.filter((e) => e.type === "sent")).toHaveLength(0);
});
