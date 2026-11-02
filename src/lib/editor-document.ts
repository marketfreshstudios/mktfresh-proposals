import type { Block } from "./model";
import { contentSections } from "./ai-review";
/** Draft/template authoring only. Never apply to a stored sent/signed version. */
export function withoutTitleHeading(content: Block[]) {
  return content[0]?.type === "heading" &&
    content[0].text === "{{proposal.title}}"
    ? content.slice(1)
    : content;
}
/** Section boundaries follow headings; special blocks remain useful outline entries. */
export function moveSection(content: Block[], from: string, to: string) {
  const sections = contentSections(content),
    a = sections.findIndex((s) => s.id === from),
    b = sections.findIndex((s) => s.id === to);
  if (a < 0 || b < 0 || a === b) return content;
  const [moved] = sections.splice(a, 1);
  sections.splice(b, 0, moved);
  return sections.flatMap((s) => s.indices.map((n) => content[n]));
}
