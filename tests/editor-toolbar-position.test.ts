import { expect, it } from "vitest";
import {
  toolbarPosition,
  type ToolbarRect,
} from "../src/lib/editor-toolbar-position";
const r = (
  left: number,
  top: number,
  right: number,
  bottom: number,
): ToolbarRect => ({ left, top, right, bottom });
const intersects = (a: ToolbarRect, b: ToolbarRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
it("moves a prepared-for toolbar past neighbouring cover lines instead of covering the title", () => {
  const obstacles = [
    r(64, 80, 696, 100),
    r(64, 120, 696, 200),
    r(64, 220, 696, 240),
    r(64, 260, 696, 280),
  ];
  const result = toolbarPosition({
    bounds: r(8, 8, 752, 800),
    anchor: obstacles[2],
    width: 500,
    height: 40,
    gap: 14,
    obstacles,
  })!;
  expect(result.top).toBe(294);
  expect(result.width).toBe(500);
  expect(
    obstacles.some((o) =>
      intersects(
        r(result.left, result.top, result.left + result.width, result.top + 40),
        o,
      ),
    ),
  ).toBe(false);
});
it("keeps neighbouring body blocks and bands clear, preferring nearby free space", () => {
  for (const below of [false, true]) {
    const obstacles = [
      r(64, 100, 696, 124),
      r(64, 136, 696, 160),
      r(64, 172, 696, 196),
    ];
    const result = toolbarPosition({
      bounds: r(8, 8, 752, 280),
      anchor: obstacles[1],
      width: 600,
      height: 40,
      below,
      obstacles,
    })!;
    expect(
      obstacles.some((o) =>
        intersects(
          r(
            result.left,
            result.top,
            result.left + result.width,
            result.top + 40,
          ),
          o,
        ),
      ),
    ).toBe(false);
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + result.width).toBeLessThanOrEqual(752);
    expect(result.top + 40).toBeLessThanOrEqual(280);
  }
});
it("uses a scrolling toolbar in an empty margin on a dense page instead of hiding text", () => {
  const obstacles = Array.from({ length: 10 }, (_, n) =>
    r(68, n * 24, 392, n * 24 + 20),
  );
  const result = toolbarPosition({
    bounds: r(8, 8, 392, 232),
    anchor: obstacles[4],
    width: 340,
    height: 40,
    obstacles,
  })!;
  expect(result.width).toBeGreaterThanOrEqual(44);
  expect(result.width).toBeLessThan(340);
  expect(
    obstacles.some((o) =>
      intersects(
        r(result.left, result.top, result.left + result.width, result.top + 40),
        o,
      ),
    ),
  ).toBe(false);
});
it("does not return a placement outside a page with no free space", () => {
  expect(
    toolbarPosition({
      bounds: r(0, 0, 100, 40),
      anchor: r(0, 0, 100, 40),
      width: 100,
      height: 40,
      obstacles: [r(0, 0, 100, 40)],
    }),
  ).toBeUndefined();
});
