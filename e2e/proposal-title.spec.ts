import { expect, test, type Page } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { coverElements, defaultCover } from "../src/lib/cover";

test.use({ viewport: { width: 1440, height: 900 } });

async function settled(page: Page) {
  await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
    "data-layout-settled",
    "true",
  );
}

test("renaming changes the name, and an unedited cover title follows it", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {});
  await page.goto(`/proposals/${f.draft.id}`);
  await settled(page);
  const input = page.getByRole("textbox", { name: "Rename proposal" });
  await expect(input).toHaveValue(f.draft.title);
  await input.fill("A new site for {{client.company}}");
  await input.press("Enter");
  // Field codes are filled in before the name is saved.
  const company = f.draft.client.company;
  await expect.poll(() => f.active().title).toBe(`A new site for ${company}`);
  // A cover title that was never edited shows the proposal name.
  await expect(page.locator(".cover-title-line").first()).toHaveText(
    `A new site for ${company}`,
  );
  // Escape puts back the name from before the edit.
  await input.fill("Something else");
  await input.press("Escape");
  await expect(input).toHaveValue(`A new site for ${company}`);
  await expect.poll(() => f.active().title).toBe(`A new site for ${company}`);
});

test("an edited cover title and the proposal name change independently", async ({
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
  await settled(page);
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
  await settled(page);
  const company = f.draft.client.company;
  const coverTitle = page.locator(".cover-title-line").first();
  await expect(coverTitle).toHaveText(`A new website for ${company}`);
  // Editing the cover title leaves the proposal name alone.
  await coverTitle.locator(".tiptap").click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(coverTitle.locator(".tiptap")).toHaveText(
    `A new website for ${company}!`,
  );
  await expect
    .poll(() =>
      JSON.stringify(
        f.active().cover?.elements?.find((e) => e.kind === "title")?.content,
      ),
    )
    .toContain("!");
  expect(f.active().title).toBe(f.draft.title);
  const input = page.getByRole("textbox", { name: "Rename proposal" });
  await expect(input).toHaveValue(f.draft.title);
  // Renaming leaves the edited cover title alone.
  await input.fill("Easley internal name");
  await input.press("Enter");
  await expect.poll(() => f.active().title).toBe("Easley internal name");
  await expect(coverTitle.locator(".tiptap")).toHaveText(
    `A new website for ${company}!`,
  );
});
