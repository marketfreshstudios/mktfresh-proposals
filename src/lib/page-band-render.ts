import type { RichText } from "./model";
import { escape } from "./presentation";
import {
  bandColumns,
  bandJustify,
  headerShown,
  footerShown,
  pageGeometry,
  type Band,
  type HeaderFooterSettings,
} from "./page-bands";
import { fontFamily } from "./proposal-fonts";
import type { ResolvedStyles } from "./proposal-styles";
export const pageBandCss = `
.page-band{position:absolute;display:grid;gap:24px;align-items:center;box-sizing:border-box;color:#5F5B53;font-size:12px;line-height:16px;font-weight:400;text-transform:none;letter-spacing:normal;overflow:hidden}
.page-band[data-page-band=header][data-divider=true]{border-bottom:1px solid #E3DED4;padding-bottom:6px}
.page-band[data-page-band=footer][data-divider=true]{border-top:1px solid #E3DED4;padding-top:6px}
.page-band .band-slot{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;height:100%}
.page-band .band-slot-content{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.page-band .band-slot img{display:block;max-height:var(--band-image-max,18px);max-width:100%;width:auto;object-fit:contain;flex-shrink:0;margin:0}
.page-band strong .field-chip{font-weight:700}
.page-band em .field-chip{font-style:italic}
.page-band p,.page-band ul,.page-band ol{font:inherit;margin:0;padding:0;letter-spacing:inherit;line-height:16px}
.page-band ul,.page-band ol{padding-left:16px}
.page-band .field-chip{background:#F0ECE4;border-radius:4px;padding:0 4px;color:#3E3B35;font:inherit;font-weight:500;font-size:12px;line-height:16px}
@media print{.page-band{font-kerning:none}.page-band .band-field{background:none;border:0;padding:0}}
`.replaceAll(
  ".page-band",
  ".proposal-typography.proposal-typography .page-band[data-page-band]",
);
export function pageBandHtml({
  hf,
  kind,
  page,
  pageCount,
  values,
  styles,
  logo,
  print = false,
  band: override,
  inContent = false,
}: {
  inContent?: boolean;
  band?: Band | "hidden";
  hf: HeaderFooterSettings | undefined;
  kind: "header" | "footer";
  page: number;
  pageCount: number;
  values: Record<string, string>;
  styles?: ResolvedStyles;
  logo?: string;
  print?: boolean;
}) {
  if (
    !hf ||
    !(kind === "header" ? headerShown(hf, page) : footerShown(hf, page))
  )
    return "";
  if (override === "hidden") return "";
  const band = override ?? hf.shared[kind],
    g = pageGeometry(styles, hf, page, { [kind]: override }),
    rect = g[kind]!;
  // Page fields are local to this rendering operation, never general proposal variables.
  const map: Record<string, string> = {
    ...values,
    "page.number": String(page),
    "page.count": String(pageCount),
  };
  const field = (path: string) =>
    print
      ? escape(map[path] ?? "")
      : `<span class="field-chip" data-field="${escape(path)}">${escape(map[path] ?? "")}</span>`;
  const text = (value: string) =>
    value
      .split(/({{\s*[\w.-]+\s*}})/g)
      .map((part) =>
        part.startsWith("{{") ? field(part.slice(2, -2).trim()) : escape(part),
      )
      .join("");
  const rich = (n: RichText): string => {
    if (n.type === "variable" || n.type === "text") {
      let s =
        n.type === "variable" ? field(n.attrs?.path ?? "") : text(n.text ?? "");
      for (const m of n.marks ?? []) {
        const tag = (
          { bold: "strong", italic: "em", underline: "u" } as Record<
            string,
            string
          >
        )[m.type];
        if (tag) s = `<${tag}>${s}</${tag}>`;
        else if (m.type === "link") {
          const href = String(m.attrs?.href ?? "");
          if (/^(https:\/\/|mailto:)/.test(href))
            s = `<a href="${escape(href)}">${s}</a>`;
        }
      }
      return s;
    }
    if (n.type === "hardBreak") return "<br>";
    const tag = (
      {
        doc: "div",
        paragraph: "p",
        bulletList: "ul",
        orderedList: "ol",
        listItem: "li",
      } as Record<string, string>
    )[n.type];
    return tag
      ? `<${tag}>${(n.content ?? []).map(rich).join("")}</${tag}>`
      : "";
  };
  const src = band.image?.src === "workspace-logo" ? logo : band.image?.src;
  const slots = band.slots
    .map(
      (slot, n) =>
        `<div class="band-slot" data-band-slot="${n}" style="justify-content:${bandJustify(band.layout)[n]};text-align:${bandJustify(band.layout)[n]}">${src && band.image?.slot === n ? `<img src="${escape(src)}" alt="${escape(band.image.alt)}" style="height:${band.image.height ?? 18}px">` : ""}<div class="band-slot-content">${rich(slot)}</div></div>`,
    )
    .join("");
  const insets = print
    ? "left:0;right:0"
    : `left:var(--editor-sheet-left,${g.margins.left}px);right:var(--editor-sheet-right,${g.margins.right}px)`;
  const edge =
    kind === "header"
      ? `top:${inContent ? rect.y - g.margins.top : rect.y}px`
      : `bottom:${inContent ? g.distance - g.margins.bottom : g.distance}px`;
  return `<div class="page-band" data-page-band="${kind}" data-band-page="${page}" data-divider="${hf.divider}" data-band-mode="${print ? "print" : "rest"}" style="${insets};${edge};height:${rect.height}px;--band-image-max:${g.bandLimits[kind].imageHeight}px;grid-template-columns:${bandColumns(band.layout)};font-family:${escape(fontFamily(styles?.body.font ?? "serif"))}">${slots}</div>`;
}
