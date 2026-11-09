# Column styles + copy/paste style: build spec

Visual reference: `Redesign 20 - Column Styles.dc.html` (frames 1a–1f). Colors, type and shell follow `ink-and-clay.md`. The data model is unchanged (`BlockStyle` in `src/lib/block-style.ts`, and `Columns` in `src/lib/columns.ts`).

## 1. Where styling lives
- Remove the `Sheet` titled "Column style" and the columns "Block style" modal from `columns-editor.tsx`.
- The Styles tab gets a segmented switch at the top: **This proposal** (the current proposal-wide styles) and **Selection**.
- Selecting a column (or choosing Style on its edit bar) opens Styles › Selection.
- Deselecting returns the switch to This proposal.

## 2. Scopes
**Columns** (the whole block is selected, 1e):
- Layout: four thumbnails (50/50, 33/67, 67/33, 33/33/33), a radiogroup.
- Gap: S / M / L.
- Align columns: Top / Center.
- **Column styles** list: one row per column with a swatch, a summary and Edit or Paste. Header action: "Match all to Column 1".
- **Group box**: the block's own `style`, collapsed behind "Add".
- A note about what changing to fewer columns does (the existing `changeColumnLayout` behavior).

**Column N** (1a):
- **Columns layout** comes first: a collapsible card (48px header with a summary such as "33 / 33 / 33 · medium gap · top" and a chevron, `aria-expanded`). Opened, it shows Layout thumbnails, Gap and Align columns inline. It's open in 1a and collapsed elsewhere, and the open state persists for the session.
- Breadcrumb: "Columns › Column N", with a column switcher.
- Copy style, Paste style and Reset.
- **Background:** swatches for None, Light neutral, Primary and palette colors, plus a "Custom" link to the existing `ColorPicker`. The `ContrastNote` sits below.
- **Padding:** None / S / M / L.
- **Border:** None / Thin / Medium. Border color swatches appear only when a border is set.
- **Corner radius:** None / S / M, shown only when there's a background or border.
- **When columns stack on a phone:** Above and Below, each Auto / 0 / S / M / L. These map to `margin_above` and `margin_below`; Auto means unset.

## 3. Copy / paste style
- **State:** `styleClipboard: { style: BlockStyle; source: string } | null` in the editor context. It lasts for the session (memory only), and is shared by blocks and columns.
- **Copy:** clones `column.style ?? {}` and shows the panel card "Copied from Column N" with a summary. The source column's tab says "· style copied".
- **Paste:** `update(column.id, { style: structuredClone(clip.style) })`. It replaces the style, never merges. An empty style becomes `undefined`.
- **Paste to all columns:** applies the paste to every other column in the same block in one history entry.
- **Legal blocks** (contract, signature): drop `background`, `border`, `border_color` and `radius` before pasting. The toast says "Background and border don't apply to contracts."
- **Entry points:**
  - edit bar: Copy style / Paste style
  - the panel buttons
  - the ⋯ menu: Copy style, Paste style, Apply this style to all columns, Reset column style
  - the hover "Paste style" button on target columns while a style is copied
  - shortcuts ⌥⌘C / ⌥⌘V (Ctrl+Alt on Windows) when a block or column is selected
- **Feedback:** every paste is one undo step with a toast ("Style pasted to Column 2 and Column 3", plus Undo for 6 seconds). When there's nothing to paste, Paste is disabled with the tooltip "Copy a style first".

## 4. Sizes
- Panel width 380px, padding 18px.
- Segmented controls: 32px tall, track `--segment`, radius 10/8.
- Swatches: 30px with a 44px hit area; the selected one has a 2px white plus 2px ink ring.
- Canvas: the selected column has a 2px ink outline and a 20px label tab. Paste targets have a 2px dashed outline (#9DB5A8, accent on hover).
- Edit bar: 42px tall, `#1C1B18`, radius 12. Text actions only, with ⋯ as the only icon.
- **Phone (1f):** a bottom sheet. Column tabs are 38px tall, buttons and swatches 44px (swatches 36px with a 44px hit area). After copying, the main button is "Paste style from Column 1", and border, corners and stacking space sit behind "More options".

## 5. Accessibility
- The column switcher is a `tablist`. Swatch groups and segmented controls are `radiogroup`s with `aria-label`s on swatches.
- Toasts use `role="status"`.
- Paste targets on the canvas are buttons named "Paste style into Column N".
