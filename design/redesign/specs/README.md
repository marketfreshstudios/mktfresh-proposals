# MarketFresh Proposals redesign: build spec

This is for Claude and Codex building in the existing Next.js app (`marketfreshstudios/mktfresh-proposals`). The `Redesign 0X - *.dc.html` files are the visual reference, and frame ids (such as `2a`) point to them. Where this spec and an older doc in `design/` disagree, this spec wins. Tokens are in `specs/tokens.css`, and the countersign flow has its own spec in `specs/countersign-from-list.md`.

## 1. Where to look

| File | Frames | What it covers |
|---|---|---|
| Redesign 01 - IA and Client Flow | IA board, 1a–1i | Navigation model; client flow on phone (live prototype in 1a) |
| Redesign 02 - Editor | 2a–2f | Editor on desktop (live) and phone |
| Redesign 03 - Record and Home | 3a–3f | Record + countersign sheet; Home, at 1440/768/375 |
| Redesign 04 - Design System | — | Type, color, spacing, components, light/dark, white-label |
| Redesign 05 - Tablet and Desktop | 5a–5h | Client flow at 1440/768; editor at 768 with drawer |
| Redesign 06 - Proposals and Clients | 6a–6f, #spec-countersign | List views, row actions, client detail |
| Redesign 07 - Studio | 7a–7g | Templates & blocks, Catalog, Connections, Workspace (incl. fonts, cents), Activity log |
| Redesign 08 - States | 8a–8r | Empty, loading, error and edge states |

## 2. Navigation and routes

- **Primary navigation:** Home `/`, Proposals `/proposals`, Clients `/clients`, plus a global **New proposal** action (sheet; keyboard shortcut `N`).
- **Studio** (workspace menu): `/studio/templates`, `/studio/catalog`, `/studio/connections`, `/studio/workspace`, `/studio/activity`.
- **One proposal, one address:** `/proposals/:id`.
  - While it's a draft, the page is the editor: document, then a Quote / Pricing reference / Review & send panel.
  - After sending, it's the record: Status, Document, Timeline, Evidence.
  - `?action=countersign` opens the countersign sheet.
- **These pages are removed** and become a sheet, tab or view:
  - dashboard, new proposal page, send dialog, countersign page, per-proposal audit page
  - archive (now a list view)
  - content library (merged into templates)
  - integrations and assistants (now Connections)
  - imports (one-time tool in Connections)
- **Layout by width:**
  - Desktop (≥1100px): 232px sidebar.
  - Tablet (≥700px): 64px icon rail.
  - Phone: 5-slot bottom tab bar (Home, Proposals, **+**, Clients, Studio). The tab bar is hidden inside a proposal, where Preview and Review & send own the bottom bar.

## 3. Status vocabulary (fixed)

