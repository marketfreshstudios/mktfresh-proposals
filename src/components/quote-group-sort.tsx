"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export type QuoteSortUnit = {
  id: string;
  label: string;
  dragLabel?: string;
  options?: { id: string; label: string }[];
  locked?: boolean;
};
export type QuoteDrop = { group: string | null; index: number };
type Drag = {
  id: string;
  height: number;
  label: string;
  keyboard: boolean;
  origin: QuoteDrop;
  target: QuoteDrop | null;
};

function same(a: QuoteDrop | null, b: QuoteDrop | null) {
  return a?.group === b?.group && a?.index === b?.index;
}

function QuoteSortRow({
  id,
  label,
  active,
  children,
  onKeyDown,
  instructions,
}: {
  id: string;
  label: string;
  active: boolean;
  children: ReactNode;
  instructions: string;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { listeners, attributes, setNodeRef, setActivatorNodeRef } =
    useDraggable({ id });
  return (
    <div
      className="quote-sortable quote-drag-row"
      ref={setNodeRef}
      data-quote-drag-id={id}
      data-sortable-id={id}
      data-quote-drag-source={active || undefined}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag ${label}`}
        title={`Drag ${label}`}
        ref={setActivatorNodeRef}
        {...attributes}
        aria-describedby={instructions}
        aria-pressed={active || undefined}
        {...listeners}
        onKeyDown={onKeyDown}
      >
        <GripVertical size={16} aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}

function QuoteDragGhost({
  label,
  start,
}: {
  label: string;
  start: { x: number; y: number };
}) {
  const ghost = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ghost.current!;
    function place(x: number, y: number) {
      const left = Math.max(
        8,
        Math.min(x + 12, window.innerWidth - node.offsetWidth - 8),
      );
      const top = Math.max(
        8,
        Math.min(y + 12, window.innerHeight - node.offsetHeight - 8),
      );
      node.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }
    const move = (event: PointerEvent) => place(event.clientX, event.clientY);
    place(start.x, start.y);
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, [start]);
  return createPortal(
    <div ref={ghost} className="quote-drag-overlay" aria-hidden="true">
      {label}
    </div>,
    document.body,
  );
}

/** Keep source nodes mounted across containers and animate the rows around a real gap. */
export function QuoteGroupSort({
  units,
  bounds,
  renderGroup,
  renderItem,
  onDrop,
}: {
  units: QuoteSortUnit[];
  bounds: RefObject<HTMLElement | null>;
  renderGroup: (id: string, options: ReactNode) => ReactNode;
  renderItem: (id: string) => ReactNode;
  onDrop: (id: string, target: QuoteDrop) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const instructions = useId();
  const pointerStart = useRef<{ x: number; y: number }>(null);
  const state = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announcement, announce] = useState("");
  const frames = useRef(new Map<HTMLElement, number>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const rows = () => [
    ...(root.current?.querySelectorAll<HTMLElement>("[data-quote-drag-id]") ??
      []),
  ];
  const row = (id: string) =>
    rows().find((node) => node.dataset.quoteDragId === id);
  const unitFor = (id: string) =>
    units.find((unit) => unit.options?.some((option) => option.id === id));
  const list = (group: string | null, excluding: string) =>
    (group
      ? (units.find((unit) => unit.id === group)?.options ?? [])
      : units
    ).filter((entry) => entry.id !== excluding);
  function update(next: Drag | null) {
    frames.current = new Map(
      rows().map((node) => [node, node.getBoundingClientRect().top]),
    );
    state.current = next;
    setDrag(next);
  }
  useLayoutEffect(() => {
    const previous = frames.current;
    frames.current = new Map();
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const offsets = new Map(
      [...previous]
        .filter(([node]) => node.isConnected)
        .map(
          ([node, top]) =>
            [node, top - node.getBoundingClientRect().top] as const,
        ),
    );
    for (const [node, offset] of offsets) {
      if (node.dataset.quoteDragId === drag?.id) continue;
      // A moving group carries its children. Only animate their own shifts.
      const parent = node.parentElement?.closest<HTMLElement>(
        "[data-quote-drag-id]",
      );
      const delta = offset - (parent ? (offsets.get(parent) ?? 0) : 0);
      if (Math.abs(delta) >= 1)
        animations.current.set(
          node,
          node.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 180, easing: "ease-out" },
          ),
        );
    }
  }, [drag]);

  function translateY(node: HTMLElement) {
    const transform = getComputedStyle(node).transform;
    return transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
  }
  function layoutTop(node: HTMLElement) {
    let y = node.getBoundingClientRect().top;
    for (
      let part: HTMLElement | null = node;
      part && part !== root.current;
      part = part.parentElement
    )
      if (part.dataset.quoteDragId) y -= translateY(part);
    return y;
  }
  function allowedGroup(id: string, group: QuoteSortUnit) {
    if (!group.options) return false;
    const source = unitFor(id);
    if (source) return source.id === group.id;
    return !group.locked && !units.find((unit) => unit.id === id)?.options;
  }
  const collision: CollisionDetection = ({ pointerCoordinates, active }) => {
    const current = state.current;
    const panel = bounds.current?.getBoundingClientRect();
    const pointer = pointerCoordinates;
    if (
      !current ||
      !panel ||
      !pointer ||
      !root.current ||
      pointer.x < panel.left ||
      pointer.x > panel.right ||
      pointer.y < panel.top ||
      pointer.y > panel.bottom
    )
      return [];
    const id = String(active.id);
    const nodes = new Map(
      rows().map((node) => [node.dataset.quoteDragId, node]),
    );
    const group = units.find((unit) => {
      if (!allowedGroup(id, unit)) return false;
      const card = nodes.get(unit.id);
      if (!card) return false;
      const { left, right } = card.getBoundingClientRect();
      const top = layoutTop(card);
      return (
        pointer.x >= left &&
        pointer.x <= right &&
        pointer.y >= top &&
        pointer.y <= top + card.offsetHeight
      );
    });
    const source = unitFor(id);
    if (!group && source?.locked) return [];
    const gap = root.current.querySelector<HTMLElement>(
      "[data-quote-drop-gap]",
    );
    const hitGap =
      gap &&
      pointer.y >= layoutTop(gap) &&
      pointer.y <= layoutTop(gap) + gap.offsetHeight;
    const groupId = group?.id ?? null;
    const siblings = list(groupId, id);
    const index = siblings.findIndex((entry) => {
      const node = nodes.get(entry.id);
      return node && pointer.y < layoutTop(node) + node.offsetHeight / 2;
    });
    const target =
      hitGap && current.target?.group === groupId
        ? current.target
        : { group: groupId, index: index < 0 ? siblings.length : index };
    return [{ id: "quote-drop", data: { target } }];
  };
  function start(id: string, keyboard: boolean) {
    const source = unitFor(id);
    const entries = source?.options ?? units;
    const option = entries.find((entry) => entry.id === id);
    if (!option) return;
    const origin = {
      group: source?.id ?? null,
      index: entries.indexOf(option),
    };
    update({
      id,
      label: option.label,
      height: row(id)?.offsetHeight ?? 50,
      origin,
      target: origin,
      keyboard,
    });
    announce(
      keyboard
        ? `Picked up ${option.label}. Use arrow keys to move it, then press Space to drop.`
        : `Picked up ${option.label}.`,
    );
  }
  function describe(current: Drag, target: QuoteDrop) {
    const group = units.find((unit) => unit.id === target.group);
    return `Moved ${group ? `into ${group.label}` : "in the quote list"}, position ${target.index + 1} of ${list(target.group, current.id).length + 1}`;
  }
  function target(next: QuoteDrop | null) {
    const current = state.current;
    if (!current || same(current.target, next)) return;
    update({ ...current, target: next });
    if (current.keyboard && next) announce(describe(current, next));
  }
  function finish(target: QuoteDrop | null, restoreFocus = true) {
    const current = state.current;
    if (!current) return;
    update(null);
    if (target && !same(current.origin, target)) {
      onDrop(current.id, target);
      announce(describe(current, target));
    } else announce(target ? `Dropped ${current.label}` : "Drag canceled");
    if (current.keyboard && restoreFocus)
      requestAnimationFrame(() =>
        row(current.id)
          ?.querySelector<HTMLButtonElement>(".drag-handle")
          ?.focus(),
      );
  }
  function keyboard(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    const key = event.key;
    const current = state.current;
    if (key === " " || key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (!current) start(id, true);
      else if (current.keyboard) finish(current.target);
      return;
    }
    if (!current?.keyboard) return;
    if (key === "Tab") {
      finish(null, false);
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
      return;
    }
    const here = current.target;
    if (
      !here ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const top = list(null, id);
    const options = (unit: QuoteSortUnit) =>
      Array.from({ length: list(unit.id, id).length + 1 }, (_, index) => ({
        group: unit.id,
        index,
      }));
    const source = unitFor(id);
    let next: QuoteDrop | undefined;
    if (key === "ArrowLeft" && here.group && !source?.locked)
      next = {
        group: null,
        index: top.findIndex((unit) => unit.id === here.group) + 1,
      };
    if (key === "ArrowRight" && !here.group) {
      const group = [top[here.index], top[here.index - 1]].find(
        (unit) => unit && allowedGroup(id, unit),
      );
      if (group) next = { group: group.id, index: 0 };
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      const stops = source?.locked
        ? options(source)
        : [
            ...top.flatMap((unit, index) => [
              { group: null, index },
              ...(allowedGroup(id, unit) ? options(unit) : []),
            ]),
            { group: null, index: top.length },
          ];
      next =
        stops[
          stops.findIndex((stop) => same(stop, here)) +
            (key === "ArrowDown" ? 1 : -1)
        ];
    }
    if (next) target(next);
  }
  function renderList(
    group: string | null,
    entries: { id: string; label: string }[],
  ) {
    const here = drag?.target?.group === group ? drag.target : null;
    const gap =
      here && drag ? (
        <div
          data-quote-drop-gap
          className="quote-drag-gap"
          style={{ blockSize: drag.height }}
          aria-hidden="true"
        >
          {drag.keyboard && drag.label}
        </div>
      ) : null;
    let position = 0;
    return entries
      .map((entry) => {
        const active = drag?.id === entry.id;
        const showGap = !active && here?.index === position;
        if (!active) position++;
        const unit =
          group === null
            ? units.find((unit) => unit.id === entry.id)
            : undefined;
        return (
          <Fragment key={entry.id}>
            {showGap && gap}
            <QuoteSortRow
              id={entry.id}
              label={unit?.dragLabel ?? entry.label}
              active={active}
              instructions={instructions}
              onKeyDown={(event) => keyboard(entry.id, event)}
            >
              {unit?.options
                ? renderGroup(unit.id, renderList(unit.id, unit.options))
                : renderItem(entry.id)}
            </QuoteSortRow>
          </Fragment>
        );
      })
      .concat(
        here?.index === position
          ? [<Fragment key="last-gap">{gap}</Fragment>]
          : [],
      );
  }

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements: {
          onDragStart: () => undefined,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
      }}
      collisionDetection={collision}
      onDragStart={({ active, activatorEvent }) => {
        const pointer = activatorEvent as PointerEvent;
        pointerStart.current = { x: pointer.clientX, y: pointer.clientY };
        start(String(active.id), false);
      }}
      onDragMove={({ collisions }) =>
        target(collisions?.[0]?.data?.target ?? null)
      }
      onDragEnd={({ collisions }) =>
        finish(collisions?.[0]?.data?.target ?? null)
      }
      onDragCancel={() => finish(null)}
    >
      <div
        ref={root}
        className="quote-drag-units"
        data-quote-dragging={drag?.id}
      >
        {renderList(null, units)}
      </div>
      <p className="sr-only" id={instructions}>
        Press Space to pick up or drop. Use Up and Down to move, Right to enter
        a group, Left to leave it, or Escape to cancel.
      </p>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {drag && !drag.keyboard && pointerStart.current && (
        <QuoteDragGhost label={drag.label} start={pointerStart.current} />
      )}
    </DndContext>
  );
}
