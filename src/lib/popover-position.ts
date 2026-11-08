export type PopoverRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};
/** Coordinates are in the visual viewport; never use the DOM parent's grid cell. */
export function anchoredPopover(
  anchor: PopoverRect,
  size: { width: number; height: number },
  viewport: { left: number; top: number; right: number; bottom: number },
  align: "start" | "end" = "end",
) {
  const gap = 4;
  const below = viewport.bottom - anchor.bottom - gap,
    above = anchor.top - viewport.top - gap;
  const up = size.height > below && above > below;
  const maxHeight = Math.max(44, up ? above : below);
  const height = Math.min(size.height, maxHeight);
  return {
    left: Math.max(
      viewport.left,
      Math.min(
        align === "end" ? anchor.right - size.width : anchor.left,
        viewport.right - size.width,
      ),
    ),
    top: Math.max(
      viewport.top,
      up ? anchor.top - height - gap : anchor.bottom + gap,
    ),
    maxHeight,
  };
}
