import { expect, it } from "vitest";
import { toolbarPosition } from "../src/lib/editor-toolbar-position";
const bounds = { left: 8, top: 80, right: 1016, bottom: 792 };
it("attaches above the block at natural width, regardless of neighbouring text", () => {
  for (const top of [160, 400, 740]) {
    const result = toolbarPosition({
      bounds,
      anchor: { left: 300, top, right: 800, bottom: top + 100 },
      width: 600,
      height: 40,
    });
    expect(result).toEqual({ left: 300, top: top - 48, width: 600 });
  }
});
it("sticks below the header while the block is partially scrolled off", () => {
  expect(
    toolbarPosition({
      bounds,
      anchor: { left: 300, top: 20, right: 800, bottom: 200 },
      width: 600,
      height: 40,
    }).top,
  ).toBe(80);
});
it("keeps full width inside the viewport instead of squeezing into a margin", () => {
  expect(
    toolbarPosition({
      bounds,
      anchor: { left: 700, top: 200, right: 900, bottom: 220 },
      width: 700,
      height: 40,
    }),
  ).toEqual({ left: 316, top: 152, width: 700 });
});
