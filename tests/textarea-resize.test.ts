import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const appDir = join(__dirname, "../src/app");
const css = readdirSync(appDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => [f, readFileSync(join(appDir, f), "utf8")] as const);

describe("paragraph fields", () => {
  it("resize vertically only and stay inside their container", () => {
    const globals = css.find(([f]) => f === "globals.css")![1];
    expect(globals).toMatch(
      /textarea\s*\{\s*resize:\s*vertical;\s*max-width:\s*100%;\s*\}/,
    );
  });
  it("never allow horizontal resizing anywhere", () => {
    for (const [file, text] of css)
      expect(text, file).not.toMatch(/resize:\s*(both|horizontal|auto)\b/);
  });
});
