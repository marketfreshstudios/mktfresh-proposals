import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import icons from "../src/components/icons.json";
import { Disclosure } from "../src/components/ui";
import { DisclosureChevron } from "../src/components/disclosure-chevron";
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
it("disclosures use a dedicated smaller solid glyph, independent of dropdowns", () => {
  const html = renderToStaticMarkup(<DisclosureChevron open />);
  expect(html).toContain('width="10" height="10"');
  expect(html).toContain('data-open="true"');
  expect(html).toContain(icons["chevron-right"].path);
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).toContain("transition: transform 120ms ease");
  expect(css).toContain("transform: rotate(90deg)");
  expect(readFileSync("src/app/tokens.css", "utf8")).toContain("chevron");
});
