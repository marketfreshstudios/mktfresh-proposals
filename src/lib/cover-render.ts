import { fieldNodes, editorFieldValue } from "./editor-fields";
import { inlineSizeHtml } from "./inline-font-size";
import {
  coverElementCss,
  coverElements,
  coverText,
  type Cover,
  type CoverElement,
} from "./cover";
import type { RichText } from "./model";
import { escape, resolve } from "./presentation";
export function coverInlineHtml(
  node: RichText,
  map: Record<string, string>,
  print = false,
): string {
  return coverNodeHtml(
    print ? node : fieldNodes({ type: "paragraph", content: [node] }),
    map,
    print,
  );
}
function coverNodeHtml(
  node: RichText,
  map: Record<string, string>,
  print: boolean,
): string {
  let value =
    node.type === "variable"
      ? print
        ? escape(map[node.attrs?.path ?? ""] ?? "")
        : `<span class="field-chip" data-field="${escape(node.attrs?.path ?? "")}">${escape(editorFieldValue(node.attrs?.path ?? "", map))}</span>`
      : node.type === "text"
        ? escape(resolve(node.text ?? "", map))
        : node.type === "hardBreak"
          ? "<br>"
          : (node.content ?? [])
              .map((n) => coverNodeHtml(n, map, print))
              .join(node.type === "doc" ? "<br>" : "");
  for (const mark of node.marks ?? [])
    if (["bold", "italic", "underline"].includes(mark.type)) {
      const tag = { bold: "strong", italic: "em", underline: "u" }[
        mark.type as "bold"
      ];
      value = `<${tag}>${value}</${tag}>`;
    } else if (mark.type === "fontSize")
      value = inlineSizeHtml(value, mark.attrs?.size);
  return value;
}
export function coverLineClass(e: CoverElement) {
  return e.kind === "workspace"
    ? "print-workspace"
    : e.kind === "byline"
      ? "flow-byline byline"
      : e.kind === "prepared_for"
        ? "flow-prepared-for prepared-for"
        : e.kind === "eyebrow"
          ? "flow-eyebrow eyebrow"
          : "";
}
export function editableCoverHtml(
  cover: Cover,
  title: string,
  map: Record<string, string>,
  logo?: string,
) {
  const src = cover.logo === null ? undefined : cover.logo || logo;
  return coverElements(cover, title)
    .filter((e) => !e.hidden)
    .map((e) => {
      const style = coverElementCss(e);
      if (e.kind === "logo")
        return src
          ? `<div class="cover-logo cover-element" data-cover-element="${escape(e.id)}" style="${style}${e.x === undefined ? "" : "text-align:left;"}"><img src="${escape(src)}" alt="${escape(cover.logo_alt ?? "Company logo")}" data-image-height="${cover.logo_height ?? 60}" ${e.x === undefined ? "" : `data-image-x="${e.x}"`} style="display:inline-block;height:${cover.logo_height ?? 60}px;max-height:none;max-width:100%;width:auto;${e.x === undefined ? "" : `margin-left:${e.x}px;`}"></div>`
          : "";
      const html = coverInlineHtml(
        e.content ??
          coverText(
            e.kind === "title"
              ? title
              : e.kind === "extra"
                ? ""
                : (cover[e.kind] ?? ""),
          ),
        map,
        true,
      );
      if (!html.replace(/<[^>]*>/g, "").trim() && e.kind !== "extra") return "";
      const tag = e.kind === "title" ? "h1" : "div";
      return `<${tag} class="cover-element ${e.kind === "title" ? "" : "cover-text-line"} ${coverLineClass(e)}" data-cover-element="${escape(e.id)}" style="${style}">${html || "<br>"}</${tag}>`;
    })
    .join("");
}
export const coverElementsCss = `.cover-text-line{min-height:18px;font:500 12px/1.5 "Instrument Sans",sans-serif;margin:10px 0}.print-cover:has(>.cover-element){display:flex;flex-direction:column;align-items:stretch}.cover-element{position:relative;flex:none}.cover-logo{width:100%;max-width:none;line-height:0}.cover-element .field-chip{font:inherit}`;
