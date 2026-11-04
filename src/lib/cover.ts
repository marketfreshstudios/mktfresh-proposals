import { z } from "zod";
/** Embedded assets only; never allow a cover to request an arbitrary remote URL. */
export const CoverSchema = z
  .object({
    workspace: z.string().max(2000),
    eyebrow: z.string().max(2000),
    byline: z.string().max(4000),
    prepared_for: z.string().max(2000).optional(),
    logo_height: z.number().min(16).max(1056).optional(),
    logo_alt: z.string().max(300).optional(),
    logo: z
      .string()
      .max(1000000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
  })
  .strict();
export type Cover = z.infer<typeof CoverSchema>;
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
