# Owner review 5

Based on merged PR #72 (`d5c4712`). No hosted SQL is required.

## Edit bars

The PR #72 collision search could choose far-away empty space, or a narrow scrolling strip in the margin. It is removed. Bars use viewport-fixed positioning, retaining their DOM/focus owner without widening the canvas. Full-size bars attach above the selected block/cover line/image/band. As the block scrolls past the top, the bar stays below the editor header while the block remains visible. Horizontal movement occurs only to keep the bar inside the viewport. Only menus flip. The bar's background and gaps let pointer clicks through; its controls remain clickable. Escape or empty-sheet space dismisses it. Phone keyboard docks remain unchanged. Cover and band Home/End navigation stays inside the single-line field, preventing macOS's native canvas-end scrolling from hiding an active bar.

The prior collision/no-overlap assertions now check the owner's replacement: natural width, above/sticky placement, viewport containment and real interactions. 1440/1280/1024 checks cover top/middle/bottom and partially scrolled blocks. Editor layout, saved breaks and PagePlan format are unchanged.

## Blocks

The shared catalogue supplies the proposal Blocks tab, Studio Blocks tab, desktop/tablet panel and gutter/phone + menu. It includes all existing text/media/contract/saved types, Divider and all three signature choices. Click/Enter inserts after the selected block or at the end of the visible page section; pointer drag shows an insertion line and inserts at the drop edge.

A proposal supports one client signature and one company signature. The pair is available only when neither role exists; individual roles remain available when missing. Duplicate options are disabled with an explanation, and the insertion operation also rejects duplicates. The normal editable Signatures heading and signer pair insert in one undo operation. Divider uses standard rich-text `horizontalRule`, requiring no new block or database schema.

## Dialog audit

Action rows share `DialogActions`: backwards/secondary first in DOM order, forward/destructive last, right-aligned. Phone keeps this left/right order with wrapping; it does not reverse keyboard order. Destructive dialogs focus the secondary action, including “Keep client” and “Keep my edits”. Enter from a form field cannot implicitly execute destruction; the destructive button must have focus. Header close controls use the standard accessible × dismiss affordance.

Audited surfaces:

| Area | Dialogs / sheets / confirmations |
| --- | --- |
| Editor | Required pricing/signature deletion; Save for reuse; block, image, signature and clause settings; sections/tools and insertion sheets; failed-save leaving confirmation |
| Styles and bands | Reset styles; use shared band / use shared on every page; band menu and phone band sheet |
| Proposal record | Status-action confirmations; manual-invoice reference; countersign; document viewer; manual-delivery link confirmation |
| Clients | New client; Edit client; Delete client; Stripe link/unlink confirmation |
| Team | Invite/resend; edit name/role; set/change password; reset email; deactivate/reactivate; remove; single and bulk reassignment |
| Studio | Product and custom-family forms; template/saved-block inspectors; connection/settings sheets |
| Emails | Email reset and editor actions; test send remains self-only |
| Client flow | Sign-step navigation and decline/back actions; preview/PDF viewer |
| Send | Review/send footer (secondary preview, primary send/publish); manual-send Done confirmation |

Menu command lists keep their own command order. Read-only sheets with a sole Done or close control do not invent a destructive confirmation. Signing, billing/provider logic and existing readiness rules are unchanged.

## List markers

One trusted DOM function measures each list item's first line. Uniform sizes apply directly; mixed first-line text uses the largest size, excluding later lines and nested lists. The marker, line height and adjacent spacing scale together; unchanged/nested items keep their default marker size. Editor decorations never enter document JSON or undo history. Canonical pagination, PDF and both client layouts use the same sizing and CSS. Native PDF bullet circles and numbered text runs are checked, not just HTML.

## Validation and captures

Final results are recorded in HANDOFF_PHASE2.md and the PR. Requested neutral-data screenshots are in `docs/screenshots/owner-review5/`; real PDF page images are rendered with Poppler for visual inspection. No live proposal/customer/provider data was used or changed. No CI wait or merge.


### Requested screenshots

| State | Capture |
| --- | --- |
| Paragraph near top | [1440](screenshots/owner-review5/bar-top-1440.png) |
| Paragraph in middle | [1440](screenshots/owner-review5/bar-middle-1440.png) |
| Paragraph near bottom | [1440](screenshots/owner-review5/bar-bottom-1440.png) |
| Partly scrolled block; bar pinned under header | [1440](screenshots/owner-review5/bar-sticky-1440.png) |
| Blocks catalogue | [1440](screenshots/owner-review5/blocks-tab-1440.png) |
| Gutter menu with Signatures | [1440](screenshots/owner-review5/plus-menu-signatures-1440.png) |
| Phone + sheet with Signatures | [375](screenshots/owner-review5/plus-sheet-signatures-375.png) |
| Cancel-first required-block deletion | [1440](screenshots/owner-review5/delete-required-cancel-first-1440.png) |
| 24px list entry in editor | [1440](screenshots/owner-review5/list-24px-editor-1440.png) |
| Same list in actual PDF preview | [1440](screenshots/owner-review5/list-24px-pdf-preview-1440.png) |
| Poppler-rendered PDF page | [Bullets](screenshots/owner-review5/bulletList-pdf.png), [numbers](screenshots/owner-review5/orderedList-pdf.png) |


Final local validation (November 5, 2026): `npm run typecheck`; `npm test` (435 tests, 87 files); `npm run format:check`; `npm run check:neutral`; `npm run build` including the 330-file PDF runtime trace; `npm run verify:fonts`; `npm run verify:pdf-jobs` (pre-band planned/unplanned and large-band fixtures); and the full `npm run test:e2e` (229 passed, 4 skipped). The corrected cover-cursor and live image-toolbar resize tests pass within that full run. Requested screenshots and actual PDF page images were inspected. No CI wait or merge.
