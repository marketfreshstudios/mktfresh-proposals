import { z } from "zod";
/** Browser-measured UTF-16 source positions, never pixels or generated HTML. */
export const PageStartSchema = z
  .object({
    page: z.number().int().min(2).max(500),
    block: z.string().min(1).max(200),
    offset: z.number().int().min(0),
    unit: z.string().max(200).optional(),
    part: z.string().max(200).optional(),
    paragraph: z.number().int().min(0).optional(),
    explicit: z.boolean().default(false),
    marker: z.string().max(200).optional(),
  })
  .strict();
export const PagePlanSchema = z
  .object({
    format: z.literal(1),
    pages: z.number().int().min(1).max(500),
    starts: z.array(PageStartSchema).max(499),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.starts.length !== p.pages - 1 ||
      p.starts.some((s, n) => s.page !== n + 2)
    )
      ctx.addIssue({ code: "custom", message: "Invalid page sequence" });
  });
export type PageStart = z.infer<typeof PageStartSchema>;
export type PagePlan = z.infer<typeof PagePlanSchema>;
export function validatePagePlan(
  plan: PagePlan,
  content: { id?: string; type: string }[],
) {
  const parsed = PagePlanSchema.parse(plan),
    ids = new Set(content.map((b) => b.id));
  if (parsed.starts.some((s) => !ids.has(s.block)))
    throw new Error("Page start refers to a missing block");
  const atomic = new Set(
    content.filter((b) => b.type === "columns").map((b) => b.id),
  );
  if (
    parsed.starts.some(
      (s) =>
        atomic.has(s.block) &&
        (s.offset !== 0 || s.paragraph !== undefined || s.part || s.unit),
    )
  )
    throw new Error("A page break cannot split a Columns block");
  return parsed;
}
