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
export const defaultCover = (): Cover => ({
  workspace: "{{workspace.name}}",
  eyebrow: "",
  prepared_for: "Prepared for {{client.company}}",
  byline: "{{proposal.validity}}",
});

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
