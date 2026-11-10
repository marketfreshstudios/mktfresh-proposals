import { quoteTableCss } from "./quote-table";
import { listMarkerCss } from "./list-markers";
import { signatureCss } from "./signature-presentation";
import { documentQuoteCss } from "./document-quote";
import { blockContentCss } from "./block-style";
import type { Block } from "./model";
import { documentFlowCss } from "./document-spacing";
import { z } from "zod";
import {
  fontChoice,
  fontFamily,
  type FontChoice,
  type ProposalFont,
} from "./proposal-fonts";
import { whiteContrast, accessibleAccent, colorContrast } from "./brand";
export const styleLevels = [
  "title",
  "heading1",
  "heading2",
  "heading3",
  "body",
] as const;
export type StyleLevel = (typeof styleLevels)[number];
export const styleLabels: Record<StyleLevel, string> = {
  title: "Title",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  body: "Body",
};
export const StyleEntrySchema = z.object({
  font: fontChoice,
  size: z.number().min(8).max(96),
  weight: z.number().int().min(100).max(900),
  colour: z.union([
    z.enum(["accent", "ink"]),
    z.string().regex(/^#[\da-fA-F]{6}$/),
  ]),
  letter_case: z.enum(["normal", "uppercase"]),
  letter_spacing: z.number().min(-0.1).max(0.5),
  space_above: z.number().min(0).max(1056),
  space_below: z.number().min(0).max(1056),
});
export type TextStyle = z.infer<typeof StyleEntrySchema>;
const hexColor = z.string().regex(/^#[\da-fA-F]{6}$/);
const QuoteNeutralsSchema = z
  .object({
    group_fill: hexColor,
    group_border: hexColor,
    dividers: hexColor,
    shaded_fill: hexColor,
  })
  .strict();
type QuoteNeutrals = z.infer<typeof QuoteNeutralsSchema>;
export const harborQuoteNeutrals: QuoteNeutrals = {
  group_fill: "#f1f4f5",
  group_border: "#dce3e6",
  dividers: "#dce3e6",
  shaded_fill: "#f4f7f7",
};
export const legacyQuoteNeutrals: QuoteNeutrals = {
  group_fill: "#f2f6f3",
  group_border: "#9db3a8",
  dividers: "#e4eaed",
  shaded_fill: "#f4f7f7",
};
export const StyleOverridesSchema = z
  .object({
    title: StyleEntrySchema.partial().optional(),
    heading1: StyleEntrySchema.partial().optional(),
    heading2: StyleEntrySchema.partial().optional(),
    heading3: StyleEntrySchema.partial().optional(),
    body: StyleEntrySchema.partial().optional(),
    density: z.enum(["standard", "comfortable"]).optional(),
    quote_layout: z.enum(["cards", "table"]).optional(),
    quote_neutrals: QuoteNeutralsSchema.partial().optional(),
    margins: z
      .object({
        top: z.number().min(0.25).max(2).optional(),
        right: z.number().min(0.25).max(2).optional(),
        bottom: z.number().min(0.25).max(2).optional(),
        left: z.number().min(0.25).max(2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type StyleOverrides = z.infer<typeof StyleOverridesSchema>;
export type DocumentLayout = {
  density: "standard" | "comfortable";
  quote_layout?: "cards" | "table";
  quote_neutrals?: QuoteNeutrals;
  margins: { top: number; right: number; bottom: number; left: number };
};
export type ResolvedStyles = Record<StyleLevel, TextStyle> & {
  layout?: DocumentLayout;
};
/** Missing layout means an older frozen style map; preserve its print metrics. */
export function documentLayout(styles?: ResolvedStyles): DocumentLayout {
  return (
    styles?.layout ?? {
      density: "comfortable",
      margins: {
        top: 18 / 25.4,
        right: 18 / 25.4,
        bottom: 18 / 25.4,
        left: 18 / 25.4,
      },
    }
  );
}
export function pageMetrics(styles?: ResolvedStyles) {
  const { margins } = documentLayout(styles);
  return {
    width: 816,
    height: 1056,
    margins,
    contentWidth: 816 - 96 * (margins.left + margins.right),
    contentHeight: 1056 - 96 * (margins.top + margins.bottom),
  };
}
type Settings = {
  proposal_fonts?: { heading: FontChoice; body: FontChoice };
  proposal_styles?: StyleOverrides;
  accent_colour?: string;
};
export function defaultStyles(
  fonts?: Settings["proposal_fonts"],
  density: DocumentLayout["density"] = "standard",
): ResolvedStyles {
  const base: TextStyle = {
    font: fonts?.heading ?? "serif",
    size: 25,
    weight: 600,
    colour: "ink",
    letter_case: "normal",
    letter_spacing: -0.015,
    space_above: density === "standard" ? 27.5 : 28,
    space_below: density === "standard" ? 8.75 : 12,
  };
  return {
    title: {
      ...base,
      size: 40,
      letter_spacing: -0.025,
      space_above: 12,
      space_below: 20,
    },
    heading1: { ...base },
    heading2: {
      ...base,
      size: 17,
      letter_spacing: 0,
      space_above: density === "standard" ? 18.7 : 16,
      space_below: density === "standard" ? 5.95 : 16,
    },
    heading3: {
      ...base,
      size: 15,
      letter_spacing: 0,
      space_above: density === "standard" ? 16.5 : 12,
      space_below: density === "standard" ? 5.25 : 8,
    },
    body: {
      ...base,
      font: fonts?.body ?? "serif",
      size: 16,
      weight: 400,
      letter_spacing: 0,
      space_above: density === "standard" ? 0 : 10,
      space_below: density === "standard" ? 9.6 : 10,
    },
  };
}
/** Draft precedence; callers must use a version's stored result after sending. */
export function resolveStyles(
  settings?: Settings | null,
  template?: StyleOverrides,
  proposal?: StyleOverrides,
): ResolvedStyles {
  const density =
    proposal?.density ??
    template?.density ??
    settings?.proposal_styles?.density ??
    "standard";
  const defaults = defaultStyles(settings?.proposal_fonts, density);
  const text = Object.fromEntries(
    styleLevels.map((level) => [
      level,
      {
        ...defaults[level],
        ...settings?.proposal_styles?.[level],
        ...template?.[level],
        ...proposal?.[level],
      },
    ]),
  ) as unknown as ResolvedStyles;
  text.layout = {
    density,
    margins: {
      top: 0.75,
      right: 0.75,
      bottom: 0.75,
      left: 0.75,
      ...settings?.proposal_styles?.margins,
      ...template?.margins,
      ...proposal?.margins,
    },
  };
  const quoteLayout =
    proposal?.quote_layout ??
    template?.quote_layout ??
    settings?.proposal_styles?.quote_layout;
  // An implicit Cards layout has the same metrics as earlier versions.
  if (quoteLayout) text.layout.quote_layout = quoteLayout;
  const workspaceNeutrals = settings?.proposal_styles?.quote_neutrals;
  const templateNeutrals = template?.quote_neutrals;
  const proposalNeutrals = proposal?.quote_neutrals;
  // Customized older documents keep their original colors until a palette is chosen.
  const matchesDefault =
    density === "standard" &&
    (!quoteLayout || quoteLayout === "cards") &&
    Object.values(text.layout.margins).every((margin) => margin === 0.75) &&
    styleLevels.every((level) =>
      Object.entries(defaults[level]).every(
        ([key, value]) =>
          JSON.stringify(text[level][key as keyof TextStyle]) ===
          JSON.stringify(value),
      ),
    );
  if (
    workspaceNeutrals ||
    templateNeutrals ||
    proposalNeutrals ||
    matchesDefault
  )
    text.layout.quote_neutrals = {
      ...harborQuoteNeutrals,
      ...workspaceNeutrals,
      ...templateNeutrals,
      ...proposalNeutrals,
    };
  return text;
}
export const marginPresets = { narrow: 0.6, normal: 0.9, wide: 1.1 } as const;
export function quoteLayout(styles?: ResolvedStyles) {
  return styles?.layout?.quote_layout ?? "cards";
}
export function styleColour(value: string, accent = "#365c4a") {
  return value === "ink" ? "#25241f" : value === "accent" ? accent : value;
}
export function freezeStyles(
  settings?: Settings | null,
  template?: StyleOverrides,
  proposal?: StyleOverrides,
) {
  const styles = resolveStyles(settings, template, proposal);
  for (const level of styleLevels)
    styles[level].colour = styleColour(
      styles[level].colour,
      settings?.accent_colour,
    );
  return styles;
}
/** Contrast is advisory. Small text derives a readable shade at render time. */
export function validateStyleContrast(styles: ResolvedStyles, accent?: string) {
  return styleLevels
    .filter(
      (level) => whiteContrast(styleColour(styles[level].colour, accent)) < 4.5,
    )
    .map((level) => `${styleLabels[level]} uses a darker shade for small text`);
}
export function styleFonts(styles?: ResolvedStyles) {
  return styles ? styleLevels.map((level) => styles[level].font) : [];
}
export function styleFontFaces(
  styles?: ResolvedStyles,
  url = (font: ProposalFont) => `/api/workspace-fonts/${font.id}`,
) {
  return [
    ...new Map(
      styleFonts(styles)
        .filter((f): f is ProposalFont => typeof f !== "string")
        .map((f) => [f.id, f]),
    ).values(),
  ]
    .map(
      (f) =>
        `@font-face{font-family:"Proposal-${f.id}";src:url("${url(f)}") format("${f.format === "ttf" ? "truetype" : "woff2"}");font-display:swap;}`,
    )
    .join("");
}
/** Shared typographic line box for print CSS and page-bounded style controls. */
export function textLineHeight(styles: ResolvedStyles, level: StyleLevel) {
  return level === "title"
    ? 1.15
    : level === "heading1"
      ? 1.25
      : level === "body"
        ? documentLayout(styles).density === "standard"
          ? 1.5
          : 1.65
        : 1.35;
}
/** Shared screen/print rules. Scope excludes the PDF completion certificate and app chrome. */
function quoteNeutralCss(
  palette: QuoteNeutrals,
  accent: string,
  table: boolean,
) {
  const { group_fill, group_border, dividers, shaded_fill } = palette;
  const readableOn = (fill: string, color: string) => {
    if (colorContrast(fill, color) >= 4.5) return color;
    return colorContrast(fill, "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
  };
  const scope = ".proposal-typography.proposal-typography";
  return `
    .proposal-typography{--quote-neutral-group:${group_fill};--quote-neutral-frame:${group_border};--quote-neutral-label:${readableOn(group_fill, accent)};--quote-neutral-divider:${dividers}}
    ${scope} .flow-choice-group,.client-flow ${scope} .flow-choice-group{background:${group_fill};border-color:${group_border}}
    ${scope} .flow-choice-group>h3,.client-flow ${scope} .flow-choice-group h3{color:${readableOn(group_fill, accent)}}
    ${scope} .flow-quote-line,${scope} .flow-quote-line.selected{border-bottom-color:${dividers}}
    ${scope} .flow-choice-group .flow-quote-line:not(.selected){box-shadow:inset 0 0 0 1px ${dividers}}
    .client-flow ${scope} .flow-choice-group .flow-quote-line:not(.selected){box-shadow:none}
    .client-flow ${scope} .flow-choice-group .flow-quote-line+.flow-quote-line::before{background:${dividers}}
    ${scope} .document-totals,.client-flow.client-flow .document-totals{background:${shaded_fill}}
    ${scope} .document-totals :is(span,small),.client-flow.client-flow .document-totals :is(span,small){color:${readableOn(shaded_fill, "#56646a")}}
    ${scope} .document-totals strong,.client-flow.client-flow .document-totals strong{color:${readableOn(shaded_fill, "#1c1b18")}}
    ${
      table
        ? `${scope} .quote-table th,${scope} .quote-table td,.client-flow .flow-document .quote-table tr{border-bottom-color:${dividers}}
    ${scope} .quote-table thead th,${scope} .quote-table .quote-table-repeat th{background:${shaded_fill};color:${readableOn(shaded_fill, "#56646a")}}`
        : ""
    }
  `;
}
export function documentStyleCss(
  styles?: ResolvedStyles,
  accent = "#365c4a",
  content?: Block[],
  surface?: "editor" | "type-sample",
) {
  const boxCss = blockContentCss(content);
  if (!styles) return boxCss;
  const scope = ".proposal-typography.proposal-typography";
  const roots = [".document-reading", ".print-root", ".style-sample"];
  const headingTags: Record<Exclude<StyleLevel, "body">, string> = {
    title: surface === "editor" ? 'h2:where([data-cover-kind="title"])' : "h1",
    heading1:
      surface === "editor" ? 'h2:not(:where([data-cover-kind="title"]))' : "h2",
    heading2: "h3",
    heading3: "h4",
  };
  const selector = (level: StyleLevel) => {
    const tags =
      level === "body"
        ? [
            ".block-content",
            "[data-document-block]",
            ".print-atom",
            ".style-body",
            ".field-editor-content",
          ]
        : [
            surface === "type-sample"
              ? `[data-sample-heading="${headingTags[level].slice(1)}"]`
              : headingTags[level],
          ];
    return roots
      .flatMap((root) =>
        tags.map((tag) => `${scope}${root} ${tag},${scope} ${root} ${tag}`),
      )
      .join(",");
  };
  return (
    styleLevels
      .map((level) => {
        const s = styles[level],
          lh = textLineHeight(styles, level);
        const declaration = `font-family:${fontFamily(s.font)};font-size:${s.size}px;font-weight:${s.weight};line-height:${lh};color:${s.size < 24 ? accessibleAccent(styleColour(s.colour, accent)) : styleColour(s.colour, accent)};text-transform:${s.letter_case === "normal" ? "none" : "uppercase"};letter-spacing:${s.letter_spacing}em;`;
        return (
          `${selector(level)}{${declaration}${level === "body" ? "" : `margin-top:${s.space_above}px;margin-bottom:${s.space_below}px;`}}` +
          (level === "body"
            ? roots
                .map((root) => `${scope}${root} p,${scope} ${root} p`)
                .join(",") +
              `{margin-top:${s.space_above}px;margin-bottom:${s.space_below}px}`
            : "")
        );
      })
      .join("") +
    (styles.layout
      ? documentQuoteCss + `.proposal-typography{--quote-accent:${accent}}`
      : "") +
    (documentLayout(styles).density === "standard"
      ? `${scope} .print-atom,${scope} .draft-block,${scope} .studio-block-card{padding-top:0}${scope} .flow-quote-line{padding-block:12px}${scope} .print-pricing-unit{margin:0!important}`
      : styles.layout
        ? `${scope} .flow-quote-line{padding-block:20px}`
        : "") +
    (styles.layout ? documentFlowCss(styles) + signatureCss : "") +
    (quoteLayout(styles) === "table"
      ? quoteTableCss +
        `.proposal-typography.proposal-typography .quote-table{font:${styles.body.weight} ${styles.body.size}px/${textLineHeight(styles, "body")} ${fontFamily(styles.body.font)}}`
      : "") +
    (styles.layout?.quote_neutrals
      ? quoteNeutralCss(
          styles.layout.quote_neutrals,
          accent,
          quoteLayout(styles) === "table",
        )
      : "") +
    `${scope}{--list-line-ratio:${textLineHeight(styles, "body")}}` +
    listMarkerCss(
      scope,
      documentLayout(styles).density === "comfortable" ? ".4em" : ".25em",
    ) +
    boxCss
  );
}
