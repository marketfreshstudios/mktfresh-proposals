# Page header & footer: build spec

Source of truth: **`Redesign 13 - Header and Footer.dc.html`** (frames 1a–1l, 2a–2c, 3a and the "spec" card). When this doc and the file disagree, the file wins. This extends `specs/editor-v2.md` (Editor v2). Reuse its tokens, `EditBar`, `PageSheet`, `ToolsPanel`, `SectionsNav`, toasts and `EditorIcon`. Icons: `src/components/icons.json` (`image` was added for this feature) and `specs/editor-icons.json`.

File names below are expected locations. **Verify each against the repo before building, and stop and ask if one doesn't exist.**

---

## 1. Behavior summary

- Each proposal has **one shared header and one shared footer**, copied from the template when the proposal is created.
- Any page can **Make unique to this page** for its header or its footer. The two are independent. The page's copy starts from the shared content.
- **Hide on this page** gives that page a unique *empty* band. The band **keeps its height**, so page breaks don't move.
- **Use shared header/footer** puts a page back on the shared one, after a small confirm. Undo restores it.
- **Cover (page 1)** starts with no header or footer. The cover's content starts at the top margin. Turn them on with the margin pill (1h) or "Show on cover" in Styles.
- A unique band is **anchored to the block that starts its page**, and follows that block when content reflows. If that block is deleted, the band moves to the block that now starts the page. If the page itself disappears, the band is dropped and a toast offers Undo.
- When an anchored band lands on a different page number after a reflow, show the **one-time reflow note** (1k).
- The client view and the PDF render bands as plain text with no editing UI (3a).

## 2. Data model

```ts
type BandLayout = 'left' | 'center' | 'right' | 'half' | 'wide' | 'thirds';
// columns: left/center/right = 1 · half = 1fr 1fr · wide = 3fr 1fr · thirds = 1fr 1fr 1fr
type Band = {
  layout: BandLayout;
  slots: RichTextDoc[];          // length = column count (1, 2 or 3). Same rich-text format as text blocks, with field chips.
  image?: { assetId: string; slot: number }; // usually the logo. Max height 18px at 96dpi.
};
type HeaderFooterSettings = {
  showHeader: boolean;           // default true
  showFooter: boolean;           // default true
  showOnCover: boolean;          // default false
  bandHeightIn: 0.4 | 0.5 | 0.75;// default 0.5
  divider: boolean;              // default true
  shared: { header: Band; footer: Band };
  overrides: Record<string /* anchor blockId */, { header?: Band | 'hidden'; footer?: Band | 'hidden' }>;
};
```
- Store this on the proposal next to the existing style settings (`proposal-styles.tsx` reads them). Templates store `shared`, `bandHeightIn`, `divider` and `showOnCover`.
- `'hidden'` is a unique band with no content. It still reserves its height.
- **Layout change rule:** when you switch to fewer columns, the content of the dropped columns is appended to the last remaining column, so nothing is lost.

## 3. Pagination (editor and PDF must agree)

- Page: Letter, 8.5 × 11 in. The editor renders at 96 px/in at 100%, and every value scales with the sheet.
- **One shared function** (add it to `lib/editor-pages.ts`; `document-print.ts` must call the same function):
  `contentHeight(page) = pageHeight − marginTop − marginBottom − (headerShown(page) ? band + 0.25in : 0) − (footerShown(page) ? band + 0.25in : 0)`
- `headerShown(page)` is false only when `showHeader` is off, or when it's the cover and `showOnCover` is off. A hidden override still counts as shown, because it reserves its space.
- The band sits **inside** the margins: header top = `marginTop`, footer bottom = `pageHeight − marginBottom`. The band-to-content gap is fixed at 0.25 in (24px).
- Page fields: `{{page.number}}` and `{{page.count}}` are resolved per page after pagination. They're only offered in the Field menu while a band is being edited.

## 4. Components

Put new components in `src/components/editor/`.

