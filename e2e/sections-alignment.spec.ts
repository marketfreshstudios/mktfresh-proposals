import { test, expect } from "@playwright/test";
import { editorFixture } from "./editor-fixture";

for (const width of [1440, 1024, 768]) {
  test(`Sections rows and PAGE labels share the prototype text edge (40px in comparison) at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const f = await editorFixture(page, false, {
      content: [
        {
          id: "overview",
          type: "heading",
          level: 1,
          text: "Overview",
          ai_review: { source: "assistant", reviewed: false },
        },
        {
          id: "intro",
          type: "paragraph",
          text: "A clear plan for the next chapter.",
        },
        { id: "detail", type: "heading", level: 2, text: "Details" },
        { id: "subdetail", type: "heading", level: 3, text: "More details" },
        { id: "scope", type: "heading", level: 1, text: "What we’ll do" },
        {
          id: "scope-text",
          type: "paragraph",
          text: "Confirm the scope and prepare the launch.",
        },
        { id: "timeline", type: "heading", level: 1, text: "Timeline" },
        {
          id: "timeline-text",
          type: "paragraph",
          text: "Agree the milestones together.",
        },
        { id: "break-quote", type: "page_break" },
        {
          id: "investment",
          type: "heading",
          level: 1,
          text: "Your investment",
        },
        { id: "quote", type: "pricing_table" },
        { id: "break-contract", type: "page_break" },
        {
          id: "contract",
          type: "contract",
          text: "Statement of Work & Contract",
          clauses: [
            {
              id: "scope-clause",
              heading: "Scope",
              body: "The agreed scope and milestones.",
              show_when: null,
            },
          ],
        },
        { id: "client-signature", type: "signature_block", role: "client" },
        { id: "company-signature", type: "signature_block", role: "company" },
      ],
    });
    await page.goto(`/proposals/${f.draft.id}`);
    await expect(page.locator(".editor-page-sheets")).toHaveAttribute(
      "data-layout-settled",
      "true",
    );
    if (
      await page
        .getByRole("button", { name: "Expand Sections sidebar", exact: true })
        .isVisible()
    ) {
      await page
        .getByRole("button", { name: "Expand Sections sidebar", exact: true })
        .click();
    }
    const nav = page
      .getByRole("navigation", { name: "Sections", exact: true })
      .filter({ visible: true });
    const rows = nav.locator(".section-row");
    for (const name of [
      "Cover",
      "Overview",
      "What we’ll do",
      "Timeline",
      "Your investment",
      "Statement of Work & Contract",
      "Signatures",
    ]) {
      await expect(nav.getByText(name, { exact: true }).first()).toBeVisible();
    }
    const measure = () =>
      nav.evaluate((el) => {
        const surface = el.closest<HTMLElement>(
          ".editor-outline,.editor-v2-sections-drawer",
        )!;
        const origin =
          surface.getBoundingClientRect().left + surface.clientLeft;
        const read = (selector: string) =>
          [...el.querySelectorAll<HTMLElement>(selector)].map((node) => ({
            text: node.textContent,
            left: node.getBoundingClientRect().left - origin,
          }));
        return {
          items: read(".section-row > .section-label"),
          pages: read(".page-label"),
        };
      });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const initial = await measure();
      expect(initial.items.length).toBeGreaterThanOrEqual(9);
      expect(initial.pages.length).toBeGreaterThanOrEqual(3);
      // The comparison frame adds 12px: the prototype's 40px screenshot
      // edge is 28px within its sidebar (16px outer + 2px border + 10px row).
      for (const label of [...initial.items, ...initial.pages]) {
        expect(
          Math.abs(label.left + 12 - 40),
          JSON.stringify(label),
        ).toBeLessThanOrEqual(1);
      }
      const edges = [...initial.items, ...initial.pages].map(
        (label) => label.left,
      );
      expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);
      for (const row of await rows.all()) {
        await row.hover();
        await row.focus();
        const after = await measure();
        expect(after).toEqual(initial);
        const handle = await row.evaluate((el) => {
          const button = el
            .closest(".quote-sortable")
            ?.querySelector<HTMLElement>(":scope > .drag-handle");
          if (!button || getComputedStyle(button).opacity !== "1") return null;
          return {
            right: button.getBoundingClientRect().right,
            text: el.querySelector(".section-label")!.getBoundingClientRect()
              .left,
          };
        });
        if (handle) expect(handle.right).toBeLessThanOrEqual(handle.text - 4);
      }
    }
  });
}
