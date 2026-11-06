import { expect, it } from "vitest";
import {
  CoverSchema,
  applyCoverLayout,
  coverElements,
  coverPlainText,
  defaultCover,
  loadedCover,
} from "../src/lib/cover";
import {
  coverLayouts,
  coverTextColor,
  visibleCoverElement,
} from "../src/lib/cover-layout";
import {
  coverDecorationHtml,
  coverGraphicSvg,
  coverPresentation,
} from "../src/lib/cover-graphics";
import { whiteContrast } from "../src/lib/brand";
import {
  extractBrandPalette,
  validateCoverImage,
} from "../src/lib/brand-palette";
import { starterTemplates } from "../seed/starter-templates";
import { editableCoverHtml } from "../src/lib/cover-render";
import sharp from "sharp";
it.each(coverLayouts)(
  "%s maps editable metadata and keeps old covers untouched",
  (layout) => {
    const old = starterTemplates("00000000-0000-4000-8000-000000000001")[1]
      .cover!;
    const before = JSON.stringify(old);
    const value = CoverSchema.parse(applyCoverLayout(old, layout));
    expect(value.layout).toBe(layout);
    expect(new Set(coverElements(value, "").map((e) => e.id)).size).toBe(
      value.elements!.length,
    );
    for (const meta of ["prepared_for", "prepared_by", "date", "valid_until"])
      expect(value.elements!.filter((e) => e.meta === meta)).toHaveLength(1);
    const validity = value.elements!.find((e) => e.meta === "valid_until")!;
    expect(coverPlainText(validity.content!)).toBe("{{proposal.valid_until}}");
    expect(
      visibleCoverElement(validity, value, { "proposal.valid_until": "" }),
    ).toBe(false);
    expect(
      visibleCoverElement(validity, value, {
        "proposal.valid_until": "December 3, 2026",
      }),
    ).toBe(true);
    expect(JSON.stringify(old)).toBe(before);
  },
);
it("legacy/custom covers retain their exact data and plain rendering, while new defaults are Editorial", () => {
  const legacy = { ...defaultCover(), eyebrow: "Authored eyebrow" };
  expect(loadedCover(legacy)).toEqual(legacy);
  expect(defaultCover(true).layout).toBe("editorial");
  expect(coverDecorationHtml(legacy)).toBe("");
  expect(
    editableCoverHtml(legacy, "Old title", {
      "workspace.name": "Example Studio",
      "client.company": "Example Client",
      "proposal.validity": "",
    }),
  ).not.toContain("cover-meta-label");
});
it("graphics respect icon resolution, crop, opacity, and independent background selection", () => {
  for (const layout of ["editorial", "split"] as const) {
    const c = applyCoverLayout(defaultCover(), layout);
    expect(coverPresentation(c)).toMatchObject({
      opacity: layout === "split" ? 0.12 : 0.08,
      size: layout === "split" ? 420 : 480,
    });
    expect(coverPresentation(c, "#2f5d50", 128, true).graphic).toBe(
      layout === "editorial" ? "ring" : "orbits",
    );
    expect(coverPresentation(c, "#2f5d50", 1024, true).graphic).toBe(
      "logo-icon",
    );
    c.background = {
      type: "solid",
      color: "#193c40",
      graphic: "dots",
      opacity: 0.3,
      size: 700,
    };
    expect(
      coverPresentation({ ...c, background: { type: "solid" } }).opacity,
    ).toBe(0.12);
    const html = coverDecorationHtml(c);
    expect(html).toContain("opacity:0.3");
    expect(html).toContain("width:700px");
    expect(html).toContain("cover-watermark-clip");
    expect(html).toContain("cover-watermark-dots");
    expect(html).not.toContain("<script");
  }
  for (const pattern of ["ring", "waves", "dots", "orbits", "corners"])
    expect(coverGraphicSvg(pattern, "#285c50", true)).toContain("<svg");
});
it("full-page uploaded images get a readable text surface, while Photo keeps its brand band", () => {
  const c = applyCoverLayout(defaultCover(), "editorial");
  c.background = { type: "image", image: "data:image/png;base64,AAAA" };
  expect(coverPresentation(c)).toMatchObject({
    backdrop: true,
    text: "#ffffff",
  });
  expect(coverPresentation({ ...c, layout: "photo" })).toMatchObject({
    backdrop: false,
  });
  expect(
    coverPresentation({
      ...c,
      layout: "photo",
      background: { ...c.background, finished: true },
    }),
  ).toMatchObject({ backdrop: true, text: "#ffffff" });
});
it.each(["#ffffff", "#000000", "#777777", "#2f5d50", "#b5532e", "#ffee00"])(
  "background %s picks AA text",
  (color) => {
    const text = coverTextColor(color);
    const contrast =
      text === "#ffffff"
        ? whiteContrast(color)
        : whiteContrast(text) / whiteContrast(color);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  },
);
it("cover images validate actual encoded PNG/JPEG bytes and reject remote, SVG, corrupt and oversized inputs", async () => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "#a04030" },
  })
    .png()
    .toBuffer();
  expect(
    await validateCoverImage(`data:image/png;base64,${png.toString("base64")}`),
  ).toMatchObject({ width: 64, height: 64 });
  for (const value of [
    "https://example.test/photo.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YmFk",
    `data:image/png;base64,${Buffer.alloc(700000).toString("base64")}`,
  ])
    await expect(validateCoverImage(value)).rejects.toThrow();
});
it("logo palette suggestions exclude neutrals/transparency, deduplicate, and never mutate saved settings", async () => {
  const bytes = await sharp({
    create: { width: 120, height: 40, channels: 4, background: "white" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="120" height="40"><rect width="40" height="40" fill="#2f5d50"/><rect x="40" width="40" height="40" fill="#b5532e"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  const palette = await extractBrandPalette(bytes);
  expect(palette.length).toBeGreaterThanOrEqual(2);
  expect(palette.length).toBeLessThanOrEqual(5);
  expect(palette.every((v) => /^#[a-f0-9]{6}$/.test(v))).toBe(true);
  expect(palette).not.toContain("#ffffff");
  expect(await extractBrandPalette(new Uint8Array([1, 2, 3]))).toEqual([]);
});
