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
  const sheet = [...paper.querySelectorAll<HTMLElement>(".page-sheet")]
    .map((el) => el.getBoundingClientRect())
    .find((r) => root.top < r.bottom && root.bottom > r.top);
  if (sheet && width <= sheet.width - 16) {
    bounds.left = Math.max(bounds.left, sheet.left + 8);
    bounds.right = Math.min(bounds.right, sheet.right - 8);
  }
  const result = toolbarPosition({
    bounds,
    anchor: root,
    width,
    height: box.height,
    gap: options.gap,
  });
  bar.dataset.toolbarPlaced = "true";
  const scale = root.width / (owner.offsetWidth || root.width || 1);
  bar.style.setProperty(
    "--toolbar-left",
    `${(result.left - root.left) / scale}px`,
  );
  bar.style.setProperty(
    "--toolbar-top",
    `${(result.top - root.top) / scale}px`,
  );
  bar.style.setProperty("--toolbar-max-width", `${result.width / scale}px`);
  bar.scrollLeft = scroll;
  if (bandScroll && insideScroll !== undefined)
    bandScroll.scrollLeft = insideScroll;
  delete bar.dataset.toolbarNarrow;
  bar.dataset.placement =
    result.top + box.height <= root.top ? "above" : "below";
}
