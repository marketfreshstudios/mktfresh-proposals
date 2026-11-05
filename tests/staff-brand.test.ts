import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { staffMetadata, staffPageName } from "../src/lib/staff-brand";
import manifest from "../src/app/manifest";
const luminance = (hex: string) => {
  const c = hex
    .match(/\w\w/g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe("Yeswell staff identity", () => {
  it("has staff-only metadata and complete install assets", () => {
    expect(staffMetadata("Sign in").title).toBe("Sign in · Yeswell");
    expect(staffPageName(["studio", "emails"])).toBe("Emails");
    const m = manifest();
    expect(m).toMatchObject({
      name: "Yeswell",
      theme_color: "#13303A",
      start_url: "/",
    });
    for (const asset of [
      ...m.icons!.map((i) => i.src),
      "/favicon.svg",
      "/favicon-16.png",
      "/favicon-32.png",
      "/apple-touch-icon.png",
      "/yeswell-social-1200x630.png",
    ])
      expect(existsSync(`public${asset}`)).toBe(true);
  });
  it("uses the brand palette with AA text/button/focus contrast in both themes", () => {
    const css = readFileSync("src/app/foundation-tokens.css", "utf8").split(
      "/* Product identity",
    )[1];
    for (const hex of ["#13303a", "#c2602f", "#eef3f3", "#e08456"])
      expect(css).toContain(hex);
    for (const [fg, bg] of [
      ["13303a", "ffffff"],
      ["13303a", "fbfaf7"],
      ["a44d23", "fbfaf7"],
      ["eef3f3", "1c1b19"],
      ["e08456", "1c1b19"],
      ["13303a", "eef3f3"],
    ])
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    // No change to client-flow or paper tokens in this staff-only override.
    expect(css).not.toMatch(/--paper|\.client-flow/);
  });
});
