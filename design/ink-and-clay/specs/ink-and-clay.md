# Ink and clay: build spec

Applies the Redesign 15 · 1a direction across the staff app, and specs the new screens and parts designed with it. Tokens are in `specs/tokens.css`. If this spec and an older one disagree on color, type or chrome, this one wins. Layouts, behavior and copy from the older specs still apply unless something below changes them.

Visual references:
- `Redesign 15 - Rich Direction.dc.html`: 1a (palette), 2a–2d, 3a–3i
- `Redesign 16 - Reports.dc.html`: 1a–1d

## 1. Palette rules

1. **Chrome is ink** (`--chrome`). This covers the desktop sidebar, the tablet top bar, the phone tab bar, the editor top bar and phone page headers. Text on chrome uses `--chrome-ink`, and inactive items use `--chrome-muted`. The active nav item gets a `--chrome-on` background and a 3×16px `--chrome-marker` bar on its left.
2. **One hero card per screen** (`--hero`, white text). On Home it's the pipeline card, on the record it's "Next step", and on Reports it's the value signed figures. Never more than one per view.
3. **Clay (`--action`) appears only on the single next action** on a screen: New proposal, Send, Send update, Review AI draft, Review & countersign. Every other button is an outline pill (`1.5px solid --border-strong`).
4. **Cards** are white with a 1px `--border`, `--radius-card` corners and no shadow. Page frames and sheets use `--shadow-frame` and `--shadow-lg`.
5. **Status chips** use the `--st-*-soft` background with `--st-*-ink` text. Dots, bars and left markers use `--st-*-strong`. Wording follows README §3.
6. **AI review marker:** the 3px left line and the ✓ on blocks both use `--ai`. Nothing else in the editor is clay.
7. **Client view and proposal pages are unchanged.** They use the tenant `--accent` and `paper-*` tokens. Ink and clay never leak into them, apart from the "Powered by Yeswell" footer when it's switched on.
8. **Shapes:** buttons are always pills. Nav items, tabs, segmented controls, inputs and selects use `--radius-md`.
9. **Contrast:** every text and background pairing in `tokens.css` meets 4.5:1. Don't lighten text with opacity. Use `--ink-muted` instead.

## 2. Type

- Page titles, card titles, section titles and big numbers use `--font-title` (DM Serif Display, weight 400). Everything else uses Instrument Sans.
- Sizes are in the `.t-*` classes. The phone sizes in the comments apply below 700px.
- Money and counts in tables use `tabular-nums`.

## 3. Shell by width

| Width | Navigation | Notes |
|---|---|---|
| ≥1100px | 236px ink sidebar: logo, workspace switcher, Home, Proposals, Reports, Clients, Studio, user at the bottom | When Studio is active, its pages show as a sub-nav under it |
| 700–1099px | 64px ink top bar: menu button (opens the sidebar as a drawer), logo, page name, avatar | Filters collapse into one "Filters" pill that opens a sheet |
| <700px | 78px ink bottom tab bar: Home, Proposals, Reports, Clients, Studio | Hidden inside a proposal. Phone page headers are ink |

**Reports** sits in the main nav directly under Proposals, at `/reports`.

## 4. Proposal record toolbar (Redesign 15 · 3a, 3b)

Left: "← Back to proposals". Right: the buttons below, then ⋯. Exactly one button is filled.

| State | Buttons | ⋯ menu notes |
|---|---|---|
| Draft, Sent, Viewed | Preview as client · **✎ Edit** (filled ink) | On a sent proposal, edits stay hidden from the client until "Send update" |
| Client signed, or company signed | Preview as client · **Review & countersign** (filled clay, only while the company signature is missing) | Edit is shown disabled with the hint "Signed proposals are locked." |
| Completed | Preview as client · **Download PDF** | — |
| Archived | **Unarchive** | Edit reads "Unarchive to edit." |
| Proposify import | **Download PDF** | Read-only: no Preview as client and no Edit |

- **Locking rule:** a proposal is editable until either party signs (see `editor-v2.md`).
- **Phone:** the toolbar becomes a sticky bottom bar with Preview (outline) and the state's main button (filled), plus ⋯ in the header.
- **Next step card** (hero): eyebrow "Next step · {who acts}", one sentence of status, then up to two outline pills on ink, e.g. "Send reminder now" and "Copy client link".

## 5. New-version notice (Redesign 15 · 3a, 3g, 3i)

Shown when the server reports a newer build than the one loaded.

