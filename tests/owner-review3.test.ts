import { it, expect } from "vitest";
import {
  boundedBandSettings,
  defaultHeaderFooter,
  HeaderFooterSettingsSchema,
  bandSpacingLimit,
  pageGeometry,
  headerShown,
  footerShown,
} from "../src/lib/page-bands";
import { resolveStyles } from "../src/lib/proposal-styles";
import { CoverSchema, defaultCover } from "../src/lib/cover";
const styles = resolveStyles(null, undefined, {
  margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
});
it("independent lines and cover switches share exact page geometry", () => {
  const hf = defaultHeaderFooter();
  hf.headerSpacing = {
    ...hf.headerSpacing!,
    heightIn: 0.6,
    distanceIn: 0.4,
    spaceByLine: 12,
    spaceToContent: 18,
    divider: false,
    showOnCover: true,
  };
  hf.footerSpacing = {
    ...hf.footerSpacing!,
    heightIn: 0.25,
    distanceIn: 0.25,
    spaceByLine: 20,
    spaceToContent: 8,
    divider: true,
    showOnCover: false,
  };
  const g = pageGeometry(styles, hf, 3);
  expect(g.margins.top).toBeCloseTo(0.4 * 96 + 0.6 * 96 + 18);
  expect(g.margins.bottom).toBeCloseTo(0.25 * 96 + 0.25 * 96 + 20 + 1 + 8);
  expect(g.spacing.header.spaceByLine).toBe(0);
  expect(headerShown(hf, 1)).toBe(true);
  expect(footerShown(hf, 1)).toBe(false);
  expect(pageGeometry(styles, hf, 1).content.height).toBe(g.content.height);
  expect(pageGeometry(styles, hf, 3, { header: "hidden" }).content.height).toBe(
    g.content.height,
  );
  hf.headerSpacing.divider = true;
  hf.footerSpacing.divider = false;
  expect(pageGeometry(styles, hf, 3).spacing.footer.spaceByLine).toBe(0);
  expect(pageGeometry(styles, hf, 3).margins.top).toBeCloseTo(
    0.4 * 96 + 0.6 * 96 + 12 + 1 + 18,
  );
});
it("editable legacy flags migrate independently, without rewriting frozen geometry", () => {
  const old = defaultHeaderFooter();
  delete old.headerSpacing!.divider;
  delete old.footerSpacing!.divider;
  delete old.headerSpacing!.showOnCover;
  delete old.footerSpacing!.showOnCover;
  old.divider = false;
  old.showOnCover = true;
  const before = JSON.stringify(old),
    g = pageGeometry(styles, old, 1);
  expect(g.spacing.header.spaceByLine).toBe(6);
  expect(headerShown(old, 1)).toBe(true);
  const next = HeaderFooterSettingsSchema.parse(old);
  expect(next.headerSpacing!.divider).toBe(false);
  expect(next.footerSpacing!.divider).toBe(false);
  expect(next.footerSpacing!.showOnCover).toBe(true);
  expect(pageGeometry(styles, next, 1).spacing.header.spaceByLine).toBe(0);
  expect(JSON.stringify(old)).toBe(before);
});
it("spacing exceeds old caps while page-bounded controls retain two inches", () => {
  expect(
    CoverSchema.safeParse({
      ...defaultCover(),
      elements: [{ id: "title", kind: "title", space_below: 412 }],
    }).success,
  ).toBe(true);
  for (const kind of ["header", "footer"] as const)
    for (const key of ["spaceByLine", "spaceToContent"] as const) {
      const hf = defaultHeaderFooter(),
        limit = bandSpacingLimit(styles, hf, kind, key),
        field = kind === "header" ? "headerSpacing" : "footerSpacing";
      hf[field]![key] = limit;
      expect(pageGeometry(styles, hf, 1).content.height).toBeGreaterThanOrEqual(
        192,
      );
      hf[field]![key] = limit + 1;
      expect(pageGeometry(styles, hf, 1).content.height).toBeLessThan(193);
    }
});

it("re-enabling a divider or band after increasing other spacing still retains two inches", () => {
  const hf = defaultHeaderFooter();
  hf.headerSpacing!.divider = false;
  hf.headerSpacing!.spaceByLine = 600;
  hf.headerSpacing!.spaceToContent = 600;
  const line = boundedBandSettings(
    styles,
    { ...hf, headerSpacing: { ...hf.headerSpacing!, divider: true } },
    "header",
  );
  expect(pageGeometry(styles, line, 1).content.height).toBeGreaterThanOrEqual(
    192,
  );
  expect(line.headerSpacing!.spaceToContent).toBeLessThan(600);
  const switched = boundedBandSettings(
    styles,
    {
      ...line,
      showFooter: true,
      footerSpacing: { ...line.footerSpacing!, spaceToContent: 700 },
    },
    "footer",
  );
  expect(
    pageGeometry(styles, switched, 1).content.height,
  ).toBeGreaterThanOrEqual(192);
});
