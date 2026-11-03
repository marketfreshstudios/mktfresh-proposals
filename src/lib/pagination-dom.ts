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
