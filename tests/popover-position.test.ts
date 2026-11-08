import { it, expect } from "vitest";
import { anchoredPopover } from "../src/lib/popover-position";
it("anchors compact menus to the trigger, flipping only when necessary", () => {
  const anchor = {
    left: 1000,
    right: 1044,
    top: 20,
    bottom: 64,
    width: 44,
    height: 44,
  };
  const viewport = { left: 8, top: 8, right: 1432, bottom: 992 };
  expect(
    anchoredPopover(anchor, { width: 240, height: 180 }, viewport),
  ).toMatchObject({ left: 804, top: 68 });
  expect(
    anchoredPopover(
      { ...anchor, top: 950, bottom: 994 },
      { width: 240, height: 180 },
      viewport,
    ),
  ).toMatchObject({ left: 804, top: 766 });
  expect(
    anchoredPopover(
      { ...anchor, left: 10, right: 54 },
      { width: 300, height: 180 },
      { ...viewport, right: 367 },
    ),
  ).toMatchObject({ left: 8, top: 68 });
});
