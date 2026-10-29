import { marked, type Tokens, type Token } from "marked";
import { check, type Block, type RichText } from "./model";
export function markdownBlocks(
  markdown: string,
  allowedVariables: string[],
): Block[] {
  check(markdown.length <= 100000, "Markdown exceeds 100,000 characters");
  for (const match of markdown.matchAll(/{{\s*([^{}]+?)\s*}}/g))
    check(allowedVariables.includes(match[1]), `Unknown variable: ${match[1]}`);
  const inline = (tokens: Token[]): RichText[] =>
    tokens.flatMap((t) => {
      if (t.type === "text" || t.type === "escape")
        return [{ type: "text", text: t.text }];
      if (t.type === "br") return [{ type: "hardBreak" }];
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
  for (const t of marked.lexer(markdown)) {
    if (t.type === "space") continue;
    if (t.type === "heading") {
      blocks.push({ type: "heading", text: t.text });
      continue;
    }
    if (t.type === "paragraph") {
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
