"use client";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { MutableRefObject } from "react";
import { SelectableImage } from "./selectable-image";
export type BandImageOptions = {
  key: string;
  slot: number;
  logo?: string;
  maxHeight: number;
  move: (fromSlot: number, from: number, toSlot: number, to: number) => void;
};
type Drag = { key: string; slot: number; position: number };
let dragging: Drag | null = null;
let caret: HTMLElement | null = null;
const clearCaret = () => {
  caret?.remove();
  caret = null;
};
export function bandImageDragOver(
  editor: Editor,
  options: BandImageOptions,
  event: DragEvent,
) {
  if (!dragging || dragging.key !== options.key) return false;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const point = editor.view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  if (point) {
    const box = editor.view.coordsAtPos(point.pos);
    clearCaret();
    caret = document.createElement("span");
    caret.dataset.editorChrome = "";
    caret.className = "band-image-insertion-caret";
    Object.assign(caret.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      height: `${Math.max(16, box.bottom - box.top)}px`,
    });
    document.body.append(caret);
  }
  return true;
}
export function bandImageDrop(
  editor: Editor,
  options: BandImageOptions,
  event: DragEvent,
) {
  if (!dragging || dragging.key !== options.key) return false;
  event.preventDefault();
  const point = editor.view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  const from = dragging;
  dragging = null;
  clearCaret();
  if (point) options.move(from.slot, from.position, options.slot, point.pos);
  return true;
}
function BandImageView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  selected,
  extension,
}: NodeViewProps) {
  const options = (
    extension.options.settings as MutableRefObject<BandImageOptions>
  ).current;
  if (node.attrs.src === "workspace-logo" && !options.logo)
    return (
      <NodeViewWrapper
        as="span"
        className="band-inline-image"
        contentEditable={false}
      />
    );
  return (
    <NodeViewWrapper
      as="span"
      className="band-inline-image"
      contentEditable={false}
    >
      <SelectableImage
        kind="band"
        value={{
          src: node.attrs.src,
          alt: node.attrs.alt,
          height: node.attrs.height,
        }}
        source={
          node.attrs.src === "workspace-logo" ? options.logo : node.attrs.src
        }
        maxHeight={options.maxHeight}
        externalSelected={selected}
        draggable
        onSelect={() => {
          const pos = getPos();
          if (pos !== undefined) editor.commands.setNodeSelection(pos);
        }}
        onDeselect={() => {
          const pos = getPos();
          if (pos !== undefined && editor.state.selection.from === pos)
            editor.commands.setTextSelection(pos + node.nodeSize);
        }}
        onDragStart={(event) => {
          const position = getPos();
          if (position === undefined) return;
          dragging = { key: options.key, slot: options.slot, position };
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(
            "application/x-proposal-band-image",
            JSON.stringify(dragging),
          );
        }}
        onChange={(image) =>
          updateAttributes({
            src: image.src,
            alt: image.alt ?? "",
            height: image.height ?? 18,
          })
        }
        onDelete={deleteNode}
      />
    </NodeViewWrapper>
  );
}
export const InlineBandImage = Node.create<{
  settings: MutableRefObject<BandImageOptions>;
}>({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes: () => ({
    src: { default: "workspace-logo" },
    alt: { default: "" },
    height: {
      default: 18,
      parseHTML: (el) => Number(el.getAttribute("data-image-height") ?? 18),
    },
  }),
  parseHTML: () => [
    {
      tag: "img[data-band-image]",
      getAttrs: (el) =>
        /^(workspace-logo|data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+)$/.test(
          el.getAttribute("src") ?? "",
        )
          ? null
          : false,
    },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    "img",
    mergeAttributes(HTMLAttributes, {
      "data-band-image": "",
      "data-image-height": node.attrs.height,
      style: `height:${node.attrs.height}px`,
    }),
  ],
  addNodeView() {
    return ReactNodeViewRenderer(BandImageView, {
      stopEvent: ({ event }) =>
        !!(event.target as Element)
          .closest("[data-editor-chrome]")
          ?.closest(".band-inline-image"),
    });
  },
});
if (typeof document !== "undefined")
  document.addEventListener("dragend", () => {
    dragging = null;
    clearCaret();
  });
