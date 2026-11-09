import { blockSpacing } from "./block-style";
import type { Block } from "./model";
import type { ResolvedStyles, StyleLevel } from "./proposal-styles";
type Edge = { above: number; below: number };
export function documentSpacing(
  content: Block[],
  styles: ResolvedStyles,
  trimStart = false,
) {
  const edge = (level: StyleLevel): Edge => ({
    above: styles[level].space_above,
    below: styles[level].space_below,
  });
  const result: Record<string, number> = {};
  let below = trimStart ? 0 : 20;
  for (const [n, b] of content.entries()) {
    if (b.type === "page_break") {
      result[b.id ?? String(n)] = 0;
      below = 0;
      continue;
    }
    const level =
      b.type === "heading"
        ? (`heading${b.level ?? 1}` as StyleLevel)
        : b.type === "pricing_table" || b.type === "contract"
          ? "heading1"
          : b.type === "signature_block"
            ? "heading2"
            : "body";
    const first = edge(level),
      last = b.type === "heading" ? first : edge("body");
    const above = b.style?.margin_above;
    const after = b.style?.margin_below;
    result[b.id ?? String(n)] =
      trimStart && n === 0
        ? 0
        : Math.max(
            below,
            above === undefined ? first.above : blockSpacing[above],
          );
    below = after === undefined ? last.below : blockSpacing[after];
  }
  return result;
}
/** Same pair-wise maximum spacing in editable DOM, client reading and print DOM. */
export function documentFlowCss(styles: ResolvedStyles) {
  const scope = ".proposal-typography.proposal-typography.proposal-typography";
  const levels: Record<string, StyleLevel> = {
    h1: "title",
    h2: "heading1",
    h3: "heading2",
    h4: "heading3",
    p: "body",
    ul: "body",
    ol: "body",
  };
  const rules = Object.entries(levels).map(
    ([tag, level]) =>
      `${scope} ${tag}{margin-top:0;margin-bottom:0;--flow-before:${styles[level].space_above};--flow-after:${styles[level].space_below}}`,
  );
  for (const [a, la] of Object.entries(levels))
    for (const [b, lb] of Object.entries(levels))
      rules.push(
        `${scope} ${a}+${b}{margin-top:${Math.max(styles[la].space_below, styles[lb].space_above)}px}`,
      );
  rules.push(
    `${scope}{--document-flow:max;--flow-before:${styles.body.space_above};--flow-after:${styles.body.space_below}}${scope} .block-sortable,${scope}>[data-document-block]{margin-top:var(--block-space-before,0px);margin-bottom:0;padding-top:0}${scope} .document-section{display:flow-root;margin:0;padding:0}${scope} li{margin-top:0;margin-bottom:0}${scope} li+li{margin-top:${styles.layout?.density === "comfortable" ? ".4em" : ".25em"}}${scope} li>p:last-child{margin-bottom:0}${scope} .flow-byline,${scope} .print-cover .byline{padding-bottom:0}${scope} .print-cover{--flow-before:0;--flow-after:20}${scope} .print-atom{padding-top:0;padding-bottom:0}${scope} .flow-quote-line .quote-description,${scope} .flow-quote-line .flow-terms{margin-top:4px;margin-bottom:0}`,
  );
  return rules.join("");
}
