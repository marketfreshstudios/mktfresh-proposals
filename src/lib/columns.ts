import { z } from "zod";
import { blockStyleSchema } from "./block-style";
import { AppError, type Block } from "./model";

export const columnTracks = {
  "50-50": "minmax(0,1fr) minmax(0,1fr)",
  "33-67": "minmax(0,1fr) minmax(0,2fr)",
  "67-33": "minmax(0,2fr) minmax(0,1fr)",
  "33-33-33": "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
} as const;
export const columnGaps = { s: 12, m: 24, l: 40 } as const;

const layout = z.enum(["50-50", "33-67", "67-33", "33-33-33"]);
const column = z
  .object({
    id: z.string().min(1).max(200),
    style: blockStyleSchema.optional(),
    content: z
      .array(
        z.custom<Block>(
          (value) =>
            !!value && typeof value === "object" && !Array.isArray(value),
        ),
      )
      .max(300),
  })
  .strict();
export const columnsSchema = z
  .object({
    layout,
    gap: z.enum(["s", "m", "l"]),
    align: z.enum(["top", "center"]),
    items: z.array(column).min(2).max(3),
  })
  .strict()
  .refine(
    ({ layout, items }) =>
      items.length === (layout === "33-33-33" ? 3 : 2) &&
      new Set(items.map(({ id }) => id)).size === items.length,
    "Columns must match the layout and have distinct IDs",
  );
export type Columns = z.infer<typeof columnsSchema>;
export type Column = Columns["items"][number];

export const canPlaceInColumn = (block: Block) =>
  ["heading", "paragraph", "image", "variable"].includes(block.type);

export function columnRejection(blocks: Block[]) {
  const first = blocks.find((block) => !canPlaceInColumn(block));
  switch (first?.type) {
    case "columns":
      return "Columns can't be nested. Add this block outside the columns.";
    case "pricing_table":
      return "Pricing tables stay outside columns.";
    case "contract":
      return "Contracts stay outside columns.";
    case "signature_block":
      return "Signatures stay outside columns.";
    case "page_break":
      return "Page breaks go between blocks, outside columns.";
    default:
      return first ? "This block can't go inside a column." : undefined;
  }
}
const emptyColumn = (): Column => ({ id: crypto.randomUUID(), content: [] });

export function createColumns(): Columns {
  return {
    layout: "50-50",
    gap: "m",
    align: "top",
    items: [emptyColumn(), emptyColumn()],
  };
}

export function changeColumnLayout(
  columns: Columns,
  layout: Columns["layout"],
): Columns {
  if (columns.layout === layout) return columns;
  const [first, second, third] = columns.items;
  return {
    ...columns,
    layout,
    items:
      layout === "33-33-33"
        ? [first, second, third ?? emptyColumn()]
        : [
            first,
            third
              ? { ...second, content: [...second.content, ...third.content] }
              : second,
          ],
  };
}

export function unwrapColumns(content: Block[], id: string) {
  return content.flatMap((block) =>
    block.id === id && block.type === "columns" && block.columns
      ? block.columns.items.flatMap((column) => column.content)
      : [block],
  );
}

export type ColumnAddress = { block: string; column: string };
export type BlockDestination = { at: number; inside?: ColumnAddress };

export function columnAt(content: Block[], address: ColumnAddress) {
  return content
    .find((block) => block.id === address.block)
    ?.columns?.items.find((column) => column.id === address.column);
}

export function updateColumn(
  content: Block[],
  address: ColumnAddress,
  update: (column: Column) => Column,
) {
  return content.map((block) =>
    block.id === address.block && block.columns
      ? {
          ...block,
          columns: {
            ...block.columns,
            items: block.columns.items.map((column) =>
              column.id === address.column ? update(column) : column,
            ),
          },
        }
      : block,
  );
}

export function documentBlocks(content: Block[]): Block[] {
  return content.flatMap((block) => [
    block,
    ...(block.columns?.items.flatMap((column) => column.content) ?? []),
  ]);
}

export function updateBlockChildren(
  block: Block,
  update: (content: Block[]) => Block[],
): Block {
  return block.columns
    ? {
        ...block,
        columns: {
          ...block.columns,
          items: block.columns.items.map((column) => ({
            ...column,
            content: update(column.content),
          })),
        },
      }
    : block;
}

export function moveBlocksAcrossColumns(
  content: Block[],
  ids: string[],
  destination: BlockDestination,
) {
  const selection = new Set(ids);
  const moved = selectedBlockRoots(content, selection);
  const list = destination.inside
    ? columnAt(content, destination.inside)?.content
    : content;
  if (
    !moved.length ||
    !list ||
    destination.at < 0 ||
    destination.at > list.length
  )
    return content;
  if (destination.inside) {
    const reason = columnRejection(moved);
    if (reason) throw new Error(reason);
  }
  const index =
    destination.at -
    list.slice(0, destination.at).filter((b) => selection.has(b.id!)).length;
  const remove = (blocks: Block[]) =>
    blocks.filter((b) => !selection.has(b.id!));
  const insert = (blocks: Block[]) => [
    ...blocks.slice(0, index),
    ...moved,
    ...blocks.slice(index),
  ];
  const next = remove(content).map((block) =>
    updateBlockChildren(block, remove),
  );
  return destination.inside
    ? updateColumn(next, destination.inside, (column) => ({
        ...column,
        content: insert(column.content),
      }))
    : insert(next);
}

export function columnGridStyle(columns: Columns) {
  return {
    display: "grid",
    gridTemplateColumns: columnTracks[columns.layout],
    gap: `${columnGaps[columns.gap]}px`,
    alignItems: columns.align === "center" ? "center" : "start",
  };
}

export const columnsOverflowMessage = (excess: number) =>
  `Columns exceed a Letter page by ${excess}px. Move content out, shorten it, or unwrap the columns before sending.`;

/** Visit document blocks in reading order, keeping their containing column. */
export function transformBlocks(
  content: Block[],
  transform: (block: Block, column?: ColumnAddress) => Block[],
): Block[] {
  return content.flatMap((block) => {
    if (!block.columns) return transform(block);
    const items = block.columns.items.map((column) => ({
      ...column,
      content: column.content.flatMap((child) =>
        transform(child, { block: block.id!, column: column.id }),
      ),
    }));
    return transform({ ...block, columns: { ...block.columns, items } });
  });
}

export function selectedBlockRoots(content: Block[], selected: Set<string>) {
  return content.flatMap((block) =>
    selected.has(block.id!)
      ? [block]
      : (block.columns?.items.flatMap((column) =>
          column.content.filter((child) => selected.has(child.id!)),
        ) ?? []),
  );
}

export class ColumnsOverflowError extends AppError {
  constructor(excesses: { excess: number }[]) {
    super(
      400,
      excesses.map(({ excess }) => columnsOverflowMessage(excess)).join(" "),
    );
  }
}
