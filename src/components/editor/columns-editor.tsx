"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { columnBoxStyle } from "../../lib/block-style";
import { insertAuthoringBlocks } from "../../lib/block-insertion";
import {
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
import { SelectableImage } from "./selectable-image";
import { Sortable } from "../sortable";
import { Button } from "../ui";
import { ColumnActionBar } from "./column-action-bar";
import { useControlLayout } from "./control-layout";
import { columnStyleKey, useStyleClipboard } from "./style-clipboard";
import { HeadingElement, HeadingTokens } from "./heading-tokens";

export function ColumnsEditor({
  block,
  styles,
  settings,
  map,
  prefix,
  saved,
  onChange,
  onUnwrap,
  onDelete,
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
  onDelete?: () => void;
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
            <EditorColumn
              blockId={block.id!}
              prefix={prefix}
              column={c}
              index={n}
              editable={!!onChange}
              onUnwrap={onUnwrap}
              onDelete={onDelete}
              onAdd={(anchor) =>
                setMenu({ column: c.id, at: c.content.length, anchor })
              }
              className="document-column editor-column"
              key={c.id}
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
            </EditorColumn>
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
    </>
  );
}

function EditorColumn({
  blockId,
  column,
  index,
  prefix,
  editable,
  onAdd,
  onUnwrap,
  onDelete,
  children,
  ...props
}: {
  blockId: string;
  column: Columns["items"][number];
  index: number;
  prefix: string;
  editable: boolean;
  onAdd: (anchor: HTMLButtonElement) => void;
  onUnwrap: () => void;
  onDelete?: () => void;
  children: ReactNode;
  className: string;
  style: CSSProperties;
}) {
  const selection = useBlockSelection();
  const clipboard = useStyleClipboard();
  const owner = useRef<HTMLDivElement>(null);
  const { phone } = useControlLayout();
  const key = columnStyleKey(column.id);
  const label = `Column ${index + 1}`;
  const selected =
    editable && selection.selected === key && !selection.selectMode;
  const activeChild = column.content.some(
    (item) => selection.active === prefix + item.id,
  );
  const selectedChild = column.content.some(
    (item) => selection.selected === prefix + item.id,
  );
  const copied = clipboard?.sourceKey === key;
  const pasteTarget = editable && !!clipboard?.styleClipboard && !copied;
  useEffect(() => {
    if (!selected || !phone) return;
    const frame = requestAnimationFrame(() =>
      owner.current?.scrollIntoView({ block: "start", inline: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [selected, phone]);
  const choose = () => selection.selectStyle(key);
  return (
    <div
      ref={owner}
      {...props}
      data-column-id={column.id}
      data-columns-block={blockId}
      data-column-empty={!column.content.length || undefined}
      data-column-editable={editable || undefined}
      data-column-selected={selected || undefined}
      data-column-paste-target={pasteTarget || undefined}
      data-column-active-child={activeChild || undefined}
      data-column-selected-child={selectedChild || undefined}
      role="group"
      aria-label={label}
    >
      {children}
      {editable && (
        <div className="column-canvas-actions" data-editor-chrome>
          <button
            type="button"
            className="column-canvas-label"
            aria-label={`Select ${label}${copied ? " | style copied" : ""}`}
            aria-pressed={selected}
            onClick={choose}
          >
            {label}
            {copied && " | style copied"}
          </button>
          {pasteTarget && !selectedChild && (
            <button
              type="button"
              className="btn column-canvas-paste"
              aria-label={`Paste style into ${label}`}
              onClick={() => clipboard.paste(key)}
            >
              Paste style
            </button>
          )}
        </div>
      )}
      {selected && clipboard && (
        <ColumnActionBar
          owner={owner}
          itemKey={key}
          label={label}
          group={blockId}
          onStyle={choose}
          onAdd={onAdd}
          onLayout={() => selection.selectStyle(prefix + blockId)}
          onUnwrap={onUnwrap}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
