# Header & footer: owner decisions (3 Nov 2026)

These override `specs/header-footer.md` and the Redesign 13 file where they differ.
The editor v2 references (Redesign 10/11, editor-v2.md, tokens, icons) live in `design/editor-v2/`.

1. **Client web page:**
   - On desktop (≥1100px), the client page draws each page as a Letter sheet with its header and footer, matching the PDF (frame 3a), scaled to fit the document column.
   - Below 1100px (tablet and phone), the client page stays the current flowing layout with no bands.
   - Choosing options can change totals and conditional clauses, but client sheets keep the published PagePlan breaks, matching the sealed PDF for that selection. No client-computed pagination is accepted or persisted. This owner clarification in PR #61 supersedes the initial live-repagination requirement; signing stays unchanged.
2. **Existing data:** every proposal and template is a test, so there is no backward-compatibility requirement.
   - Proposals and templates without `header_footer` get the defaults when loaded.
   - Frozen versions without `header_footer` still render without bands, so a sealed PDF never changes.
3. **Defaults:**
   - Header (50/50): logo + `{{workspace.name}}` | `{{proposal.title}}`.
   - Footer (50/50): "Prepared for `{{client.company}}`" | "Page `{{page.number}}` of `{{page.count}}`".
   - Each template in Studio → Templates holds its own header/footer settings and shared bands, edited in the template editor.
   - New templates start from these defaults. A new proposal copies its template's settings.
4. **Image button:** the band edit bar includes Image (spec §4.2), styled exactly like the other edit bar buttons, in the same place in the header and footer bars.
5. **Safe defaults:**
   - **Storage:** `header_footer` lives in proposal/template JSON data, next to `style_overrides`; no SQL migration.
   - **Versions:** it is frozen into each version and its hash.
   - **Geometry:** it lives in a new `src/lib/page-bands.ts`, built on `pageMetrics()`, and is used by the editor, pagination and PDF. Pages can have different heights (the cover differs).
   - **Image:** `Band.image` is `{ src, alt, slot }`, like image blocks. There is no asset store.
   - **Line:** it toggles the single `divider` setting.
   - **Anchors:**
     - a page that starts at an explicit break uses that page_break's id
     - otherwise, the id of the block that starts the page
     - page 1 is `cover`
     - every repeated non-cover start is suffixed: `id`, `id#2`, `id#3`, and so on (two starts already need distinct keys)
   - **Page count:** `{{page.count}}` counts proposal pages only. The certificate page has no bands.
   - **Templates:** they also store `showHeader`/`showFooter`. Templates have no per-page overrides.
   - **Styles tab:** it becomes the accordions shown in 1i (Text styles, Page & margins, Header & footer). Existing controls are unchanged.
   - **Live editing:** band edits go live on the same link and lock after a signature.
   - **AI connector:** it gets no header/footer tools.
   - **File names:** `pages-outline.tsx` in the spec is `src/components/editor/sections-nav.tsx`.
6. **Build order:**
   - PR 1: model and pagination
   - PR 2: editing shared bands
   - PR 3: overrides, cover pill, Sections markers, tablet/phone editor
   - PR 4: client desktop sheets

7. **PR 3 owner clarifications:**
   - Header and footer collisions resolve independently. An exact match to the page's current anchor wins; otherwise the earlier anchor in document order wins and is re-keyed to the current page anchor. Other entries are dropped with the eight-second removed-band Undo toast. A deleted anchor does not transfer over an existing destination override.
   - Editing a hidden band creates an empty unique band with the shared layout; Undo restores `hidden`. A hidden band's menu has Edit and Use shared only.
   - “Shared on N pages” includes only pages actually showing shared content. Unique and hidden bands are excluded. Styles states the exclusions (`· 1 unique`, `· 1 hidden`, or both); edit bars, menus and the phone header use the same shared N. Frame 1i's Footer “8” was a design slip.

