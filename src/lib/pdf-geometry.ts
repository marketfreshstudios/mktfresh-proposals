import { pageGeometry, type HeaderFooterSettings } from "./page-bands";
import { pageMetrics, type ResolvedStyles } from "./proposal-styles";
export function validatePrintValue(
  name: string,
  value: number,
  max: number,
  allowZero = false,
) {
  if (
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0) ||
    value > max + 0.01
  )
    throw new Error(
      `Invalid PDF print geometry: ${name} = ${String(value)}px (expected ${allowZero ? "0" : "> 0"}–${max}px)`,
    );
}
/** Validate configured dimensions, not naturally flowing content on an overflowing frozen page. */
export function validatePrintGeometry(
  styles?: ResolvedStyles,
  hf?: HeaderFooterSettings,
) {
  const m = pageMetrics(styles),
    g = pageGeometry(styles, hf, 1);
  for (const [side, n] of Object.entries(g.margins))
    validatePrintValue(
      `margin.${side}`,
      n,
      side === "top" || side === "bottom" ? 1056 : 816,
      true,
    );
  validatePrintValue("content.width", g.content.width, 816);
  validatePrintValue("content.height", g.content.height, 1056);
  validatePrintValue("sheet.height", hf ? 1056 : m.contentHeight, 1056);
  return g;
}
/** Trusted DOM-only check, also used for a fresh target after a print failure. */
export function validatePrintDom() {
  const valid = (name: string, n: number, max: number, zero = false) => {
    if (!Number.isFinite(n) || (zero ? n < 0 : n <= 0) || n > max + 0.1)
      throw new Error(`Invalid PDF print geometry: ${name} = ${String(n)}px`);
  };
  const certificate = document.querySelector<HTMLElement>(".certificate");
  if (certificate) {
    const b = certificate.getBoundingClientRect();
    valid("certificate.width", b.width, 816);
    valid("certificate.height", b.height, 1056);
    return;
  }
  for (const [index, sheet] of [
    ...document.querySelectorAll<HTMLElement>(".print-sheet"),
  ].entries()) {
    const s = getComputedStyle(sheet),
      root = sheet.closest<HTMLElement>(".print-root")!;
    valid(
      `sheet[${index + 1}].width`,
      sheet.getBoundingClientRect().width,
      816,
    );
    const height = parseFloat(
      s.getPropertyValue("--print-sheet-height") ||
        s.getPropertyValue("--print-content-height"),
    );
    valid(`sheet[${index + 1}].height`, height, 1056);
    const content = parseFloat(s.getPropertyValue("--print-content-height"));
    valid(`sheet[${index + 1}].content.height`, content, 1056);
    valid(
      `sheet[${index + 1}].padding.top`,
      parseFloat(s.paddingTop),
      1056,
      true,
    );
    valid(
      `sheet[${index + 1}].padding.bottom`,
      parseFloat(s.paddingBottom),
      1056,
      true,
    );
    if (!root)
      throw new Error("Invalid PDF print geometry: sheet has no print root");
  }
}
