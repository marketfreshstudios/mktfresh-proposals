"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { ToolbarPopover } from "../toolbar-popover";
import { useBandEditing } from "./band-editing";
import { EditBar } from "./edit-bar";
import { BandFieldMenu, LayoutGlyph, LayoutMenu, menuKeys } from "./band-menus";
type Props = Parameters<typeof pageBandHtml>[0] & {
  onChange?: (hf: HeaderFooterSettings) => void;
  source?: "shared" | "unique" | "hidden";
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
  } = props;
  const control = useBandEditing(),
    selection = useBlockSelection(),
    toolbar = useBlockToolbar();
  const root = useRef<HTMLDivElement>(null),
    editors = useRef<(Editor | null)[]>([]),
    column = useRef<number | null>(null);
  const [desktop, setDesktop] = useState(false),
    [menu, setMenu] = useState<"more" | "layout" | "fields" | "image" | null>(
      null,
    ),
    [trigger, setTrigger] = useState<HTMLElement | null>(null),
    [error, setError] = useState("");
  const [, refreshMarks] = useState(0);
  const markListeners = useRef(new Map<Editor, () => void>());
  const id = `${kind}-${page}`,
    editing = control?.active === id && desktop && !!onChange;
  const shown =
    !!hf && (kind === "header" ? headerShown(hf, page) : footerShown(hf, page));
  const editable = desktop && !!onChange && source === "shared";
  const begin = () => {
    if (!editable) return;
    selection.clear();
    column.current = null;
    control?.begin(id);
  };
  const done = (focus = false) => {
    setMenu(null);
    control?.end();
    if (focus)
      requestAnimationFrame(() => root.current?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    const media = matchMedia("(min-width:960px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!editable || !shown || !root.current) return;
    return control?.register(id, {
      kind,
      page,
      element: root.current,
      edit: begin,
    });
  }, [editable, shown, id]);
  useEffect(() => {
    if (!editing) {
      setMenu(null);
      return;
    }
    const outside = (e: PointerEvent) => {
      const el = e.target as Element;
      if (!root.current?.contains(el) && !el.closest(".band-popover")) done();
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
  }, [editing, menu]);
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
  const band = hf.shared[kind],
    geometry = pageGeometry(styles, hf, page),
    rect = geometry[kind]!;
  const patch = (next: Band) =>
    onChange?.({ ...hf, shared: { ...hf.shared, [kind]: next } });
  const open = (which: typeof menu, el: HTMLElement) => {
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
      className="page-band-frame"
      role="group"
      tabIndex={editable ? 0 : undefined}
      aria-label={`${kind === "header" ? "Header" : "Footer"} · ${source === "shared" ? "Shared" : source === "unique" ? `Unique to page ${page}` : "Hidden"}`}
      style={
        {
          left: `var(--editor-sheet-left,${geometry.margins.left}px)`,
          right: `var(--editor-sheet-right,${geometry.margins.right}px)`,
          height: rect.height,
          ...(kind === "header"
            ? { top: rect.y }
            : { bottom: geometry.margins.bottom }),
        } as CSSProperties
      }
      onDoubleClick={begin}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !editing) {
          e.preventDefault();
          begin();
        }
        if (e.shiftKey && e.key === "F10" && editable) {
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
                  <img
                    src={
                      band.image.src === "workspace-logo"
                        ? logo
                        : band.image.src
                    }
                    alt={band.image.alt}
                  />
                )}
              <div
                className="band-slot-content"
                data-history-block={`band-${kind}-${n}`}
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
          dangerouslySetInnerHTML={{ __html: pageBandHtml(props) }}
        />
      )}
      {source !== "shared" && (
        <span className="band-source-tag">
          {source === "hidden" ? "Hidden" : `Unique to page ${page}`}
        </span>
      )}
      {editable && !editing && (
        <div className="band-hover-controls">
          <span className="band-label">
            {kind === "header" ? "Header · Shared" : "Footer · Shared"}
          </span>
          <span className="band-hover-actions">
            <button tabIndex={-1} className="band-edit-button" onClick={begin}>
              Edit
            </button>
            <button
              tabIndex={-1}
              aria-label={`${kind} actions`}
              title="More"
              onClick={(e) => open("more", e.currentTarget)}
            >
              ⋯
            </button>
          </span>
        </div>
      )}
      {editing && (
        <EditBar
          variant="band"
          kind={kind}
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
          <button
            aria-label="Line"
            aria-pressed={hf.divider}
            onClick={() => onChange?.({ ...hf, divider: !hf.divider })}
          >
            — Line
          </button>
          <span className="band-separator" />
          <button
            aria-label="Insert band field"
            aria-expanded={menu === "fields"}
            aria-haspopup="menu"
            onClick={(e) => open("fields", e.currentTarget)}
          >
            <span className="band-field-icon">{"{ }"}</span> Field
          </button>
          <button
            aria-label="Image"
            title="Image"
            aria-expanded={menu === "image"}
            onClick={(e) => open("image", e.currentTarget)}
          >
            <Icon name="image" />
          </button>
          <span className="band-separator" />
          <span className="band-shared-count">
            Shared on {Math.max(0, pageCount - (hf.showOnCover ? 0 : 1))} pages
          </span>
          <button className="band-done" onClick={() => done(true)}>
            Done
          </button>
        </EditBar>
      )}
      {menu && (
        <ToolbarPopover
          className={`band-popover band-popover-${menu}`}
          trigger={trigger}
          close={() => setMenu(null)}
        >
          {menu === "more" ? (
            <div
              role="menu"
              aria-label={`${kind} actions`}
              onKeyDown={menuKeys}
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  begin();
                }}
              >
                Edit shared {kind}
              </button>
            </div>
          ) : menu === "layout" ? (
            <LayoutMenu
              value={band.layout}
              onPick={(layout) => {
                patch(changeBandLayout(band, layout));
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
                          slot: column.current ?? band.slots.length - 1,
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
                      slot: column.current ?? band.slots.length - 1,
                    },
                  });
                  setMenu(null);
                }}
              >
                Use workspace logo
              </button>
              {band.image && (
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
        </ToolbarPopover>
      )}
    </div>
  );
}
