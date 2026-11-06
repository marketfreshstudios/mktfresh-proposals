import type { RichText } from "./model";
import { fieldLabel } from "./field-labels";
/** Authoring-only normalization. Never rewrite a stored published version. */
export function fieldNodes(node: RichText): RichText {
  if (node.type === "doc" && !node.content?.length)
    return { ...node, content: [{ type: "paragraph" }] };
  return {
    ...node,
    ...(node.content
      ? {
          content: node.content.flatMap((n) => {
            if (n.type !== "text") return [fieldNodes(n)];
            const out: RichText[] = [];
            let last = 0;
            for (const m of (n.text ?? "").matchAll(/{{\s*([\w.-]+)\s*}}/g)) {
              if (m.index! > last)
                out.push({ ...n, text: n.text!.slice(last, m.index) });
              out.push({
                type: "variable",
                attrs: { path: m[1] },
                ...(n.marks ? { marks: n.marks } : {}),
              });
              last = m.index! + m[0].length;
            }
            if (last < (n.text ?? "").length)
              out.push({ ...n, text: n.text!.slice(last) });
            return out;
          }),
        }
      : {}),
  };
}
export function editorFieldValue(
  path: string,
  map: Record<string, string>,
  names = false,
  labels?: Record<string, string>,
) {
  return (names ? undefined : map[path]) || labels?.[path] || fieldLabel(path);
}
export function editorFieldParts(text: string, map: Record<string, string>) {
  return (text ?? "")
    .split(/({{\s*[\w.-]+\s*}})/g)
    .filter(Boolean)
    .map((part) => {
      const match = /^{{\s*([\w.-]+)\s*}}$/.exec(part);
      return match
        ? { path: match[1], value: editorFieldValue(match[1], map) }
        : { value: part };
    });
}
export const resolvedEditorText = (text: string, map: Record<string, string>) =>
  editorFieldParts(text, map)
    .map((p) => p.value)
    .join("");

/** String-backed fields retain line breaks and token paths, never rendered values. */
export function plainEditorText(node: RichText): string {
  if (node.type === "variable") return `{{${node.attrs?.path ?? ""}}}`;
  if (node.type === "hardBreak") return "\n";
  return (
    node.text ??
    (node.content ?? [])
      .map(plainEditorText)
      .join(node.type === "doc" ? "\n" : "")
  );
}
