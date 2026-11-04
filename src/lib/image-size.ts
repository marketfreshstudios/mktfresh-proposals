/** CSS pixels at 96dpi. The smaller limit wins, including a margin too small for 16px. */
export function constrainedImageSize(
  height: number,
  ratio: number,
  maxWidth: number,
  maxHeight = Infinity,
) {
  ratio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const max = Math.max(0, Math.min(maxHeight, maxWidth / ratio));
  const h = Math.min(max, Math.max(Math.min(16, max), height));
  return { width: h * ratio, height: h };
}
export function imagePercent(width: number, available: number) {
  return Math.min(100, Math.max(0.01, (width / Math.max(1, available)) * 100));
}
export type ImageValue = {
  src: string;
  alt?: string;
  height?: number;
  width_percent?: number;
  align?: "left" | "center" | "right";
};
