/** Shared source stream for the editable DOM and the print DOM. UI never counts as content. */
export const paginationIgnored =
  "[data-editor-chrome],textarea,.sr-only,[data-pagination-spacer],style";
export function sourceTextNodes(root: Node): Text[] {
  const walk = root.ownerDocument!.createTreeWalker(root, 4, {
    acceptNode: (n) => (n.parentElement?.closest(paginationIgnored) ? 2 : 1),
  });
  const nodes: Text[] = [];
  let n;
  while ((n = walk.nextNode())) nodes.push(n as Text);
  return nodes;
}
function streamLength(text: Text, at = text.length) {
  return text.parentElement?.closest('[data-field="client.address"]')
    ? text.data.slice(0, at).replace(/\n/g, "").length
    : at;
}
export function sourceOffset(root: HTMLElement, node: Node, at = 0) {
  let offset = 0;
  for (const text of sourceTextNodes(root)) {
    if (text === node) return offset + streamLength(text, at);
    offset += streamLength(text);
  }
  if (node.nodeType === 1) {
    const point = document.createRange();
    point.setStart(node, at);
    point.collapse(true);
    offset = 0;
    for (const text of sourceTextNodes(root)) {
      const r = document.createRange();
      r.selectNodeContents(text);
      if (r.compareBoundaryPoints(Range.END_TO_START, point) <= 0)
        offset += streamLength(text);
    }
  }
  return offset;
}

export function sourceLines(target: HTMLElement) {
  const result: { node: Node; at: number; top: number; bottom: number }[] = [];
  for (const node of sourceTextNodes(target)) {
    if (
      !node.parentElement?.getClientRects().length ||
      node.parentElement.closest(paginationIgnored)
    )
      continue;
    let at = 0;
    while (at < node.length) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 1);
      const rect = range.getBoundingClientRect();
      if (rect.height < 1) {
        at++;
        continue;
      }
      const last = result.at(-1);
      if (!last || Math.abs(last.top - rect.top) > 2)
        result.push({ node, at, top: rect.top, bottom: rect.bottom });
      else last.bottom = Math.max(last.bottom, rect.bottom);
      // Find the end of this line without a Range call for every character.
      let lo = at + 1,
        hi = node.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        range.setStart(node, mid - 1);
        range.setEnd(node, mid);
        const r = range.getBoundingClientRect();
        if (Math.abs(r.top - rect.top) < 2) lo = mid;
        else hi = mid - 1;
      }
      at = Math.max(at + 1, lo);
    }
  }
  for (const empty of target.querySelectorAll<HTMLElement>("p")) {
    if (!empty.textContent?.trim()) {
      const r = empty.getBoundingClientRect();
      if (r.height > 0)
        result.push({ node: empty, at: 0, top: r.top, bottom: r.bottom });
    }
  }
  return result.sort((a, b) => a.top - b.top);
}
