"use client";
import type { ReactNode, CSSProperties } from "react";
import { useBlockSelection } from "./block-controls";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
export function Sortable({
  id,
  label,
  children,
  block = false,
  printUnit,
  documentKind,
  spaceBefore,
}: {
  id: string;
  label: string;
  block?: boolean;
  printUnit?: string;
  documentKind?: "card" | "group";
  spaceBefore?: number;
  children: ReactNode;
}) {
  const selection = useBlockSelection();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-print-unit={printUnit}
      data-sortable-id={id}
      onPointerLeave={() => {
        if (block) selection.hover(null);
      }}
      style={
        {
          "--block-space-before":
            spaceBefore === undefined ? undefined : `${spaceBefore}px`,
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        } as CSSProperties
      }
      className={`quote-sortable ${block ? "block-sortable" : ""} ${documentKind ? `document-sortable-${documentKind}` : ""}`}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${label}`}
        title={`Drag ${label}`}
        onPointerOver={(e) => {
          if (block) {
            e.stopPropagation();
            const id =
              e.currentTarget.parentElement?.querySelector<HTMLElement>(
                ":scope > .block-frame",
              )?.dataset.blockId;
            if (id) selection.hover(id);
          }
        }}
        onFocus={(e) => {
          if (block) {
            const id =
              e.currentTarget.parentElement?.querySelector<HTMLElement>(
                ":scope > .block-frame",
              )?.dataset.blockId;
            if (id) selection.select(id);
          }
        }}
        onPointerDownCapture={(e) => {
          if (block) {
            const id =
              e.currentTarget.parentElement?.querySelector<HTMLElement>(
                ":scope > .block-frame",
              )?.dataset.blockId;
            if (id) selection.select(id);
          }
        }}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      {children}
    </div>
  );
}
export function Reorder({
  ids,
  onMove,
  children,
  pages = false,
}: {
  ids: string[];
  onMove: (from: string, to: string) => void;
  children: ReactNode;
  pages?: boolean;
}) {
  // Align centres for vertical keyboard moves. The stock getter bottom-aligns
  // differently sized cards, which leaves a tall choice group over itself.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.code))
      return sortableKeyboardCoordinates(event, args);
    const { active, over, droppableRects, collisionRect } = args.context;
    if (!active || !collisionRect) return;
    const targets =
      pages && String(active.id).startsWith("page:")
        ? ids.filter((id) => id.startsWith("page:"))
        : ids;
    const index = targets.indexOf(String(over?.id ?? active.id));
    const target = targets[index + (event.code === "ArrowDown" ? 1 : -1)];
    const rect = target && droppableRects.get(target);
    if (!rect || index < 0) return;
    event.preventDefault();
    return {
      x: rect.left + (rect.width - collisionRect.width) / 2,
      y: rect.top + (rect.height - collisionRect.height) / 2,
    };
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      scrollBehavior: "auto",
    }),
  );
  const collision: CollisionDetection = (args) => {
    if (!pages) return closestCenter(args);
    const page = String(args.active.id).startsWith("page:");
    const filtered = {
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (d) => !page || String(d.id).startsWith("page:"),
      ),
    };
    if (page || !args.pointerCoordinates) return closestCenter(filtered);
    const inside = pointerWithin(filtered);
    return inside.filter((d) => String(d.id).startsWith("section:")).length
      ? inside.filter((d) => String(d.id).startsWith("section:"))
      : inside.length
        ? inside
        : closestCenter(filtered);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (over && active.id !== over.id)
          onMove(String(active.id), String(over.id));
      }}
    >
      <SortableContext
        items={pages ? ids.filter((id) => id.startsWith("page:")) : ids}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}
