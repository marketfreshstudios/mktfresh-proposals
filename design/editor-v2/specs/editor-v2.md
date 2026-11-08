# Proposal editor v2: build spec

Source of truth: **`Redesign 10 - Editor Prototype.dc.html`**. Open it in a browser; every interaction described here is clickable there. When this doc and the prototype disagree, the prototype wins. Tokens come from `src/app/foundation-tokens.css`, and every hex value below maps to a token.

This is a re-layout of the existing editor, not a rewrite of its logic. Keep saving, history, review, readiness, pagination (`PagedPaper`), dnd-kit sorting and the API calls as they are. Change the chrome, the controls and where things live.

---

## 1. Files to change

| Area | Existing file | Change |
|---|---|---|
| Editor shell, header, panels | `src/components/quote-editor.tsx` (`.quote-workspace`, `.quote-editor-top`, `.editor-layout`, `.editor-tabs`) | New header, a collapsible left Sections nav, a collapsible right panel with 4 tabs |
| Block selection + toolbar | `src/components/block-controls.tsx` (`BlockFrame`, `.block-tools`, `.block-insert`, `DocumentFormattingBar`) | Replace the per-block vertical tools **and** the document formatting bar with one floating **edit bar** on the selected block. Add round "+" insert buttons in the left gutter. Add the AI line and review check |
| Formatting buttons | `src/components/formatting-controls.tsx` | Same commands, regrouped into the edit bar. Undo/Redo move to the header |
| Text style picker | `src/components/text-style-picker.tsx` | Becomes the first dropdown in the edit bar: Paragraph, Heading 1, Heading 2, Heading 3 |
| Add-block menu | `src/components/block-menu.tsx` | Keep the options and logic. Restyle it and anchor it to the "+" that opened it |
| Sections nav | `src/components/pages-outline.tsx` | Text-only list grouped by page. Remove the per-page "+" and "×" |
| Fields tab | `src/components/field-options.tsx` (`FieldOptions` variant "panel") | New card layout (§6.2) |
| Styles tab | `src/components/proposal-styles.tsx` | Same controls, new layout (§6.3). US spelling: "Color" |
| Quote tab | `quote-editor.tsx` → `itemCard`, `quotePanel` | Collapsed one-line rows that expand (§6.1) |
| Send tab | `quote-editor.tsx` → `sendPanel` | Restyled checklist + form (§6.4) |
| Paper | `src/components/paged-paper.tsx` | Each PDF page renders as its own white sheet with a 52px gap (§4) |
| CSS | `editor-ux.css`, `editor-round3…6.css`, `editor-polish.css`, `editor-followup.css`, `block-controls.css` | Merge the editor rules into a single `editor.css`. Delete the round-N files once they're unused |

Removed from the editor UI:
- the AI review banner (`.ai-review-banner`)
- the always-on `DocumentFormattingBar`
- the per-block vertical `.block-tools` column
- the "Page N (continued)" outline buttons
- "Pricing reference" (no longer a tab)
- the "Join with previous page" control

---

## 2. Layout (desktop ≥ 1180px)

```
┌ header 56px ──────────────────────────────────────────────────────────────┐
│ ‹ Proposals │ Title  ● Draft · Saved ............ [AI pill] ↶ ↷ [Preview PDF] [Preview as client] [Review & send] │
├───────────┬──────────────────────────────────────────────┬───────────────┤
│ Sections  │  main (scrolls)                              │ Right panel   │
│ 220px     │  sheets max-width 760, centered               │ 400px         │
│           │                                              │ Quote|Fields| │
│           │                                              │ Styles|Send   │
└───────────┴──────────────────────────────────────────────┴───────────────┘
```

- **Page background:** `--surface-page` #F3F0EA.
- **Header, nav and panel:** `--surface` #FBFAF7. Dividers are 1px #E3DED4.
- The app's own left sidebar (`staff-shell`) is hidden on this route.
- Both side columns are `flex:none`, and `main` is `flex:1; min-width:0; overflow:auto; padding:32px 16px 160px`.

### Responsive rules (implement exactly)

- **Window width w ≥ 1180:** Sections open, panel open.
- **960 ≤ w < 1180:** Sections collapsed to a 56px rail, panel open.
- **w < 960:** both collapsed (56px left rail, 64px right rail).
- **Narrow side columns (w < 1180):** opening one side column closes the other.
- **⌘\ / Ctrl+\:** toggles the right panel.
- **Compact mode:** when `mainWidth = w − leftWidth − rightWidth < 760`, the edit bar uses short labels (§5.1).
- **Header (w < 1180):** "Preview PDF" becomes "PDF", "Preview as client" becomes "Preview", and the AI pill drops "· Next ›". Review & send must always be fully visible, so the title is the only element that shrinks (`flex:0 1 auto; min-width:120px; ellipsis`).

