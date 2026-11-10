import { reviewBlocks } from "./ai-review";
import {
  contentAfterCover,
  CoverSchema,
  coverText,
  loadedCover,
} from "./cover";
import { defaultCoverBackground } from "./cover-background";
import { fieldNodes } from "./editor-fields";
import { hasInlineFontSize } from "./inline-font-size";
import { QuoteSchema, type Block, type RichText, type Template } from "./model";
import { defaultTemplateBands, TemplateBandsSchema } from "./page-bands";
import { withSignatureHeadings } from "./signature-headings";

function authoredState(value: Template) {
  return {
    content: value.content,
    cover: value.cover,
    header_footer: value.header_footer,
    default_quote: value.default_quote,
    default_items: value.default_items,
    style_overrides: value.style_overrides,
  };
}
const sort = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, n]) => n !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, n]) => [k, sort(n)]),
        )
      : v;
const key = (value: unknown) => JSON.stringify(sort(value));

/** Exact authored state for guarded seed maintenance. */
export const starterState = (value: Template) => key(authoredState(value));
export const sameStarterState = (a: Template, b: Template) =>
  starterState(a) === starterState(b);

function authoringContent(value: Template) {
  return value.signature_heading_defaulted
    ? value.content
    : withSignatureHeadings(value.content);
}

/** Supply editor defaults in a DTO; never store this projection on read. */
export function templateAuthoringView(value: Template): Template {
  return {
    ...value,
    content: authoringContent(value),
    signature_heading_defaulted: true,
    ...(value.signature_heading_defaulted ? {} : { pagination: undefined }),
    header_footer: TemplateBandsSchema.parse(
      value.header_footer ?? defaultTemplateBands(),
    ),
    cover: loadedCover(
      value.cover === undefined ? undefined : CoverSchema.parse(value.cover),
    ),
  };
}

function richState(node: RichText): RichText {
  const { content, marks, attrs, ...rest } = node;
  const attributes = Object.fromEntries(
    Object.entries(attrs ?? {}).filter(([, value]) => value != null),
  );
  return {
    ...rest,
    ...(Object.keys(attributes).length ? { attrs: attributes } : {}),
    ...(marks?.length ? { marks } : {}),
    ...(content?.length ? { content: content.map(richState) } : {}),
  };
}

function blockState(block: Block): Block {
  if (block.type === "columns" && block.columns)
    return {
      ...block,
      columns: {
        ...block.columns,
        items: block.columns.items.map((column) => ({
          ...column,
          content: column.content.map(blockState),
        })),
      },
    };
  if (block.type !== "heading" && block.type !== "paragraph") return block;
  const { text, content, rich_heading, ...rest } = block;
  return {
    ...rest,
    content: richState(
      fieldNodes(
        block.type === "heading" &&
          !rich_heading &&
          !(content && hasInlineFontSize(content))
          ? coverText(text ?? "")
          : (content ?? coverText(text ?? "")),
      ),
    ),
  };
}

function semanticAuthoredState(value: Template) {
  const view = templateAuthoringView(value);
  let content = contentAfterCover(view.content);
  try {
    content = reviewBlocks(content, false);
  } catch {
    // Older documents may predate today's validation; compare them as-is.
  }
  const { cover } = view;
  const layout = cover?.layout ?? "custom";
  const background = defaultCoverBackground(layout);
  const quote =
    value.default_items === undefined
      ? undefined
      : QuoteSchema.safeParse(value.default_items);
  return {
    ...authoredState(view),
    content: content.map(blockState),
    cover: cover
      ? {
          ...cover,
          layout,
          background: {
            ...(cover.background ?? background),
            graphic: cover.background?.graphic ?? background.graphic,
          },
          elements: cover.elements?.map((element) => ({
            ...element,
            content: element.content
              ? richState(fieldNodes(element.content))
              : undefined,
          })),
        }
      : undefined,
    default_items: quote?.success
      ? quote.data
      : (value.default_items ?? (value.default_quote.length ? undefined : [])),
    style_overrides: value.style_overrides ?? {},
  };
}

/** Ignore storage and editor normalization, but keep authored formatting and bands. */
export const sameAuthoredTemplate = (a: Template, b: Template) =>
  key(semanticAuthoredState(a)) === key(semanticAuthoredState(b));

/** Normal saves also compare editable template metadata. */
export const sameTemplateSave = (a: Template, b: Template) =>
  a.name === b.name &&
  (a.description ?? "") === (b.description ?? "") &&
  a.active === b.active &&
  sameAuthoredTemplate(a, b);
