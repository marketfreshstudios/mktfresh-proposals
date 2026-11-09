import { withCount } from "../lib/count-label";
import { createColumns } from "../lib/columns";
import type { Block } from "../lib/model";
import type { SavedBlock } from "../lib/model";
import { savedBlocks, stampSavedBlocks } from "../lib/linked-blocks";
import type icons from "./icons.json";
export type BlockOption = {
  name: string;
  description: string;
  icon: keyof typeof icons;
  group: string;
  block?: Block;
  extra?: Block[];
  image?: boolean;
  disabled?: boolean;
};
const paragraph = (kind?: string): Block => ({
  type: "paragraph",
  content: {
    type: "doc",
    content: kind
      ? [
          {
            type: kind,
            content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
          },
        ]
      : [{ type: "paragraph" }],
  },
});
export function blockOptions({
  hasPricing,
  saved,
  signatureRoles = [],
}: {
  hasPricing: boolean;
  saved: SavedBlock[];
  signatureRoles?: string[];
}): BlockOption[] {
  return [
    ...([1, 2, 3] as const).map((level) => ({
      group: "Text",
      name: `Heading ${level}`,
      description:
        level === 1 ? "Start a new section" : "Subheading within this section",
      icon: "heading" as const,
      block: {
        type: "heading" as const,
        level,
        text: level === 1 ? "New section" : "Subheading",
      },
    })),
    {
      group: "Text",
      name: "Text",
      description: "A paragraph of rich text",
      icon: "align-left",
      block: paragraph(),
    },
    {
      group: "Text",
      name: "Bulleted list",
      description: "An unordered list",
      icon: "list-ul",
      block: paragraph("bulletList"),
    },
    {
      group: "Text",
      name: "Numbered list",
      description: "A list of steps in order",
      icon: "list-ol",
      block: paragraph("orderedList"),
    },
    {
      group: "Media",
      name: "Image",
      description: "Upload a PNG or JPEG",
      icon: "image",
      image: true,
    },
    {
      group: "Proposal",
      name: "Pricing table",
      description: hasPricing
        ? "Already in this proposal"
        : "The quote with totals",
      disabled: hasPricing,
      icon: "table",
      block: { type: "pricing_table" },
    },
    {
      group: "Proposal",
      name: "Contract",
      description: "Terms and contract clauses",
      icon: "file-contract",
      block: {
        type: "contract",
        text: "Statement of Work & Contract",
        clauses: [],
      },
    },
    {
      group: "Proposal",
      name: "Signatures",
      description: signatureRoles.length
        ? "Remove existing signature blocks before adding a pair"
        : "Client and company signatures",
      disabled: signatureRoles.length > 0,
      icon: "signature",
      block: { type: "signature_block", role: "client" },
      extra: [{ type: "signature_block", role: "company" }],
    },
    ...(["client", "company"] as const).map((role) => ({
      group: "Proposal",
      name: role === "client" ? "Client signature" : "Company signature",
      description: signatureRoles.includes(role)
        ? `Already has a ${role} signature — only one is supported`
        : `A required ${role} signature`,
      disabled: signatureRoles.includes(role),
      icon: "signature" as const,
      block: { type: "signature_block" as const, role },
    })),
    {
      group: "Proposal",
      name: "Columns",
      description: "Arrange blocks in two or three columns",
      icon: "table",
      block: { type: "columns", columns: createColumns() },
    },
    {
      group: "Proposal",
      name: "Page break",
      description: "Start the next PDF page",
      icon: "file-lines",
      block: { type: "page_break" },
    },
    {
      group: "Text",
      name: "Divider",
      description: "A horizontal dividing line",
      icon: "file-lines",
      block: {
        type: "paragraph",
        content: { type: "doc", content: [{ type: "horizontalRule" }] },
      },
    },
    ...saved.map((s) => {
      const blocks = stampSavedBlocks(s);
      return {
        group: "Saved blocks",
        name: s.name,
        description:
          s.type === "group"
            ? `Group · ${withCount(savedBlocks(s).length, "block")}`
            : "Saved block",
        icon: "bookmark" as const,
        block: blocks[0],
        extra: blocks.slice(1),
        disabled:
          (hasPricing && s.block.type === "pricing_table") ||
          (s.block.type === "signature_block" &&
            signatureRoles.includes(s.block.role!)),
      };
    }),
  ];
}
