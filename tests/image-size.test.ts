import { expect, it } from "vitest";
import { constrainedImageSize, imagePercent } from "../src/lib/image-size";
it("locked proportions respect width, minimum size and the band margin max", () => {
  expect(constrainedImageSize(180, 16 / 9, 640)).toEqual({
    width: 320,
    height: 180,
  });
  expect(constrainedImageSize(400, 2, 320)).toEqual({
    width: 320,
    height: 160,
  });
  expect(constrainedImageSize(2, 2, 640)).toEqual({ width: 32, height: 16 });
  expect(constrainedImageSize(100, 2, 640, 24)).toEqual({
    width: 48,
    height: 24,
  });
  expect(constrainedImageSize(100, 2, 640, 0)).toEqual({ width: 0, height: 0 });
  expect(imagePercent(320, 640)).toBe(50);
});
