"use client";
import { Select } from "./form-controls";
import { useEffect, useRef, useState } from "react";
import { Disclosure, Field, Button, post } from "./ui";
import { SpacingInput } from "./editor/spacing-input";
import { ColorPicker } from "./color-picker";
import {
  applyCoverLayout,
  coverElements,
  defaultCover,
  type Cover,
} from "../lib/cover";
import {
  coverLayouts,
  coverLayoutNames,
  defaultCoverBackground,
  coverPatterns,
} from "../lib/cover-layout";
import type { WorkspaceSettings } from "../lib/workspace";
import { coverPresentation } from "../lib/cover-graphics";
const names = {
  plain: "Plain",
  ring: "Ring",
  waves: "Waves",
  dots: "Dot grid",
  orbits: "Orbits",
  corners: "Corners",
  solid: "Solid color",
  image: "Upload image",
};
export function CoverSettings({
  value,
  onChange,
  settings,
}: {
  value?: Cover;
  onChange: (cover: Cover) => void;
  settings?: WorkspaceSettings | null;
}) {
  const cover = value ?? defaultCover(true),
    layout = cover.layout ?? "custom",
    b = cover.background ?? defaultCoverBackground(layout);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [iconWidth, setIconWidth] = useState(settings?.logo_icon?.width ?? 0);
  const backgroundFile = useRef<HTMLInputElement>(null),
    graphicFile = useRef<HTMLInputElement>(null);
  const icon = settings?.logo_icon
    ? `/api/workspace-icon?size=original&v=${encodeURIComponent(settings.logo_icon.path)}`
    : undefined;
  useEffect(() => {
    setIconWidth(settings?.logo_icon?.width ?? 0);
    if (!icon) return;
    let active = true;
    const img = new Image();
    img.onload = () =>
      active && setIconWidth(Math.min(img.naturalWidth, img.naturalHeight));
    img.src = icon;
    return () => {
      active = false;
    };
  }, [icon, settings?.logo_icon?.width]);
  const change = (patch: Partial<NonNullable<Cover["background"]>>) =>
    onChange({ ...cover, background: { ...b, ...patch } });
  const upload = async (file: File | undefined, graphic = false) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!["image/png", "image/jpeg"].includes(file.type))
        throw new Error("Choose a PNG or JPEG image");
      if (file.size >= 700000) throw new Error("Choose an image under 700 KB");
      const image = await new Promise<string>((ok, bad) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = bad;
        r.readAsDataURL(file);
      });
      const result = await post("/api/cover-image", { image });
      change(
        graphic
          ? { graphic: "upload", graphic_image: result.image }
          : { type: "image", image: result.image },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const color = b.color ?? settings?.accent_colour ?? "#365c4a",
    elements = coverElements(cover, ""),
    appearance = coverPresentation(cover, settings?.accent_colour),
    usesColor =
      ["split", "bold", "photo"].includes(layout) ||
      ["solid", "waves", "orbits", "ring", "dots", "corners"].includes(b.type),
    text =
      layout === "split" && !appearance.backdrop
        ? appearance.panelText
        : appearance.text;
  return (
    <details className="style-accordion cover-settings-accordion">
      <Disclosure>Cover</Disclosure>
      <div className="cover-settings">
        <Field label="Cover layout">
          <Select
            aria-label="Cover layout"
            value={layout}
            onChange={(e) =>
              onChange(
                applyCoverLayout(
                  cover,
                  e.target.value as (typeof coverLayouts)[number],
                ),
              )
            }
          >
            {layout === "custom" && (
              <option value="custom">Custom · existing arrangement</option>
            )}
            {coverLayouts.map((v) => (
              <option key={v} value={v}>
                {coverLayoutNames[v]}
              </option>
            ))}
          </Select>
        </Field>
        <p className="muted">
          Layouts keep your editable fields. Undo restores the previous
          arrangement.
        </p>
        {layout !== "custom" && (
          <>
            <Field label="Background">
              <Select
                aria-label="Cover background"
                value={b.type}
                onChange={(e) =>
                  change({ type: e.target.value as typeof b.type })
                }
              >
                {[...coverPatterns, "solid", "image"].map((type) => (
                  <option key={type} value={type}>
                    {names[type as keyof typeof names]}
                  </option>
                ))}
              </Select>
            </Field>
            {usesColor && (
              <div className="field">
                <span>
                  {layout === "split" ? "Panel color" : "Background color"}
                </span>
                <ColorPicker
                  label={layout === "split" ? "Panel" : "Background"}
                  value={color}
                  settings={settings}
                  onChange={(color) => change({ color })}
                />
                <span className="muted">
                  {text === "#ffffff" ? "White" : "Ink"} text on{" "}
                  {layout === "split" && !appearance.backdrop
                    ? "the panel"
                    : "the cover"}{" "}
                  · AA contrast
                </span>
              </div>
            )}
            {b.type === "image" && (
              <>
                <input
                  ref={backgroundFile}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg"
                  aria-label="Upload cover background"
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => backgroundFile.current?.click()}
                >
                  {b.image
                    ? "Replace background image"
                    : "Upload background image"}
                </Button>
                <p className="muted">
                  PNG/JPG under 700 KB. 2550 × 3300 recommended.
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={!!b.finished}
                    onChange={(e) => change({ finished: e.target.checked })}
                  />
                  Finished full-page design
                </label>
                {b.image && (
                  <>
                    <div
                      className="cover-focal-picker"
                      role="button"
                      tabIndex={0}
                      aria-label="Set image focal point"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        change({
                          focal: {
                            x: Math.max(
                              0,
                              Math.min(
                                100,
                                ((e.clientX - r.left) / r.width) * 100,
                              ),
                            ),
                            y: Math.max(
                              0,
                              Math.min(
                                100,
                                ((e.clientY - r.top) / r.height) * 100,
                              ),
                            ),
                          },
                        });
                      }}
                      onKeyDown={(e) => {
                        const key = e.key;
                        if (!key.startsWith("Arrow")) return;
                        e.preventDefault();
                        change({
                          focal: {
                            x: Math.max(
                              0,
                              Math.min(
                                100,
                                (b.focal?.x ?? 50) +
                                  (key === "ArrowLeft"
                                    ? -5
                                    : key === "ArrowRight"
                                      ? 5
                                      : 0),
                              ),
                            ),
                            y: Math.max(
                              0,
                              Math.min(
                                100,
                                (b.focal?.y ?? 50) +
                                  (key === "ArrowUp"
                                    ? -5
                                    : key === "ArrowDown"
                                      ? 5
                                      : 0),
                              ),
                            ),
                          },
                        });
                      }}
                    >
                      <img alt="Cover background focal point" src={b.image} />
                      <span
                        style={{
                          left: `${b.focal?.x ?? 50}%`,
                          top: `${b.focal?.y ?? 50}%`,
                        }}
                      >
                        ＋
                      </span>
                    </div>
                    <SpacingInput
                      label="Focal point X"
                      unit="%"
                      value={b.focal?.x ?? 50}
                      max={100}
                      onChange={(x) =>
                        change({ focal: { x, y: b.focal?.y ?? 50 } })
                      }
                    />
                    <SpacingInput
                      label="Focal point Y"
                      unit="%"
                      value={b.focal?.y ?? 50}
                      max={100}
                      onChange={(y) =>
                        change({ focal: { x: b.focal?.x ?? 50, y } })
                      }
                    />
                  </>
                )}
              </>
            )}
            <Field label="Graphic">
              <Select
                aria-label="Cover graphic"
                value={
                  b.graphic === "logo-icon" && iconWidth < 1024
                    ? "auto"
                    : (b.graphic ?? "auto")
                }
                onChange={(e) =>
                  change({ graphic: e.target.value as typeof b.graphic })
                }
              >
                <option value="auto">Automatic · logo icon or built-in</option>
                {iconWidth >= 1024 && (
                  <option value="logo-icon">Logo icon</option>
                )}
                {coverPatterns
                  .filter((v) => v !== "plain")
                  .map((v) => (
                    <option key={v} value={v}>
                      {names[v]}
                    </option>
                  ))}
                <option value="upload">Upload image</option>
                <option value="none">None</option>
              </Select>
            </Field>
            {iconWidth < 1024 && (
              <p className="muted">
                Upload a 1024×1024 or larger icon to use it as the cover graphic
              </p>
            )}
            {b.graphic === "upload" && (
              <>
                <input
                  ref={graphicFile}
                  type="file"
                  hidden
                  accept="image/png,image/jpeg"
                  aria-label="Upload cover graphic"
                  onChange={(e) => void upload(e.target.files?.[0], true)}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => graphicFile.current?.click()}
                >
                  Upload graphic image
                </Button>
              </>
            )}
            {(b.graphic ?? "auto") !== "none" && (
              <>
                <SpacingInput
                  label="Opacity (%)"
                  unit="%"
                  value={appearance.opacity * 100}
                  max={40}
                  onChange={(opacity) => change({ opacity: opacity / 100 })}
                />
                <SpacingInput
                  label="Size (px)"
                  min={300}
                  max={700}
                  value={appearance.size}
                  onChange={(size) => change({ size })}
                />
              </>
            )}
            <details>
              <Disclosure>Meta labels</Disclosure>
              {elements
                .filter((e) => e.label !== undefined)
                .map((e) => (
                  <Field key={e.id} label={`Label · ${e.label || e.id}`}>
                    <input
                      aria-label={`Cover label ${e.id}`}
                      value={e.label}
                      onChange={(event) =>
                        onChange({
                          ...cover,
                          elements: elements.map((v) =>
                            v.id === e.id
                              ? { ...v, label: event.target.value }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
            </details>
            <details>
              <Disclosure>Visible elements</Disclosure>
              {elements.map((e) => (
                <label className="check-row" key={e.id}>
                  <input
                    type="checkbox"
                    checked={!e.hidden}
                    onChange={(event) =>
                      onChange({
                        ...cover,
                        elements: elements.map((v) =>
                          v.id === e.id
                            ? { ...v, hidden: !event.target.checked }
                            : v,
                        ),
                      })
                    }
                  />
                  {e.label || e.kind}
                </label>
              ))}
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
