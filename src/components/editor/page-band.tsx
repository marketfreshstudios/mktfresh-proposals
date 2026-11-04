"use client";
import { SelectableImage } from "./selectable-image";
import { sharedPagesLabel, sharedChangesLabel } from "../../lib/page-count";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  setBandOverride,
  removeBandOverride,
  emptyBand,
} from "../../lib/band-overrides";
import { BandMenu, UseSharedConfirm } from "./band-menu";
import { BandPopover } from "./band-popover";
import type { Editor } from "@tiptap/core";
import { pageBandHtml } from "../../lib/page-band-render";
import {
  BandSchema,
  bandColumns,
  bandJustify,
  changeBandLayout,
  headerShown,
  footerShown,
  pageGeometry,
  type HeaderFooterSettings,
  type Band,
} from "../../lib/page-bands";
import { fontFamily } from "../../lib/proposal-fonts";
import { FieldEditor } from "../field-editor";
import { useBlockSelection, useBlockToolbar } from "../block-controls";
import { Icon } from "../ui";
import { useBandEditing } from "./band-editing";
import { EditBar } from "./edit-bar";
import { BandFieldMenu, LayoutGlyph, LayoutMenu, menuKeys } from "./band-menus";
type Props = Parameters<typeof pageBandHtml>[0] & {
  onChange?: (hf: HeaderFooterSettings) => void;
  source?: "shared" | "unique" | "hidden";
  anchor?: string;
  allowOverrides?: boolean;
  sharedCount?: number;
  movedFrom?: number;
  onDismissMove?: () => void;
};
export function PageBand(props: Props) {
  const {
    hf,
    kind,
    page,
    pageCount,
    values,
    styles,
    logo,
    onChange,
    source = "shared",
    band: resolved,
    anchor,
    allowOverrides = true,
    sharedCount = Math.max(0, pageCount - (hf?.showOnCover ? 0 : 1)),
    movedFrom,
    onDismissMove,
  } = props;
  const control = useBandEditing(),
    selection = useBlockSelection(),
    toolbar = useBlockToolbar();
  const root = useRef<HTMLDivElement>(null),
    editors = useRef<(Editor | null)[]>([]),
    column = useRef<number | null>(null),
    clickPoint = useRef<{
      x: number;
      y: number;
      slot: number;
      image?: boolean;
    } | null>(null);
  const [menu, setMenu] = useState<
      "more" | "confirm" | "layout" | "fields" | "image" | null
    >(null),
    [trigger, setTrigger] = useState<HTMLElement | null>(null),
    [error, setError] = useState(""),
    [imageSelected, setImageSelected] = useState(false);
  const device = control?.device,
    phone = device === "phone",
    tablet = device === "tablet";
  const [, refreshMarks] = useState(0);
  const markListeners = useRef(new Map<Editor, () => void>());
  const id = `${kind}-${anchor ?? page}`,
    editing = control?.active === id && !!device && !!onChange,
    selected = control?.selected === id;
  const shown =
    !!hf && (kind === "header" ? headerShown(hf, page) : footerShown(hf, page));
  const editable = !!device && !!onChange;
  const begin = (point?: {
    x: number;
    y: number;
    slot: number;
    image?: boolean;
  }) => {
    if (!editable) return;
    if (resolved === "hidden" && hf && anchor)
      onChange?.(setBandOverride(hf, anchor, kind, emptyBand(hf.shared[kind])));
    selection.clear();
    column.current = point?.slot ?? null;
    clickPoint.current = point ?? null;
    control?.begin(id);
  };
  const done = (focus = false) => {
    setMenu(null);
    control?.end();
    if (focus)
      requestAnimationFrame(() => root.current?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    if (!editing || !phone || clickPoint.current) return;
    const frame = requestAnimationFrame(() =>
      editors.current[0]?.commands.focus("end"),
    );
    return () => cancelAnimationFrame(frame);
  }, [editing, phone]);
  useEffect(() => {
    if (!editable || !shown || !root.current) return;
    return control?.register(id, {
      kind,
      page,
      source,
      element: root.current,
      edit: begin,
    });
  }, [editable, shown, id, source, page]);
  useEffect(() => {
    if (!editing && !selected) {
      setMenu(null);
      return;
    }
    const outside = (e: PointerEvent) => {
      const el = e.target as Element;
      if (
        !root.current?.contains(el) &&
        !el.closest(
          ".band-popover,.band-phone-sheet,.band-phone-header,.band-edit-bar",
        )
      )
        done();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menu) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      done(true);
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [editing, selected, menu]);
  useEffect(() => {
    if (menu !== "more" && menu !== "image") return;
    const frame = requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>(
          `.band-popover-${menu} button,.band-popover-${menu} input`,
        )
        ?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [menu]);
  if (!hf || !shown) return null;
  const band =
      resolved === "hidden" ? hf.shared[kind] : (resolved ?? hf.shared[kind]),
    geometry = pageGeometry(styles, hf, page, { [kind]: resolved }),
    rect = geometry[kind]!;
  const patch = (next: Band) => {
    onDismissMove?.();
    onChange?.(
      source !== "shared" && anchor
        ? setBandOverride(hf, anchor, kind, next)
        : { ...hf, shared: { ...hf.shared, [kind]: next } },
    );
  };
  const unique = () => {
    if (!anchor) return;
    onChange?.(setBandOverride(hf, anchor, kind, hf.shared[kind]));
    setMenu(null);
    selection.clear();
    column.current = null;
    control?.begin(id);
  };
  const hide = () => {
    if (anchor) onChange?.(setBandOverride(hf, anchor, kind, "hidden"));
    done(true);
  };
  const useShared = () => {
    if (!anchor) return;
    onChange?.(removeBandOverride(hf, anchor, kind));
    control?.announce(`Page ${page} now uses the shared ${kind}`);
    done(true);
  };
  const label = `${kind === "header" ? "Header" : "Footer"} · ${source === "shared" ? "Shared" : source === "hidden" ? "Hidden" : `Unique to page ${page}`}`;
  const scopeLabel =
    source === "shared"
      ? sharedPagesLabel(sharedCount)
      : `Unique to page ${page}`;
  const open = (which: typeof menu, el: HTMLElement) => {
    control?.select(id);
    setTrigger(el);
    setMenu(menu === which ? null : which);
  };
  const map = {
    ...values,
    "page.number": String(page),
    "page.count": String(pageCount),
  };
  const active = () =>
    editors.current[
      Math.min(column.current ?? band.slots.length - 1, band.slots.length - 1)
    ];
  const imageSlot = Math.min(
    column.current ?? band.image?.slot ?? 0,
    band.slots.length - 1,
  );
  const insert = (path: string) => {
    const e = active();
    if (!e) return;
    if (column.current === null) {
      e.commands.setTextSelection(Math.max(1, e.state.doc.content.size - 1));
      e.view.focus();
    }
    // FieldEditor retains the last selection while the menu owns focus.
    if (path === "page.number+count") {
      e.chain()
        .focus()
        .insertContent([
          { type: "text", text: "Page " },
          { type: "variable", attrs: { path: "page.number" } },
          { type: "text", text: " of " },
          { type: "variable", attrs: { path: "page.count" } },
        ])
        .run();
    } else toolbar?.insert(path);
    setMenu(null);
  };
  return (
    <div
      ref={root}
      data-editor-chrome
      data-band-frame={kind}
      data-band-page={page}
      data-band-state={editing ? "editing" : "rest"}
      data-band-source={source}
      data-band-selected={selected}
      data-small-margin={
        (kind === "header" ? geometry.margins.top : geometry.margins.bottom) <
        57.6
      }
      data-band-anchor={anchor}
      className="page-band-frame"
      role="group"
      tabIndex={editable ? 0 : undefined}
      aria-label={`${kind === "header" ? "Header" : "Footer"} · ${source === "shared" ? "Shared" : source === "unique" ? `Unique to page ${page}` : "Hidden"}`}
      style={
        {
          left: `var(--editor-sheet-left,${geometry.margins.left}px)`,
          right: `var(--editor-sheet-right,${geometry.margins.right}px)`,
          height: rect.height,
          "--band-image-max": `${geometry.bandLimits[kind].imageHeight}px`,
          ...(kind === "header"
            ? { top: rect.y }
            : { bottom: geometry.distance }),
        } as CSSProperties & Record<string, string | number>
      }
      onClick={(event) => {
        if (
          editing ||
          !editable ||
          (event.target as Element).closest("button,input")
        )
          return;
        const slot = (event.target as Element).closest<HTMLElement>(
          "[data-band-slot]",
        );
        begin({
          x: event.clientX,
          y: event.clientY,
          slot: Number(slot?.dataset.bandSlot ?? 0),
          image: (event.target as Element).tagName === "IMG",
        });
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && e.key === "Enter" && !editing) {
          e.preventDefault();
          begin();
        }
        if (
          e.target === e.currentTarget &&
          e.shiftKey &&
          e.key === "F10" &&
          editable
        ) {
          e.preventDefault();
          open("more", root.current!);
        }
      }}
    >
      {editing ? (
        <div
          className="page-band"
          data-page-band={kind}
          data-band-page={page}
          data-divider={hf.divider}
          data-band-mode="editing"
          style={{
            gridTemplateColumns: bandColumns(band.layout),
            fontFamily: fontFamily(styles?.body.font ?? "serif"),
          }}
        >
          {band.slots.map((slot, n) => (
            <div
              className="band-slot"
              data-band-slot={n}
              key={n}
              style={{
                justifyContent: bandJustify(band.layout)[n],
                textAlign: bandJustify(band.layout)[
                  n
                ] as CSSProperties["textAlign"],
              }}
              onFocusCapture={() => {
                column.current = n;
              }}
              onPointerDownCapture={() => {
                column.current = n;
              }}
            >
              {band.image?.slot === n &&
                (band.image.src !== "workspace-logo" || logo) && (
                  <SelectableImage
                    kind="band"
                    value={band.image}
                    source={
                      band.image.src === "workspace-logo"
                        ? logo
                        : band.image.src
                    }
                    maxHeight={geometry.bandLimits[kind].imageHeight}
                    onChange={(image) =>
                      patch({
                        ...band,
                        image: {
                          ...band.image!,
                          src: image.src,
                          alt: image.alt ?? "",
                          height: image.height,
                        },
                      })
                    }
                    onDelete={() => {
                      const { image: _, ...next } = band;
                      patch(next);
                    }}
                    onSelectionChange={setImageSelected}
                  />
                )}
              <div
                className="band-slot-content"
                data-history-block={`band-${kind}-${source === "shared" ? "shared" : anchor}-${n}`}
              >
                <FieldEditor
                  value={slot}
                  map={map}
                  showNames={false}
                  label={`${kind} column ${n + 1}`}
                  bandEditor={(e) => {
                    const old = editors.current[n];
                    const listener = old && markListeners.current.get(old);
                    if (old && listener) {
                      old.off("transaction", listener);
                      old.off("selectionUpdate", listener);
                      markListeners.current.delete(old);
                    }
                    editors.current[n] = e;
                    if (e) {
                      const point = clickPoint.current;
                      if (point?.slot === n)
                        requestAnimationFrame(() => {
                          if (e.isDestroyed) return;
                          if (point.image) {
                            root.current
                              ?.querySelector<HTMLImageElement>(
                                `[data-band-slot="${n}"] img`,
                              )
                              ?.click();
                            clickPoint.current = null;
                            return;
                          }
                          const position = e.view.posAtCoords({
                            left: point.x,
                            top: point.y,
                          });
                          e.commands.setTextSelection(
                            position?.pos ??
                              Math.max(1, e.state.doc.content.size - 1),
                          );
                          e.view.focus();
                          clickPoint.current = null;
                        });
                      const paint = () => refreshMarks((v) => v + 1);
                      markListeners.current.set(e, paint);
                      e.on("transaction", paint);
                      e.on("selectionUpdate", paint);
                    }
                  }}
                  onChange={(value) =>
                    patch({
                      ...band,
                      slots: band.slots.map((s, i) =>
                        i === n
                          ? { type: "doc", content: value.content ?? [] }
                          : s,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="band-rest-content"
          dangerouslySetInnerHTML={{
            __html: pageBandHtml({ ...props, band: resolved }),
          }}
        />
      )}
      {movedFrom !== undefined && source !== "shared" && !editing ? (
        <div data-editor-chrome className="band-reflow-note" role="status">
          <strong>Unique</strong>
          <span title={`Moved here from page ${movedFrom} with its section`}>
            Moved here from page {movedFrom} with its section
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismissMove?.();
            }}
          >
            OK
          </button>
        </div>
      ) : (
        source !== "shared" && (
          <span className="band-source-tag">
            {source === "hidden" ? "Hidden" : "Unique"}
          </span>
        )
      )}
      {editable && !editing && (
        <div className="band-hover-controls">
          <span className="band-label">{label}</span>
          <span className="band-hover-actions">
            <button
              tabIndex={-1}
              aria-label={`${kind} actions`}
              title="More"
              onClick={(e) => {
                e.stopPropagation();
                open("more", e.currentTarget);
              }}
            >
              ⋯
            </button>
          </span>
        </div>
      )}
      {editing && !imageSelected && (
        <EditBar
          variant="band"
          portal={root.current?.closest<HTMLElement>(
            ".quote-workspace,.studio-template-layout",
          )}
          kind={kind}
          device={device ?? "desktop"}
          sourceLabel={source === "shared" ? "Shared" : "Unique"}
          inside={
            (kind === "header"
              ? geometry.margins.top
              : geometry.margins.bottom) < 57.6
          }
        >
          <button
            aria-label="Bold"
            title="Bold"
            aria-pressed={active()?.isActive("bold") ?? false}
            onClick={() => active()?.chain().focus().toggleBold().run()}
          >
            <b>B</b>
          </button>
          <button
            aria-label="Italic"
            title="Italic"
            aria-pressed={active()?.isActive("italic") ?? false}
            onClick={() => active()?.chain().focus().toggleItalic().run()}
          >
            <i>I</i>
          </button>
          <span className="band-separator" />
          <button
            aria-label="Layout"
            aria-expanded={menu === "layout"}
            aria-haspopup="menu"
            onClick={(e) => open("layout", e.currentTarget)}
          >
            <LayoutGlyph layout={band.layout} /> Layout{" "}
            <span aria-hidden>▾</span>
          </button>
          <span className="band-separator" />
          {!phone && (
            <button
              aria-label="Line"
              aria-pressed={hf.divider}
              onClick={() => onChange?.({ ...hf, divider: !hf.divider })}
            >
              — Line
            </button>
          )}
          {!phone && <span className="band-separator" />}
          <button
            aria-label="Insert band field"
            aria-expanded={menu === "fields"}
            aria-haspopup="menu"
            onClick={(e) => open("fields", e.currentTarget)}
          >
            <span className="band-field-icon">{"{ }"}</span> Field
          </button>
          <span className="band-separator" />
          <button
            aria-label="Image"
            title="Image"
            aria-expanded={menu === "image"}
            onClick={(e) => open("image", e.currentTarget)}
          >
            <Icon name="image" />
          </button>
          <span className="band-separator" />
          {device === "desktop" && (
            <span className="band-shared-count">{scopeLabel}</span>
          )}
          {device !== "desktop" && (
            <button
              className="band-bar-more"
              type="button"
              aria-label={`${kind} actions`}
              title="More"
              onClick={(e) => open("more", e.currentTarget)}
            >
              ⋯
            </button>
          )}
          {!phone && (
            <button className="band-done" onClick={() => done(true)}>
              Done
            </button>
          )}
        </EditBar>
      )}
      {editing && tablet && (
        <span className="band-touch-scope">{scopeLabel}</span>
      )}
      {editing &&
        phone &&
        createPortal(
          <header data-editor-chrome className="band-phone-header">
            <button
              type="button"
              aria-label="Back to proposal"
              onClick={() => done(true)}
            >
              ‹
            </button>
            <div>
              <strong>{label}</strong>
              {source === "shared" && (
                <small>{sharedChangesLabel(sharedCount)}</small>
              )}
            </div>
            <button type="button" onClick={() => done(true)}>
              Done
            </button>
          </header>,
          document.body,
        )}
      {menu && (
        <BandPopover
          phone={phone}
          mode={menu}
          kind={kind}
          page={page}
          subtitle={scopeLabel}
          trigger={trigger}
          close={() => setMenu(null)}
          onEscape={menu === "confirm" ? () => setMenu("more") : undefined}
        >
          {menu === "more" ? (
            <BandMenu
              kind={kind}
              source={source}
              count={sharedCount}
              sharedOnly={!allowOverrides || !anchor}
              onEdit={() => {
                setMenu(null);
                begin();
              }}
              onUnique={unique}
              onShared={() => setMenu("confirm")}
              onHide={hide}
            />
          ) : menu === "confirm" ? (
            <UseSharedConfirm
              kind={kind}
              page={page}
              onCancel={() => setMenu("more")}
              onConfirm={useShared}
            />
          ) : menu === "layout" ? (
            <LayoutMenu
              value={band.layout}
              onPick={(layout) => {
                const next = changeBandLayout(band, layout);
                // A removed column no longer owns a cursor. Field insertion now
                // uses the documented end-of-last-column fallback.
                if (
                  column.current !== null &&
                  column.current >= next.slots.length
                )
                  column.current = null;
                patch(next);
                setMenu(null);
                requestAnimationFrame(() =>
                  trigger?.focus({ preventScroll: true }),
                );
              }}
            />
          ) : menu === "fields" ? (
            <BandFieldMenu
              map={values}
              page={page}
              count={pageCount}
              onPick={insert}
            />
          ) : (
            <div className="band-image-menu">
              <label className="band-upload">
                Upload image
                <input
                  aria-label="Upload band image"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (
                      !["image/png", "image/jpeg"].includes(f.type) ||
                      f.size > 749000
                    ) {
                      setError(
                        "Choose a PNG or JPEG image smaller than 750 KB.",
                      );
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const next = BandSchema.safeParse({
                        ...band,
                        image: {
                          src: String(reader.result),
                          alt: "Band image",
                          slot: imageSlot,
                        },
                      });
                      if (!next.success) {
                        setError(
                          "Choose a valid PNG or JPEG image smaller than 750 KB.",
                        );
                        return;
                      }
                      patch(next.data);
                      setMenu(null);
                      setError("");
                    };
                    reader.onerror = () =>
                      setError("Image could not be read. Try another file.");
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
              <button
                onClick={() => {
                  patch({
                    ...band,
                    image: {
                      src: "workspace-logo",
                      alt: "Workspace logo",
                      slot: imageSlot,
                    },
                  });
                  setMenu(null);
                }}
              >
                Use workspace logo
              </button>
              {band.image?.slot === imageSlot && (
                <button
                  onClick={() => {
                    const { image: _, ...next } = band;
                    patch(next);
                    setMenu(null);
                  }}
                >
                  Remove image
                </button>
              )}
              {error && <p role="alert">{error}</p>}
            </div>
          )}
        </BandPopover>
      )}
    </div>
  );
}
