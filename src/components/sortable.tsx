"use client";
import type { ReactNode } from "react";
import { useBlockSelection } from "./block-controls";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
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
}: {
  id: string;
  label: string;
  block?: boolean;
  printUnit?: string;
  documentKind?: "card" | "group";
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
      onPointerLeave={() => {
        if (block) selection.hover(null);
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
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
}: {
  ids: string[];
  onMove: (from: string, to: string) => void;
  children: ReactNode;
}) {
  // Align centres for vertical keyboard moves. The stock getter bottom-aligns
  // differently sized cards, which leaves a tall choice group over itself.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.code))
      return sortableKeyboardCoordinates(event, args);
    const { active, over, droppableRects, collisionRect } = args.context;
    if (!active || !collisionRect) return;
    const index = ids.indexOf(String(over?.id ?? active.id));
    const target = ids[index + (event.code === "ArrowDown" ? 1 : -1)];
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
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (over && active.id !== over.id)
          onMove(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
