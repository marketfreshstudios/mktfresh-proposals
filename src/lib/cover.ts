import { fieldNodes } from "./editor-fields";
import { defaultCoverBackground } from "./cover-background";
import { CoverBackgroundSchema } from "./cover-background";
import { FontSizeMarkSchema } from "./inline-font-size";
import { z } from "zod";
import type { RichText } from "./model";
const CoverTextNode: z.ZodType<RichText> = z.lazy(() =>
  z
    .object({
      type: z.enum(["doc", "paragraph", "text", "variable", "hardBreak"]),
      text: z.string().max(4000).optional(),
      content: z.array(CoverTextNode).max(100).optional(),
      attrs: z
        .object({
          path: z
            .string()
            .regex(/^[\w.-]+$/)
            .max(200),
        })
        .strict()
        .optional(),
      marks: z
        .array(
          z.union([
            z
              .object({ type: z.enum(["bold", "italic", "underline"]) })
              .strict(),
            FontSizeMarkSchema,
          ]),
        )
        .max(4)
        .optional(),
    })
    .strict(),
);
export const CoverElementSchema = z
  .object({
    id: z.string().min(1).max(100),
    label: z.string().max(100).optional(),
    meta: z
      .enum(["prepared_for", "prepared_by", "date", "valid_until"])
      .optional(),
    kind: z.enum([
      "logo",
      "workspace",
      "eyebrow",
      "title",
      "prepared_for",
      "byline",
      "extra",
    ]),
    content: CoverTextNode.optional(),
    align: z.enum(["left", "center", "right"]).default("left"),
    space_above: z.number().min(0).max(1056).optional(),
    space_below: z.number().min(0).max(1056).optional(),
    x: z.number().min(0).max(816).optional(),
    hidden: z.boolean().optional(),
  })
  .strict();