8. **Owner review: margin bands, direct editing, images and cover (4 Nov 2026):**
   - **Precedence:** these decisions replace the older geometry, band-image representation and editing entry steps above, and override `specs/header-footer.md` where they differ.
   - **Margin geometry:** content is always the page minus margins, with bands on, off or hidden. Header top and footer bottom sit at **Distance from edge**, with choices 0.25 / 0.3 / 0.4 in and default 0.3 in. Remove Band height from the UI. The helper is “Headers and footers sit in the page margins. Page content keeps its space. Headers, footers and images are sized to fit their margins.”
   - **Computed band height:** one non-wrapping 12px/16px text line, with ellipsis; height is `max(16px, tallest stored image height) + (divider ? 1px : 0px) + 6px` (padding on the content-facing side). Keep an 8px minimum content gap. **owner: max height for now; may revisit later** Bands never consume content space. Maximum total band height is `max(0, margin - distance - 8px)`, including divider and its 6px padding. Clamp inserted/resized images to the remaining height. If margins/distance later reduce it, preserve the stored image size and render it smaller. Hidden, on and off have identical content heights. Keep the shared geometry in `src/lib/page-bands.ts` for editor, browser pagination, PDF and client sheets. Stored settings migrate to the distance setting, with tolerant parsing of old fields; PagePlan is unchanged.
   - **Direct editing:** one click/tap enters a header/footer with its caret at the click point on every device. Remove the separate Edit button; retain label pills, the actions menu and its editing commands. Enter edits; Esc, Done and click-outside exit.
   - **Shared image controls:** block images, cover logos and band images all select on click with a 1.5px `#9DB3A8` outline and four 10px corner handles with 44px hit areas. Corner resizing always locks aspect ratio and displays live dimensions. Minimum height is 16px; maximum width is the available column/content width. Block images store width as a content-width percentage; cover and band images store height in CSS pixels at 96dpi. Editor, client sheets and PDF render those sizes consistently. Changes use editor history and normal live publication.
   - **Image actions and keyboard:** selected-image EditBar offers Replace, Alt text, Align (block images only), Reset size and Delete. Delete/Backspace removes; Tab focuses, Enter selects, Shift+Arrow resizes proportionally in 10px steps and Esc deselects. Support tablet/phone touch resizing.
   - **Inline band images:** replace `Band.image` with an inline RichText node `{ type: 'image', attrs: { src, alt, height } }`. Migrate each old image to the start of its slot. Keep `workspace-logo` as a valid reserved source. Upload/Image inserts at the caret, falling back to the end of the last column. Dragging moves images to any caret in the same band, across columns, with an insertion caret; Cmd/Ctrl-X and Cmd/Ctrl-V provide the keyboard alternative. Lossless layout conversion moves images with the slot content.
   - **Cover:** defaults are logo, `{{workspace.name}}`, proposal title, “Prepared for `{{client.company}}`”, and `{{proposal.validity}}`, in that order. Remove the default sender line and the separate “Proposal for …” eyebrow; lines remain editable/removable. The cover is its own page: new manual/template/AI drafts start content on page 2, inserting a leading content `page_break` when absent. Apply cover defaults to existing proposals/templates whose cover is unset or exactly the old default. Data is test data.
   - **Chevrons:** use Font Awesome 6 Solid chevron-left/right/up/down through the existing Icon component for site-wide disclosures and collapse controls. Use 12px muted-ink icons in 13–14px rows; accordions use right when closed and down when open. Remove text disclosure glyphs `▾ ▴ ▸ « »` and forward `›` indicators. Keep `‹` back buttons and `⋯` menus.
   - **Scope and acceptance:** each of the six owner-review items ships in its own implementation commit. Stripe/billing, readiness, signing and PagePlan format remain unchanged. Verify exact margin overflow math, consistent rendering, direct editing, image selection/resize/move/history/keyboard/touch, new cover creation paths and source-level chevron coverage; run the full existing suite. PR evidence includes the requested 1440px states and a 375px touch-resize capture.

