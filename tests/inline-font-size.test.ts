import { it, expect } from "vitest";
import {
  INLINE_FONT_SIZES,
  FontSizeMarkSchema,
  validateInlineSizes,
} from "../src/lib/inline-font-size";
import { renderBlocks } from "../src/lib/presentation";
import { CoverSchema, defaultCover } from "../src/lib/cover";
import { BandSchema } from "../src/lib/page-bands";
import { bandRichText } from "../src/components/editor/band-rich-text";
import { setup, staff } from "./helpers";
const text = (size: number) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "a",
          marks: [{ type: "fontSize", attrs: { size } }],
        },
        { type: "text", text: "bc" },
      ],
    },
  ],
});
it("preserves whitelisted inline size marks and renders them without changing unsized content", () => {
  for (const size of INLINE_FONT_SIZES) {
    expect(() => validateInlineSizes(text(size))).not.toThrow();
    expect(
      renderBlocks([{ type: "paragraph", content: text(size) }], [], {}),
    ).toContain(`data-inline-size="${size}"`);
  }
  for (const size of [0, 13, 17, 31, "30", "30px", NaN])
    expect(() =>
      FontSizeMarkSchema.parse({ type: "fontSize", attrs: { size } }),
    ).toThrow();
  expect(renderBlocks([{ type: "paragraph", text: "unchanged" }], [], {})).toBe(
    "<p>unchanged</p>",
  );
  expect(bandRichText(text(30))).toEqual(text(30));
  expect(
    BandSchema.parse({ layout: "left", slots: [text(30)] }).slots[0],
  ).toEqual(text(30));
  const c = defaultCover();
  c.elements = [
    { id: "title", kind: "title", align: "left", content: text(30) },
  ];
  expect(CoverSchema.parse(c).elements![0].content).toEqual(text(30));
  expect(
    renderBlocks([{ type: "heading", content: text(30), text: "abc" }], [], {}),
  ).toContain('data-inline-size="30"');
});
it("rejects unsupported sizes before saving, preserving revision and content", async () => {
  const { service, repo, draft } = await setup();
  const before = await repo.get(draft.id);
  await expect(
    service.edit(
      draft.id,
      {
        revision: draft.revision,
        content: [{ type: "paragraph", content: text(13) }],
      },
      staff,
    ),
  ).rejects.toThrow("preset font size");
  expect(await repo.get(draft.id)).toEqual(before);
});

it("leaves historical heading rendering unchanged and appends fields to rich headings", async () => {
  const { appendField } = await import("../src/lib/editor-document");
  const rich = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Heading", marks: [{ type: "bold" }] }],
      },
    ],
  };
  expect(
    renderBlocks([{ type: "heading", text: "Heading", content: rich }], [], {}),
  ).toBe('<h2 data-heading-level="1">Heading</h2>');
  const next = appendField(
    { type: "heading", text: "Heading", content: rich, rich_heading: true },
    "client.first_name",
  );
  expect(next.text).toBe("Heading{{client.first_name}}");
  expect(renderBlocks([next], [], { "client.first_name": "Jane" })).toContain(
    "<strong>Heading</strong>",
  );
  expect(renderBlocks([next], [], { "client.first_name": "Jane" })).toContain(
    "Jane",
  );
});

it("shared list typography scales markers and gaps without adding document marks", async () => {
  const { listMarkerCss } = await import("../src/lib/list-markers");
  const css = listMarkerCss(".proposal-typography", ".25em");
  expect(css).toContain(
    "li[data-list-size]::marker{font-size:var(--list-marker-size)}",
  );
  expect(css).toContain("line-height:var(--list-line-height)");
  expect(css).toContain("var(--list-gap-scale,1)");
});
