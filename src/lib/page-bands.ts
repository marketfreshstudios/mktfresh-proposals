import { pageMetrics } from "./proposal-styles";
import { z } from "zod";
import type { RichText } from "./model";

export const BandLayoutSchema = z.enum([
  "left",
  "center",
  "right",
  "half",
  "wide",
  "thirds",
]);
export type BandLayout = z.infer<typeof BandLayoutSchema>;
export const bandColumns = (layout: BandLayout) =>
  ({
    left: "1fr",
    center: "1fr",
    right: "1fr",
    half: "1fr 1fr",
    wide: "3fr 1fr",
    thirds: "1fr 1fr 1fr",
  })[layout];
export const bandJustify = (
  layout: BandLayout,
): ("start" | "center" | "end")[] =>
  layout === "thirds"
    ? ["start", "center", "end"]
    : ["half", "wide"].includes(layout)
      ? ["start", "end"]
      : [layout === "center" ? "center" : layout === "right" ? "end" : "start"];
const MarkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["bold", "italic", "underline"]) }).strict(),
  z
    .object({
      type: z.literal("link"),
      attrs: z.object({ href: z.string().max(2000) }).strict(),
    })
    .strict(),
]);
const NodeSchema: z.ZodType<RichText> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "doc",
        "paragraph",
        "text",
        "variable",
        "hardBreak",
        "bulletList",
        "orderedList",
        "listItem",
        "image",
      ]),
      text: z.string().max(10000).optional(),
      content: z.array(NodeSchema).max(100).optional(),
      marks: z.array(MarkSchema).max(10).optional(),
      attrs: z
        .object({
          src: z
            .union([
              z.literal("workspace-logo"),
              z
                .string()
                .max(1000000)
                .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
            ])
            .optional(),
          alt: z.string().max(300).optional(),
          height: z.number().positive().max(1056).optional(),
          path: z
            .string()
            .regex(/^[\w.-]+$/)
            .max(200)
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      if (node.type === "image" && (!node.attrs?.src || !node.attrs.height))
        ctx.addIssue({
          code: "custom",
          message: "Band image source and height required",
          path: ["attrs"],
        });
    }),
);
const SlotSchema = z
  .object({ type: z.literal("doc"), content: z.array(NodeSchema) })
  .strict();
