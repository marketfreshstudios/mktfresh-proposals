import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import icons from "../src/components/icons.json";
import { Disclosure } from "../src/components/ui";
it("UI components have no text disclosure glyphs and all chevrons use the licensed icon paths", () => {
  const visit = (dir: string) => {
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, file.name);
      if (file.isDirectory()) visit(path);
      else if (/\.(tsx?|json)$/.test(path))
        expect(readFileSync(path, "utf8"), path).not.toMatch(/[▾▴▸«»]/);
    }
  };
  visit("src/components");
  for (const direction of ["left", "right", "up", "down"] as const) {
    const svg = readFileSync(
      `node_modules/@fortawesome/fontawesome-free/svgs/solid/chevron-${direction}.svg`,
      "utf8",
    );
    expect(svg).toContain(`d="${icons[`chevron-${direction}`].path}"`);
  }
  expect(
    renderToStaticMarkup(
      <details>
        <Disclosure>Text styles</Disclosure>
      </details>,
    ),
  ).toContain('class="disclosure-marker"');
});
