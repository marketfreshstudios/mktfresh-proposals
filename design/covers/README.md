# Cover designs and header default

Owner-approved direction, 6 Nov 2026. The `.dc.html` files here are the design reference (Claude Design canvas "Yeswell cover designs"); open them in a browser. They use placeholder content (Example Studio, Harbor & Pine Dental) and a placeholder wordmark standing in for an uploaded logo. Precedence: this README › the artboards.

## 1. Page header (Header.dc.html)

- Every page reserves the header band's full height plus its gap before body content (editor, client page, PDF). A heading at the top of a page must never draw under the header rule. Owner saw this on the Website design & build starter, page 2.
- Default header left side: the wide logo if uploaded; otherwise the logo icon + workspace name; otherwise the workspace name. Never logo + name by default. Staff can still add both in Styles › Header & footer. Right side: proposal title.

## 2. Logo on the cover (all layouts)

The cover's logo element resolves, in order:
1. The uploaded wide logo, as one image (never icon + text when a wide logo exists).
2. Only a logo icon uploaded: the logo icon + the workspace name as text.
3. Neither: the workspace name as text.

Staff can replace the cover logo per template or proposal (existing cover logo field), and can hide it.

## 3. Layouts

Five cover layouts. A template picks one; a proposal inherits it and can change it. Each layout is a starting arrangement of the existing cover elements (logo, eyebrow, title, prepared for, prepared by/byline, date, validity, extra); staff can still edit, hide and reposition elements as today.

| Layout | Artboard | Background default | Notes |
| --- | --- | --- | --- |
| 1 Editorial (default for new templates and all six starters) | Main.dc.html | White + **logo-mark watermark** top-right | Title large in the lower half, short accent rule under it, 4-column meta row (Prepared for · Prepared by · Date · Valid until) above the bottom margin |
| 2 Split panel | Split.dc.html | Left 296px panel in brand color + **logo-mark watermark** bottom of the panel | Logo, Prepared by, Date, Valid until in the panel; eyebrow, title, Prepared for on the right |
| 3 Full color | Bold.dc.html | Brand color + Waves graphic | White text; meta row at the bottom |
| 4 Photo / uploaded design | Photo.dc.html | Uploaded image top ~64%, brand-colour band with the text below | Logo in a white chip top-left |
| 5 Centered minimal | Centered.dc.html | Warm paper + thin frame | Everything centered |

Meta labels are small caps-style labels (11px, 600, 0.12em tracking, uppercase) above values (14px). Title: heading font, 700, tight leading (≈1.04), slight negative tracking; sizes as drawn (64px Editorial). Text color flips to white or ink automatically so it passes 4.5:1 on whatever background is chosen.

## 4. Cover graphic (watermark) — layouts 1 and 2

- Default graphic is the workspace's **logo icon**, drawn large and cropped by the page edge (Editorial: ~480px square, offset so roughly a third bleeds off the top-right corner; Split: ~420px, bleeding off the panel's right and bottom).
- Controls (cover settings): **Graphic** = Logo icon (default when uploaded) · one of the built-in graphics · Upload image · None; **Opacity** 0–40% (defaults: 8% on white, 12% on a brand-colour panel); **Size** S / M / L (or a slider, 300–700px); position stays as designed per layout.
- No logo icon uploaded: default to the built-in Ring (Editorial) / Orbits (Split) graphic.
- Logo icon resolution: the current icon minimum (128×128) is too small for a ~700px watermark. Require **at least 1024×1024** for an icon to be offered as the cover graphic; a smaller icon still works everywhere else, and the cover settings show "Upload a 1024×1024 or larger icon to use it as the cover graphic". Prefer PNG with transparency. Raise the Brand upload hint accordingly ("square, at least 1024×1024 for cover graphics").
- The graphic is tinted to the background: on white it uses the icon's own colors at the chosen opacity; a recolour option is not needed now.

## 5. Backgrounds (Backgrounds.dc.html)

- Background options per cover: Plain · Ring · Waves · Dot grid · Orbits · Corners (built-in, drawn as SVG in the chosen brand color) · Solid color · Upload image (photo or a finished full-page design, PNG/JPG, 2550×3300 recommended, with a focal-point picker for photos) · and for an uploaded finished design, elements can be hidden so only chosen fields sit on top.
- Built-in graphics are vector (SVG in code), so they print sharp in the PDF.
- Uploaded images follow existing upload validation (type, size, dimensions, sanitizing); embedded as data or stored like the logo — never an arbitrary remote URL (keep the existing CoverSchema rule).

## 6. Brand colors

- Workspace › Brand gets a **brand palette**: primary (today's accent) plus up to 4 more colors.
- On logo upload, suggest a palette extracted from the logo (dominant non-neutral colors, de-duplicated; ignore near-white/near-black and transparency). Show the suggestions as swatches the Super admin can accept, edit or discard; never overwrite saved colors silently.
- Cover backgrounds, panels and accents default to the primary brand color; color pickers in the template/proposal editor show the brand palette first, then any custom color.
- Contrast: keep the existing "Readable on white" check; for a color used as a background, show the text color it will get.

## 7. Data and compatibility

- Extend the cover data (CoverSchema) with layout, background (type, color, graphic, opacity, size, image, focal point). Keep existing covers rendering exactly as they do today (they are "custom" layout with a plain background) — never rewrite existing proposals or frozen versions.
- The six starters move to layout 1 Editorial. Starters are insert-only and edit-protected; provide an opt-in, targeted script that only updates starters still identical to their seed, and say clearly if hosted SQL is needed.
- PDF output must match the client page (backgrounds, watermark crop, colors).