export type CoverElement = z.infer<typeof CoverElementSchema>;
/** Embedded assets only; never allow a cover to request an arbitrary remote URL. */
export const CoverSchema = z
  .object({
    workspace: z.string().max(2000),
    eyebrow: z.string().max(2000),
    byline: z.string().max(4000),
    prepared_for: z.string().max(2000).optional(),
    layout: z
      .enum([
        "custom",
        "editorial",
        "split",
        "bold",
        "photo",
        "centered",
        "side-photo",
      ])
      .optional(),
    background: CoverBackgroundSchema.optional(),
    logo_mode: z.literal("brand").optional(),
    logo_height: z.number().min(16).max(1056).optional(),
    logo_alt: z.string().max(300).optional(),
    elements: z
      .array(CoverElementSchema)
      .max(40)
      .refine(
        (es) => new Set(es.map((e) => e.id)).size === es.length,
        "Cover element IDs must be unique",
      )
      .optional(),
    logo: z
      .string()
      .max(1000000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
  })
  .strict();
export type Cover = z.infer<typeof CoverSchema>;
export const coverText = (text: string): RichText => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ],
});
export function coverElements(cover: Cover, title: string): CoverElement[] {
  return (
    cover.elements ??
    (
      [
        "logo",
        "workspace",
        "eyebrow",
        "title",
        "prepared_for",
        "byline",
      ] as const
    ).map((kind) => ({
      id: kind,
      kind,
      align: "left",
      ...(kind !== "logo" && kind !== "title"
        ? { content: coverText(cover[kind] ?? "") }
        : {}),
    }))
  );
}
export function coverPlainText(node: RichText): string {
  return node.type === "variable"
    ? `{{${node.attrs?.path ?? ""}}}`
    : (node.text ??
        (node.content ?? [])
          .map(coverPlainText)
          .join(node.type === "doc" ? "\n" : ""));
}
export function coverElementCss(e: CoverElement) {
  return `text-align:${e.align};${e.space_above === undefined ? "" : `margin-top:${e.space_above}px;`}${e.space_below === undefined ? "" : `margin-bottom:${e.space_below}px;padding-bottom:0;`}`;
}
export const defaultCover = (brand = false): Cover => {
  const base: Cover = {
    ...(brand ? { logo_mode: "brand" as const } : {}),
    workspace: brand ? "" : "{{workspace.name}}",
    eyebrow: "",
    prepared_for: "Prepared for {{client.company}}",
    byline: "{{proposal.validity}}",
  };
  return brand ? applyCoverLayout(base, "editorial") : base;
};
export function applyCoverLayout(
  cover: Cover,
  layout: Exclude<NonNullable<Cover["layout"]>, "custom">,
): Cover {
  const elements = coverElements(cover, "").map((e) => structuredClone(e));
  for (const e of elements) {
    e.align = layout === "centered" ? "center" : "left";
    delete e.x;
    if (
      e.kind === "workspace" &&
      (!e.content ||
        ["", "{{workspace.name}}"].includes(coverPlainText(e.content)))
    )
      e.hidden = true;
    if (e.kind === "logo" || e.kind === "title") continue;
    let text =
      e.content ?? coverText(e.kind === "extra" ? "" : (cover[e.kind] ?? ""));
    const plain = coverPlainText(text).trim();
    if (e.kind === "prepared_for") {
      e.label ??= "Prepared for";
      e.meta = "prepared_for";
    } else if (
      plain === "{{proposal.validity}}" ||
      plain === "{{proposal.valid_until}}"
    ) {
      e.kind = "extra";
      e.meta = "valid_until";
      e.label ??= "Valid until";
      text = coverText("{{proposal.valid_until}}");
    } else if (e.id === "date" || plain === "{{proposal.date}}") {
      e.label ??= "Date";
      e.meta = "date";
    } else if (e.kind === "byline") {
      e.label ??= "Prepared by";
      e.meta = "prepared_by";
    }
    let first = true;
    const strip = (
      n: import("./model").RichText,
    ): import("./model").RichText => ({
      ...n,
      ...(n.type === "text" && first
        ? ((first = false),
          {
            text: (n.text ?? "").replace(
              e.kind === "prepared_for"
                ? /^Prepared for\s*/i
                : e.kind === "byline"
                  ? /^(?:Prepared by|From)\s*/i
                  : /$^/,
              "",
            ),
          })
        : {}),
      ...(n.content ? { content: n.content.map(strip) } : {}),
    });
    e.content = fieldNodes(strip(text));
  }
  const extra = (
    id: string,
    label: string,
    text: string,
    meta: NonNullable<CoverElement["meta"]>,
  ) => {
    if (elements.some((e) => e.meta === meta)) return;
    let key = id;
    while (elements.some((e) => e.id === key)) key += "-1";
    elements.push({
      id: key,
      kind: "extra",
      align: "left",
      label,
      meta,
      content: fieldNodes(coverText(text)),
    });
  };
  extra(
    "prepared-by",
    "Prepared by",
    "{{sender.name}}, {{workspace.name}}",
    "prepared_by",
  );
  extra("date", "Date", "{{proposal.date}}", "date");
  extra("validity", "Valid until", "{{proposal.valid_until}}", "valid_until");
  return {
    ...cover,
    logo_mode: "brand",
    layout,
    logo_height: cover.logo_height ?? (layout === "split" ? 22 : 26),
    background: defaultCoverBackground(layout),
    elements,
  };
}

export function loadedCover(value?: Cover): Cover {
  if (!value) return defaultCover();
  if (
    value.workspace === "{{workspace.name}}" &&
    value.eyebrow === "Proposal for {{client.company}}" &&
    value.byline === "From {{sender.name}} · {{proposal.validity}}"
  )
    return { ...value, ...defaultCover() };
  return structuredClone(value);
}
export function contentAfterCover(
  content: import("./model").Block[],
): import("./model").Block[] {
  if (content[0]?.type === "page_break") return content;
  let id = "cover-page-break";
  while (content.some((b) => b.id === id)) id += "-1";
  return [{ id, type: "page_break" }, ...content];
}
