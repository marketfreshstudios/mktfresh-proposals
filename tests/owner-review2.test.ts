import { it, expect } from "vitest";
import {
  defaultHeaderFooter,
  HeaderFooterSettingsSchema,
  pageGeometry,
  BandSpacingSchema,
} from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
it("legacy distance migrates independently; large headers grow margins on cover, shared and hidden pages", () => {
  const defaults = defaultHeaderFooter();
  const legacy = HeaderFooterSettingsSchema.parse({
    ...defaults,
    headerSpacing: undefined,
    footerSpacing: undefined,
    distanceIn: 0.4,
  });
  expect(legacy.headerSpacing.distanceIn).toBe(0.4);
  expect(legacy.footerSpacing.distanceIn).toBe(0.4);
  const hf = {
    ...defaults,
    headerSpacing: BandSpacingSchema.parse({ distanceIn: 0.4, heightIn: 0.6 }),
    footerSpacing: BandSpacingSchema.parse({
      distanceIn: 0.25,
      heightIn: 0.25,
    }),
  };
  const styles = resolveStyles(null, undefined, {
    margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
  });
  for (const page of [1, 2, 3]) {
    const g = pageGeometry(
      styles,
      { ...hf, overrides: { cover: { header: "hidden" } } },
      page,
    );
    expect(g.margins.top).toBeCloseTo(38.4 + 57.6 + 6 + 1 + 8, 8);
    expect(g.margins.bottom).toBe(72);
    expect(g.content.height).toBeCloseTo(1056 - 111 - 72, 8);
    expect(g.bandLimits.header.imageHeight).toBeCloseTo(57.6, 8);
  }
  expect(
    pageGeometry(styles, { ...hf, showHeader: false }, 2).margins.top,
  ).toBe(72);
});
