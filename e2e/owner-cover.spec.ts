import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { contentAfterCover, defaultCover } from "../src/lib/cover";
test("new default cover is ordered, editable and alone on page 1", async ({
  page,
}) => {
  const f = await editorFixture(page, false, {
    content: contentAfterCover([
      { id: "scope", type: "heading", text: "Scope starts here" },
      {
        id: "body",
        type: "paragraph",
        text: "The body starts after the cover.",
      },
    ]),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/proposals/${f.draft.id}`);
  await page.locator(".editor-page-sheets[data-layout-settled=true]").waitFor();
  const cover = page.locator(".document-cover");
  await expect(cover.locator(".flow-eyebrow")).toHaveCount(0);
  await expect(cover.locator(".flow-prepared-for")).toContainText(
    "Prepared for Acme",
  );
  await expect(cover.locator(".flow-byline")).not.toContainText("From ");
  await expect(page.locator(".page-sheet")).toHaveCount(2);
  const second = (await page.locator(".page-sheet").nth(1).boundingBox())!,
    heading = (await page
      .locator('[data-block-id="block-scope"]')
      .boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(second.y);
  await cover
    .getByLabel("Cover client name")
    .fill("Prepared especially for {{client.company}}");
  await expect
    .poll(() => f.active().cover?.prepared_for)
    .toBe("Prepared especially for {{client.company}}");
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  await expect.poll(() => f.renders.length).toBe(1);
  const rendered = f.renders[0];
  expect(rendered.layout.pages).toBe(2);
  expect(rendered.layout.sheets![0].html).not.toContain("Scope starts here");
  expect(rendered.layout.sheets![1].html).toContain("Scope starts here");
  expect(rendered.layout.sheets![0].html).toContain("Prepared especially for");
});
