/** Screen-only chrome placement. Never used by pagination or document rendering. */
export type ToolbarRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export function toolbarPosition({
  bounds,
  anchor,
  width,
  height,
  gap = 8,
}: {
  bounds: ToolbarRect;
  anchor: ToolbarRect;
  width: number;
  height: number;
  gap?: number;
}) {
  // The owner prefers an attached, full-size bar over collision avoidance.
  // Only the menus flip. The bar sticks below the header until its block leaves.
  return {
    left: Math.max(bounds.left, Math.min(anchor.left, bounds.right - width)),
    top: Math.min(
      anchor.bottom,
      Math.max(bounds.top, anchor.top - height - gap),
    ),
    width,
  };
}
