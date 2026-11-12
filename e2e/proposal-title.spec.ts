import { expect, test } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { coverElements, defaultCover } from "../src/lib/cover";

test.use({ viewport: { width: 1440, height: 900 } });

test("the top-bar title renames the proposal and keeps the cover in step", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {});
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const input = page.getByRole("textbox", { name: "Rename proposal" });
  await expect(input).toHaveValue(f.draft.title);
  await input.fill("A new site for {{client.company}}");
  await input.press("Enter");
  // Field codes are filled in before the title is saved.
  const company = f.draft.client.company;
  await expect.poll(() => f.active().title).toBe(`A new site for ${company}`);
  await expect(page.locator(".cover-title-line").first()).toHaveText(
    `A new site for ${company}`,
  );
  // Escape puts back the title from before the edit.
  await input.fill("Something else");
  await input.press("Escape");
  await expect(input).toHaveValue(`A new site for ${company}`);
  await expect.poll(() => f.active().title).toBe(`A new site for ${company}`);
});

test("editing a cover title with a client field saves the title with the company filled in", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {});
  const elements = coverElements(defaultCover(), f.draft.title).map((e) =>
    e.kind === "title"
      ? {
          ...e,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "A new website for " },
                  { type: "variable", attrs: { path: "client.company" } },
                ],
              },
            ],
          },
        }
      : e,
  );
  await page.goto(`/proposals/${f.draft.id}`);
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  await page.evaluate(
    async ([id, revision, cover]) => {
      await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, cover }),
      });
    },
    [f.draft.id, f.active().revision, { ...defaultCover(), elements }] as const,
  );
  await page.reload();
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
  const title = page.locator(".cover-title-line .tiptap").first();
  await title.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  const company = f.draft.client.company;
  await expect
    .poll(() => f.active().title)
    .toBe(`A new website for ${company}!`);
  await expect(
    page.getByRole("textbox", { name: "Rename proposal" }),
  ).toHaveValue(`A new website for ${company}!`);
});
