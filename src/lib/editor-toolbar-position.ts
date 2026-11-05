/** Screen-only chrome placement. Never used by pagination or document rendering. */
export type ToolbarRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export function toolbarPosition(input: {
  bounds: ToolbarRect;
  anchor: ToolbarRect;
  width: number;
  height: number;
  obstacles: ToolbarRect[];
  below?: boolean;
  gap?: number;
}) {
  const {
    bounds: b,
    anchor: a,
    height: h,
    obstacles,
    below = false,
    gap = 8,
  } = input;
  const maxWidth = Math.min(input.width, b.right - b.left);
  const preferredY = below ? a.bottom + gap : a.top - h - gap;
  const clamp = (n: number, low: number, high: number) =>
    Math.max(low, Math.min(n, high));
  const ys = [
    ...new Set([
      clamp(preferredY, b.top, b.bottom - h),
      a.top - h - gap,
      a.bottom + gap,
      b.top,
      b.bottom - h,
      ...obstacles.flatMap((r) => [r.top - h - gap, r.bottom + gap]),
    ]),
  ].filter((y) => y >= b.top && y + h <= b.bottom);
  function find(width: number) {
    const xs = [
      ...new Set([
        clamp(a.left, b.left, b.right - width),
        b.left,
        b.right - width,
        ...obstacles.flatMap((r) => [r.left - width - gap, r.right + gap]),
      ]),
    ].filter((x) => x >= b.left && x + width <= b.right);
    let best:
      { left: number; top: number; width: number; score: number } | undefined;
    for (const y of ys)
      for (const x of xs) {
        if (
          obstacles.some(
            (r) =>
              x < r.right + 2 &&
              x + width > r.left - 2 &&
              y < r.bottom + 2 &&
              y + h > r.top - 2,
          )
        )
          continue;
        const score = Math.abs(y - preferredY) + Math.abs(x - a.left) * 0.25;
        if (!best || score < best.score)
          best = { left: x, top: y, width, score };
      }
    return best;
  }
  const full = find(maxWidth);
  if (full) return full;
  // Dense pages can still expose a scrolling toolbar in a blank margin. Keep
  // complete 44px controls rather than overlaying any document text.
  const widths = [
    ...new Set([
      maxWidth,
      ...obstacles.flatMap((r) => [r.left - b.left - 2, b.right - r.right - 2]),
      54,
    ]),
  ]
    .filter((w) => w >= 54 && w < maxWidth)
    .sort((a, b) => b - a);
  for (const width of widths) {
    const found = find(width);
    if (found) return found;
  }
  return undefined;
}