- **Desktop and tablet:** a floating toast (`--toast` background) centered over the content area, below the page toolbar (84px from the top of the content area on the record), 560px wide at most, `--radius-xl`, `--shadow-lg`. It sits above everything else.
  - Copy: "A new version of Yeswell is available. Your work is saved first, then the page reloads."
  - Buttons: **Later** (text) and **Reload** (white pill with ink text).
- **With unsaved work that can't be saved automatically** (for example, a validation error): the copy becomes "A new version of Yeswell is available. Save your changes first." and Reload stays disabled until the save succeeds.
- **Phone:** the same content as an inline card at the top of the page (Home, below the greeting), not a floating toast.
- **Later** hides it for this session. It comes back on the next navigation after 30 minutes.
- **Reload** calls the existing save-then-reload handler.
- **Accessibility:** `role="status"` and `aria-live="polite"`. Focus is never moved to it.

## 6. Reports (Redesign 16)

Route `/reports`. Every count and amount links to `/proposals` with the matching filters applied.

**Order, top to bottom:**
1. Eyebrow with the date range and proposal count, then the "Reports" page title.
2. **Filter bar:**
   - date range as a segmented control: This month · Last month · Last 90 days · This year · Custom
   - Owner, Template and Client dropdowns
   - an "Export CSV" outline pill on the right
   - Tablet and phone: the dropdowns move into a "Filters" sheet. On phone, the ranges are horizontally scrolling chips in the ink header.
3. **Six headline cards** (6 columns on desktop, 3 on tablet, 2 on phone). Each card has a label, a number in `.t-number`, a context line and a "View proposals" link. The whole card is the link.
   - **Proposals sent:** in range.
   - **Viewed:** reached Viewed or any later stage, including declined and expired proposals that were opened. Context line: "{n}% of sent".
   - **Signed:** context line "{n}% win rate". There's an ⓘ next to it. Hover or focus shows a tooltip with "Signed ÷ (signed + declined + expired)", the worked numbers, and "Proposals still open aren't counted."
   - **Median time to first view**, measured from send.
   - **Median time to sign**, from send to the client's signature.
   - **Open now:** Sent + Viewed, with the context line "{a} sent · {b} viewed".
4. **Value signed** (hero card): One-time and Monthly as two separate ink tiles. Never add them together or show a combined total.
5. **Pipeline by stage:**
   - **In progress and won:** one segmented bar with Draft · Sent · Viewed · Signed by client · Countersigned · Billing set up. The segments get darker left to right, each shows its count, and there's a legend below.
   - **Exited:** a separate bar to the right with Declined and Expired, red with diagonal hatching.
   - Phone: one row per stage (label, bar, count), with Exited under its own heading.
6. **Sent vs signed by month:**
   - Paired bars per month: Sent is outlined and hatched, Signed is solid ink. The value sits above each bar, with a y-axis and gridlines.
   - A "Chart / View as table" switch (`role="tablist"`). Table columns: Month, Sent, Signed, Signed ÷ sent.
7. **Breakdowns:** two sortable tables, By template and By owner.
   - Columns: Sent, Signed, Win rate, Median to sign, One-time, Monthly.
   - Headers are buttons with `aria-sort`, and the active column shows ▼ or ▲.
   - Footer note: "One-time and monthly values are totaled separately and never combined."
   - Phone: each row becomes a card, with a Sort dropdown.
8. **Engagement:**
   - **Most-read sections:** section name and average time per viewed proposal, with a bar scaled to the largest.
   - **Client questions:** Asked, Open and Answered. The Open tile uses `--st-review-*` when it's above 0. Below are the median reply time, plus "See {n} open questions" and "All {n}" links.

**Rules:**
- Only data from existing proposals. No forecasts or predictions.
- Charts must read in grayscale (patterns, outlines and labels, not color alone).

**Empty state (1b):**
- The headline cards show "—" with dashed borders, and the filter bar is disabled at 55% opacity.
- Below is a hero panel:
  - eyebrow "Nothing to report yet"
  - title "Reports fill in once you send proposals."
  - one paragraph
  - a **New proposal** clay pill
  - a list of what will appear

**Loading:** skeleton cards in `--segment` at the same sizes. Charts show an empty track.

**Errors:** an inline banner above the cards reading "Couldn't load reports. Try again", with the last good data shown underneath if it's cached.

## 7. Screens already in this direction

| Frame | Screen |
|---|---|
| R15 2a | Proposals list (views, row ⋯ menu) |
| R15 2b, 3a | Record: client signed / viewed |
| R15 2c | Studio › Workspace |
| R15 2d, 3g | Phone: proposals, record, countersign, Home, clients |
| R15 3c | Clients, list and detail |
| R15 3d–3f | Studio › Team, Email templates, Connections |
| R15 3h | Client on phone (tenant brand) |
| R15 3i | Sign in, first run, loading, empty, billing error, update notice |
| R16 1a–1d | Reports |

