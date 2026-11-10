import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { colorContrast } from "../src/lib/brand";

const src = new URL("../src/", import.meta.url);
const oldBeige = new Set(
  `f3efe7 eee9e0 dcd5c8 e4ded2 cfc8bb 5f5b53 ece7dd 4a463f 8a857b
   f3f0ea f2efe9 f3f1eb e9e5dd f0ece4 d8d3ca d7d3c9 d6d5cd eeece6 f6f4ef
   fbfaf7 ddd8ce e3ded4 e8e4dc e0ddd4 dcdedb 625f56 65635e 6b6963 6c685f
   ece8e1 f2ede4 3e3b35 544c3f 92918c 948e82 a39d92 d9d4ca d6d1c7 d2cec5
   131311 181715 1c1b19 0e0e0c 24231f f1efea f4f2ed aba79e 302f2b 6e6a61
   2a2926 2c2b27 3b3731 615d53 14120e`.split(/\s+/),
);

it("keeps retired beige and warm gray literals out of runtime source", () => {
  const hits: string[] = [];
  for (const name of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!/\.(?:css|[cm]?[jt]sx?|svg|html|json)$/.test(name)) continue;
    const source = readFileSync(new URL(name, src), "utf8");
    for (const color of source.matchAll(
      /(?:#|%23)([a-f\d]{6})(?:[a-f\d]{2})?(?![a-f\d])/gi,
    ))
      if (oldBeige.has(color[1].toLowerCase()))
        hits.push(`${name}: ${color[0]}`);
    for (const color of source.matchAll(
      /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?=\s*[,/)])/gi,
    )) {
      const hex = color
        .slice(1, 4)
        .map((channel) => Number(channel).toString(16).padStart(2, "0"))
        .join("");
      if (oldBeige.has(hex)) hits.push(`${name}: ${color[0]}`);
    }
  }
  expect(hits).toEqual([]);
});

it("keeps Harbor muted text readable on both client surface steps in light and dark", () => {
  const css = readFileSync(new URL("app/foundation-tokens.css", src), "utf8");
  const palettes = [...css.matchAll(/\{([^{}]+)\}/g)]
    .map(([, block]) =>
      Object.fromEntries(
        [...block.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/gi)].map(
          ([, name, hex]) => [name, hex],
        ),
      ),
    )
    .filter((tokens) => tokens["surface-page"]);
  expect(palettes).toHaveLength(2);
  expect(palettes[0]).toMatchObject({
    "surface-page": "#f1f4f5",
    "surface-sunken": "#e8edef",
    "ink-muted": "#56646a",
  });
  for (const palette of palettes)
    for (const ground of ["surface-page", "surface", "surface-sunken"])
      expect(
        colorContrast(palette["ink-muted"], palette[ground]),
      ).toBeGreaterThanOrEqual(4.5);
});
