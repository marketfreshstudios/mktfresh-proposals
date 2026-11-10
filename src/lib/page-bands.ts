import { FontSizeMarkSchema } from "./inline-font-size";
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
const MarkSchema = z.union([
  FontSizeMarkSchema,
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
              z.enum(["workspace-logo", "workspace-brand"]),
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
          z.enum(["workspace-logo", "workspace-brand"]),
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
export const BandSpacingSchema = z
  .object({
    distanceIn: z
      .union([z.literal(0.25), z.literal(0.3), z.literal(0.4), z.literal(0.5)])
      .default(0.3),
    heightIn: z
      .union([z.literal(0.25), z.literal(0.4), z.literal(0.6), z.literal(0.8)])
      .default(0.25),
    divider: z.boolean().optional(),
    showOnCover: z.boolean().optional(),
    spaceByLine: z.number().min(0).max(1056).default(6),
    spaceToContent: z.number().min(0).max(1056).default(8),
  })
  .strict();
export type BandSpacing = z.infer<typeof BandSpacingSchema>;
export const bandSpacing = (
  settings:
    | {
        distanceIn?: number;
        headerSpacing?: BandSpacing;
        footerSpacing?: BandSpacing;
      }
    | undefined,
  kind: "header" | "footer",
): BandSpacing =>
  settings?.[kind === "header" ? "headerSpacing" : "footerSpacing"] ??
  BandSpacingSchema.parse({ distanceIn: settings?.distanceIn ?? 0.3 });
/** Parse editable settings only; never normalize a stored signed version. */
function editableBandSpacing(
  value: {
    divider: boolean;
    showOnCover: boolean;
    distanceIn?: number;
    headerSpacing?: BandSpacing;
    footerSpacing?: BandSpacing;
  },
  kind: "header" | "footer",
): BandSpacing {
  const spacing = bandSpacing(value, kind);
  return {
    ...spacing,
    divider: spacing.divider ?? value.divider,
    showOnCover: spacing.showOnCover ?? value.showOnCover,
  };
}
export const bandDivider = (
  hf: HeaderFooterSettings | undefined,
  kind: "header" | "footer",
) => bandSpacing(hf, kind).divider ?? hf?.divider ?? false;
export const bandOnCover = (
  hf: HeaderFooterSettings | undefined,
  kind: "header" | "footer",
) => bandSpacing(hf, kind).showOnCover ?? hf?.showOnCover ?? false;
export function bandLineSpace(
  hf: HeaderFooterSettings | undefined,
  kind: "header" | "footer",
) {
  const s = bandSpacing(hf, kind);
  // Missing independent flag identifies older frozen geometry, including its
  // padding with the shared divider off. Keep that historical render unchanged.
  return s.divider === false ? 0 : s.spaceByLine;
}
/** Convert only the retired first-slot default; preserve authored band content. */
export function upgradeLegacyHeader(header: Band): Band {
  const old = header.slots[0];
  const children = old?.content[0]?.content;
  const image = children?.[0];
  const name = children?.[1];
  if (
    old?.content.length !== 1 ||
    old.content[0].type !== "paragraph" ||
    old.content[0].text !== undefined ||
    old.content[0].attrs ||
    old.content[0].marks ||
    children?.length !== 2 ||
    image?.type !== "image" ||
    image.attrs?.src !== "workspace-logo" ||
    image.attrs.alt !== "Workspace logo" ||
    image.attrs.height !== 18 ||
    Object.keys(image.attrs).length !== 3 ||
    image.marks ||
    image.content ||
    image.text !== undefined ||
    name?.type !== "text" ||
    name.text !== "{{workspace.name}}" ||
    name.marks ||
    name.content ||
    name.attrs
  )
    return header;
  return {
    ...header,
    slots: [
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { ...image, attrs: { ...image.attrs, src: "workspace-brand" } },
              { type: "text", text: "" },
            ],
          },
        ],
      },
      ...header.slots.slice(1),
    ],
  };
}

