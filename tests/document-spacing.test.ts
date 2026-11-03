import { expect, it } from "vitest";
import { documentSpacing } from "../src/lib/document-spacing";
import { resolveStyles } from "../src/lib/proposal-styles";
import { documentQuote } from "../src/lib/document-quote";
import { setup } from "./helpers";
import type { QuoteItem } from "../src/lib/model";
it("uses one maximum gap for list/paragraph/heading neighbours without changing content", () => {
  const content = [
    {
      id: "list",
      type: "paragraph" as const,
      content: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "List" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    { id: "h1", type: "heading" as const, text: "Heading" },
    { id: "p1", type: "paragraph" as const, text: "Paragraph" },
    { id: "h2", type: "heading" as const, text: "Next heading" },
    { id: "list2", type: "paragraph" as const, text: "Another list" },
    { id: "p2", type: "paragraph" as const, text: "Last paragraph" },
  ];
  const before = JSON.stringify(content);
  const styles = resolveStyles(undefined, undefined, {
    body: { space_above: 4, space_below: 22 },
    heading1: { space_above: 12, space_below: 6 },
  });
  expect(documentSpacing(content, styles)).toMatchObject({
    h1: 22,
    p1: 6,
    h2: 22,
    list2: 6,
    p2: 22,
  });
  expect(JSON.stringify(content)).toBe(before);
});
it("prints compact single-price rows, labelled multiple sub-lines, accessible choices and unchanged totals", async () => {
  const f = await setup();
  const item: QuoteItem = {
    ...structuredClone(f.draft.quote[0]),
    name: "Care",
    description: "",
    optional: true,
    selected: false,
    default_selected: false,
    choice_group_id: crypto.randomUUID(),
    sublines: [
      {
        ...f.draft.quote[0].sublines[0],
        amount: 19500,
        interval: "month" as const,
        label: "Monthly",
      },
    ],
  };
  const html = documentQuote([item], "USD"),
    visible = html.replace(/<[^>]+>/g, "");
  expect(html).toContain('class="amount">$195/mo');
  expect(html).toContain('aria-label="not included"');
  expect(html).toContain("print-radio");
  expect(visible).not.toMatch(/Required|Included|Not included|Monthly\$195/);
  expect(html).toContain("<span>One-time</span><strong>$0</strong>");
  expect(html).toContain(
    "<span>Monthly</span><strong>$0<small>/mo</small></strong>",
  );
  item.sublines.push({
    ...item.sublines[0],
    id: crypto.randomUUID(),
    interval: "one_time",
    label: "Kickoff",
    amount: 50000,
  });
  const multi = documentQuote([item], "USD");
  expect(multi.match(/class="flow-subline"/g)).toHaveLength(2);
  expect(multi).toContain("Kickoff");
  expect(multi).toContain("$500");
});
