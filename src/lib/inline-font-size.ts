import { z } from "zod";
export const INLINE_FONT_SIZES = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 30,
] as const;
export function isInlineFontSize(size: unknown): size is number {
  return (
    typeof size === "number" &&
    (INLINE_FONT_SIZES as readonly number[]).includes(size)
  );
}
export const FontSizeMarkSchema = z
  .object({
    type: z.literal("fontSize"),
    attrs: z
      .object({
        size: z
          .number()
          .refine(isInlineFontSize, "Choose a preset font size (8–30 px)"),
      })
      .strict(),
  })
  .strict();
export function validateInlineSizes(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(validateInlineSizes);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node.type === "fontSize") FontSizeMarkSchema.parse(node);
  Object.values(node).forEach(validateInlineSizes);
}
export function inlineSizeHtml(value: string, size: unknown) {
  if (!isInlineFontSize(size))
    throw new Error("Choose a preset font size (8–30 px)");
  return `<span data-inline-size="${size}" style="font-size:min(${size}px,var(--inline-font-max,${size}px));line-height:normal">${value}</span>`;
}

export function hasInlineFontSize(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasInlineFontSize);
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return (
    node.type === "fontSize" || Object.values(node).some(hasInlineFontSize)
  );
}
