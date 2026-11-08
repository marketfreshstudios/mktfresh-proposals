import { describe, it, expect } from "vitest";
import {
  americanEnglishViolations,
  checkAmericanEnglish,
  sourceCopy,
  proseOnly,
} from "../scripts/check-american-english";
describe("American English copy", () => {
  it("checks actual UI literals without renaming persisted keys and aliases", () => {
    expect(
      americanEnglishViolations(
        sourceCopy(
          `const colour = {colour: "#000000"}; const route="/catalogue"; const a=<label>Colour options</label>;`,
        ),
      ),
    ).toEqual([
      expect.objectContaining({ word: "Colour", replacement: "color" }),
    ]);
    expect(
      americanEnglishViolations("optimistic license canceled traveling gray"),
    ).toEqual([]);
    expect(
      americanEnglishViolations("behaviour cancelled colours catalogue"),
    ).toHaveLength(4);
    expect(
      americanEnglishViolations(
        proseOnly("Use `accent_colour` at [catalog](/catalogue)."),
      ),
    ).toEqual([]);
  });
  it("keeps application, email, starter and documentation copy American", () =>
    expect(checkAmericanEnglish()).toEqual([]));
});
