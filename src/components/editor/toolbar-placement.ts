import {
  toolbarPosition,
  type ToolbarRect,
} from "../../lib/editor-toolbar-position";
export function placeEditorToolbar(
  owner: HTMLElement,
  bar: HTMLElement,
  options: { below?: boolean; gap?: number; withinCanvas?: boolean } = {},
) {
  if (innerWidth < 700) {
    delete bar.dataset.toolbarPlaced;
    bar.style.visibility = "";
    return;
  }
  const paper = owner.closest<HTMLElement>(
    ".editor-paper,.template-paged-paper,.studio-blocks",
  );
  if (!paper) return;
  const region = owner
    .closest<HTMLElement>(".editor-document-region,.studio-template-main")
    ?.getBoundingClientRect();
  let root: ToolbarRect = owner.getBoundingClientRect();
  if (bar.classList.contains("selection-edit-bar")) {
    const selected = [
      ...(owner
        .closest(".block-scope")
        ?.querySelectorAll<HTMLElement>('[data-multi-selected="true"]') ?? []),
    ]
      .filter(
        (el) =>
          !el.closest("[data-page-measurement]") && el.getClientRects().length,
      )
      .map((el) => el.getBoundingClientRect());
    if (selected.length)
      root = {
        top: Math.min(...selected.map((r) => r.top)),
        bottom: Math.max(...selected.map((r) => r.bottom)),
        left: Math.min(...selected.map((r) => r.left)),
        right: Math.max(...selected.map((r) => r.right)),
      };
  }
  const bounds: ToolbarRect = {
    left: options.withinCanvas && region ? Math.max(8, region.left + 8) : 8,
    right:
      options.withinCanvas && region
        ? Math.min(innerWidth - 8, region.right - 8)
        : innerWidth - 8,
    top: Math.max(8, region?.top ?? 0),
    bottom: innerHeight - 8,
  };
  // Viewport-fixed chrome escapes the canvas clip without becoming a native
  // popover. Only actual menus use popovers and their focus/teardown behavior.
  if (root.bottom <= bounds.top || root.top >= bounds.bottom) {
    bar.style.visibility = "hidden";
    return;
  }
  bar.style.visibility = "";
  // Measure overflow without temporarily expanding the bar: expansion would
  // reset its horizontal scroll during a pointer click on an end action.
  const box = bar.getBoundingClientRect();
  const css = getComputedStyle(bar);
  const border =
    (parseFloat(css.borderLeftWidth) || 0) +
    (parseFloat(css.borderRightWidth) || 0);
  const bandScroll = bar.querySelector<HTMLElement>(".band-edit-scroll");
  const width = Math.max(
    box.width,
    bar.scrollWidth + border,
    bandScroll
      ? bandScroll.scrollWidth +
          border +
          (parseFloat(css.paddingLeft) || 0) +
          (parseFloat(css.paddingRight) || 0)
      : 0,
  );
  const scroll = bar.scrollLeft,
    insideScroll = bandScroll?.scrollLeft;
  const result = toolbarPosition({
    bounds,
    anchor: root,
    width,
    height: box.height,
    gap: options.gap,
  });
  bar.dataset.toolbarPlaced = "true";
  bar.style.setProperty("--toolbar-left", `${result.left}px`);
  bar.style.setProperty("--toolbar-top", `${result.top}px`);
  bar.style.setProperty("--toolbar-max-width", `${result.width}px`);
  bar.scrollLeft = scroll;
  if (bandScroll && insideScroll !== undefined)
    bandScroll.scrollLeft = insideScroll;
  delete bar.dataset.toolbarNarrow;
  bar.dataset.placement =
    result.top + box.height <= root.top ? "above" : "sticky";
}
