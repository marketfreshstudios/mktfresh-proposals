/** Trusted DOM geometry shared by editor, canonical pagination, client and print.
 * Returns decorations in the editor; writes attributes only in renderer-owned DOM. */
export function sizeListMarkers(root: HTMLElement, apply = true) {
  const records: {
    element: HTMLElement;
    size: number | null;
    style: string;
  }[] = [];
  for (const item of root.querySelectorAll<HTMLElement>("li")) {
    const base = parseFloat(getComputedStyle(item).fontSize) || 16;
    const own = (el: Element) => el.closest("li") === item;
    const sized = [
      ...item.querySelectorAll<HTMLElement>("[data-inline-size]"),
    ].filter(own);
    let size: number | null = null;
    if (sized.length) {
      const walk = document.createTreeWalker(item, NodeFilter.SHOW_TEXT),
        range = document.createRange();
      let text: Node | null,
        top = Infinity,
        bottom = -Infinity,
        largest = 0,
        done = false;
      while (!done && (text = walk.nextNode())) {
        if (
          !text.parentElement ||
          !own(text.parentElement) ||
          text.parentElement.closest(
            "[data-editor-chrome],[data-pagination-spacer]",
          )
        )
          continue;
        for (let at = 0; at < (text.textContent?.length ?? 0); at++) {
          range.setStart(text, at);
          range.setEnd(text, at + 1);
          const r = range.getBoundingClientRect();
          if (!r.height) continue;
          if (
            top !== Infinity &&
            (r.top >= bottom - 1 || r.bottom <= top + 1)
          ) {
            done = true;
            break;
          }
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
          largest = Math.max(
            largest,
            parseFloat(getComputedStyle(text.parentElement).fontSize) || base,
          );
        }
      }
      size = largest || base;
    }
    const ratio =
      parseFloat(
        getComputedStyle(item).getPropertyValue("--list-line-ratio"),
      ) || 1.65;
    const previous = records.findLast(
      (r) => r.element === item.previousElementSibling,
    );
    const gap = Math.max(size ?? base, previous?.size ?? base) / base;
    const style =
      (size !== null
        ? `--list-marker-size:${size}px;--list-line-height:${size * ratio}px;`
        : "") + `--list-gap-scale:${gap};`;
    records.push({ element: item, size, style });
    if (apply) {
      if (size !== null) item.dataset.listSize = String(size);
      else delete item.dataset.listSize;
      item.dataset.listGap = "";
      for (const key of [
        "--list-marker-size",
        "--list-line-height",
        "--list-gap-scale",
      ])
        item.style.removeProperty(key);
      for (const declaration of style.split(";").filter(Boolean)) {
        const [key, value] = declaration.split(":");
        item.style.setProperty(key, value);
      }
    }
  }
  return records;
}
export function listMarkerCss(scope: string, gap: string) {
  return `${scope} li[data-list-size]::marker{font-size:var(--list-marker-size)}${scope} li[data-list-size]>p{line-height:var(--list-line-height)!important}${scope} li+li[data-list-gap]{margin-top:calc(${gap} * var(--list-gap-scale,1))}`;
}