### 4.1 `PageBand`
```ts
type PageBandProps = {
  kind: 'header' | 'footer'; page: number; pageCount: number;
  band: Band | 'hidden'; source: 'shared' | 'unique';
  sharedCount: number;                 // the "on N pages" number
  heightPx: number; divider: boolean;
  mode: 'rest' | 'hover' | 'editing' | 'print';
  movedFrom?: number;                  // shows the reflow note
  onEdit(): void; onMenu(anchor: HTMLElement): void; onDone(): void;
};
```
- **Position:** `position:absolute; left/right = side margins; top = marginTop` (header) or `bottom = marginBottom` (footer). Height `heightPx`. Grid columns depend on the layout (§2). Column gap 24. `align-items:center`.
- **Text:** 12px/16px body font (9 pt), color `#5F5B53`. Field chips use the existing chip style (`#F0ECE4`, radius 4, padding 0 4px) and show **values**, not labels.
- **Divider:** 1px `#E3DED4` on the edge facing the content (header: bottom, footer: top).
- **States** (use `outline` plus `outline-offset:6px`, never border or padding, so nothing moves):
  - rest · shared: nothing extra.
  - rest · unique: a dark "Unique" tag, 20px tall, 11/600, radius 6, in the margin 6px outside the band edge.
  - rest · hidden: the same tag reading "Hidden".
  - hover/focus: `1px dashed #9DB3A8` outline. A label pill "Header · Shared" (22px, `#EEF3F0`/`#24402F`, 11/600, radius 6) in the margin at the left. **Edit** (dark, 28px) and **⋯** (outline, 28px) in the margin at the right. Hit areas are 44px.
  - Unique hover: outline `1px dashed #1C1B18`, label "Header · Unique to page N" (dark pill).
  - editing: `1.5px solid #9DB3A8` outline. Page body content dims to `opacity:.55`. The `EditBar` shows in the margin.
  - print: band content only.
- **Margin placement:** the header's controls go **above** the band, the footer's go **below**. They never take space from content, so they can't collide with the gutter "+" (left of blocks), the AI ✓ (right of blocks) or the PAGE N gap (outside the sheet).

### 4.2 Band edit bar (`EditBar` variant `band`)
Same component and styling as §5.1 of editor-v2. Order, with 1px separators (`rgba(255,255,255,.16)`, 20px tall, margin 0 4px) between groups:

`B I | Layout ▾ | Line | { } Field | Image | Shared on N pages · Done`

- **Position:** header `bottom:calc(100% + 14px)`; footer `top:calc(100% + 14px)`; `left:-6px`. If the margin is under 0.6 in, flip it inside the page, over the dimmed content.
- "Shared on N pages" appears only for shared bands (12/500, `rgba(255,255,255,.72)`). Unique bands show "Unique to page N".
- **Done**, **Esc**, or a click outside exits.
- **Tablet:** the same bar at 44px tall. **Phone:** docked above the keyboard (`dock:'keyboard'`), as `B I | Layout ▾ | { } Field | Image`, spacer, `⋯`. Done moves to the top bar, whose title is "Header · Shared" and subtitle "Changes show on N pages" (2b).

### 4.3 `LayoutMenu` (1c, 1l)
- 268px wide, radius 12, padding 10, menu shadow. `role="menu"`, with items `role="menuitemradio"`.
- Groups: **1 column** (Left, Center, Right) · **2 columns** (50 / 50, 75 / 25) · **3 columns** (Thirds).
- Each item is a 72×36 preview tile (1.5px border `#DDD8CE`; selected: `#1C1B18` border, `#F3F0EA` fill) with an 11/500 label. The bars inside are 6px tall, `#8A857B`.
- Footnote: "Switching to fewer columns moves the extra content into the last column, so nothing is lost."
- The Layout button's icon is a mini preview of the current layout.

### 4.4 `FieldMenu` (1g, 1l)
- 300px wide, max-height 420, scrolls. A search input at the top (40px tall, radius 10, 14px text).
- Groups in this order: **Page** (Page number, Page count, "Page 3 of 9" inserts both), then the existing groups from `field-options.tsx`: **Client**, **Proposal**, **Sender & workspace**, **Totals**.
- Each row is at least 44px: label 13/600, token in 11px mono at the right, and this proposal's value 12/400 below.
- Picking a field inserts it at the cursor (reuse `useBlockToolbar().insert`), or at the end of the last column if there's no cursor.