---

## 3. Header

Left to right, 10px gap, 0 12px padding:

1. **‹ Proposals:** ghost button, 36px, 13/500, ink-muted, nowrap.
2. **Divider:** 1×20px #DDD8CE.
3. **Title:** 15/600, ellipsis.
4. **Status:** 6px dot #8A857B + "Draft · Saved", 12/500 muted, directly after the title. The save, offline and recovery states replace this text: "Saving…", "Offline · saved on this device", "Unsaved changes recovered".
5. **Spacer** (`flex:1`).
6. **AI pill**, shown only while sections are unreviewed. 34px pill, `--ai-soft` #EEE8FB on #3E2A80, with the `ai` icon and "{n} to review · Next ›".
   - Click: select the next unreviewed AI block and scroll it to 140px from the top of `main`. Reuse `showReview()`.
   - When none are left: a green pill "✓ AI review done" (#E3F1E8 / #146B3F).
7. **Undo / Redo:** 36px icon buttons with curved-arrow icons. Redo is the mirror of undo. Disabled color #B5AFA4. Wire to `useHistoryStatus()`.
8. **Preview PDF:** outline pill, 36px, 1px #DDD8CE. Opens the existing `PdfPreviewViewer`.
9. **Preview as client:** outline pill. Saves, then opens `/p/:id?preview=1`.
10. **Review & send:** primary pill, #1C1B18 on white. Opens the panel on the **Send** tab.

The header has no panel-toggle icons; the arrows inside the panels do that job.

---

## 4. Document sheets (PDF-like pages)

- Split `content` at `page_break` blocks. Each segment renders as a separate sheet:
  - `max-width:760px; margin:0 auto; background:#fff; border-radius:4px; min-height:320px`
  - `box-shadow:0 1px 3px rgba(20,18,14,.08),0 14px 32px rgba(20,18,14,.08)`
  - `padding: clamp(40px,6vw,72px) clamp(52px,6vw,88px) 88px clamp(64px,7vw,88px)`. The left side needs ≥ 64px for the gutter controls and the right side ≥ 52px for the review check.
  - Blocks stack with `gap:12px` (Standard density) or `22px` (Comfortable).
- **Between sheets:** a 52px gap showing the page background, with a centered label "PAGE 2" (11/600, tracking .08em, uppercase, #8A857B). It has no controls. A page break block is removed by selecting and deleting it from the outline, or with undo.
- Automatic overflow pages from `PagedPaper` layout boundaries render the same way.
- Clicking empty sheet space clears the selection.

### Block frame

Every block is wrapped in a frame: `position:relative; padding:6px 10px; margin:0 -10px; border-radius:8px`.

| State | Visual |
|---|---|
| Idle | nothing |
| Selected | `box-shadow:0 0 0 1.5px #9DB3A8`. Shows the edit bar, the gutter controls and (for AI blocks) the review check |
| AI-written (`ai_review` pending) | 3px rounded line at `left:-14px; top:8px; bottom:8px`, color **#9F88E0**. Always visible until reviewed |

Field tokens render as chips: `background:#F0ECE4; border-radius:4px; padding:0 4px`, showing the resolved value. Headings keep field chips too (don't strip tokens when converting paragraph ⇄ heading).

---

## 5. Selected-block controls

### 5.1 Edit bar (one bar; replaces the formatting bar and the block tools)

- **Position:** `position:absolute; left:0; bottom:calc(100% + 8px); z-index:20`. The bar always lines up with the block's left edge so it never covers the top "+" in the gutter.
- **Shape:** `height:40px; padding:0 4px; border-radius:12px; background:#1C1B18; color:#fff; box-shadow:0 10px 28px rgba(20,18,14,.28)`.
- **Single line:** `flex-wrap:nowrap; width:max-content; white-space:nowrap`. Every child is `flex:none`.
- **Clamp:** after every render and on resize, measure the bar against `main`.
  - If the right edge overflows, `translateX` left so the bar ends 12px inside `main`.
  - Never shift the bar left of the block's own left edge. The left edge wins; compact labels keep the bar narrow enough to fit.
- Buttons are 32px tall, radius 8, hover `rgba(255,255,255,.1)`. Group dividers are 1×20px `rgba(255,255,255,.16)`.

Contents, in order:

**Text blocks** (paragraph, heading, lists):
1. **Style dropdown:** label "Paragraph" / "Heading 1|2|3" / "Bulleted list" / "Numbered list" + ▾. Compact labels: ¶ / H1 / H2 / H3 / • / 1.
   - The menu opens below the button (dark, 200px min, radius 12) with: Paragraph ⌥0, Heading 1 ⌥1, Heading 2 ⌥2, Heading 3 ⌥3. Each option is previewed in its own type.
   - Picking one converts the block via `convertTextStyle` and keeps its text and fields.
2. Divider.
3. **Bold** (B), **Italic** (I, serif italic).
4. **Bulleted list:** icon of 3 dots + 3 lines. **Numbered list:** icon of "1 2 3" + 3 lines.
5. **Link:** chain icon, tooltip "Link (⌘K)".
6. **Insert field:** "{ } Field" in mono 12px (compact: "{ }"). aria-label "Insert field". Opens the Fields tab, or the field menu if the panel is closed.
7. Divider.

**Object blocks** (pricing table, contract, signatures, image, cover):
1. Block name, 12/600, at 75% white.
2. Contextual button: "Edit quote" (pricing table; opens the Quote tab) or "Settings" (contract, signatures, image; opens the existing settings sheet).
3. Divider.

**Then for every block:**
- **Move up (↑) / Move down (↓):** disabled at the ends, at 30% white. These map to `moveAdjacentBlock`.
- **Duplicate:** two overlapping squares icon. Maps to `duplicateBlock`.
- **Save:** text button, labeled "Save" with the tooltip "Save for reuse". Opens the existing Save for reuse dialog.
- **Delete:** trash icon in #FF9A90, hover `rgba(255,120,110,.18)`. It runs the existing `remove()`, which confirms for pricing and signature blocks and shows an Undo toast.

AI review is **not** in the edit bar.

### 5.2 Gutter insert controls (left)

- **Column:** `position:absolute; left:-52px; top:0; bottom:0; width:30px`, flex column with space-between.
- **Top:** a round **+** (26px, border 1.5px #365C4A, white fill, accent "+", `margin-top:-13px`, shadow `0 2px 6px rgba(20,18,14,.12)`). aria-label "Add a block above". Hover fills it with the accent and turns the "+" white.
- **Middle:** the ⋮⋮ drag handle (#A39D92, `cursor:grab`), which is the dnd-kit `Sortable` handle.
- **Bottom:** a round **+** (`margin-bottom:-13px`). aria-label "Add a block below".
- **Click:** opens `BlockMenu`, anchored at `left:-52px`, `top:18px` (above) or `top:calc(100% + 18px)` (below).
  - Menu: 320px wide, max-height 420px, scrollable, background #FBFAF7, border #DDD8CE, radius 14, shadow `0 2px 4px rgba(20,18,14,.06),0 16px 40px rgba(20,18,14,.16)`.
  - Its header reads "Add above" or "Add below", with × and a search field.
  - Groups: Text / Media / Proposal / Saved blocks. Each row is 44px min, with a 30px glyph tile, the name (14/600) and a description (12/400).
  - The pricing table row is disabled when one already exists (45% opacity, "Already in this proposal").
  - **Picking:** insert at that edge, select the new block, scroll to it, and close the menu.

### 5.3 AI review check (right)

- Shown only when the block is **selected and AI-written**.
- **Position:** `position:absolute; left:calc(100% + 8px); top:4px; z-index:16`.
- **Shape:** 28px circle, border 1.5px **#9F88E0** (the same color as the line), white fill, "✓" in #6B4FBB. Hover fills #9F88E0 with a white ✓.
- title "Mark reviewed", aria-label "Mark this AI-written block reviewed".
- **Click:** `review([sectionId], true)`. The line and the check disappear, the header count drops, and an Undo toast appears.

Keyboard: `Esc` closes any open menu first, then deselects the block. Selecting a different block closes the style and add menus.

---

## 6. Right panel (400px, collapsible)

- **Header row:** a segmented control (`#ECE8E1` track, 3px padding, radius 10). Active tab: white fill + `0 1px 2px rgba(0,0,0,.08)`, 30px high.
  - Tabs: **Quote · Fields · Styles · Send**.
  - Then a collapse button **»**: 32px, `border:1px solid #DDD8CE; border-radius:8px; background:#fff; box-shadow:0 1px 2px rgba(20,18,14,.06)`, hover #ECE8E1.
- **Collapsed:** a 64px rail with:
  - an **«** button (same style) at the top
  - 4 stacked tab buttons (56×48, glyph + 10px label: `$` Quote, `{ }` Fields, `Aa` Styles, `➝` Send). Each one opens the panel on that tab.
  - at the bottom, the totals as vertical text: "$1,150 · $260/mo"
- **Sections nav:** collapses the same way.
  - The header row has "Sections" and a **«** button. Collapsed, it's a 56px rail with **»**.
  - Items: page labels (11/600 uppercase #8A857B), then section buttons (32px, 13/500 muted; current section 13/600 ink with a 2px accent left border). A 6px #5B3FA8 dot marks unreviewed AI content.
  - At the bottom, "+ Add page" (dashed).

### 6.1 Quote tab

- **Intro line** (12/400 muted): "Enter agreed prices. The app never sets prices. Drag ⋮⋮ to reorder; the client sees this order."
- **Units:** a choice group, or a single item. A choice group has a 2px #365C4A left rail, 10px left padding, a "CHOOSE ONE" header (11/600 accent) and an **Unlink** button.
- **Collapsed row:** 52px min, a ⋮⋮ handle, then name (14/600, ellipsis) over a tag (12/500), then the amount (14/600 tabular) and ▾.
  - Tags: "Choose one · default", "Choose one", "Required · custom line" (#7A4800), "Optional · ticked for client", "Optional · not ticked", "Required".
  - An 8px #5B3FA8 dot marks an AI price that differs from list.
  - Amounts are formatted per spec: whole dollars, or cents only when present. Recurring amounts carry /mo or /yr, and sub-lines join with " + " (for example "$500 + $175/mo").
- **Expanded row** (one at a time): white card with 1px #DDD8CE border, radius 12 and a light shadow. It contains:
  - name input and description textarea
  - per sub-line, a grid `72px | minmax(0,1fr) | 40px | 104px` of label, $ amount, quantity and interval select (One-time / Monthly / Yearly)
  - plan terms note (#F3F0EA well)
  - AI price card ("Claude entered $250. The product list price is $295." with **Use $295** and **Keep $250**)
  - an option row: Optional switch, "Ticked for client" checkbox (or the "Selected for client" radio inside a group), and a "Link as alternative" chip
  - a footer row: + Sub-line · Details · (spacer) · Remove (#A3261E). **Details** reveals the Stripe lookup key and QuickBooks item fields plus "Plan terms come from Products."
- **Add row:** dashed "+ Add product" (opens a catalog list) and "+ Custom".
- **Sticky footer:** "CLIENT SEES BY DEFAULT", then One-time and Monthly at 24/650 tabular, then "Across all choices · $a–$b one-time · $c–$d/mo". Use `quoteRange()`.

### 6.2 Fields tab

- **Hint:** "Choose a field to insert it at the end of the selected text. Or type {{ in any paragraph." If nothing is selected: "Click into a paragraph, then choose a field…"
- **Search:** 40px high, full width, `flex:none` so the flex column doesn't squash it.
- **Groups:** Client / Proposal / Sender & workspace / Totals.
- **Cards:** `flex:none`, 1px #E8E4DC, radius 10, padding 8px 10px. Line 1 is the label (13/600) with the token right next to it in mono 11px #5B3FA8. Line 2 is the resolved value (12/400 muted, ellipsis). The cards have no "Insert" text: the whole card is the button. Hover: border #9DB3A8, background #F7FAF8.
- **Click:** inserts `{{path}}` at the cursor, or at the end if there's no cursor. Reuse `useBlockToolbar().insert`. With no text target, show the toast "Click into a paragraph first, then choose a field".

### 6.3 Styles tab

Order:
1. Note: "Changes apply to this proposal only…"
2. **Density** segmented control: Standard / Comfortable.
3. **Page margins (inches):** a 4-column grid (Top, Right, Bottom, Left).
4. Divider.
5. **Text level** select.
6. **Font** (grouped Serif / Sans / Monospace / Uploaded) + **Size (px)** in an 80px column.
7. **Color:** 3 swatch buttons (Ink / Accent / Custom), the selected one with a 2px accent border, plus the contrast line "x.x:1 against white paper · Passes contrast".
8. **Weight / Space above / Space below:** 3 columns.
9. Divider.
10. **Sample** header with "Reset to template", then the sample card.

Every change applies live to the sheets.

### 6.4 Send tab

- **Readiness list:**
  - Blockers (#FBE9E7 / #7A1C15, a "!" badge): the AI blocker lists the unreviewed section names and has the checkbox "I've reviewed these AI-written sections" and a **Show me** link.
  - Warnings (#FBEEDB / #5C3600, a "?" badge).
  - Success (#E3F1E8 / #0F4F2E, a "✓" badge).
- **Form:** Valid until, From (staff select), To (read-only), Subject, Note, "Subject and note start from your Proposal sent email…", and a **Require a password** switch.
- **Sticky footer:** **Preview as client** (outline) and **Send to {first name}** (primary, `flex:1`, 44px). When blocked, the button is disabled (#D8D3CA / #5F5B53) with a red reason line under it.

---

## 6.5 Tablet and phone

Reference: **`Redesign 11 - Editor v2 Tablet and Phone.dc.html`** (frames 1a–1f). These frames use the same components as desktop; only where they dock changes.

**Tablet (700–959px):**
- Sections is a 56px rail and the panel is a 64px rail (1a).
- Header labels shorten: "PDF", "Preview", and the AI pill reads "{n} to review".
- Opening a tab slides a **440px overlay drawer** in from the right over a `rgba(20,18,14,.28)` scrim (1b). It doesn't push the page. Close it with », by tapping the scrim, or with Esc.
- The edit bar and gutter controls work as on desktop.

**Phone (< 700px):**
- **Header (52px):** ‹ back (44px), title with "Draft · Saved" under it, the AI pill, and a ⋯ menu (Preview PDF, Preview as client, Undo, Redo, Sections).
- **Pages:** sheets go full width with `padding:24px 36px 28px 40px` and 12px page gaps with a "PAGE N" label.
- **Bottom dock (not editing):** 4 slots: **Quote** (shows live totals "$1,150 · $260/mo", wider), Fields, Styles, and **Send** (dark). Each opens a bottom sheet (1c).
- **Editing a block (1d):**
  - The header becomes "‹ {section} … Done".
  - The **edit bar docks above the keyboard**: 48px high, #1C1B18, single line, scrolls sideways with a right-edge fade. It has the same buttons and order as desktop, with 44px targets.
  - Insert controls are pills centered on the block's top and bottom edges ("+ Add above" / "+ Add below"), 32px tall, because there's no gutter.
  - AI blocks keep the left line. The ✓ is a 32px circle at the block's top-right corner.
- **Block menu (1e):** a bottom sheet titled "Add above" or "Add below" with Cancel, a 44px search, the same groups, and 52px rows.
- **Panel sheets (1f):** a bottom sheet with a grabber, the segmented tabs and Done. The body scrolls and the totals stay pinned at the bottom. Quote rows expand in place, and inputs are 44px.

## 7. Toasts

Bottom center, fixed. #1C1B18, radius 12, 13/500 white, with an optional **Undo** button (`rgba(255,255,255,.14)`). They dismiss after 5s. Reuse the `ToastSurface` popover so toasts stay above dialogs.

---

## 8. Accessibility

- Every icon-only control has an `aria-label` and a `title`.
- The edit bar is `role="toolbar"`. Menus use `role="menu"` / `menuitem` / `menuitemradio`. Tabs use `role="tab"` + `aria-selected`. Switches use `role="switch"` + `aria-checked`.
- Focus ring: `outline:2px solid #365C4A; outline-offset:2px`.
- Moving blocks and items works by keyboard through the existing dnd-kit keyboard sensor, as well as through ↑/↓ in the edit bar.

---

## 9. Acceptance checklist

- [ ] At 1440, 1180, 1024 and 924px widths, `main.scrollWidth === main.clientWidth` and `header.scrollWidth === header.clientWidth`, with a block selected and the panel open.
- [ ] The edit bar is never wrapped or clipped, and Delete is always reachable.
- [ ] Converting Paragraph → Heading 2 keeps field chips.
- [ ] The AI line and the ✓ use the same color (#9F88E0). Only the ✓ appears on the right, and only on a selected AI block.
- [ ] Page breaks show the page background between white sheets, with only a "PAGE N" label.
- [ ] Both side columns collapse with the bordered «/» buttons, and ⌘\ toggles the right panel.
- [ ] The Fields search is 40px high, and field cards show the label + token with no "Insert" text.
- [ ] The header shows Preview PDF and Preview as client, with Draft · Saved next to the title.
- [ ] Sent and Viewed proposals stay editable, with Send update; the editor locks only after a signature.
- [ ] US spelling throughout ("Color", "Catalog").
- [ ] Money always shows its interval, and totals are always split into one-time and monthly.
- [ ] Tablet: the panel opens as an overlay drawer. Phone: the edit bar docks above the keyboard, insert pills sit on the block edges, and the tabs are a bottom dock opening sheets (§6.5).


---

## 11. Component contracts

These are the new or changed components. Each one wraps existing logic; **"Calls"** names the function that already exists in the repo. Don't re-implement it. Put the new components in `src/components/editor/`.

### 11.1 `EditorHeader`
```ts
type EditorHeaderProps = {
  title: string;
  saveState: 'saved' | 'saving' | 'unsaved' | 'offline' | 'recovered' | 'stale';
  aiPending: number;            // unreviewed AI sections; 0 = show "✓ AI review done" (hide entirely if the proposal never had AI content)
  compact: boolean;             // window < 1180
  canUndo: boolean; canRedo: boolean;
  locked: boolean;              // true only once either party has signed (§12)
  published: 'draft' | 'live' | 'unpublished_changes'; // drives the status text and Send vs Send update
  onBack(): void; onNextAi(): void; onUndo(): void; onRedo(): void;
  onPreviewPdf(): void; onPreviewClient(): void; onReviewSend(): void;
};
```
- **Calls:** `showReview()` (Next), `useHistoryStatus().controller.undo/redo`, `setPdfOpen(true)`, `save()` then `window.open('/p/:id?preview=1')`, and `openTools('Review & send')`.
- **Save-state text:** "Saved" · "Saving…" · "Unsaved changes" · "Offline · saved on this device" · "Recovered unsaved changes · Keep / Discard" · "Edited elsewhere · Reload". The stale state also turns the dot #A3261E.

### 11.2 `SectionsNav`
```ts
type SectionsNavProps = {
  pages: { number: number; sections: { id: string; title: string; aiPending: boolean }[] }[];
  currentSectionId: string | null;
  open: boolean;
  onToggle(): void; onGo(sectionId: string): void; onAddPage(): void;
  onMove(from: string, to: string): void;   // keep dnd-kit Reorder from pages-outline.tsx
};
```
- **Calls:** `authoringPages`, `addPage`, `movePage` and `movePageSection` (`lib/editor-pages.ts`). The current section is the nearest heading at or above the selected block.
- **Removed:** the per-page "+" and "×" and the "Page N (continued)" rows. Deleting a page means deleting its page-break block.

### 11.3 `PanelRail` + `ToolsPanel`
```ts
type Tab = 'Quote' | 'Fields' | 'Styles' | 'Send';
type ToolsPanelProps = {
  tab: Tab; open: boolean; mode: 'docked' | 'drawer' | 'sheet';   // ≥960 docked, 700–959 drawer, <700 sheet
  totals: { oneTime: string; monthly: string };                 // preformatted, for the rail and the phone dock
  onTab(t: Tab): void; onToggle(): void;
  children: ReactNode;                                           // the active tab body
};
```
- **Calls:** `useEditorPanels()` for the stored open state. The existing `panels.toggle('right')` keeps the ⌘\ shortcut.
- **Behavior:**
  - The panel's open/closed state persists per user, as it does today.
  - Drawer and sheet modes trap focus and close on Esc or a scrim click.

### 11.4 `PageSheet`
```ts
type PageSheetProps = { number: number; showLabel: boolean; children: ReactNode; onBackgroundClick(): void };
```
- **Calls:** `PagedPaper` keeps computing the page layout. Instead of drawing page boundaries inside one long paper, render one `PageSheet` per page and put the 52px "PAGE N" gap between sheets. Explicit `page_break` blocks and automatic overflow boundaries render the same way.
- PDF output is unchanged (`document-print.ts`).

### 11.5 `BlockFrame` (changed)

Keep its API. Drop the `tools` render for the vertical column, and add:
```ts
type BlockFrameExtra = {
  kind: 'text' | 'heading' | 'list' | 'object';
  objectLabel?: string;               // "Pricing table", "Contract", "Signatures", "Image", "Cover"
  objectAction?: { label: 'Edit quote' | 'Settings'; onClick(): void };
  canMoveUp: boolean; canMoveDown: boolean;
  onMoveUp(): void; onMoveDown(): void; onDuplicate(): void; onSave(): void; onDelete(): void;
  onInsert(edge: 'above' | 'below', anchor: HTMLElement): void;
};
```
- When selected, it renders `<EditBar>`, `<GutterInsert>` and (if `ai`) `<AiReviewCheck>`.
- The AI line renders whenever `ai` is true.
- **Calls:** `moveAdjacentBlock`, `canMoveAdjacentBlock`, `duplicateBlock`, `useBlockFeedback().reuse/remove`, `useBlockSelection()`.

### 11.6 `EditBar`
```ts
type EditBarProps = {
  frame: BlockFrameExtra; compact: boolean;
  textStyle?: TextStyleControl;       // from useBlockToolbar(); undefined for object blocks
  editor?: Editor | null;             // tiptap editor for rich text; null for heading textarea
  onField(trigger: HTMLElement): void; onLink(trigger: HTMLElement): void;
  dock: 'float' | 'keyboard';         // phone uses 'keyboard'
};
```
- **Calls:** the commands in `formatting-controls.tsx` (`toggleBold`, `toggleItalic`, `toggleBulletList`, `toggleOrderedList`), plus `TextStylePicker` restyled as the dark dropdown, and `convertTextStyle` for Paragraph ⇄ Heading 1–3. Field tokens must be kept.
- **Clamp:** after layout, on resize and on panel toggle, measure the bar against the scroll container (`main`). Shift left with `translateX` so the right edge sits 12px inside. Never shift left of the block's own left edge. No wrapping, ever.
- **`dock:'keyboard'`:** `position:fixed; bottom: env(keyboard-inset-height, 0)`, using the `visualViewport` resize listener as a fallback. It's 48px high and scrolls on the x-axis with a 36px right fade.
- **Buttons:** each one keeps `onMouseDown={e => e.preventDefault()}` so the text selection survives (this is the existing pattern in `DocumentFormattingBar`).

### 11.7 `GutterInsert`
```ts
type GutterInsertProps = { onAdd(edge: 'above' | 'below', anchor: HTMLElement): void; dragHandleProps: object; layout: 'gutter' | 'edges' };
```
- `'gutter'` (≥700px) puts round "+" buttons at the top and bottom of a 30px column at `left:-52px`, with the drag handle between them.
- `'edges'` (phone) puts the pills "+ Add above" and "+ Add below" centered on the block's top and bottom edges, nowrap.
- **Calls:** opens the existing `BlockMenu` with `anchor`; the insert index is block index (+1 for below). On the phone, `BlockMenu` renders as a bottom sheet.

### 11.8 `AiReviewCheck`
```ts
type AiReviewCheckProps = { sectionId: string; busy: boolean; onReviewed(): void; layout: 'side' | 'corner' };
```
- **Calls:** `review([sectionId], true)`. Disable it while `reviewBusy`. After it succeeds, show a toast "Marked reviewed · Undo" that calls `review([sectionId], false)`.

### 11.9 `EditorIcon`
```tsx
import icons from '../../../specs/editor-icons.json'; // move to src/components/editor/editor-icons.json
export function EditorIcon({ name, size }: { name: keyof typeof icons; size?: number }) {
  const i = icons[name]; const [, , w, h] = i.viewBox.split(' ').map(Number);
  return <svg aria-hidden="true" width={size ?? w} height={size ? (size * h) / w : h} viewBox={i.viewBox}
    style={i.mirror ? { transform: 'scaleX(-1)' } : undefined}>
    {i.els.map(([tag, { children, ...a }], n) => createElement(tag, { key: n, ...a }, children))}</svg>;
}
```
Use it for undo, redo, list-bulleted, list-numbered, link, duplicate and trash. Don't redraw these icons.

### 11.10 Quote rows, field cards, styles

- **`QuoteRow`** is `itemCard(i, full)` split into a collapsed row and an expanded body, with `expanded: boolean` and `onToggle()`. Every existing input and handler stays (`updateItem`, `defaultItem`, `link`, `unlink`, price review, Billing mapping, Plan terms). Only one row is expanded at a time. Billing mapping and Plan terms move under **Details**.
- **`FieldCard`** goes in `FieldOptions` `variant="panel"`: the whole card is the button, showing the label + token on one line and the value under it. **Calls:** `onInsert(path)`.
- **Styles** is `ProposalStyles`, restyled (§6.3), and the "Color" labels become "Color".

---

## 12. Edge states (the prototype doesn't show these; build them as written)

| State | Behavior |
|---|---|
| **Empty document** | One empty sheet with a centered 44px round "+" and the line "Add your first block" (13/500 muted). Clicking it opens `BlockMenu` (existing `firstBlock`). The Sections nav shows "No sections yet". |
| **Long title** | The title ellipses at `min-width:120px`; the full title is in `title` and `aria-label`. The Sections items also ellipse. |
| **Many AI blocks** | The pill shows the count of *sections* (not blocks). Next cycles through them in document order and wraps around. |
| **Never had AI content** | No AI pill at all (not "AI review done"). |
| **Sent / Viewed (still editable)** | Fully editable, with the same controls as a draft. The header status reads "Sent · Viewed Nov 2" (or "Sent · Not viewed"). Edits autosave as a pending revision that the client doesn't see yet; the status reads "Unpublished changes", and the primary button becomes **Send update**. Send update runs the same readiness checks and email form, with the subject "Updated proposal from {workspace}". The client's link stays the same and shows the existing "This proposal was updated" notice. |
| **Signed by either party (locked)** | Once the client signs (or the company signs first), the proposal is locked: no edit bar, gutter or AI check, and the Quote tab is read-only. The header shows "Signed · locked", and the primary button becomes **Duplicate as new draft**. The record screen handles countersigning and billing. |
| **Lost / Expired / Declined (not signed)** | Still editable. The primary button becomes **Send again**, which reopens the client link with a new valid-until date. |
| **Saving** | The status reads "Saving…" with a pulsing dot (respect reduced motion). Never block typing. |
| **Offline** | The status reads "Offline · saved on this device". Send is disabled with the reason "Reconnect to send". |
| **Recovered draft** | An inline status bar under the header (40px, #FBEEDB) reads "We found unsaved changes from {time}." with **Keep** and **Discard**. It replaces the old banner stack. |
| **Stale (409)** | An inline bar (#FBE9E7) reads "This proposal changed in another tab or by another person." with **Reload**. Editing is disabled until reload. |
| **Save error** | The status turns red and reads "Couldn't save · Retry". |
| **Pricing table deleted** | The existing confirm dialog. Readiness then shows the blocker "Add a pricing table". |
| **Panel closed + Insert field** | The edit bar "{ }" opens the inline `FieldOptions variant="menu"` popover anchored to the button instead of opening the panel. |
| **Dark mode** | The header, nav, panel, rails, menus and toasts use the dark tokens in `foundation-tokens.css`. **Sheets stay white** (`--paper`), because they must match the PDF. The edit bar stays #1C1B18 in both modes, with a 1px `rgba(255,255,255,.08)` border in dark mode. Gutter "+" buttons use `--surface` fill with an `--accent-text` border. |

### Keyboard and focus order
1. Header: back → undo → redo → Preview PDF → Preview as client → Review & send.
2. Sections nav: « → section items → + Add page.
3. Document blocks in order. **Enter** on a focused block selects it and moves focus into its text. **Esc** closes an open menu, then deselects.
4. When a block is selected, **Tab** moves from the text to the edit bar (left to right), then to Add above, the drag handle, Add below, and the AI check. **Shift+Tab** returns.
5. Edit bar: arrow keys move between buttons (roving tabindex); the style dropdown opens with Enter or ↓.
6. The panel: tabs are a `tablist` (arrow keys switch tabs), then the panel content. The » button comes last.
7. Shortcuts: ⌘\ toggles the panel, ⇧⌘\ toggles Sections, ⌘Z / ⇧⌘Z undo and redo, ⌥0–3 set the text style, ⌘K adds a link.

---

## 13. Build order (4 PRs)

Each PR must pass its checks before the next one starts. Screenshots in each PR description should be taken at 1440, 1024 and 375px.

**PR 1: Shell** (header, Sections nav, panel and rails, responsive rules)
- §2, §3, §6 header and rails, §11.1–11.3, §12 save states, Send update and the locked header.
- Checks: no header overflow at 1440/1180/1024/924; both columns collapse; ⌘\ and ⇧⌘\ work; Draft · Saved sits next to the title.

**PR 2: Block controls** (edit bar, gutter insert, AI line and check, icons)
- §5, §11.5–11.9; delete `DocumentFormattingBar` and `.block-tools`.
- Checks: the edit bar never wraps or clips; Paragraph ⇄ Heading keeps fields; the AI line and ✓ share #9F88E0; keyboard order works as in §12; focus returns to the text after formatting.

**PR 3: Page sheets**
- §4, §11.4.
- Checks: the gaps between sheets show the page background; "PAGE N" labels match the PDF page numbers from `usePdfPreview`; selection and gutter controls work on every sheet.

**PR 4: Panel tabs** (Quote rows, Fields cards, Styles layout, Send) **and mobile** (§6.5)
- §6.1–6.5, §11.10, and the remaining rows of §12.
- Checks: everything in §9; the phone edit bar docks above the keyboard on iOS Safari and Android Chrome; sheets trap focus.

**After PR 4:** delete `editor-round*.css`, `editor-polish.css`, `editor-followup.css` and `editor-ux.css` once nothing references them, and remove the `ai-review-banner` code.

---

## 10. Prompt for Codex

> You are working in `marketfreshstudios/mktfresh-proposals` (Next.js, React, TypeScript). Implement the proposal editor v2 exactly as specified in `specs/editor-v2.md`, using `Redesign 10 - Editor Prototype.dc.html` as the visual reference (open it in a browser to see every state).
>
> Constraints:
> - Re-layout only. Keep the existing save, autosave, history, AI review, readiness, pagination, dnd-kit sorting and API behavior in `quote-editor.tsx`, `block-controls.tsx`, `paged-paper.tsx` and `editor-history.tsx`.
> - Replace `DocumentFormattingBar` and the per-block `.block-tools` with the single floating edit bar from §5.1, including the clamp-to-main logic. Move Undo/Redo to the header.
> - Add the gutter "+" insert buttons (§5.2) using the existing `BlockMenu`, and the AI line + right-side ✓ (§5.3) using the existing `review()`.
> - Rebuild the right panel as the tabs Quote / Fields / Styles / Send (§6), collapsible to a 64px rail. Make the Sections nav (`pages-outline.tsx`) collapsible to a 56px rail. Apply the responsive rules in §2.
> - Render each PDF page as its own sheet with a 52px gap and a "PAGE N" label (§4).
> - Use tokens from `foundation-tokens.css`. Consolidate the editor CSS into `src/app/editor.css` and delete the unused `editor-round*.css` files.
> - US spelling. Money formatting per `specs/README.md` §4.
>
> Build in the four PRs from §13, using the component contracts in §11 and the edge states in §12. Use `specs/editor-icons.json` for icons; don't redraw them.
>
> Done means every item in §9 passes. Add Playwright checks for the overflow assertions at 1440/1180/1024/924px and for paragraph→heading field preservation.