9. **Owner review 2: editable covers, toolbar sizing, disclosures and independent band stacks:**
   - **Precedence:** these decisions override earlier sections, including §8's fixed content-space rule.
   - **Owner clarification in PR #64:** the cover title may contain rich text and fields in cover JSON while `proposal.title` remains plain-text record metadata. Editing the title updates that metadata; Remove line hides the title only on the cover and keeps the record title. Preserve the existing 300-character title limit.
   - **Cover elements:** logo, workspace, title, prepared-for, validity and added lines are individually selectable/editable. Cover text uses a dark EditBar with bold/italic, alignment, shared spacing controls, fields and Remove line / Add line below. Store each element's alignment and space above/below in cover JSON. Text spacing accepts 0–200px in 4px steps, with steppers and live preview. Logo controls also offer alignment and spacing; horizontal drag stores alignment or a free CSS-pixel offset, snapping within 8px to left/center/right with a `#9DB3A8` guide. Existing covers retain their current appearance. Cover edits publish through the existing unsigned save path and freeze in versions; undo/redo applies.
   - **Image toolbar:** intrinsic content width, no wrapping/clipping, independent of image size. Position above the image, clamp inside sheet/viewport, and flip below when necessary. Applies to body, band and cover images.
   - **Disclosure chevrons:** a dedicated 10px heavy FA6 Solid right chevron rotates 90° over 120ms when expanded. Use for all disclosures, including Quote rows and native details. Dropdown/select arrows and left/right panel controls remain unchanged.
   - **Independent stacks:** Header and Footer each have distance 0.25/0.3/0.4/0.5in (default inherited 0.3in), fixed content height Small 0.25in / Medium 0.4in / Large 0.6in / X-Large 0.8in (default Small), space by line 0–24px (default 6), and space to content 0–48px (default 8). Keep one shared divider switch. Cap band images to the content height.
   - **Effective margins:** top is `max(configured top margin, header distance + content height + space by line + divider thickness + space to content)`; bottom uses the independent footer stack. Apply on every page, including cover and hidden pages, regardless of per-page visibility. Only turning a band's global switch off removes its stack. Shared geometry in `src/lib/page-bands.ts` serves all renderers/pagination, with tolerant old JSON parsing and unchanged PagePlan format. Styles reports whether each base margin fits or grows.
   - **Scope:** separate commits per item; full automated suite plus requested 1440px evidence and a 375px cover edit-bar capture. No Stripe/billing, readiness, signing or PagePlan format changes. Do not wait for GitHub CI.

10. **Owner review 3: cover editing, page-limited spacing, independent band sections and responsive access:**
    - These decisions override §8–§9 where they differ. Build each requested item in its own commit. Signing, provider billing, readiness and PagePlan format remain unchanged.
    - Every edit-bar menu/popover uses app UI typography, regardless of the selected document element. Cover/band bold, italic and field insertion preserve the active range/caret through autosave. Cover fields show editor chips and resolve to plain values in client/PDF rendering.
    - Cover spacing applies to logo, workspace, title, prepared-for, validity and added lines in editor/client/PDF. Shared spacing controls are sliders with small px inputs, live feedback, page-derived limits (no fixed 200px cap), one history step per drag, arrow ±1 / Shift+arrow ±10, and 44px touch targets. Cover spacing cannot push the other cover lines off their page; band spacing retains at least two inches of body content.
    - The Align menu contains per-item Left/Center/Right with the active check, then an All cover items group with Left/Center/Right. Use supplied alignment icons. Remove Align all entries from the cover More menu.
    - Add line below inserts/focuses an empty line at that exact index with its own defaults, persists through reload and renders after editing. Remove affects only that line (title removal hides only the cover title), focuses the previous line, and Undo/Redo retains content, formatting and spacing.
    - Styles and Studio templates have separate Header and Footer accordions, at least 24px apart. Each contains its global switch/shared count, per-band Show on cover, distance, height, content-side spacing, its own divider switch, optional divider-side spacing, and the effective margin note. Existing shared cover/divider flags migrate to both bands for editable settings. Frozen versions preserve their original rendering.
    - Header uses Spacing below header and, when its line is on, Spacing above line. Footer uses Spacing above footer and, when its line is on, Spacing below line. Divider-side spacing is hidden and ignored when that band's line is off. Shared geometry handles both switches independently across all renderers; no PagePlan change.
    - Protect staff pages on the server before rendering, using the same staff membership/session refresh as protected APIs. Signed-out page requests redirect 307 to /login?next=<path+query> with no-store. Public/login/client/OAuth/MCP/API/static routes retain their existing behavior; the mid-session client redirect remains a fallback.
    - On client phones below 700px, use a single 16px + safe-area text inset on each side across reading, pricing, totals, choices, clauses and signing. Keep money on one line, put descriptions/sub-lines below the name, retain 44px controls, and preserve tablet/desktop layouts. Record measured 375/390px before/after insets.
    - Capture the requested desktop cover menus/selection/chips/Styles states, a phone slider, and 375px intro/pricing before/after. Run all new checks and the full suite; hand back the PR without waiting for CI.