const switches = {
  headerSpacing: BandSpacingSchema.optional(),
  footerSpacing: BandSpacingSchema.optional(),
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
  .transform((value) => ({
    ...value,
    bandHeightIn: undefined,
    shared: {
      ...value.shared,
      header: upgradeLegacyHeader(value.shared.header),
    },
    headerSpacing: editableBandSpacing(value, "header"),
    footerSpacing: editableBandSpacing(value, "footer"),
  }));
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
  .transform((value) => ({
    ...value,
    bandHeightIn: undefined,
    headerSpacing: editableBandSpacing(value, "header"),
    footerSpacing: editableBandSpacing(value, "footer"),
  }));
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
        slots: [slot(""), slot("{{proposal.title}}")],
        image: { src: "workspace-brand", alt: "Workspace logo", slot: 0 },
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
export function headerShown(
  hf: HeaderFooterSettings | undefined,
  page: number,
) {
  return !!hf?.showHeader && (page !== 1 || bandOnCover(hf, "header"));
}
export function footerShown(
  hf: HeaderFooterSettings | undefined,
  page: number,
) {
  return !!hf?.showFooter && (page !== 1 || bandOnCover(hf, "footer"));
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
  const baseMargins = { ...margin };
  const spacing = {
    header: {
      ...bandSpacing(hf, "header"),
      spaceByLine: bandLineSpace(hf, "header"),
    },
    footer: {
      ...bandSpacing(hf, "footer"),
      spaceByLine: bandLineSpace(hf, "footer"),
    },
  };
  const distances = {
    header: spacing.header.distanceIn * 96,
    footer: spacing.footer.distanceIn * 96,
  };
  const limits = Object.fromEntries(
    (["header", "footer"] as const).map((kind) => [
      kind,
      {
        height:
          spacing[kind].heightIn * 96 +
          spacing[kind].spaceByLine +
          (bandDivider(hf, kind) ? 1 : 0),
        imageHeight: spacing[kind].heightIn * 96,
      },
    ]),
  ) as Record<"header" | "footer", { height: number; imageHeight: number }>;
  // Global switches alone remove a stack. Cover/unique/hidden states never
  // change effective margins or the canonical content height between pages.
  if (hf?.showHeader)
    margin.top = Math.max(
      margin.top,
      distances.header + limits.header.height + spacing.header.spaceToContent,
    );
  if (hf?.showFooter)
    margin.bottom = Math.max(
      margin.bottom,
      distances.footer + limits.footer.height + spacing.footer.spaceToContent,
    );
  const contentHeight = m.height - margin.top - margin.bottom;
  const height = (kind: "header" | "footer") => limits[kind].height;
  const head = headerShown(hf, page),
    foot = footerShown(hf, page);
  const before = 0,
    after = 0;
  return {
    page,
    width: m.width,
    height: m.height,
    margins: margin,
    baseMargins,
    distances,
    spacing,
    distance: distances.header,
    bandLimits: limits,
    content: {
      x: margin.left,
      y: margin.top,
      width: m.contentWidth,
      height: contentHeight,
    },
    header: head
      ? {
          x: margin.left,
          y: distances.header,
          width: m.contentWidth,
          height: height("header"),
        }
      : null,
    footer: foot
      ? {
          x: margin.left,
          y: m.height - distances.footer - height("footer"),
          width: m.contentWidth,
          height: height("footer"),
        }
      : null,
    frameHeight: contentHeight,
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

/** Maximum one spacing value can take while retaining two inches of content. */
export function bandSpacingLimit(
  styles: import("./proposal-styles").ResolvedStyles,
  hf: HeaderFooterSettings,
  kind: "header" | "footer",
  key: "spaceByLine" | "spaceToContent",
) {
  const active = {
    ...hf,
    [kind === "header" ? "showHeader" : "showFooter"]: true,
  };
  const g = pageGeometry(styles, active, 1),
    s = bandSpacing(hf, kind);
  const other = g.margins[kind === "header" ? "bottom" : "top"];
  const fixed =
    s.distanceIn * 96 +
    s.heightIn * 96 +
    (bandDivider(hf, kind)
      ? 1 + (key === "spaceByLine" ? 0 : s.spaceByLine)
      : 0) +
    (key === "spaceToContent" ? 0 : s.spaceToContent);
  return Math.max(0, Math.floor(1056 - 192 - other - fixed));
}
/** UI setting changes cannot reserve more than the page can hold. Frozen data
 * never passes through this helper. Reduce the edited stack, not the other band. */
export function boundedBandSettings(
  styles: import("./proposal-styles").ResolvedStyles,
  hf: HeaderFooterSettings,
  kind: "header" | "footer",
): HeaderFooterSettings {
  if (pageGeometry(styles, hf, 1).content.height >= 192) return hf;
  const next = structuredClone(hf),
    key = kind === "header" ? "headerSpacing" : "footerSpacing";
  const spacing = { ...bandSpacing(next, kind) };
  next[key] = spacing;
  spacing.spaceToContent = Math.min(
    spacing.spaceToContent,
    bandSpacingLimit(styles, next, kind, "spaceToContent"),
  );
  if (bandDivider(next, kind))
    spacing.spaceByLine = Math.min(
      spacing.spaceByLine,
      bandSpacingLimit(styles, next, kind, "spaceByLine"),
    );
  return next;
}
