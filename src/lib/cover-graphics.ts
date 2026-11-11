import { accessibleAccent } from "./brand";
import type { Cover } from "./cover";
import { escape } from "./presentation";
import {
  defaultCoverBackground,
  coverTextColor,
  coverImageBackdrop,
} from "./cover-layout";
/** Built-in vectors are inert, self-contained and use the chosen workspace color. */
export function coverGraphicSvg(
  pattern: string,
  color: string,
  watermark = false,
) {
  const c = escape(color);
  if (["none", "plain"].includes(pattern)) return "";
  if (watermark)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 700" aria-hidden="true">${pattern === "ring" ? `<circle cx="350" cy="350" r="270" fill="none" stroke="${c}" stroke-width="80"/>` : pattern === "orbits" ? `<g fill="none" stroke="${c}" stroke-width="3">${[100, 180, 260, 340].map((r) => `<circle cx="350" cy="350" r="${r}"/>`).join("")}</g>` : pattern === "dots" ? `<defs><pattern id="cover-watermark-dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="4" fill="${c}"/></pattern></defs><rect width="700" height="700" fill="url(#cover-watermark-dots)"/>` : pattern === "corners" ? `<path d="M0 0H280L0 280ZM700 700H420L700 420Z" fill="${c}"/>` : `<path d="M0 100Q350 600 700 100M0 250Q350 750 700 250M0 400Q350 900 700 400" fill="none" stroke="${c}" stroke-width="48"/>`}</svg>`;

  const shapes =
    pattern === "ring"
      ? `<circle cx="610" cy="90" r="270" fill="none" stroke="${c}" stroke-width="90" opacity=".12"/>`
      : pattern === "waves"
        ? `<g fill="none" stroke="${c}" stroke-width="1.25" opacity=".12">${Array.from({ length: 10 }, (_, i) => `<path d="M-40 ${640 + i * 40}C160 ${560 + i * 40},320 ${720 + i * 40},520 ${640 + i * 40}S860 ${560 + i * 40},900 ${600 + i * 40}"/>`).join("")}</g>`
        : pattern === "dots"
          ? `<defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.5" fill="${c}" opacity=".2"/></pattern></defs><rect width="816" height="1056" fill="url(#dots)"/>`
          : pattern === "orbits"
            ? `<g fill="none" stroke="${c}" opacity=".18" stroke-width="3">${[160, 240, 320, 400, 480].map((r) => `<circle cx="480" cy="900" r="${r}"/>`).join("")}</g>`
            : pattern === "corners"
              ? `<path d="M610 0H816V206Z M0 850V1056H206Z" fill="${c}" opacity=".12"/><path d="M700 0H816V116Z M0 940V1056H116Z" fill="${c}" opacity=".32"/>`
              : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="816" height="1056" viewBox="0 0 816 1056" aria-hidden="true">${shapes}</svg>`;
}
export function coverPresentation(
  cover: Cover,
  accent = "#365C4A",
  iconWidth = 0,
  hasIcon = false,
) {
  const layout = cover.layout ?? "custom",
    b = cover.background ?? defaultCoverBackground(layout),
    color = b.color ?? accent;
  const filled =
    layout === "bold" ||
    layout === "photo" ||
    layout === "side-photo" ||
    b.type === "solid" ||
    b.type === "waves" ||
    b.type === "orbits";
  const base = filled
    ? color
    : layout === "centered" || b.type === "corners"
      ? "#f4f7f7"
      : "#ffffff";
  let graphic =
    b.graphic ??
    (layout === "editorial" || layout === "split" ? "auto" : "none");
  if (graphic === "auto" || graphic === "logo-icon")
    graphic =
      hasIcon && iconWidth >= 1024
        ? "logo-icon"
        : layout === "split"
          ? "orbits"
          : "ring";
  return {
    layout,
    b,
    color,
    base,
    backdrop: coverImageBackdrop(cover),
    text: coverImageBackdrop(cover) ? "#ffffff" : coverTextColor(base),
    panelText: coverTextColor(color),
    graphic,
    opacity: b.opacity ?? (layout === "split" || filled ? 0.12 : 0.08),
    size: b.size ?? (layout === "split" ? 420 : 480),
  };
}
export function coverDecorationHtml(
  cover: Cover,
  accent?: string,
  icon?: string,
  iconWidth = 0,
) {
  if (!cover.layout || cover.layout === "custom") return "";
  const p = coverPresentation(cover, accent, iconWidth, !!icon),
    { b } = p;
  const image =
    b.type === "image" && b.image
      ? `<img class="cover-background-image" alt="" src="${escape(b.image)}" style="object-position:${b.focal?.x ?? 50}% ${b.focal?.y ?? 50}%">`
      : "";
  const graphic =
    p.graphic === "logo-icon"
      ? `<img src="${escape(icon!)}" alt="">`
      : p.graphic === "upload" && b.graphic_image
        ? `<img src="${escape(b.graphic_image)}" alt="">`
        : coverGraphicSvg(
            p.graphic,
            p.layout === "split" ? "#ffffff" : p.color,
            true,
          );
  const automatic =
    (b.graphic ?? "auto") === "auto" || b.graphic === "logo-icon";
  const displayed =
    automatic && icon
      ? `<img data-cover-icon-candidate data-fallback="${p.layout === "split" ? "orbits" : "ring"}" src="${escape(icon)}" alt="" style="display:none">${coverGraphicSvg(p.layout === "split" ? "orbits" : "ring", p.layout === "split" ? "#ffffff" : p.color, true)}`
      : graphic;
  return `<div class="cover-decoration" aria-hidden="true" style="--cover-base:${p.base}">${image}${b.type !== "solid" && b.type !== "image" ? coverGraphicSvg(b.type, ["waves", "orbits"].includes(b.type) ? "#ffffff" : p.color) : ""}<div class="cover-panel"></div>${p.graphic === "none" ? "" : `<div class="cover-watermark-clip"><div class="cover-watermark" data-cover-graphic="${p.graphic}" style="width:${p.size}px;height:${p.size}px;opacity:${p.opacity}">${displayed}</div></div>`}</div>`;
}
export function coverLayoutStyle(cover: Cover, accent?: string) {
  const p = coverPresentation(cover, accent);
  return `--cover-small-accent:${accessibleAccent(p.color)};--cover-color:${p.color};--cover-text:${p.text};--cover-panel-text:${p.panelText};${cover.layout && cover.layout !== "custom" ? `color:${p.text};` : ""}`;
}
const phoneCoverRules = `.document-cover:not([data-page-measurement] *)[data-cover-layout]:not([data-cover-layout=custom]){min-height:780px;height:auto;--cover-inset-left:var(--editor-sheet-left,16px)!important;--cover-inset-right:var(--editor-sheet-right,16px)!important;--cover-inset-top:24px!important;--cover-inset-bottom:28px!important}.document-cover:not([data-page-measurement] *)[data-cover-layout]:not([data-cover-layout=custom]){--cover-title-size:36px}.document-cover:not([data-page-measurement] *) .cover-meta-group{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.document-cover:not([data-page-measurement] *)[data-cover-layout]:not([data-cover-layout=custom]) .cover-logo:not(:has(img)) .cover-brand-name{margin-left:0}
[data-cover-layout=split]{--cover-padding:0}.document-cover:not([data-page-measurement] *)[data-cover-layout=split] .cover-panel{width:100%}.document-cover:not([data-page-measurement] *)[data-cover-layout=split] .cover-brand-group,.document-cover:not([data-page-measurement] *)[data-cover-layout=split] .cover-meta-group,.document-cover:not([data-page-measurement] *)[data-cover-layout=split] .cover-meta-group>[data-cover-kind=prepared_for]{position:relative;left:auto;bottom:auto;top:auto;width:auto;color:var(--cover-panel-text)}.document-cover:not([data-page-measurement] *)[data-cover-layout=split] .cover-main-group{color:var(--cover-panel-text);min-height:420px}.document-cover:not([data-page-measurement] *) .cover-main-group{min-height:420px}.document-cover:not([data-page-measurement] *) .cover-brand-group{flex-wrap:wrap}.document-cover:not([data-page-measurement] *)[data-cover-layout=photo] .cover-brand-group{margin:0;max-width:100%}`;
export const coverLayoutCss = `
[data-cover-layout]:not([data-cover-layout=custom]){position:relative;isolation:isolate;min-height:var(--cover-content-height,912px);height:var(--cover-content-height,912px);margin:0!important;padding:var(--cover-padding,0)!important;gap:0!important;display:flex!important;flex-direction:column;align-items:stretch!important;color:var(--cover-text);box-sizing:border-box}
.cover-decoration{position:absolute;inset:calc(-1*var(--cover-inset-top,72px)) calc(-1*var(--cover-inset-right,72px)) calc(-1*var(--cover-inset-bottom,72px)) calc(-1*var(--cover-inset-left,72px));overflow:hidden;background:var(--cover-base);z-index:-1;pointer-events:none}
.cover-decoration>svg,.cover-background-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;max-height:none!important;max-width:none!important}
.cover-panel{display:none}.cover-watermark-clip{position:absolute;inset:0;overflow:hidden;pointer-events:none}.cover-watermark{position:absolute;background:transparent;border:0;right:-150px;top:-150px;overflow:visible;pointer-events:none}.cover-watermark>img,.cover-watermark>svg{width:100%;height:100%;object-fit:contain;background:transparent;border:0;border-radius:0;max-height:none!important;max-width:none!important}
.cover-brand-group,.cover-main-group,.cover-meta-group{position:relative;min-width:0}
.cover-main-group{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:72px}
.cover-main-group:after{content:"";display:block;width:72px;height:4px;background:var(--cover-color);margin-top:36px}
.cover-meta-group{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px;border-top:1px solid #dce3e6;padding-top:24px}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-element{min-width:0;flex:none;color:inherit}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-element :is(.field-editor,.field-editor-content,.tiptap,.tiptap>p){font:inherit!important;color:inherit!important;line-height:inherit!important;text-transform:inherit!important;letter-spacing:inherit!important}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-text-line{font:400 14px/1.4 var(--proposal-body,"Source Serif 4",serif);margin:0;color:inherit}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-title-line,[data-cover-layout]:not([data-cover-layout=custom]) h1{font-weight:700!important;font-size:var(--cover-title-size,64px)!important;line-height:var(--cover-title-leading,1.04)!important;letter-spacing:var(--cover-title-tracking,-.025em)!important;max-width:var(--cover-title-width,600px);margin:0;color:inherit!important}
[data-cover-layout]:not([data-cover-layout=custom]) .flow-eyebrow{font:600 13px/1.4 var(--font-ui,"Instrument Sans",sans-serif);letter-spacing:.16em;text-transform:uppercase;margin-bottom:20px;color:var(--cover-eyebrow-color,var(--cover-small-accent,var(--cover-color)))}
.cover-meta-label{display:block;font:600 11px/1.3 var(--font-ui,"Instrument Sans",sans-serif);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;opacity:1}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-logo{width:auto;margin:0;line-height:0}
[data-cover-layout]:not([data-cover-layout=custom]) .cover-logo:not(:has(img)) .cover-brand-name{margin-left:0}
[data-cover-layout=split]{--cover-padding:0 0 0 288px;--cover-title-size:52px;--cover-title-leading:1.06}
[data-cover-layout=split] .cover-panel{display:block;position:absolute;left:0;top:0;bottom:0;width:296px;background:var(--cover-color)}
[data-cover-layout=split] .cover-brand-group{position:absolute;left:-24px;top:0;width:200px;color:var(--cover-panel-text)}
[data-cover-layout=split] .cover-main-group{padding-bottom:0;justify-content:center}
[data-cover-layout=split] .cover-main-group:after{display:none}

[data-cover-layout=split] .cover-meta-group{border:0;grid-template-columns:1fr;padding:0;position:absolute;left:-24px;bottom:0;width:200px;color:var(--cover-panel-text)}
[data-cover-layout=split] .cover-main-group>[data-cover-kind=prepared_for]{margin-top:40px;font-size:16px}
[data-cover-layout=split] .cover-watermark{top:auto;right:auto;left:96px;bottom:-90px}
[data-cover-layout=split] .cover-watermark-clip{right:auto;width:296px}
[data-cover-layout=split] .cover-watermark>img[data-cover-icon-candidate]{filter:brightness(0) invert(1)}
[data-cover-layout=bold]{--cover-eyebrow-color:var(--cover-text);--cover-title-size:76px;--cover-title-leading:1;--cover-title-tracking:-.03em;--cover-title-width:640px}[data-cover-layout=bold] .cover-main-group{justify-content:center;padding-bottom:0}[data-cover-layout=bold] .cover-main-group:after{display:none}[data-cover-layout=bold] .flow-eyebrow{color:inherit}
[data-cover-layout=photo]{--cover-eyebrow-color:var(--cover-text);--cover-title-size:50px;--cover-title-leading:1.06;--cover-title-width:640px}[data-cover-layout=photo] .cover-background-image{height:64%}[data-cover-layout=photo] .cover-decoration{background:var(--cover-color)}[data-cover-layout=photo] .cover-main-group{justify-content:flex-end;padding-bottom:72px}[data-cover-layout=photo] .cover-brand-group{align-self:flex-start;background:white;color:#1b1f1d;border-radius:10px;padding:10px 14px;margin:-32px -32px 0}
[data-cover-layout=photo] .flow-eyebrow{color:inherit}[data-cover-layout=photo] .cover-main-group:after{display:none}
[data-cover-layout=centered]{--cover-title-size:56px;--cover-title-leading:1.06;--cover-title-width:560px;text-align:center}[data-cover-layout=centered] .cover-decoration:after{content:"";position:absolute;inset:56px;border:1px solid #c2cdd2}[data-cover-layout=centered] .cover-main-group{align-items:center;justify-content:center;padding-bottom:0}[data-cover-layout=centered] .cover-main-group:after{display:none}[data-cover-layout=centered] .cover-meta-group{border:0;display:flex;justify-content:center;flex-wrap:wrap}
[data-cover-layout=bold] .cover-brand-group{display:flex;align-items:center;justify-content:space-between;gap:24px}[data-cover-layout=bold] .cover-brand-group .flow-eyebrow{margin-bottom:0}[data-cover-layout=bold] .cover-main-group{padding-bottom:120px}[data-cover-layout=bold] .cover-main-group>[data-cover-kind=prepared_for]{margin-top:32px;font-size:18px}[data-cover-layout=bold] .cover-meta-group{display:flex;gap:48px;border:0}
[data-cover-layout=centered] .cover-brand-group{padding-top:56px}[data-cover-layout=centered] h1:after{content:"";display:block;width:48px;height:3px;background:var(--cover-color);margin:24px auto}[data-cover-layout=centered] .cover-main-group>[data-cover-kind=prepared_for]{font-size:17px}[data-cover-layout=centered] .cover-meta-group{padding-bottom:40px}
[data-cover-finished=true] .cover-background-image{height:100%}[data-cover-backdrop=true] .cover-text-line,[data-cover-backdrop=true] h1{background:rgba(0,0,0,.78);color:white!important;padding:8px!important;border-radius:4px}
[data-cover-backdrop=true] .cover-brand-group{background:white;color:#1b1f1d;border-radius:10px;padding:10px 14px;max-width:100%}
@media(max-width:699px){${phoneCoverRules}}
@media print{.cover-meta-label{letter-spacing:0}}
`;
const phoneSidePhotoRules = `.document-cover:not([data-page-measurement] *)[data-cover-layout=side-photo]{--cover-padding:0;--cover-title-size:36px;min-height:0}.document-cover:not([data-page-measurement] *)[data-cover-layout=side-photo] .cover-main-group{min-height:240px}.document-cover:not([data-page-measurement] *)[data-cover-layout=side-photo] .cover-decoration>:is(.cover-background-image,.cover-panel){position:absolute;inset:auto 0 0;width:100%;height:180px}.document-cover:not([data-page-measurement] *)[data-cover-layout=side-photo] .cover-meta-group{margin-bottom:180px}`;
export const sidePhotoCoverCss = `
[data-cover-layout=side-photo]{--cover-padding:0 35% 0 0;--cover-eyebrow-color:var(--cover-text);--cover-title-size:52px;--cover-title-leading:1.06}
[data-cover-layout=side-photo] .cover-main-group{justify-content:center;padding-bottom:0}
[data-cover-layout=side-photo] .cover-main-group:after{display:none}
[data-cover-layout=side-photo] .cover-meta-group{grid-template-columns:repeat(2,minmax(0,1fr));border-top-color:currentColor;gap:20px}
[data-cover-layout=side-photo] .cover-decoration>.cover-panel{display:block;position:absolute;inset:0 0 0 auto;width:36%;background:repeating-linear-gradient(135deg,transparent 0 12px,rgba(255,255,255,.055) 12px 24px)}
[data-cover-layout=side-photo] .cover-background-image{inset:0 0 0 auto;width:36%;height:100%}
[data-cover-layout=side-photo]:has(.cover-background-image) .cover-panel{display:none}
@media(max-width:699px){${phoneSidePhotoRules}}
`;
/** The centered phone preview is narrow even when the browser viewport is wide. */
export const phonePreviewCoverCss = `@container client-stage (width < 700px){${phoneCoverRules}${phoneSidePhotoRules}}`;
/** Same final decision in editor, public sheets and Chromium print, including old icons without dimension metadata. */
export function resolveCoverGraphics(root: ParentNode) {
  for (const image of root.querySelectorAll<HTMLImageElement>(
    "img[data-cover-icon-candidate]",
  )) {
    const update = () => {
      const usable = image.naturalWidth >= 1024 && image.naturalHeight >= 1024;
      image.style.display = usable ? "block" : "none";
      image.parentElement!.dataset.coverGraphic = usable
        ? "logo-icon"
        : image.dataset.fallback;
      const fallback = image.parentElement!.querySelector<SVGElement>("svg");
      if (fallback) fallback.style.display = usable ? "none" : "block";
    };
    update();
    if (!image.complete) image.addEventListener("load", update, { once: true });
  }
}
