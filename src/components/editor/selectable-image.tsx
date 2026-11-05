"use client";
import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  constrainedImageSize,
  fitStoredImages,
  imagePercent,
  type ImageValue,
} from "../../lib/image-size";
import { useImageToolbar, PhoneToolbar } from "./use-image-toolbar";
import { useEditorHistory } from "../editor-history";
import { CoverAlignMenu } from "./cover-align-menu";
import { ToolbarPopover } from "../toolbar-popover";
export function SelectableImage({
  value,
  source = value.src,
  kind = "block",
  maxHeight = Infinity,
  maximumHeight,
  onChange,
  onDelete,
  onSelect,
  onSelectionChange,
  externalSelected,
  onDeselect,
  draggable = false,
  onDragStart,
  onAlign,
  onAlignAll,
  toolbarExtra,
  placementStyle,
}: {
  onAlignAll?: (align: "left" | "center" | "right") => void;
  onAlign?: (align: "left" | "center" | "right") => void;
  toolbarExtra?: React.ReactNode;
  placementStyle?: CSSProperties;
  value: ImageValue;
  source?: string;
  kind?: "block" | "cover" | "band";
  maxHeight?: number;
  maximumHeight?: () => number;
  onChange?: (value: ImageValue) => void;
  onDelete?: () => void;
  onSelect?: () => void;
  onSelectionChange?: (selected: boolean) => void;
  externalSelected?: boolean;
  onDeselect?: () => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLImageElement>;
}) {
  const root = useRef<HTMLSpanElement>(null),
    image = useRef<HTMLImageElement>(null),
    bar = useRef<HTMLSpanElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState(false),
    [preview, setPreview] = useState<{ width: number; height: number } | null>(
      null,
    ),
    [panel, setPanel] = useState<"alt" | "align" | null>(null),
    [error, setError] = useState("");
  const history = useEditorHistory(),
    id = useId(),
    editable = !!onChange;
  useImageToolbar(root, bar, selected);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  useEffect(() => {
    if (externalSelected !== undefined) setSelected(externalSelected);
  }, [externalSelected]);
  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected]);
  const save = (next: ImageValue) => {
    const run = () => latest.current.onChange?.(next);
    history ? history.inScope(`image:${id}`, run) : run();
  };
  const select = () => {
    if (!editable) return;
    root.current?.focus({ preventScroll: true });
    onSelect?.();
    setSelected(true);
  };
  useEffect(() => {
    if (!selected) return;
    const outside = (e: PointerEvent) => {
      if (
        !root.current?.contains(e.target as Node) &&
        !(e.target as Element).closest(`[data-image-toolbar="${id}"]`)
      ) {
        setSelected(false);
        setPanel(null);
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [selected]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const viewport = window.visualViewport;
    const place = () =>
      el.style.setProperty(
        "--image-keyboard-inset",
        `${Math.max(0, innerHeight - (viewport?.height ?? innerHeight) - (viewport?.offsetTop ?? 0))}px`,
      );
    place();
    viewport?.addEventListener("resize", place);
    viewport?.addEventListener("scroll", place);
    return () => {
      viewport?.removeEventListener("resize", place);
      viewport?.removeEventListener("scroll", place);
    };
  }, []);
  useLayoutEffect(() => {
    if (kind === "block" || !root.current || !image.current) return;
    const apply = () => root.current && fitStoredImages(root.current);
    const resize = new ResizeObserver(apply);
    const column = root.current.closest(
      kind === "band" ? ".band-slot" : ".cover-logo",
    );
    if (column) resize.observe(column);
    resize.observe(image.current);
    apply();
    return () => resize.disconnect();
  }, [kind, source, value.height, preview?.height, maxHeight]);
  const available = () => {
    const container =
      kind === "band"
        ? root.current?.closest(".band-slot")
        : kind === "cover"
          ? root.current?.closest(".cover-logo")
          : root.current?.parentElement;
    return container?.getBoundingClientRect().width ?? 1;
  };
  const limit = () => maximumHeight?.() ?? maxHeight;
  const dimensions = (height: number) =>
    constrainedImageSize(
      height,
      (image.current?.naturalWidth ?? 1) /
        Math.max(1, image.current?.naturalHeight ?? 1),
      available(),
      limit(),
    );
  const commit = (size: { width: number; height: number }) => {
    // A margin can temporarily leave no room for an image. Preserve its
    // positive stored size while rendering it at the available (zero) height.
    if (size.height <= 0 || size.width <= 0) return;
    save({
      ...latest.current.value,
      ...(kind === "block"
        ? { width_percent: imagePercent(size.width, available()) }
        : { height: size.height }),
    });
  };
  const resize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    select();
    const start = image.current!.getBoundingClientRect(),
      x = event.clientX,
      y = event.clientY;
    let size = { width: start.width, height: start.height };
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - x) * (corner.includes("left") ? -1 : 1),
        dy = (e.clientY - y) * (corner.includes("top") ? -1 : 1);
      const scale =
        1 +
        (dx * start.width + dy * start.height) /
          Math.max(1, start.width ** 2 + start.height ** 2);
      size = dimensions(start.height * scale);
      setPreview(size);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      commit(size);
      setPreview(null);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      setPreview(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  };
  const width =
    kind === "block"
      ? preview
        ? `${preview.width}px`
        : value.width_percent
          ? `${value.width_percent}%`
          : "100%"
      : undefined;
  const imgStyle: CSSProperties = {
    display: "block",
    width: kind === "block" ? "100%" : "auto",
    height:
      kind === "block"
        ? "auto"
        : (preview?.height ?? value.height ?? (kind === "cover" ? 60 : 18)),
    maxWidth: "100%",
    maxHeight:
      kind === "band"
        ? "var(--band-image-max,18px)"
        : kind === "block" || !Number.isFinite(maxHeight)
          ? "none"
          : maxHeight,
    objectFit: "contain",
  };
  return (
    <span
      ref={root}
      className="document-image"
      data-image-kind={kind}
      data-image-x={
        typeof placementStyle?.marginLeft === "number"
          ? placementStyle.marginLeft
          : undefined
      }
      data-image-selected={editable && selected}
      data-image-owner={id}
      tabIndex={editable ? 0 : undefined}
      role={editable ? "group" : undefined}
      aria-label={
        editable ? `${kind} image: ${value.alt || "Image"}` : undefined
      }
      style={{
        width,
        ...(kind === "block"
          ? {
              display: "block",
              marginLeft:
                value.align === "right" || value.align === "center"
                  ? "auto"
                  : 0,
              marginRight:
                value.align === "left" || value.align === "center" ? "auto" : 0,
            }
          : { display: "inline-block" }),
        ...placementStyle,
      }}
      onKeyDown={(e) => {
        const input = (e.target as Element).closest(
          "input,textarea,select,[contenteditable=true]",
        );
        if (input && root.current?.contains(input)) return;
        if (e.key === "Enter" && e.target === root.current) {
          e.preventDefault();
          select();
        }
        if (e.key === "Escape" && selected) {
          e.preventDefault();
          e.stopPropagation();
          setSelected(false);
          onDeselect?.();
          setPanel(null);
        }
        if (selected && ["Delete", "Backspace"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onDelete?.();
        }
        if (
          selected &&
          e.shiftKey &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          commit(
            dimensions(
              image.current!.getBoundingClientRect().height +
                (["ArrowDown", "ArrowRight"].includes(e.key) ? 10 : -10),
            ),
          );
        }
      }}
    >
      <img
        ref={image}
        src={source}
        data-image-height={
          kind === "block"
            ? undefined
            : (preview?.height ?? value.height ?? (kind === "cover" ? 60 : 18))
        }
        onLoad={() => {
          if (root.current && kind !== "block") fitStoredImages(root.current);
        }}
        alt={value.alt ?? ""}
        draggable={draggable}
        onDragStart={onDragStart}
        style={imgStyle}
        onPointerDown={
          editable
            ? (event) => {
                if (event.button === 0) {
                  event.stopPropagation();
                  select();
                }
              }
            : undefined
        }
        onClick={
          editable
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                select();
              }
            : undefined
        }
      />
      {editable && selected && (
        <>
          <span data-editor-chrome className="image-selection-controls">
            {(
              ["top-left", "top-right", "bottom-left", "bottom-right"] as const
            ).map((corner) => (
              <button
                key={corner}
                type="button"
                className={`image-resize-handle ${corner}`}
                aria-label={`Resize image ${corner.replace("-", " ")}`}
                title="Resize image (proportions locked)"
                onPointerDown={(e) => resize(e, corner)}
              />
            ))}
            {preview && (
              <span className="image-live-size" role="status">
                {Math.round(preview.width)} × {Math.round(preview.height)}
              </span>
            )}
          </span>
          <PhoneToolbar>
            <span
              data-editor-chrome
              data-image-toolbar={id}
              ref={bar}
              className="editor-edit-bar image-edit-bar"
              role="toolbar"
              aria-label="Image actions"
              onMouseDown={(e) => {
                if ((e.target as Element).closest("button")) e.preventDefault();
              }}
            >
              <button type="button" onClick={() => input.current?.click()}>
                Replace
              </button>
              <button
                type="button"
                onClick={(e) => {
                  trigger.current = e.currentTarget;
                  setPanel(panel === "alt" ? null : "alt");
                }}
              >
                Alt text
              </button>
              {(kind === "block" || onAlign) && (
                <button
                  type="button"
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setPanel(panel === "align" ? null : "align");
                  }}
                >
                  Align
                </button>
              )}
              {toolbarExtra}
              <button
                type="button"
                onClick={() =>
                  save({
                    ...value,
                    height:
                      kind === "cover"
                        ? 60
                        : kind === "band"
                          ? limit() > 0
                            ? Math.min(18, limit())
                            : value.height
                          : undefined,
                    width_percent: kind === "block" ? 100 : undefined,
                  })
                }
              >
                Reset size
              </button>
              <button type="button" className="image-delete" onClick={onDelete}>
                Delete
              </button>
            </span>
          </PhoneToolbar>
          {panel && (
            <ToolbarPopover
              className="image-controls-popover"
              close={() => setPanel(null)}
              trigger={trigger.current}
            >
              {panel === "alt" ? (
                <label>
                  Alt text
                  <input
                    autoFocus
                    maxLength={300}
                    value={value.alt ?? ""}
                    onChange={(e) => save({ ...value, alt: e.target.value })}
                  />
                </label>
              ) : onAlignAll ? (
                <CoverAlignMenu
                  align={value.align ?? "left"}
                  onAlign={(align) => {
                    onAlign?.(align);
                    setPanel(null);
                  }}
                  onAll={(align) => {
                    onAlignAll(align);
                    setPanel(null);
                  }}
                />
              ) : (
                (["left", "center", "right"] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    aria-pressed={(value.align ?? "left") === align}
                    onClick={() => {
                      if (onAlign) onAlign(align);
                      else save({ ...value, align });
                      setPanel(null);
                    }}
                  >
                    {align[0].toUpperCase() + align.slice(1)}
                  </button>
                ))
              )}
            </ToolbarPopover>
          )}
        </>
      )}
      {editable && (
        <input
          ref={input}
          data-editor-chrome
          hidden
          type="file"
          aria-label="Replace selected image"
          accept="image/png,image/jpeg"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 700000) {
              setError("Choose a PNG or JPEG under 700 KB");
              return;
            }
            const src = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => resolve("");
              reader.readAsDataURL(file);
            });
            if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(src)) {
              setError("Choose a valid PNG or JPEG image");
              return;
            }
            const current = latest.current.value;
            save({
              ...current,
              src,
              ...(kind === "band"
                ? {
                    height:
                      limit() > 0
                        ? Math.min(current.height ?? 18, limit())
                        : current.height,
                  }
                : {}),
            });
            setError("");
            e.target.value = "";
          }}
        />
      )}
      {error && (
        <span data-editor-chrome role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