**Restyle only (layout and behavior final, apply §1–3):**
- Editor v2 (Redesigns 10 and 11)
- Header and footer (Redesign 13)
- Templates, Saved blocks, Catalog, Imports and Activity log (Redesign 14)

| R17 1a–1d | Client on phone: password gate, choosing options, billing (Checkout handoff and existing subscriber), link states |
| R17 2a–2c | Dark mode: record, Reports, phone Home, editor canvas |
| R17 3a–3d | Tablet 768: proposals list, record, client detail, Studio › Workspace |
| **R18 A1–F7** | **Every desktop screen at 1440**, the main reference for desktop builds. Home (B1) and the editor (C1–C3) follow the R15 · 1a layouts: pipeline card first on Home; a summary-style quote panel where one line opens for editing at a time |

## 7a. Buttons and row actions (Redesign 18)

- **No icons inside text buttons.** Write "Edit", "New proposal", "Sub-line", never "✎ Edit" or "+ New proposal".
- **Icon-only buttons** are allowed only where space is tight: Proposals table row actions, editor undo/redo, and ⋯ menus. Each is 40×40 (44×44 on touch), has an `aria-label`, and shows a tooltip on hover or focus. Icons come from `specs/table-action-icons.json` (Lucide, 18px, stroke 2, `currentColor`).
- **Proposals table actions column**, 196px, right-aligned, in fixed slots from left to right: [Edit or Sign] [Duplicate] [Archive] [⋯]. An inapplicable action keeps a 40×40 spacer (44×44 on touch and in tablet/phone row cards) so the icons line up. Row icons are borderless circles with `--ink-muted` on transparent, `--ink-title` on `--segment` on hover or focus, and the shared focus ring.

| Status | Slot 1 | Duplicate | Archive |
|---|---|---|---|
| Draft, AI draft, Sent, Viewed, Lost, Expired | Edit (`square-pen`) | ✓ | ✓ |
| Won + Needs countersign | Sign (`pen-tool`, tooltip and accessible name “Countersign”; opens the record with the countersign sheet) | ✓ | ✓ |
| Won (countersigned, billing or completed) | empty | ✓ | ✓ |
| Archived view | Edit (`square-pen`) if unsigned (unarchives first) | ✓ | Unarchive (archive-restore icon) |
| Proposify import | empty | empty | ✓ |

- The **⋯ menu** keeps: Open record, Preview as client, Download PDF, Mark as sent again / won / lost, Copy client link.
- Row buttons stop click propagation and activate with Enter or Space. The rest of the row opens the proposal. Home Recent proposals and mobile/tablet row cards use the same actions.

## 8. Client screens (Redesign 17 · 1a–1d)

- **Password gate:** 52px field with Show, then **Open proposal**. A wrong password shows an inline `role="alert"` message; the field keeps its value. The page shows who to ask (sender name and email).
- **Billing step**, following Studio › Billing defaults:
  - **New client:** the Stripe card lists the monthly items, "First payment today" and the monthly date. One-time fees sit below as "by invoice", with nothing to pay. Buttons: **Continue to secure payment** and "I'll do this later".
  - **Existing subscriber:** no payment step. Show the items being added, the monthly total now and from the next invoice date, and a **Done** button.
- **Updated while open:** an amber banner at the top of the page with **Load latest version**. The page dims and the bar's button is disabled until the client loads it. Choices carry over where the items still exist. Never auto-reload.
- **Dead ends** (closed, expired, replaced): an icon, a one-line title, one sentence, the contact card (sender, email, phone) and one button (Email Jonathan / Ask for a new proposal / Open the latest version).

## 9. Dark mode (Redesign 17 · 2a–2c)

The values in `tokens.css` under `[data-theme="dark"]` are now final.
- On a dark ground, filled ink buttons (Edit) flip to light (`--ink` background with `#13303A` text).
- Clay buttons use dark text.
- The pipeline bar's segments go from dark to light on a dark ground, and each keeps its count.
- Proposal pages and the client view stay light.

## 10. Tablet (Redesign 17 · 3a–3d)

- **Proposals list:** row cards. The whole card is the link, and Sign and ⋯ are separate 44px targets. The View dropdown replaces the filter pills.
- **Record:** same order as desktop, with Quote and Timeline in two columns.
- **Clients:** the list and the detail are separate pages.
- **Studio:** the sub-nav is a horizontally scrolling tab row. Two-column field grids stack below 600px.
