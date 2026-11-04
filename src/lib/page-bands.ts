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
      ]),
      text: z.string().max(10000).optional(),
      content: z.array(NodeSchema).max(100).optional(),
      marks: z.array(MarkSchema).max(10).optional(),
      attrs: z
        .object({
          path: z
            .string()
            .regex(/^[\w.-]+$/)
            .max(200)
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
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
  });
export type Band = z.infer<typeof BandSchema>;
const shared = z.object({ header: BandSchema, footer: BandSchema }).strict();
const switches = {
  showHeader: z.boolean().default(true),
  showFooter: z.boolean().default(true),
  showOnCover: z.boolean().default(false),
  bandHeightIn: z
    .union([z.literal(0.4), z.literal(0.5), z.literal(0.75)])
    .default(0.5),
  divider: z.boolean().default(true),
  shared,
};
export const TemplateBandsSchema = z.object(switches).strict();
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
  .strict();
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
  const next = structuredClone(band),
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
