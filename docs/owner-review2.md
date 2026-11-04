# Owner review 2 — PR #64

Started from main `7ebd1c7`. The cover, image toolbar, disclosures, independent controls and effective-margin geometry have separate implementation commits. [Header/footer decisions §9](../design/header-footer/DECISIONS.md) records the owner rules and title clarification.

Every cover text line has its own selection, rich-text toolbar, fields, alignment and spacing. Added lines and hidden lines use the same cover JSON and editor history. The rich cover title also updates the plain record title; hiding it keeps that record title. Its existing 300-character limit is enforced before edits apply. Logos support alignment, proportional resizing, spacing and horizontal dragging with an 8px snap zone. Free offsets remain stored when a narrower sheet temporarily clamps their rendering.

Image action bars have intrinsic width, fit the sheet/viewport and flip below when needed. Phone toolbars escape the sheet's stacking context and dock above the visual viewport keyboard. Disclosure chevrons are 10px heavy right/down icons; dropdown arrows and panel controls retain their existing appearance.

Header and Footer each have independent distance, fixed content height, space by line and space to content. The divider switch stays shared. Effective margins use the same geometry in the editor, canonical browser pagination, PDF and client sheets. For example, header distance 0.4in + Large 0.6in + 6px line spacing + 1px divider + 8px content gap gives a **111px top margin**. A 0.25in footer distance with Small height fits the base **72px bottom margin**, leaving **873px of content** on every page, including the cover and pages with a hidden header. A Large header accommodates a 57.6px logo.

Existing JSON normalizes through schema loading/saving; no hosted migration or bulk rewrite is required. Existing frozen objects and stored hashes are not rewritten. The PagePlan format, billing, readiness and signing behavior are unchanged.

## Requested evidence

All captures use neutral local fixtures. Desktop captures are 1440px wide; the phone capture is 375px. The preview PDF uses the actual print pipeline and contains no signatures or completion certificate.

| State | Evidence |
| --- | --- |
| Cover text selected, EditBar visible | [Screenshot](screenshots/owner-review2/cover-selected-1440.png) |
| Shared spacing popover | [Screenshot](screenshots/owner-review2/cover-spacing-1440.png) |
| Logo drag with center guide | [Screenshot](screenshots/owner-review2/logo-center-guide-1440.png) |
| Centered cover | [Screenshot](screenshots/owner-review2/centered-cover-1440.png) |
| Tiny logo, full intrinsic toolbar | [Screenshot](screenshots/owner-review2/tiny-logo-toolbar-1440.png) |
| Independent settings and effective-margin notes | [Screenshot](screenshots/owner-review2/independent-band-settings-1440.png) |
| Large header and larger logo | [Screenshot](screenshots/owner-review2/large-header-1440.png) |
| Closed/open disclosures beside a dropdown | [Screenshot](screenshots/owner-review2/disclosure-and-dropdown-1440.png) |
| Phone cover EditBar | [Screenshot](screenshots/owner-review2/cover-edit-bar-375.png) |
| Centered cover and independent band geometry | [Actual preview PDF](screenshots/owner-review2/independent-bands-preview.pdf) |

PDF pages were rendered with Poppler and visually inspected. Chromium covers the phone visual-viewport fallback and 44px targets. Physical **iOS Safari / Android Chrome software-keyboard docking, image resizing and logo dragging** remain manual checks.

## Verification

Final local results are recorded in [HANDOFF_PHASE2.md](../HANDOFF_PHASE2.md). Coverage includes cover selection, rich formatting, field insertion, hide-title metadata preservation, title length, spacing parity with print, logo snapping/free offsets/Undo, tiny toolbar placement across phone/desktop resizing, band-image keyboard resize/delete/Undo, independent geometry against the generated PDF, and disclosure/dropdown differences. The full existing browser suite includes frozen plans, hashes, pagination, signing, session recovery and client choices.

All work used local/mock fixtures. No hosted resource or live provider credential was used. GitHub CI is not awaited.
