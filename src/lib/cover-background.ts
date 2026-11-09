import { z } from "zod";
export const coverPatterns = [
  "plain",
  "ring",
  "waves",
  "dots",
  "orbits",
  "corners",
] as const;
const image = z
  .string()
  .max(1000000)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
export const CoverBackgroundSchema = z
  .object({
    type: z.enum([...coverPatterns, "solid", "image"]),
    color: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .optional(),
    image: image.optional(),
    finished: z.boolean().optional(),
    focal: z
      .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
      .strict()
      .optional(),
    graphic: z
      .enum(["auto", "logo-icon", "none", "upload", ...coverPatterns])
      .optional(),
    graphic_image: image.optional(),
    opacity: z.number().min(0).max(0.4).optional(),
    size: z.number().min(300).max(700).optional(),
  })
  .strict();
export type CoverBackground = z.infer<typeof CoverBackgroundSchema>;
export function defaultCoverBackground(layout: string): CoverBackground {
  return {
    type:
      layout === "bold"
        ? "waves"
        : layout === "photo" || layout === "side-photo"
          ? "image"
          : "plain",
    graphic: layout === "editorial" || layout === "split" ? "auto" : "none",
  };
}
