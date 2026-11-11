"use client";
import { documentBlocks, type BlockDestination } from "../lib/columns";
import {
  type ReactNode,
  type CSSProperties,
  useLayoutEffect,
  useEffect,
  type RefObject,
  useRef,
  useCallback,
} from "react";
import type { Block } from "../lib/model";
import { useDropIndicator } from "./editor/drop-target";
import { BlockDragHandle, useControlLayout } from "./editor/control-layout";
import { useBlockSelection } from "./block-controls";
import {
  DndContext,
  DragOverlay,
  useDndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type Collision,
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
  draggable = true,
  printUnit,
  documentKind,
  spaceBefore,
  customSpacing,
  style,
}: {
  id: string;
  label: string;
  block?: boolean;
  draggable?: boolean;
  printUnit?: string;
  documentKind?: "card" | "group";
  spaceBefore?: number;
  customSpacing?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const selection = useBlockSelection();
  const cardNode = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!documentKind || !cardNode.current) return;
    const node = cardNode.current;
    const measure = () =>
      node.style.setProperty(
        "--document-price-width",
        `${node.querySelector<HTMLElement>(":scope > .flow-quote-line .flow-line-title > .amount")?.offsetWidth ?? 0}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  });
  const { desktop } = useControlLayout();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: { draggable: !draggable } });
  const assignRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      cardNode.current = node;
    },
    [setNodeRef],
  );
  const handle = draggable ? (
    <button
      type="button"
      data-editor-chrome
      className="drag-handle"
      aria-label={`Drag ${label}`}
      title={`Drag ${label}`}
      onPointerOver={(e) => {
        if (block) {
          e.stopPropagation();
          const id = e.currentTarget
            .closest(".block-sortable")
            ?.querySelector<HTMLElement>(":scope > .block-frame")
            ?.dataset.blockId;
          if (id) selection.hover(id);
        }
      }}
      onFocus={(e) => {
        if (block) {
          const id = e.currentTarget
            .closest(".block-sortable")
            ?.querySelector<HTMLElement>(":scope > .block-frame")
            ?.dataset.blockId;
          if (id && !selection.ids.includes(id)) selection.select(id);
        }
      }}
      onPointerDownCapture={(e) => {
        if (block) {
          const id = e.currentTarget
            .closest(".block-sortable")
            ?.querySelector<HTMLElement>(":scope > .block-frame")
            ?.dataset.blockId;
          if (id && !selection.ids.includes(id)) selection.select(id);
        }
      }}
      {...attributes}
      {...listeners}
    >
      <span aria-hidden="true">⋮⋮</span>
    </button>
  ) : null;
  return (
    <div
      ref={assignRef}
      data-print-unit={printUnit}
      data-sortable-id={id}
      data-custom-spacing={customSpacing || undefined}
      onPointerLeave={() => {
        if (block) selection.hover(null);
      }}
      style={
        {
          "--block-space-before":
            spaceBefore === undefined ? undefined : `${spaceBefore}px`,
          transform: CSS.Translate.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
          ...style,
        } as CSSProperties
      }
      className={`quote-sortable ${block ? "block-sortable" : ""} ${documentKind ? `document-sortable-${documentKind}` : ""}`}
    >
      {!block || !desktop ? handle : null}
      <BlockDragHandle.Provider value={block && desktop ? handle : null}>
        {children}
      </BlockDragHandle.Provider>
    </div>
  );
}

type DropEdge = "before" | "after";

export function sectionDropEdge(collision?: Collision): DropEdge | undefined {
  const edge = collision?.data?.sectionEdge;
  if (edge === "before" || edge === "after") return edge;
}

// Resolve against painted rows, including the insertion gap. Their original
// nodes stay registered and the drag handle keeps its keyboard focus.
function sectionPointerCollision(
  args: Parameters<CollisionDetection>[0],
  sidebar: HTMLElement,
): Collision | undefined {
  const { pointerCoordinates: pointer, droppableContainers, active } = args;
  if (!pointer) return;
  const contains = ({ left, right, top, bottom }: DOMRect) =>
    pointer.x >= left &&
    pointer.x <= right &&
    pointer.y >= top &&
    pointer.y <= bottom;
  const gap = sidebar.querySelector<HTMLElement>("[data-section-drop-gap]");
  if (gap?.dataset.sectionDropGap && contains(gap.getBoundingClientRect())) {
    return {
      id: gap.dataset.sectionDropGap,
      data: { sectionEdge: gap.dataset.sectionDropEdge },
    };
  }

  // A page's end slot bounds its painted height while its rows are moving.
  let page: Collision | undefined;
  for (const { id, node } of droppableContainers) {
    const element = node.current;
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (String(id).startsWith("page:")) {
      const end = element.querySelector(
        ":scope > .outline-page > .outline-page-end",
      );
      const bottom = end?.getBoundingClientRect().bottom ?? rect.bottom;
      if (
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= bottom
      ) {
        page = { id };
      }
    } else if (
      (id !== active.id || element.style.pointerEvents !== "none") &&
      contains(rect)
    ) {
      return { id, data: { center: rect.top + rect.height / 2 } };
    }
  }
  return page;
}

// The floating section follows the sensor independently of the page layout.
function SectionDragOverlay({ label }: { label: (id: string) => string }) {
  const { active } = useDndContext();
  const id = String(active?.id ?? "");
  return (
    <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
      {id.startsWith("section:") && (
        <div
          className="section-drag-preview"
          data-section-drag-preview
          aria-hidden="true"
        >
          {label(id)}
        </div>
      )}
    </DragOverlay>
  );
}
export function Reorder({
  ids,
  onMove,
  children,
  pages = false,
  sectionDragLabel,
  documentDrop,
}: {
  ids: string[];
  onMove: (from: string, to: string, edge?: "before" | "after") => void;
  children: ReactNode;
  pages?: boolean;
  sectionDragLabel?: (id: string) => string;
  documentDrop?: {
    paper: RefObject<HTMLElement | null>;
    content: Block[];
    onMoveAt: (
      from: string,
      target: BlockDestination,
      selected: string[],
    ) => void;
  };
}) {
  const selection = useBlockSelection();
  const emptyPaper = useRef<HTMLElement | null>(null);
  const indicator = useDropIndicator(
    documentDrop?.content ?? [],
    documentDrop?.paper ?? emptyPaper,
  );
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerDrag = useRef(false);
  const keyboardSectionTarget = useRef<string | null>(null);
  const lastSectionHit = useRef<{
    x: number;
    y: number;
    sidebarTop: number;
    collision: Collision;
  } | null>(null);
  useEffect(() => {
    const track = (event: PointerEvent) => {
      if (pointerDrag.current)
        pointer.current = { x: event.clientX, y: event.clientY };
    };
    if (documentDrop) window.addEventListener("pointermove", track, true);
    return () => window.removeEventListener("pointermove", track, true);
  }, [!!documentDrop]);
  const blockId = (id: string) =>
    id.startsWith("column:")
      ? id.slice(7)
      : documentDrop?.content[ids.indexOf(id)]?.id;
  const selectedBlocks = () =>
    documentBlocks(documentDrop?.content ?? [])
      .filter((b) =>
        selection.ids.some(
          (id) => id === `block-${b.id}` || id === `template-${b.id}`,
        ),
      )
      .map((b) => b.id!) ?? [];

  // Align centers for vertical keyboard moves. The stock getter bottom-aligns
  // differently sized cards, which leaves a tall choice group over itself.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.code))
      return sortableKeyboardCoordinates(event, args);
    const { active, over, droppableRects, collisionRect } = args.context;
    if (!active || !collisionRect) return;
    const movingSection = pages && String(active.id).startsWith("section:");
    // Automatic page headings are not extra keyboard stops between sections.
    const targets =
      pages && String(active.id).startsWith("page:")
        ? ids.filter(
            (id) => id.startsWith("page:") && !id.startsWith("page:computed-"),
          )
        : movingSection
          ? ids.filter((id) => !id.startsWith("page:computed-"))
          : ids;
    const index = targets.indexOf(String(over?.id ?? active.id));
    const target = targets[index + (event.code === "ArrowDown" ? 1 : -1)];
    const rect = target && droppableRects.get(target);
    if (!rect || index < 0) return;
    if (movingSection) keyboardSectionTarget.current = target;
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
    if (String(args.active.id).startsWith("page:")) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          ({ id }) =>
            String(id).startsWith("page:") &&
            !String(id).startsWith("page:computed-"),
        ),
      });
    }
    const sectionPage = (id: string) => {
      const index = ids.indexOf(id);
      return ids.slice(0, index).findLast((item) => item.startsWith("page:"));
    };
    const targetEdge = (id: string, pointerOffset?: number): DropEdge => {
      if (id.startsWith("page-end:")) return "after";
      if (!id.startsWith("section:")) return "before";
      if (pointerOffset !== undefined) {
        if (pointerOffset > 8) return "after";
        if (
          pointerOffset < -8 ||
          sectionPage(String(args.active.id)) !== sectionPage(id)
        )
          return "before";
      }
      return ids.indexOf(String(args.active.id)) < ids.indexOf(id)
        ? "after"
        : "before";
    };
    if (!args.pointerCoordinates) {
      // The center of a page target can also fall inside its section row.
      // Honor the keyboard's ordered target instead of re-guessing by geometry.
      const id = keyboardSectionTarget.current ?? args.active.id;
      return [{ id, data: { sectionEdge: targetEdge(String(id)) } }];
    }
    const sidebar = args.droppableContainers
      .find((item) => item.id === args.active.id)
      ?.node.current?.closest<HTMLElement>(".sections-nav");
    if (!sidebar) return [];
    const { x, y } = args.pointerCoordinates;
    const sidebarTop = sidebar.getBoundingClientRect().top;
    const last = lastSectionHit.current;
    // A gap's animation must not choose a different target while the
    // pointer is stationary. A scroll or pointer move can choose again.
    if (last?.x === x && last.y === y && last.sidebarTop === sidebarTop) {
      return [last.collision];
    }
    const candidate =
      sectionPointerCollision(args, sidebar) ??
      closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          ({ id }) => !String(id).startsWith("page-end:"),
        ),
      })[0];
    if (!candidate) return [];
    const rect = args.droppableRects.get(candidate.id);
    const center =
      candidate.data?.center ?? (rect ? rect.top + rect.height / 2 : y);
    const chosen = {
      id: candidate.id,
      data: {
        sectionEdge:
          sectionDropEdge(candidate) ??
          targetEdge(String(candidate.id), y - center),
      },
    };
    lastSectionHit.current = { x, y, sidebarTop, collision: chosen };
    return [chosen];
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ activatorEvent }) => {
        keyboardSectionTarget.current = null;
        lastSectionHit.current = null;
        const e = activatorEvent as PointerEvent;
        pointerDrag.current = typeof e.clientX === "number";
        pointer.current =
          typeof e.clientX === "number" ? { x: e.clientX, y: e.clientY } : null;
      }}
      onDragMove={({ active }) => {
        if (documentDrop && pointer.current)
          indicator.show(pointer.current.x, pointer.current.y, [
            blockId(String(active.id))!,
          ]);
      }}
      onDragCancel={() => {
        pointerDrag.current = false;
        pointer.current = null;
        indicator.clear();
      }}
      onDragEnd={({
        active,
        over,
        delta,
        activatorEvent,
        collisions,
      }: DragEndEvent) => {
        if (documentDrop && pointer.current) {
          const from = blockId(String(active.id));
          const target = indicator.resolve(
            pointer.current.x,
            pointer.current.y,
            [from!],
          );
          indicator.clear();
          pointer.current = null;
          pointerDrag.current = false;
          if (target && from)
            documentDrop.onMoveAt(from, target, selectedBlocks());
          return;
        }
        if (pages && String(active.id).startsWith("section:")) {
          // Commit the same collision used to draw the gap. The announced
          // `over` state updates in an effect and can lag the last pointer move.
          const target = collisions?.[0];
          if (target && target.id !== active.id)
            onMove(
              String(active.id),
              String(target.id),
              sectionDropEdge(target),
            );
          return;
        }
        if (over && active.id !== over.id) {
          if (
            String(active.id).startsWith("column:") ||
            String(over.id).startsWith("column:")
          )
            return;
          const pointer = activatorEvent as PointerEvent;
          const distance =
            pointer.clientY + delta.y - (over.rect.top + over.rect.height / 2);
          // A drop on the row center keeps sortable's direction semantics. The
          // upper/lower edge is an explicit before/after slot.
          const edge =
            typeof pointer.clientY === "number" && Math.abs(distance) > 8
              ? distance < 0
                ? "before"
                : "after"
              : undefined;
          onMove(String(active.id), String(over.id), edge);
        }
      }}
    >
      <SortableContext
        items={
          pages
            ? ids.filter(
                (id) =>
                  id.startsWith("page:") && !id.startsWith("page:computed-"),
              )
            : ids
        }
        strategy={documentDrop ? () => null : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      {sectionDragLabel && <SectionDragOverlay label={sectionDragLabel} />}
      {indicator.line}
    </DndContext>
  );
}
