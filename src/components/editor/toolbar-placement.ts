import {
  toolbarPosition,
  type ToolbarRect,
} from "../../lib/editor-toolbar-position";
const rect = (r: DOMRect): ToolbarRect => ({
  left: r.left,
  top: r.top,
  right: r.right,
  bottom: r.bottom,
});
/** Actual text/image rectangles, excluding all editor chrome and hidden measuring copies. */
export function toolbarObstacles(
  paper: HTMLElement,
  bounds: ToolbarRect,
  owner?: HTMLElement,
) {
  const result: ToolbarRect[] = [];
  const add = (r: DOMRect) => {
    if (
      r.width &&
      r.height &&
      r.right > bounds.left &&
      r.left < bounds.right &&
      r.bottom > bounds.top &&
      r.top < bounds.bottom
    )
      result.push(rect(r));
  };
  const ignored = (el: Element) =>
    !!el.closest(
      '[data-editor-chrome],[data-page-measurement],[aria-hidden="true"]',
    ) || getComputedStyle(el).visibility !== "visible";
  const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || ignored(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) add(r);
  }
  for (const el of paper.querySelectorAll<HTMLElement>(
    "img,input,textarea,.signature-pair,.document-signature,.cover-element,.tiptap,[data-page-band],.flow-quote-line,summary,.block-content",
  ))
    if (!ignored(el)) add(el.getBoundingClientRect());
  for (const cover of paper.querySelectorAll<HTMLElement>(".document-cover"))
    if (!cover.contains(owner ?? null) && !ignored(cover))
      add(cover.getBoundingClientRect());
  // Hover controls (including an empty cover's Add logo) can sit outside their
  // zero-height content box. Keep those hit targets clear as well.
  for (const button of paper.querySelectorAll<HTMLElement>("button"))
    if (
      !button.closest(".editor-edit-bar,.toolbar-popover") &&
      button.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      })
    )
      add(button.getBoundingClientRect());
  return result;
}
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
  let anchor = root;
  const selection = document.getSelection();
  if (selection?.rangeCount && owner.contains(selection.anchorNode)) {
    const line = [...selection.getRangeAt(0).getClientRects()].find(
      (r) => r.height && r.bottom > (region?.top ?? 0) && r.top < innerHeight,
    );
    if (line) anchor = line;
  }
  const sheets = [...paper.querySelectorAll<HTMLElement>(".page-sheet")].map(
    (el) => el.getBoundingClientRect(),
  );
  const y = Math.max(anchor.top, region?.top ?? 0);
  const sheet =
    sheets.find((r) => y >= r.top && y < r.bottom) ??
    sheets.find(
      (r) =>
        r.bottom > Math.max(root.top, region?.top ?? 0) &&
        r.top < Math.min(root.bottom, innerHeight),
    ) ??
    paper.getBoundingClientRect();
  const bounds = {
    left: Math.max(8, sheet.left + 8, region?.left ?? 0),
    right: Math.min(
      innerWidth - 8,
      sheet.right - 8,
      (region?.right ?? innerWidth) - 12,
    ),
    top: Math.max(8, sheet.top + 8, region?.top ?? 0),
    bottom: Math.min(innerHeight - 8, sheet.bottom - 8),
  };
  if (
    bounds.right - bounds.left < 44 ||
    bounds.bottom - bounds.top < bar.offsetHeight
  )
    return;
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
    anchor: { ...rect(anchor), left: root.left },
    width,
    height: box.height,
    obstacles: toolbarObstacles(paper, bounds, owner),
    ...options,
  });
  if (!result) return;
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
  bar.dataset.toolbarNarrow = String(result.width < 96);
  bar.dataset.placement =
    result.top + box.height <= anchor.top ? "above" : "below";
}
