"use client";

import { useState, type ReactNode } from "react";
import { columnBoxStyle } from "../../lib/block-style";
import { insertAuthoringBlocks } from "../../lib/block-insertion";
import {
  changeColumnLayout,
  columnGridStyle,
  columnsOverflowMessage,
  columnRejection,
  type Columns,
} from "../../lib/columns";
import { documentSpacing } from "../../lib/document-spacing";
import {
  blockText,
  convertTextStyle,
  duplicateBlock,
} from "../../lib/editor-document";
import type { Block, SavedBlock } from "../../lib/model";
import type { ResolvedStyles } from "../../lib/proposal-styles";
import type { WorkspaceSettings } from "../../lib/workspace";
import { BlockAction, BlockFrame, useBlockSelection } from "../block-controls";
import { BlockMenu } from "../block-menu";
import { FieldEditor } from "../field-editor";
import { Select } from "../form-controls";
import { Sheet } from "../foundation";
import { SelectableImage } from "./selectable-image";
import { Sortable } from "../sortable";
import { Button, Field } from "../ui";
import { BlockStyleControls } from "./block-style-controls";
import { HeadingElement, HeadingTokens } from "./heading-tokens";

const layouts: [Columns["layout"], string][] = [
  ["50-50", "50 / 50"],
  ["33-67", "33 / 67"],
  ["67-33", "67 / 33"],
  ["33-33-33", "33 / 33 / 33"],
];

