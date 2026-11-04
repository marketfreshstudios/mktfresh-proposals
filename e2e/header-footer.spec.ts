import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";
import { defaultHeaderFooter, pageContentHeight } from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
import type { Block } from "../src/lib/model";
const content: Block[] = Array.from({ length: 3 }, (_, n) => [
  ...(n ? [{ id: `break-${n}`, type: "page_break" as const }] : []),
  { id: `heading-${n}`, type: "heading" as const, text: `Page ${n + 1}` },
  {
    id: `text-${n}`,
    type: "paragraph" as const,
    text: "A clear proposal with the same page geometry in editing and print.",
  },
]).flat();
test("canonical editor and PDF content areas match every band height and switch state", async ({
  page,
}) => {
  const f = await editorFixture(page, false, { content });
  await page.setViewportSize({ width: 1920, height: 1200 });
  for (const bandHeightIn of [0.4, 0.5, 0.75] as const)
    for (const showHeader of [false, true])
      for (const showFooter of [false, true]) {
        const hf = {
          ...defaultHeaderFooter(),
          bandHeightIn,
          showHeader,
          showFooter,
        };
        await f.editRemote({ header_footer: hf });
        await page.goto(`/proposals/${f.draft.id}`);
        await page
          .locator(".editor-page-sheets[data-layout-settled=true]")
          .waitFor();
        const areas = await page
          .locator(".editor-paper .page-sheet")
          .evaluateAll((els) =>
            els.map((el) => {
              const s = getComputedStyle(el);
              return {
                height:
                  el.getBoundingClientRect().height -
                  parseFloat(s.paddingTop) -
                  parseFloat(s.paddingBottom),
                canonical: Number(el.getAttribute("data-content-height")),
              };
            }),
          );
        expect(areas).toHaveLength(3);
        const before = f.renders.length;
        await page
          .getByRole("button", { name: "Preview PDF", exact: true })
          .click();
        await expect.poll(() => f.renders.length).toBe(before + 1);
        const rendered = f.renders.at(-1)!;
        expect(rendered.layout.pages).toBe(3);
        for (let n = 0; n < 3; n++) {
          const expected = pageContentHeight(
            resolveStyles(f.settings),
            hf,
            n + 1,
          );
          expect(areas[n].canonical).toBeCloseTo(expected, 1);
          expect(Math.abs(areas[n].height - expected)).toBeLessThanOrEqual(1);
          expect(
            Math.abs(
              rendered.layout.sheets![n].content_area!.height - expected,
            ),
          ).toBeLessThanOrEqual(1);
        }
      }
});
