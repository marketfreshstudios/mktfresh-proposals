# Owner review 3 — PR #66

Started from main `bbd46a8`. Owner decisions are recorded in [header/footer decisions §10](../design/header-footer/DECISIONS.md). Changes are split into separate cover/menu, spacing, Header/Footer, staff-page and phone-client commits.

Cover menus reset document typography at the shared popover root. Cover rich text now uses the same canonical comparison as bands, avoiding selection-destroying content replacements during autosave. Real middle-word Bold/Italic tests retain the selection; dynamic fields stay highlighted in the editor and render plain in client/PDF output.

Cover lines keep their own vertical space instead of collapsing neighbouring margins. Added empty lines have an editable/print line box, insert directly below, focus correctly and retain content, marks and spacing through Undo/Redo and reload. Removing the title preserves proposal metadata. Item and whole-cover alignment share the Align menu, including the logo, using the existing Font Awesome family.

All spacing controls share sliders and compact px fields. Limits derive from available page space; cover spacing can exceed 200px. Band stacks retain at least two inches of content, including when changing distance/height or re-enabling a divider. A drag is one history transaction; arrows change one px and Shift+arrows ten. Number entry clamps with the page-specific maximum. Header/Footer sliders and typography sliders reuse this control; touch inputs retain 44px targets.

Styles and Studio templates have independent Header and Footer accordions. Each has global visibility/shared count, its own Show on cover, distance, height, content-side spacing, divider and conditional line-side spacing. Divider-side spacing is ignored when that line is off. Old shared flags migrate only when editable settings are parsed. Raw frozen versions without independent flags retain their earlier geometry, including historical line padding. The PagePlan format and signed hashes are unchanged.

Signed-out staff pages redirect before rendering, with no-store and the full path/query preserved. Root-path refresh cookies let the existing server refresh run before page rendering; old `/api` copies expire on login/rotation/logout. Anonymous API access remains guarded and public login, client links, OAuth/discovery, MCP and assets remain public. The existing mid-session signed-out recovery stays in place.

Phone client reading has one inset, full-width descriptions/sub-lines and fixed, unwrapped prices. At both **375px and 390px**, the text inset changed from **33px left / 33px right to 16px / 16px**, plus safe-area insets. Totals also start at 16px. Control rows remain large click targets. Tablet/desktop rules are unchanged. The contact link is underlined on phones so it does not rely on colour alone.

Before phone captures were taken from a separate `bbd46a8` checkout with the same neutral fixture. After captures use this branch. No hosted resources or data were changed.

## Requested screenshots

- [Cover Align and All cover items](screenshots/owner-review3/cover-align-after.png)
- [Cover spacing sliders](screenshots/owner-review3/cover-spacing-after.png)
- [Selected middle word after Bold and Italic](screenshots/owner-review3/cover-selection-after.png)
- [Cover fields](screenshots/owner-review3/cover-chips-after.png)
- [Separate Header and Footer Styles](screenshots/owner-review3/styles-header-footer-after.png)
- [375px spacing slider](screenshots/owner-review3/phone-spacing-after.png)
- Client intro: [before](screenshots/owner-review3/client-intro-before.png) / [after](screenshots/owner-review3/client-intro-after.png)
- Client pricing: [before](screenshots/owner-review3/client-pricing-before.png) / [after](screenshots/owner-review3/client-pricing-after.png)

## Validation

Focused regressions include real Chromium/PDF text-position checks for every cover element, independent divider combinations, retained page geometry, line history/reload, pointer-drag Undo, phone widths/axe and server refresh/redirect/cookie flags. The full suite and production build results are recorded below after completion.