export function ColumnsSettings({
  value,
  onChange,
}: {
  value: Columns;
  onChange: (next: Columns) => void;
}) {
  return (
    <>
      <Field label="Column layout">
        <Select
          value={value.layout}
          onChange={(e) =>
            onChange(
              changeColumnLayout(value, e.target.value as Columns["layout"]),
            )
          }
        >
          {layouts.map(([key, title]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Column gap">
        <Select
          value={value.gap}
          onChange={(e) =>
            onChange({ ...value, gap: e.target.value as Columns["gap"] })
          }
        >
          <option value="s">Small</option>
          <option value="m">Medium</option>
          <option value="l">Large</option>
        </Select>
      </Field>
      <Field label="Vertical alignment">
        <Select
          value={value.align}
          onChange={(e) =>
            onChange({ ...value, align: e.target.value as Columns["align"] })
          }
        >
          <option value="top">Top</option>
          <option value="center">Center</option>
        </Select>
      </Field>
    </>
  );
}

export function ColumnsEditor({
  block,
  styles,
  settings,
  map,
  prefix,
  saved,
  onChange,
  onUnwrap,
  excess,
  reuse,
  renderLink,
}: {
  block: Block;
  styles: ResolvedStyles;
  settings?: WorkspaceSettings | null;
  map: Record<string, string>;
  prefix: "block-" | "template-";
  saved: SavedBlock[];
  onChange?: (block: Block) => void;
  onUnwrap: () => void;
  excess?: number;
  reuse?: (block: Block) => void;
  renderLink?: (block: Block) => ReactNode;
}) {
  const columns = block.columns!;
  const selection = useBlockSelection();
  const [menu, setMenu] = useState<{
    column: string;
    at: number;
    anchor: HTMLElement;
  } | null>(null);
  const [styleColumn, setStyleColumn] = useState<string | null>(null);
  const column = columns.items.find(({ id }) => id === styleColumn);
  const update = (id: string, patch: Partial<Columns["items"][number]>) =>
    onChange?.({
      ...block,
      columns: {
        ...columns,
        items: columns.items.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    });
  const focus = (id: string) =>
    requestAnimationFrame(() => {
      const frame = document.getElementById(prefix + id);
      selection.select(prefix + id);
      (frame?.querySelector<HTMLElement>(".tiptap") ?? frame)?.focus({
        preventScroll: true,
      });
    });
  return (
    <>
      <div
        className="document-columns"
        role="region"
        aria-label="Columns"
        style={columnGridStyle(columns)}
      >
        {columns.items.map((c, n) => {
          const spacing = documentSpacing(c.content, styles, true);
          return (
            <div
              className="document-column editor-column"
              key={c.id}
              data-column-id={c.id}
              data-columns-block={block.id}
              data-column-empty={!c.content.length || undefined}
              role="group"
              aria-label={`Column ${n + 1}`}
              style={columnBoxStyle(c.style)}
            >
              {c.content.map((child, index) => {
                const id = prefix + child.id;
                const updateContent = (content: Block[]) =>
                  update(c.id, { content });
                const replace = (next: Block) =>
                  updateContent(
                    c.content.map((item) =>
                      item.id === child.id ? next : item,
                    ),
                  );
                const remove = () =>
                  updateContent(
                    c.content.filter((item) => item.id !== child.id),
                  );
                const move = (direction: -1 | 1) => {
                  const items = [...c.content];
                  const other = index + direction;
                  [items[other], items[index]] = [items[index], items[other]];
                  updateContent(items);
                };
                const level = child.type === "heading" ? (child.level ?? 1) : 0;
                const editor = (
                  <FieldEditor
                    value={
                      child.content ?? {
                        type: "doc",
                        content: [
                          {
                            type: "paragraph",
                            content: child.text
                              ? [{ type: "text", text: child.text }]
                              : [],
                          },
                        ],
                      }
                    }
                    label={`Column ${n + 1} ${level ? "heading" : "text"} ${index + 1}`}
                    map={map}
                    allowLinks
                    readOnly={!onChange}
                    textLevel={level}
                    showNames={false}
                    onChange={(content) =>
                      replace({
                        ...child,
                        content,
                        ...(level
                          ? {
                              rich_heading: true,
                              text: blockText({
                                type: "heading",
                                content,
                              }).replace(/[\r\n]+/g, " "),
                            }
                          : { text: undefined }),
                      })
                    }
                    onTextStyle={
                      onChange
                        ? (next, text, afterFocus) => {
                            replace(convertTextStyle(child, next, text));
                            focus(child.id!);
                            if (afterFocus) requestAnimationFrame(afterFocus);
                          }
                        : undefined
                    }
                  />
                );
                return (
                  <Sortable
                    key={child.id}
                    id={`column:${child.id}`}
                    block
                    draggable={!!onChange}
                    label={`block ${index + 1} in column ${n + 1}`}
                    spaceBefore={spacing[child.id ?? String(index)]}
                  >
                    <BlockFrame
                      id={id}
                      label={`Block ${index + 1} in column ${n + 1}`}
                      blockType={child.type}
                      appearance={{
                        value: child.style,
                        block: child,
                        styles,
                        settings,
                        onChange: onChange
                          ? (style) => replace({ ...child, style })
                          : undefined,
                      }}
                      insert={
                        onChange
                          ? (edge, anchor) =>
                              setMenu({
                                column: c.id,
                                at: index + (edge === "below" ? 1 : 0),
                                anchor,
                              })
                          : undefined
                      }
                      tools={
                        onChange && (
                          <>
                            <BlockAction
                              disabled={index === 0}
                              onClick={() => move(-1)}
                            >
                              Move up
                            </BlockAction>
                            <BlockAction
                              disabled={index === c.content.length - 1}
                              onClick={() => move(1)}
                            >
                              Move down
                            </BlockAction>
                            <BlockAction
                              onClick={() => {
                                const copy = duplicateBlock(child);
                                updateContent([
                                  ...c.content.slice(0, index + 1),
                                  copy,
                                  ...c.content.slice(index + 1),
                                ]);
                                focus(copy.id!);
                              }}
                            >
                              Duplicate block
                            </BlockAction>
                            {reuse && (
                              <BlockAction onClick={() => reuse(child)}>
                                Save for reuse
                              </BlockAction>
                            )}
                            <BlockAction onClick={remove}>
                              Delete block
                            </BlockAction>
                          </>
                        )
                      }
                    >
                      {child.type === "image" ? (
                        <SelectableImage
                          value={{ ...child, src: child.src ?? "" }}
                          onChange={
                            onChange
                              ? (value) => replace({ ...child, ...value })
                              : undefined
                          }
                          onDelete={onChange ? remove : undefined}
                        />
                      ) : child.type === "variable" ? (
                        <HeadingTokens
                          text={`{{${child.path ?? ""}}}`}
                          map={map}
                        />
                      ) : level ? (
                        <HeadingElement
                          level={level}
                          className="document-heading-edit"
                          data-heading-level={level}
                        >
                          {editor}
                        </HeadingElement>
                      ) : (
                        editor
                      )}
                      {renderLink?.(child)}
                    </BlockFrame>
                  </Sortable>
                );
              })}
              {onChange && !c.content.length && (
                <span
                  className="column-drop-area"
                  data-editor-chrome
                  aria-hidden="true"
                />
              )}
              {onChange && (
                <div className="column-editor-actions" data-editor-chrome>
                  <Button
                    variant="ghost"
                    aria-label={`Add block to column ${n + 1}`}
                    onClick={(event) =>
                      setMenu({
                        column: c.id,
                        at: c.content.length,
                        anchor: event.currentTarget,
                      })
                    }
                  >
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Style column ${n + 1}`}
                    onClick={() => setStyleColumn(c.id)}
                  >
                    Style
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!!excess && (
        <div
          className="columns-overflow-notice"
          data-editor-chrome
          role="status"
        >
          <span>{columnsOverflowMessage(excess)}</span>
          {onChange && <Button onClick={onUnwrap}>Unwrap columns</Button>}
        </div>
      )}
      {menu && (
        <BlockMenu
          columnOnly
          anchor={menu.anchor}
          hasPricing={false}
          saved={saved}
          onClose={() => setMenu(null)}
          onChoose={(first, extra = []) => {
            const target = columns.items.find((c) => c.id === menu.column);
            const incoming = [first, ...extra];
            if (!target || columnRejection(incoming)) return;
            const content = insertAuthoringBlocks(
              target.content,
              incoming,
              menu.at,
            );
            update(target.id, { content });
            setMenu(null);
            focus(content[menu.at].id!);
          }}
        />
      )}
      {column && (
        <Sheet
          title="Column style"
          className="block-style-sheet"
          onClose={() => setStyleColumn(null)}
        >
          <BlockStyleControls
            value={column.style}
            content={column.content}
            styles={styles}
            settings={settings}
            onChange={(style) => update(column.id, { style })}
          />
        </Sheet>
      )}
    </>
  );
}
