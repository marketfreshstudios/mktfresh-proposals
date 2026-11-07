import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  hexToHsv,
  hsvToHex,
  acceptBrandSuggestions,
} from "../src/lib/color-picker";
import { accessibleAccent, whiteContrast } from "../src/lib/brand";
import { coverLayoutStyle } from "../src/lib/cover-graphics";
import { defaultCover } from "../src/lib/cover";
import { documentStyleCss, resolveStyles } from "../src/lib/proposal-styles";
it.each(["#ea4e26", "#365c4a", "#ffffff", "#000000", "#74ccdb"])(
  "round trips %s through saturation/hue without losing exact bytes",
  (color) => expect(hsvToHex(hexToHsv(color))).toBe(color),
);
it("accepts suggestions in order up to five colors without replacing primary or existing colors", () => {
  const saved = ["#335577", "#445566", "#556677"];
  expect(
    acceptBrandSuggestions("#365c4a", saved, ["#335577", "#EA4E26", "#74ccdb"]),
  ).toEqual({
    palette: [...saved, "#EA4E26"],
    added: ["#EA4E26"],
    remaining: ["#74ccdb"],
  });
  expect(saved).toEqual(["#335577", "#445566", "#556677"]);
});
it("keeps the exact brand fill and derives AA small text consistently", () => {
  const raw = "#ea4e26",
    text = accessibleAccent(raw);
  expect(whiteContrast(raw)).toBeLessThan(4.5);
  expect(whiteContrast(text)).toBeGreaterThanOrEqual(4.5);
  expect(coverLayoutStyle(defaultCover(true), raw)).toContain(
    `--cover-small-accent:${text}`,
  );
  expect(coverLayoutStyle(defaultCover(true), raw)).toContain(
    `--cover-color:${raw}`,
  );
  expect(
    documentStyleCss(
      resolveStyles({
        accent_colour: raw,
        proposal_styles: { body: { colour: "accent" } },
      }),
      raw,
    ),
  ).toContain(`color:${text}`);
});
it("browser CI has six consistent shards and thirty minutes of headroom", async () => {
  const yaml = await readFile(".github/workflows/ci.yml", "utf8");
  const browser = yaml.slice(yaml.indexOf("  e2e:"));
  expect(browser).toContain("timeout-minutes: 30");
  expect(browser).toContain("shard: [1, 2, 3, 4, 5, 6]");
  expect(browser.match(/matrix.shard }}\/6/g)).toHaveLength(2);
});
