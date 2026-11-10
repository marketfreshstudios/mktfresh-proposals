# Editor panel cards: build spec (Redesign 23, turn 2)

Visual reference: `Redesign 23 - Styles Panel.dc.html`, frames 2a, 2a2, 2b, 2c, 2d and 2e. Tokens are in `specs/tokens.css` and match `src/app/ink-clay-tokens.css`.

## 1. Card system (every tab: Quote, Fields, Blocks, Styles, Send)
- **Panel ground:** `--surface-preview` (#F4F7F7). The tab row stays white, with a 1px `--border` underneath.
- **Card:** white, 14px corners, 1px `--border` (#DCE3E6), no shadow. Cards sit 10px apart, with 14px of panel padding.
- **Open card:** border #B9C9CE, a 1px `--border` line under the header, and `0 6px 18px rgba(19,48,58,.10)`.
- **Card header:**
  - 50px min height, 16px side padding, title in 600 15px Instrument Sans in `--ink-title`.
  - The whole header is the toggle (`<details>/<summary>`, or a button with `aria-expanded`).
- **Closed cards:** show only the title, with no summary text. The exceptions are values you'd otherwise have to open the card to see:
  - a quote line's amount
  - the Readiness count
  - the Saved blocks count
- **Disclosure chevron:** the live `DisclosureChevron` (10px, stroke 3, `--ink-muted`) sits to the left of the title with an 8px gap and rotates 90° when open.
  - Quote rows are the exception: as live, the chevron sits on the right after the amount.
- **Not collapsible:** totals, notes, the send card and action rows sit between cards without a header.
- **Panel collapse:** the live `PanelChevron` right inside a 40×40 `.sidebar-arrow.panel-collapse` at the right end of the tab row. Don't use ⇥.
- **Separators:** never use "·" in UI copy. Use " | ", a comma or a line break.

## 2. Quote tab (2a, 2a2), in `quote-items-panel.tsx`
- **Choose one group:** a card with a white header (drag handle, "Choose one", "Unlink"). Its body is `--surface-sunken` (#E8EDEF), with 12px padding and 8px gaps.
- **Options in the group:** white cards with 10px corners, a 1px `--border` and `0 1px 2px rgba(19,48,58,.08)`.
- **Closed row:**
  - drag handle, then the name
  - under the name, "Default" in 500 11px `--ink-muted`, only on the default selection
  - then the amount and the chevron
  - Closed rows have no radio and no "Catalog" tag. Use the same "Default" style everywhere, including standalone optional lines ("Optional | Default").
- **Open row (`quote-row-body`), top to bottom:**
  1. Item name, then Description.
  2. A small "PRICE" divider label.
  3. The sub-lines.
     - Each one is a #F4F7F7 box holding Amount | USD, Qty (52px) and Interval (116px, never wraps).
     - Billing mapping is a nested disclosure inside each sub-line.
     - Remove "Shown as the item price".
  4. **Add sub-line:** a dashed-outline pill directly under the last sub-line. It moves out of `quote-item-footer`.
  5. One row: the **Optional** switch, a 1×22 divider, then **Make default selection**. It's a radio in a Choose one group and a checkbox on standalone lines. This replaces "Selected for client" and "Ticked for client".
  6. Plan terms, as a disclosure.
  7. Footer: Details (link), a spacer, Remove (danger text), Done (ink pill).
- **Add sub-line behavior (2a2):**
  - Appends `{amount: 0, interval: "one_time", qty: 1}` and moves focus to the new label field.
  - With two or more sub-lines, each shows a label field and a × to remove it.
  - The existing "Name these sub-lines so the client can tell them apart." warning shows under them.

## 3. Fields (2b), Blocks (2c), Send (2e)
- **Fields:**
  - Hint first, then the 44px search box.
  - One card per group (Team, Job, Client, Proposal, Sender & workspace, Totals).
  - Rows are at least 52px: label and value on the first line, `{{path}}` in mono below.
  - With a search query, open every matching group.
- **Blocks:**
  - Search box, then one card per `block-options.ts` group (Text, Media, Proposal, Saved blocks).
  - Rows show the name and description. Disabled rows are at 55% opacity.
  - Saved blocks shows its count when closed.
- **Send:**
  - The Readiness card is open, with a "{n} to fix" chip.
  - The Email card (From, To, Note) is open, and Link settings is closed.
  - The ink send card comes last. Its Send button is clay, the same as the header's.

## 4. Styles (2d), in `proposal-styles.tsx` and `cover-settings.tsx`
- **Order:** scope note, then the Cover, Text styles, Page & margins, Header and Footer cards, then the shared card, then the action row.
- **Spacing fields:** use the live `SpacingInput` (label above, slider plus an 84px number box).
- **Header and Footer cards:** keep every current control and its order.
- **Shared header & footer card**, replacing `.band-style-actions` and `.band-own-pages`:
  - Title "Shared header & footer", with **Edit header** and **Edit footer** as outline pills side by side. Same handlers and disabled rules as today.
  - Below a line, a #F4F7F7 footer area: "Pages with their own (n)", then one white row per page ("Page 4 | Header"), each with a small "Go to" pill.
  - Then the "Use shared on every page" link, with the same confirm popover as today.
  - Hide the footer area when no page has its own.
- **Action row:** **Reset to template** (outline) and a new **Save to template** (filled ink), side by side, full width. Remove the reset helper text.
  - Save to template writes the proposal's current styles, header and footer back to its template. Confirm first: "Save these styles to {template}? New proposals from it will use them. Existing proposals don't change." It's undoable for 5 seconds with a toast, like reset.

## 5. Out of scope
No changes to data, saving, history or the PDF. Don't change the copy except where listed above.

## 6. Done when
- Every tab matches its frame at a 380px panel width.
- Nothing wraps in Interval, the pills or the tab row.
- All controls are keyboard reachable, and toggles use `aria-expanded`.
- The radio and checkbox labels read "Make default selection".
- No "·" appears in panel copy.
- Existing quote, band and style tests still pass. Add tests for: Add sub-line focuses the new label, closed rows show "Default" only on the default, and Save to template confirms and can be undone.
