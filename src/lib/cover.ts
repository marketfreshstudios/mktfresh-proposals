import { z } from "zod";
/** Embedded assets only; never allow a cover to request an arbitrary remote URL. */
export const CoverSchema = z
  .object({
    workspace: z.string().max(2000),
    eyebrow: z.string().max(2000),
    byline: z.string().max(4000),
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
  eyebrow: "Proposal for {{client.company}}",
  byline: "From {{sender.name}} · {{proposal.validity}}",
});
