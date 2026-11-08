import { marked, type Tokens, type Token } from "marked";
import { check, type Block, type RichText } from "./model";
import { constrainedImageSize, imagePercent } from "./image-size";
export type MarkdownImages = ReadonlyMap<
  string,
  { image: string; width: number; height: number }
>;
export const MARKDOWN_INPUT_LIMIT = 1100000;
export const linkMarkdown = (text: string, href: string) =>
  `[${text}](<${href.replaceAll("<", "%3C").replaceAll(">", "%3E").replaceAll("\n", "%0A").replaceAll("\r", "%0D")}>)`;
export function markdownLink(href: string) {
  let valid = false;
  try {
    valid = ["https:", "mailto:"].includes(new URL(href).protocol);
  } catch {}
  check(
    valid,
    "Markdown links must use HTTPS or mailto; HTTP, relative, javascript: and data: links are not allowed",
  );
  return href;
}
export function markdownBlocks(
  markdown: string,
  allowedVariables: string[],
  images: MarkdownImages = new Map(),
  contentWidth = 672,
): Block[] {
  check(
    markdown.length <= MARKDOWN_INPUT_LIMIT,
    "Markdown including embedded images exceeds 1,100,000 characters",
  );
  const tokens = marked.lexer(markdown);
  let proseLength = markdown.length;
  marked.walkTokens(tokens, (token) => {
    if (token.type === "image") proseLength -= token.raw.length;
  });
  check(proseLength <= 100000, "Markdown text exceeds 100,000 characters");
  for (const match of markdown.matchAll(/{{\s*([^{}]+?)\s*}}/g))
    check(allowedVariables.includes(match[1]), `Unknown variable: ${match[1]}`);
  const inline = (tokens: Token[]): RichText[] =>
    tokens.flatMap((t) => {
      if (t.type === "text" || t.type === "escape")
        return [{ type: "text", text: t.text }];
      if (t.type === "br") return [{ type: "hardBreak" }];
      if (t.type === "link") {
        const href = markdownLink(t.href);
        return inline(t.tokens ?? []).map((n) => ({
          ...n,
          marks: [...(n.marks ?? []), { type: "link", attrs: { href } }],
        }));
      }
      if (t.type === "strong" || t.type === "em")
        return inline(t.tokens ?? []).map((n) => ({
          ...n,
          marks: [
            ...(n.marks ?? []),
            { type: t.type === "strong" ? "bold" : "italic" },
          ],
        }));
      throw new Error(`Unsupported Markdown inline construct: ${t.type}`);
    });
  const blocks: Block[] = [];
  for (const t of tokens) {
    if (t.type === "space") continue;
    if (t.type === "heading") {
      const nodes = inline(t.tokens ?? []),
        rich = nodes.some((n) => n.marks?.length || n.type !== "text");
      blocks.push({
        type: "heading",
        level: Math.min(3, t.depth) as 1 | 2 | 3,
        text: nodes.map((n) => n.text ?? "").join(""),
        ...(rich
          ? {
              rich_heading: true,
              content: {
                type: "doc",
                content: [{ type: "paragraph", content: nodes }],
              },
            }
          : {}),
      });
      continue;
    }
    if (t.type === "paragraph") {
      const image = t.tokens?.[0];
      if (image?.type === "image") {
        const suffix = (t.tokens ?? [])
          .slice(1)
          .map((n) => n.raw)
          .join("")
          .trim();
        check(
          !suffix || /^\{width=\d+(?:\.\d+)?\}$/.test(suffix),
          "Images must be on their own line; optional size is {width=120} in CSS pixels",
        );
        const asset = images.get(image.href);
        check(
          asset,
          "Unsupported Markdown image: use a validated embedded PNG/JPEG image_ref; remote URLs and unknown or other-workspace references are not allowed",
        );
        let width_percent: number | undefined;
        if (suffix) {
          const requested = Number(suffix.slice(7, -1));
          check(
            Number.isFinite(requested) && requested > 0,
            "Image width must be a positive number of CSS pixels",
          );
          const ratio = asset.width / asset.height;
          width_percent = imagePercent(
            constrainedImageSize(requested / ratio, ratio, contentWidth).width,
            contentWidth,
          );
        }
        blocks.push({
          type: "image",
          src: asset.image,
          alt: inline(
            image.tokens ?? [
              { type: "text", raw: image.text, text: image.text },
            ],
          )
            .map((n) => n.text ?? "")
            .join(""),
          width_percent: width_percent ?? 100,
        });
        continue;
      }
      blocks.push({
        type: "paragraph",
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: inline(t.tokens ?? []) }],
        },
      });
      continue;
    }
    if (t.type === "list") {
      blocks.push({
        type: "paragraph",
        content: {
          type: "doc",
          content: [
            {
              type: t.ordered ? "orderedList" : "bulletList",
              content: t.items.map((i: Tokens.ListItem) => {
                check(!i.task, "Unsupported Markdown task list");
                check(
                  !i.tokens.some((x: Token) => x.type === "list"),
                  "Nested Markdown lists are not supported",
                );
                return {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: inline(
                        marked.lexer(i.text)[0]?.type === "paragraph"
                          ? (marked.lexer(i.text)[0] as any).tokens
                          : marked.Lexer.lexInline(i.text),
                      ),
                    },
                  ],
                };
              }),
            },
          ],
        },
      });
      continue;
    }
    throw new Error(`Unsupported Markdown block: ${t.type}`);
  }
  return blocks;
}
