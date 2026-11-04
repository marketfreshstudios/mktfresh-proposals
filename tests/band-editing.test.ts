import { expect, it } from "vitest";
import {
  BandSchema,
  defaultHeaderFooter,
  defaultTemplateBands,
} from "../src/lib/page-bands";
import { bandRichText } from "../src/components/editor/band-rich-text";
import { resetBandSettings } from "../src/components/editor/reset-band-settings";
it("resets shared template presentation while retaining switches and per-page overrides", () => {
  const current = defaultHeaderFooter();
  current.showHeader = false;
  current.showFooter = false;
  current.overrides.cover = { footer: "hidden" };
  const template = defaultTemplateBands();
  template.shared.header.slots[0].content = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Current saved template" }],
    },
  ];
  template.divider = false;
  template.bandHeightIn = 0.75;
  template.showOnCover = true;
  const reset = resetBandSettings(current, template);
  expect(reset.shared).toEqual(template.shared);
  expect(reset).toMatchObject({
    showHeader: false,
    showFooter: false,
    divider: false,
    bandHeightIn: 0.75,
    showOnCover: true,
    overrides: current.overrides,
  });
  expect(current.shared).not.toEqual(template.shared);
  reset.shared.header.slots[0].content = [];
  expect(template.shared.header.slots[0].content).not.toEqual([]);
});
it("falls back to built-in shared bands if the template has been deleted or has no saved bands", () => {
  const current = defaultHeaderFooter();
  current.divider = false;
  expect(resetBandSettings(current).shared).toEqual(
    defaultTemplateBands().shared,
  );
  expect(resetBandSettings(current).divider).toBe(true);
});

it("stores pasted/editor list and link content in the strict band format without losing text, fields or marks", () => {
  const source = {
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 1, type: null },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Read this ",
                    marks: [{ type: "bold" }],
                  },
                  { type: "variable", attrs: { path: "page.number" } },
                  {
                    type: "text",
                    text: " link",
                    marks: [
                      {
                        type: "link",
                        attrs: {
                          href: "https://example.test",
                          target: "_blank",
                          rel: "noopener",
                          class: null,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  } as any;
  const value = bandRichText(source);
  expect(() =>
    BandSchema.parse({ layout: "left", slots: [value] }),
  ).not.toThrow();
  expect(value.content![0].attrs).toBeUndefined();
  const nodes = value.content![0].content![0].content![0].content!;
  expect(nodes.map((n) => n.text ?? n.attrs?.path).join("")).toBe(
    "Read this page.number link",
  );
  expect(nodes[0].marks).toEqual([{ type: "bold" }]);
  expect(nodes[2].marks).toEqual([
    { type: "link", attrs: { href: "https://example.test" } },
  ]);
  expect((source.content[0].attrs as any).start).toBe(1);
});
