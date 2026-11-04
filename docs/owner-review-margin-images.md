# Owner review: margin bands, images, covers and chevrons — PR #63

Started from main `c98b4ca`. The six owner-review items have separate implementation commits. The final owner decision is recorded in [header/footer decisions §8](../design/header-footer/DECISIONS.md): **owner: max height for now; may revisit later**.

Headers and footers never consume body space. One geometry function caps their total height at `margin − distance − 8px`, including the divider and its 6px padding. Stored image heights survive a later reduction of the available space; rendering scales them down proportionally. Distance from edge replaces Band height, and old JSON settings/images normalize when loaded or saved. No database migration or hosted bulk update is needed.

One click or tap edits a band at the clicked caret position. Body images, cover logos and inline band images share selection, locked-aspect resizing, keyboard controls and history. Band images insert at the cursor (last-column end without one), move between columns with a visible caret, and support cut/paste. Responsive logo fitting uses the same logical sizing in the editor, canonical pagination, client sheets and PDF.

New proposals start their content on page 2. Their default cover contains the logo, workspace name, title, prepared-for line and validity. Existing unsigned unset/old-default covers normalize without replacing custom copy. Frozen version objects and stored hashes are not rewritten. Disclosures use the shared Font Awesome 6 chevrons with their attribution in the icon library.

## Requested evidence

Neutral local fixtures; all desktop captures are 1440px wide. The bands-on/off pair uses the same content, styles and scroll position. PDF preview is generated through the actual print pipeline. It is watermarked and contains no signatures or certificate.

| State | Capture |
| --- | --- |
| Page 2, bands on | [Screenshot](screenshots/owner-review/page-2-bands-on-1440.png) |
| Page 2, bands off — same body lines | [Screenshot](screenshots/owner-review/page-2-bands-off-1440.png) |
| Single-click band editing | [Screenshot](screenshots/owner-review/band-single-click-1440.png) |
| Block image mid-resize | [Screenshot](screenshots/owner-review/block-image-mid-resize-1440.png) |
| Header image moved to the right column | [Screenshot](screenshots/owner-review/header-image-right-column-1440.png) |
| Default cover, content on page 2 | [Screenshot](screenshots/owner-review/default-cover-1440.png) |
| Styles: chevrons and Distance from edge | [Screenshot](screenshots/owner-review/styles-distance-chevrons-1440.png) |
| Phone touch resize, 375px | [Screenshot](screenshots/owner-review/touch-image-mid-resize-375.png) |
| Actual preview PDF, after resize/drag | [PDF](screenshots/owner-review/margin-bands-preview.pdf) |

The PDF was rendered to PNG with Poppler and visually inspected. Phone evidence uses Chromium touch events. Physical-device **iOS Safari / Android Chrome keyboard docking and touch resizing** remain manual checks.

## Validation

Final local results are recorded in [HANDOFF_PHASE2.md](../HANDOFF_PHASE2.md). Coverage includes margin invariance, tall-image caps, actual PDF geometry, click-point carets, image resize/delete/undo, cross-column drag and cut/paste, phone touch resizing, proportional wide-logo fitting, new-cover inheritance and shared chevrons. The existing frozen-plan, signing, publication, client-choice and session tests remain in the full browser suite.

No live provider credentials or hosted resources were used. GitHub CI is not awaited.