| Status | When | Pill |
|---|---|---|
| Draft | Never sent (AI drafts add an "AI" pill; they're still Drafts) | neutral |
| Sent | Link live, not opened | info |
| Viewed | Client opened it | info |
| Won | Client signed, or staff marked it won by hand | success |
| Lost | Staff marked it lost, or the client declined from the link | danger |
| Expired | Passed valid-until without signing | neutral |
| Archived | Flag, not a status; hides the proposal from All | — |

- **Tags that ride on Won:** "Needs countersign" (warning) until the company signs; "Billing to finish" (info) while billing jobs are open.
- **List views:** All, Drafts, Sent (includes Viewed and Not viewed), Viewed, Not viewed, Won, Needs countersign, Lost, Billing issues, Archived, Imported. On tablet and phone the views are a native `<select>`, not pills.
- **Marking won by hand** records `marked_won_by` and creates no signature. The record says "Marked as won by Jonathan, no client signature".

## 4. Money

- **Formatting:** whole dollars by default (`$500`, `$175/mo`). Show cents only when an amount has them (`$49.50/mo`).
  - Workspace setting `money.cents = 'auto' | 'always'`.
  - Use `Intl.NumberFormat` with min and max fraction digits `0` or `2`, decided per amount.
- **Intervals:** one-time amounts carry no suffix in line rows. Recurring amounts always carry `/mo` or `/yr`. Sentences and the PDF say "per month" or "/month".
- **Totals:** always two figures, One-time and Monthly, never blended. Both are always shown, including `$0`.
- **No price logic:** the app never calculates or suggests prices. Catalog list prices are shown for reference, and staff type every amount.

## 5. Quote model (changes `src/lib/model.ts`)

```ts
type QuoteItem = {
  id: string; order: number;              // drag-and-drop order = client reading order
  name: string; description: string;
  source: 'catalog' | 'custom'; pricing_item_id: string | null; custom_family_id: string | null;
  sublines: { id: string; label?: string; amount: number; list_amount: number | null; interval: 'one_time'|'month'|'year'; qty: number }[];
  optional: boolean;                      // client may include/exclude
  default_selected: boolean;              // staff choice; ignored if !optional
  choice_group_id: string | null;         // "Link as alternative": client picks exactly one in the group
  min_term_months: number | null; schedule: { after_paid_invoices: number; then: { amount: number; lookup_key: string } } | null;
  plan_terms: Record<string, string|number|boolean> | null;
};
```

- **Sub-lines:** an item can have several. Own It Over Time is one item with two sub-lines, Kickoff (one-time) and Monthly. Any item can have sub-lines ("+ Sub-line"). Totals sum sub-lines by interval.
- **Own It Over Time terms**, from the catalog item: $500 kickoff, $175/month for 30 paid invoices, then $100/month (`schedule.after_paid_invoices: 30`), 18-month minimum (`min_term_months: 18`). Client copy: "$175/month for 30 months, then $100/month. 18-month minimum commitment."
- **Choice groups:**
  - Valid only between optional items. Exactly one item in the group is selected at a time; `default_selected` on at most one of them.
  - Items in a group always render together, in one block, wherever the group sits in the order.
  - You can drag the group as a unit, and drag items within it.
  - Removing the link ungroups the items.
- **Client rendering:** a choice group is a `radiogroup` panel with a "Choose one" header, 2px `--choice-border` and `--choice-ground` background, and white option cards with a 2px accent border on the selected one. Optional items are checkbox rows with a 44px+ hit area. Required items show a lock icon and have no control.
- **Readiness** (`/api/proposals/:id/ready`):
  - Blockers: unreviewed AI content (unless confirmed at send); missing accounting mapping (unless "invoice manually"); missing signature blocks; a choice group with no default (warning only, since the client must pick).
  - Warnings: custom line; AI price differs from list (resolve with "Use list price" or "Keep").

## 6. Content, fields and contract

- **Fields** (variables):
  - `{{client.first_name}}`, `{{client.full_name}}`, `{{client.company}}`
  - `{{workspace.name}}`, `{{sender.name}}`
  - `{{proposal.date}}`, `{{proposal.valid_until}}`
  - `{{quote.one_time_total}}`, `{{quote.monthly_total}}`

  In the editor they render as shaded chips. The Fields panel has a "Show names" toggle that swaps values for tokens. Typing `{{` inserts a field. Totals fields resolve live on the client page as selections change.
- **Templates** are ordered blocks: text, list, image, pricing table, contract, signature blocks. Any block can be saved for reuse; this replaces the content library.
- **Contract block** = ordered clauses `{ id, heading, body, show_when: null | { kind: 'item_selected', pricing_item_id } }`.
  - Conditional clauses appear only when the condition holds. On the client page this is evaluated live, then frozen with the signature.
  - Per-proposal clause edits are allowed and raise a readiness warning.
  - Clause **4.4 Own It Over Time** is draft wording; the studio must supply the final text.
- **Client page:** the contract is its own section with expandable clauses. The sign step summary includes "and the Statement of Work & Contract dated {date}" with a Read link.

## 7. Client flow (`/p/:token`)

- **Steps:** Review → Sign → Billing (Billing only if recurring items are selected or Checkout is needed), shown as a 3-segment progress bar.
- **Phone:** sticky bottom bar with both totals and **Review and sign** (52px). The document gets bottom padding equal to the bar's height.
- **Tablet:** the same bar, laid out in one row.
- **Desktop:** a sticky 340px "Your choices" side panel replaces the bar.
- **Sign** (its own step):
  - Order: what you're accepting (selected items + both totals + contract line) → who is signing (prefilled name and title, which can be edited; email fixed, with "Not you? Ask … to re-send") and the date → signature (Draw by default on touch, Type by default with a mouse) → consent text in full + checkbox → **Sign proposal**.
  - A disabled button always shows the reason.
  - While sealing, show "Sealing your signed copy…" and block double submit.
  - On a stale revision, show the reload banner. Never auto-reload.
- **Billing:**
  - New client: "Signed. Thank you" first, then the charges, Stripe Checkout, and "I'll do this later". The same link is emailed.
  - Existing Stripe subscriber: no payment step; explain what changes on the next invoice.
- **Done:** "Signed by you · awaiting countersignature" checklist. It becomes Completed copy once countersigned.
- **Dead ends** (expired, lost, declined, link replaced) share one calm pattern: one sentence plus a named contact. No codes.
- **White-label:** workspace logo or name in the header, and the accent color. Document headings and body use the workspace's chosen fonts.

## 8. Editor (`/proposals/:id` while a draft)

- **Desktop layout:** 236px section outline, with the AI review progress and Fields below it | document on paper | 452px panel with tabs **Quote**, **Pricing reference**, **Review & send**.
- **Tablet:** the panel becomes a 440px drawer, opened from a toolbar totals chip.
- **Phone:** a section list → full-screen single-section editing (‹ › to move between sections) → the quote as a sheet → line edit as a sheet → pricing reference sliding up over it.
- **Quote panel:**
  - Draggable cards (⋮⋮ handle; `@dnd-kit/sortable` with keyboard support).
  - Each sub-line row is a grid: amount (min-width 0) | quantity | interval `<select>` (116px). Nothing may overflow the card.
  - Each card has × remove, an Optional switch, "Ticked for client" / "Selected for client", Link as alternative, + Sub-line, and Look up.
  - "Add from catalog" lists items not yet in the quote.
  - Footer: Client sees by default (both totals) + the range across all possible client choices.
- **AI review:**
  - Each AI-written section has a gutter marker and **Mark reviewed**. Progress shows in the outline.
  - AI-entered prices that differ from list are held with **Use $X / Keep $Y**.
  - At send, any unreviewed sections can be confirmed with one checkbox that names them.
- **Pricing reference:** read-only text from the linked playbook, searchable, with its version and fetch hash shown.
- **Review & send:** checklist (blockers first) → From (defaults to the signed-in user; Jonathan or Franz) → To → note → password toggle → Preview / **Send to {first name}**. The client link is added automatically.

## 9. Record and countersign (`/proposals/:id` after sending)

- **Layout:** a "Next" card naming the action and the person → lifecycle strip → timeline → As signed (chosen items, totals, items not chosen) → Billing (Stripe and manual invoice states; Mark as invoiced) → Files.
- **Countersign sheet:** see `specs/countersign-from-list.md`. The signature always reads Jonathan Garces. When a delegate applies it, the on-behalf checkbox names the delegate, and the audit trail records who actually applied it.
- **Billing failures** sit beside the record with retry, and never cast doubt on the signature.

## 10. Lists and row actions

- **Rows:** the whole row (or card) is a link: drafts open the editor, everything else opens the record. **Sign** and **⋯** are separate targets that stop propagation.
- **⋯ menu** (a bottom sheet on phone):
  - **Edit:** on a draft, opens the editor. On Sent or Viewed, "Edit as new version", which rotates the link. On Won or Lost it's disabled, with the reason shown.
  - **Duplicate:** creates a new draft.
  - **Download PDF:** the sealed copy if won, otherwise a preview.
  - **Mark as won / Mark as lost / Mark as sent again:** marking lost closes the client link.
  - **Archive / Unarchive**, with Undo in a toast.
- **Client detail:** "How they're billed" comes first (Stripe subscriber or not, current items and their monthly total, card on file, QuickBooks link), then proposals, then notes. Claude can read the notes.

## 11. Studio

- **Catalog:** synced from Stripe, plus custom families. Own It Over Time's plan terms are edited here, with a preview of the client copy.
- **Connections:** one card per integration (Stripe, QuickBooks, Email, Pricing reference, AI assistants, Proposify import). Each has a status pill, one plain-language line and one fix action.
- **Workspace:**
  - Brand: name, logo, accent. The accent needs ≥4.5:1 contrast with white; otherwise suggest a darker shade of the same hue.
  - Proposal fonts: headings and body, chosen from a curated list or uploaded as WOFF2/TTF licensed for PDF embedding. Applied to the document, the client page and the PDF; UI chrome stays in Instrument Sans.
  - Money: currency and cents mode.
  - Team.
  - Company signatory and who may apply the signature on his behalf.
  - Client link defaults: validity, reminders, default password, sending domain.
- **Activity log:** workspace-wide, filterable by person, assistant or event type, exportable as CSV. Event types and IP addresses are shown in mono.

## 12. States, accessibility, motion

- **States:** see Redesign 08. Skeletons, never spinners over content. Every error keeps what the person already did and offers one way forward.
- **Accessibility:** WCAG AA throughout.
  - Focus ring: 2px in the accent with a 2px offset.
  - Every icon is paired with a word.
  - Client tap targets are at least 44px. Choice groups are a `radiogroup`, optional items are `checkbox`, and switches are `role="switch"`.
  - Dragging has a keyboard alternative.
- **Motion:** 120–180ms ease-out. Totals update instantly, with no counting animation. Respect `prefers-reduced-motion`.

## 13. Open items for the studio

1. Final wording of contract clause 4.4 (Own It Over Time).
2. Whether "Mark as won" by hand should require a reason note.
3. Which curated proposal fonts to offer by default; licensing for any uploaded fonts.
