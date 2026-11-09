import { expect, test } from "vitest";
import { reviewBlocks } from "../src/lib/ai-review";
import { blockBoxCss, blockBoxStyle } from "../src/lib/block-style";
import { colorContrast, whiteContrast } from "../src/lib/brand";
import { documentSpacing } from "../src/lib/document-spacing";
import type { Block } from "../src/lib/model";
import {
  printContent,
  printCss,
  printPageCss,
} from "../src/lib/document-print";
import { sha256 } from "../src/lib/content";
import { documentStyleCss, resolveStyles } from "../src/lib/proposal-styles";

test("block styles opt in and use the same declarations in JSX and print", () => {
  expect(blockBoxStyle()).toBeUndefined();
  expect(blockBoxCss({ padding: "none", margin_below: "none" })).toBe("");
  expect(
    blockBoxCss({
      background: "neutral",
      padding: "l",
      border: "medium",
      border_color: "#123456",
      radius: "m",
    }),
  ).toBe(
    "background-color:#f3f0ea;print-color-adjust:exact;padding:40px;border:2px solid #123456;border-radius:8px;",
  );
});

test("block spacing replaces the matching style edge and retains pair-wise spacing", () => {
  const blocks: Block[] = [
    { type: "heading", id: "heading" },
    { type: "paragraph", id: "body" },
  ];
  const styles = resolveStyles();
  expect(documentSpacing(blocks, styles)).toEqual({
    heading: 27.5,
    body: 8.75,
  });
  blocks[0].style = { margin_below: "l" };
  blocks[1].style = { margin_above: "m" };
  expect(documentSpacing(blocks, styles).body).toBe(40);
  blocks[0].style = { margin_below: "none" };
  expect(documentSpacing(blocks, styles).body).toBe(24);
  blocks[1].style = { margin_above: "none" };
  expect(documentSpacing(blocks, styles).body).toBe(0);
});

test("block styles refuse invalid CSS and preserve fixed legal paint", () => {
  expect(() =>
    reviewBlocks(
      [{ type: "paragraph", style: { background: "#000;background:red" } }],
      false,
    ),
  ).toThrow();
  for (const type of ["contract", "signature_block"] as const) {
    expect(() =>
      reviewBlocks([{ type, style: { border: "thin" } }], false),
    ).toThrow("keep their fixed background and border");
    expect(
      reviewBlocks([{ type, style: { padding: "s" } }], false)[0].style,
    ).toEqual({
      padding: "s",
    });
  }
  expect(() =>
    reviewBlocks([{ type: "page_break", style: { padding: "m" } }], false),
  ).toThrow("Page breaks");
});

test("background contrast checks use both actual colors", () => {
  expect(colorContrast("#25241f", "#ffffff")).toBeCloseTo(
    whiteContrast("#25241f"),
    8,
  );
  expect(colorContrast("#25241f", "#333333")).toBeLessThan(4.5);
  expect(colorContrast("#25241f", "#f3f0ea")).toBeGreaterThan(4.5);
});

test("an unstyled document keeps its exact pre-feature print source and CSS", () => {
  const styles = resolveStyles();
  const source = printContent({
    title: "Original proposal",
    company: "Client",
    sender: "Sender",
    validity: "",
    content: [
      { id: "overview", type: "heading", text: "Overview" },
      {
        id: "intro",
        type: "paragraph",
        text: "This document has no block styles.",
      },
    ],
    quote: [],
    variables: {},
    currency: "USD",
    legacyCover: true,
    currentLayout: true,
    styles,
    planned: true,
  });
  expect(
    sha256(printCss + printPageCss(styles) + documentStyleCss(styles) + source),
  ).toBe("a7e4ecd9eece557aa49ea277432c2ea8de163e59116fb2df7e40e023df45a4f3");
});