export const BandSchema = z
  .object({
    layout: BandLayoutSchema,
    slots: z.array(SlotSchema).min(1).max(3),
    image: z
      .object({
        src: z.union([
          z.literal("workspace-logo"),
          z
            .string()
            .max(1000000)
            .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
        ]),
        alt: z.string().max(300),
        slot: z.number().int().min(0).max(2),
        height: z.number().positive().max(1056).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const count = bandJustify(b.layout).length;
    if (b.slots.length !== count)
      ctx.addIssue({
        code: "custom",
        message: "Band slots must match its layout",
        path: ["slots"],
      });
    if (b.image && b.image.slot >= count)
      ctx.addIssue({
        code: "custom",
        message: "Image slot is outside the band layout",
        path: ["image", "slot"],
      });
  })
  .transform((band) => {
    const next = structuredClone(band);
    if (next.image) {
      const image = {
        type: "image",
        attrs: {
          src: next.image.src,
          alt: next.image.alt,
          height: next.image.height ?? 18,
        },
      };
      const slot = next.slots[next.image.slot];
      if (slot.content[0]?.type === "paragraph")
        slot.content[0].content = [image, ...(slot.content[0].content ?? [])];
      else slot.content.unshift({ type: "paragraph", content: [image] });
      delete next.image;
    }
    return next;
  });
export type Band = z.infer<typeof BandSchema>;
const shared = z.object({ header: BandSchema, footer: BandSchema }).strict();
const switches = {
  showHeader: z.boolean().default(true),
  showFooter: z.boolean().default(true),
  showOnCover: z.boolean().default(false),
  bandHeightIn: z
    .union([z.literal(0.4), z.literal(0.5), z.literal(0.75)])
    .optional(),
  distanceIn: z
    .union([z.literal(0.25), z.literal(0.3), z.literal(0.4)])
    .default(0.3),
  divider: z.boolean().default(true),
  shared,
};
export const TemplateBandsSchema = z
  .object(switches)
  .strict()
  .transform((value) => ({ ...value, bandHeightIn: undefined }));
export const HeaderFooterSettingsSchema = z
  .object({
    ...switches,
    overrides: z
      .record(
        z.string().min(1).max(250),
        z
          .object({
            header: z.union([BandSchema, z.literal("hidden")]).optional(),
            footer: z.union([BandSchema, z.literal("hidden")]).optional(),
          })
          .strict(),
      )
      .default({}),
  })
  .strict()
  .transform((value) => ({ ...value, bandHeightIn: undefined }));
export type HeaderFooterSettings = z.infer<typeof HeaderFooterSettingsSchema>;
export type TemplateBands = z.infer<typeof TemplateBandsSchema>;
const slot = (text: string): Band["slots"][number] => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
export function defaultTemplateBands(): TemplateBands {
  return TemplateBandsSchema.parse({
    shared: {
      header: {
        layout: "half",
        slots: [slot("{{workspace.name}}"), slot("{{proposal.title}}")],
        image: { src: "workspace-logo", alt: "Workspace logo", slot: 0 },
      },
      footer: {
        layout: "half",
        slots: [
          slot("Prepared for {{client.company}}"),
          slot("Page {{page.number}} of {{page.count}}"),
        ],
      },
    },
  });
}
export const defaultHeaderFooter = (): HeaderFooterSettings => ({
  ...defaultTemplateBands(),
  overrides: {},
});
export function proposalBands(
  value?: TemplateBands | HeaderFooterSettings,
): HeaderFooterSettings {
  return value
    ? HeaderFooterSettingsSchema.parse({
        ...structuredClone(value),
        overrides: "overrides" in value ? value.overrides : {},
      })
    : defaultHeaderFooter();
}
/** Lossless layout conversion. Dropped column docs append in order to the last column. */
export function changeBandLayout(band: Band, layout: BandLayout): Band {
  const next = BandSchema.parse(band),
    count = bandJustify(layout).length;
  next.layout = layout;
  while (next.slots.length < count)
    next.slots.push({ type: "doc", content: [] });
  if (next.slots.length > count) {
    const dropped = next.slots.splice(count);
    next.slots[count - 1].content.push(...dropped.flatMap((s) => s.content));
  }
  if (next.image) next.image.slot = Math.min(next.image.slot, count - 1);
  return BandSchema.parse(next);
}

// All page distances below are CSS pixels at 96px/in, including PDF print CSS.
export type BandRect = { x: number; y: number; width: number; height: number };
export const BAND_GAP = 8;
export function bandImageHeightLimit(
  marginPx: number,
  distanceIn: number,
  divider: boolean,
) {
  return Math.max(
    0,
    marginPx - distanceIn * 96 - BAND_GAP - 6 - (divider ? 1 : 0),
  );
}
export function bandDataHeight(band: Band, divider: boolean) {
  const height = (node: RichText): number =>
    Math.max(
      node.type === "image"
        ? Number((node.attrs as Record<string, unknown>)?.height ?? 18)
        : 0,
      ...(node.content ?? []).map(height),
    );
  return (
    Math.max(
      16,
      band.image?.height ?? (band.image ? 18 : 0),
      ...band.slots.map(height),
    ) +
    6 +
    (divider ? 1 : 0)
  );
}
export function headerShown(
  hf: HeaderFooterSettings | undefined,
  page: number,
) {
  return !!hf?.showHeader && (page !== 1 || hf.showOnCover);
}
export function footerShown(
  hf: HeaderFooterSettings | undefined,
  page: number,
) {
  return !!hf?.showFooter && (page !== 1 || hf.showOnCover);
}
export function pageGeometry(
  styles: import("./proposal-styles").ResolvedStyles | undefined,
  hf: HeaderFooterSettings | undefined,
  page: number,
  resolved?: Partial<Record<"header" | "footer", Band | "hidden">>,
) {
  const m = pageMetrics(styles),
    margin = {
      top: m.margins.top * 96,
      right: m.margins.right * 96,
      bottom: m.margins.bottom * 96,
      left: m.margins.left * 96,
    };
  const distance = 96 * (hf?.distanceIn ?? 0.3);
  const limits = {
    header: {
      height: Math.max(0, margin.top - distance - BAND_GAP),
      imageHeight: bandImageHeightLimit(
        margin.top,
        hf?.distanceIn ?? 0.3,
        hf?.divider ?? true,
      ),
    },
    footer: {
      height: Math.max(0, margin.bottom - distance - BAND_GAP),
      imageHeight: bandImageHeightLimit(
        margin.bottom,
        hf?.distanceIn ?? 0.3,
        hf?.divider ?? true,
      ),
    },
  };
  const height = (kind: "header" | "footer") =>
    Math.min(
      limits[kind].height,
      hf
        ? bandDataHeight(
            resolved?.[kind] && resolved[kind] !== "hidden"
              ? (resolved[kind] as Band)
              : hf.shared[kind],
            hf.divider,
          )
        : 0,
    );
  const head = headerShown(hf, page),
    foot = footerShown(hf, page);
  const before = 0,
    after = 0;
  return {
    page,
    width: m.width,
    height: m.height,
    margins: margin,
    distance,
    bandLimits: limits,
    content: {
      x: margin.left,
      y: margin.top,
      width: m.contentWidth,
      height: m.contentHeight,
    },
    header: head
      ? {
          x: margin.left,
          y: distance,
          width: m.contentWidth,
          height: height("header"),
        }
      : null,
    footer: foot
      ? {
          x: margin.left,
          y: m.height - distance - height("footer"),
          width: m.contentWidth,
          height: height("footer"),
        }
      : null,
    frameHeight: m.contentHeight,
    before,
    after,
  };
}
export const pageContentHeight = (
  styles: import("./proposal-styles").ResolvedStyles | undefined,
  hf: HeaderFooterSettings | undefined,
  page: number,
) => pageGeometry(styles, hf, page).content.height;
export const bandRects = (
  styles: import("./proposal-styles").ResolvedStyles | undefined,
  hf: HeaderFooterSettings | undefined,
  page: number,
) => {
  const { header, footer } = pageGeometry(styles, hf, page);
  return { header, footer };
};

export function bandImages(band: Band) {
  const found: { slot: number; node: RichText }[] = [];
  const visit = (node: RichText, slot: number) => {
    if (node.type === "image") found.push({ slot, node });
    for (const child of node.content ?? []) visit(child, slot);
  };
  band.slots.forEach((node, slot) => visit(node, slot));
  return found;
}