### 4.5 `BandMenu` (1d, 1f, 2c)
- 288px, `role="menu"`. Items are at least 52px: title 14/600 plus a 12/400 line below.
- **Shared band:** Edit shared header ("Changes show on all N pages") · Make unique to this page ("Starts as a copy you can change") · Hide on this page ("Leaves an empty band. Page breaks stay put.").
- **Unique band:** Edit this page's header · Use shared header · Hide on this page.
- Footer: the same wording with "footer". Footnote: "↑ ↓ move · Enter pick · Esc close".
- **Phone:** a bottom sheet with 56px rows and a 52px Cancel (2c).

### 4.6 `UseSharedConfirm` (1f)
- A 304px popover in the menu's place: "Use the shared header on page N?", then "This page's own header will be replaced by the shared one. You can undo this." Buttons: Cancel (outline) and **Use shared header** (dark), both 36px tall with 44px hit areas.
- On confirm: remove the override and show the toast "Page N now uses the shared header · Undo" (8s). Cmd/Ctrl-Z also restores it through the existing editor history.

### 4.7 Cover pill (1h)
- On hover or focus of the cover's top margin (bottom margin for the footer), show a 30px pill "+ Use shared header" (dashed `#9DB3A8` border, `#24402F` text) centered in the margin, over a faint striped zone. It sets `showOnCover = true`.

### 4.8 Reflow note (1k)
- The Unique tag widens into a 26px pill: [Unique] "Moved here from page 4 with its section" | OK.
- Show it once per move. It clears on OK or on the next edit. `role="status"`. No modal.

### 4.9 Styles tab group (1i), in `proposal-styles.tsx`
Under the "Header & footer" accordion:
- **Header** switch (subtitle "Shared on 7 pages · 1 unique")
- **Footer** switch
- **Show on cover** switch
- **Band height:** segmented 0.4 / 0.5 / 0.75 in, with a helper line
- **Divider line** switch
- **Edit shared header** / **Edit shared footer** buttons, each scrolling to page 2's band and entering edit mode
- **"Pages with their own"** list (Page N · header/footer [hidden], with "Go to"), plus "Use shared on every page"
- **Reset to template:** resets only the shared bands. Pages with their own keep them.

Turning Header or Footer off hides the band on every page and frees its space. Overrides are kept and come back when it's switched on again.

### 4.10 `SectionsNav` marker (1j)
After a page label, a 10×13 page icon (1.2px `#5F5B53` border, radius 2). A filled top bar means a unique header, a filled bottom bar a unique footer, and a dashed bar a hidden band. Shared pages show nothing. Add `aria-label`/`title` ("Unique header", "Footer hidden").

## 5. Keyboard

- Tab order on each page: header band → the page's blocks → footer band. A focused band shows its hover state.
- Enter edits. Shift+F10 or the ⋯ button opens `BandMenu`. In menus, ↑ ↓ move, Enter picks, and Esc closes and returns focus to the trigger. Esc while editing returns focus to the band.

## 6. Client view and PDF (3a)

- `document-print.ts` and the client page render bands with the same geometry. Fields are resolved to plain text, with no chips, outlines or tags.
- The client page draws each sheet at Letter geometry, scaled to fit the screen. There's no editing UI.

## 7. Acceptance checks

- [ ] A Playwright check per page: the editor sheet's content-area height equals the PDF's content-area height (±1px), for band heights 0.4, 0.5 and 0.75, with the header and footer each on and off.
- [ ] Hovering or focusing a band changes no element's `getBoundingClientRect()` on the page.
- [ ] "Hide on this page" does not change any page break.
- [ ] "Make unique" → edit → "Use shared header" → Undo restores the edited unique content.
- [ ] A reflow that pushes an anchored block to the next page moves its unique band and shows the note once.
- [ ] Switching from Thirds to 1 column keeps all slot content.
- [ ] Every touch target is ≥ 44px, and the menus pass an axe check.
- [ ] Page 3 of the PDF matches frame 3a at 1:1 (margins 72, band 48, gap 24, content 768).

## 8. Build order (3 PRs)

1. **Model + pagination:** the data model, migration (defaults; cover off), the shared `contentHeight`, PDF rendering of shared bands, Styles switches and band height.
2. **Editing:** `PageBand` states, the band `EditBar`, `LayoutMenu`, `FieldMenu`, page fields, Edit shared.
3. **Overrides:** `BandMenu`, Make unique, Hide, `UseSharedConfirm` + Undo, anchoring and the reflow note, `SectionsNav` markers, the cover pill, and tablet/phone (2a–2c).
