import {
  toolbarPosition,
  type ToolbarRect,
} from "../../lib/editor-toolbar-position";
export function placeEditorToolbar(
  owner: HTMLElement,
  bar: HTMLElement,
  options: { below?: boolean; gap?: number } = {},
) {
  if (innerWidth < 700) {
    delete bar.dataset.toolbarPlaced;
    if (bar.matches(":popover-open")) bar.hidePopover();
    bar.removeAttribute("popover");
    bar.style.visibility = "";
    return;
  }
  const paper = owner.closest<HTMLElement>(
    ".editor-paper,.template-paged-paper",
  );
  if (!paper) return;
  const region = owner
    .closest<HTMLElement>(".editor-document-region,.studio-template-main")
    ?.getBoundingClientRect();
  const root = owner.getBoundingClientRect();
  const bounds: ToolbarRect = {
    left: 8,
    right: innerWidth - 8,
    top: Math.max(8, region?.top ?? 0),
    bottom: innerHeight - 8,
  };
  // A top-layer surface keeps natural-width chrome out of the canvas's scroll
  // geometry and escapes its overflow clip, while retaining DOM/focus ownership.
  bar.setAttribute("popover", "manual");
  if (root.bottom <= bounds.top || root.top >= bounds.bottom) {
    bar.style.visibility = "hidden";
    if (bar.matches(":popover-open")) bar.hidePopover();
    return;
  }
  bar.style.visibility = "";
  if (!bar.matches(":popover-open")) bar.showPopover();
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
