# Header/footer PR 3 — overrides and touch editing

Builds on merged PR #59 (`9cd16b4`). Scope: anchor resolution and lifecycle, shared/unique/hidden menus, confirmations and Undo, reflow notes, cover pills, Styles/Sections indicators, and tablet/phone band editing. Client pages, geometry functions, PagePlan, billing, readiness and AI tools remain unchanged.

## Owner decisions

- Every repeated non-cover start is suffixed: `X`, `X#2`, `X#3`. An explicit page-break ID takes precedence; page 1 is `cover`.
- Resolve header and footer independently. An exact match to the page's current anchor wins a collision; otherwise the earlier anchor in document order wins. Re-key that surviving collision to the current page anchor. Drop other entries with the eight-second removed-band Undo toast. A deleted anchor never transfers over an existing destination override.
- Shared-page counts include only pages actually showing shared content, excluding unique and hidden bands. Styles lists both exclusions when present. The owner confirmed frame 1i’s footer count was a design slip. The same shared N drives the edit bar, menu and phone top bar.
- Editing a hidden band creates an empty unique band in the shared layout, with Undo restoring `hidden`. Its menu contains only Edit and Use shared.
- A removed-page/anchor reconciliation joins the originating editor history step, so Undo restores both the content and its bands. A plan-only update never creates an ordinary content revision unless stored override data itself must change.

## Reference review

Viewed Redesign 13 frames 1d–1k, 2a–2c and the spec card in a browser. The tablet bar has More and Done; the phone bar omits Line and moves Done to the phone header. Template settings remain shared-only, as required by DECISIONS §5.

## Manual checks

- iOS Safari: keyboard docking and the Layout/Field/Image menus with the software keyboard open.
- Android Chrome: keyboard docking, viewport changes, and bottom-sheet focus.

These require real devices and are not claimed as completed by the desktop browser checks.

## Review captures

Neutral local fixtures; no hosted proposal data. Canonical sheet geometry comes from PR #58; narrow displayed sheets retain its responsive projection. Keyboard-dock captures use a simulated 550px visual viewport, cropped to that visible area, rather than claiming a physical keyboard/device test.

| Reference | Local capture |
| --- | --- |
| 1d — Shared menu | [1440px](screenshots/header-footer-pr3/1d-1440-shared-menu.png) |
| 1e — Unique at rest | [1440px](screenshots/header-footer-pr3/1e-1440-unique.png) |
| 1f — Use shared confirm | [1440px](screenshots/header-footer-pr3/1f-1440-confirm.png) |
| 1h — Cover pill | [1440px](screenshots/header-footer-pr3/1h-1440-cover-pill.png) |
| 1i — Styles and own pages | [1440px](screenshots/header-footer-pr3/1i-1440-styles.png) |
| 1j — Sections markers | [1440px](screenshots/header-footer-pr3/1j-1440-sections-markers.png) |
| 1k — Reflow note | [1440px](screenshots/header-footer-pr3/1k-1440-reflow-note.png) |
| 2a — Tablet editing | [768px](screenshots/header-footer-pr3/2a-768-tablet-band.png) |
| 2b — Keyboard dock | [375px](screenshots/header-footer-pr3/2b-375-keyboard-band.png) |
| 2c — Actions sheet | [375px](screenshots/header-footer-pr3/2c-375-band-sheet.png) |

## Local verification

- Full browser suite: 160 passed, three optional captures skipped (12.4 minutes). Pagination/frozen-break, save-conflict, signing and overflow checks remain intact.
- Final band/override suite after the count clarification: six passed, including actual PDF text and count consistency across Styles, edit bar, menu and phone header. The full run also passed the seven existing shared-band checks.
- Unit/database suite: 329 passed in 56 files.
- Typecheck, formatting, neutral-code guard, production build and PDF runtime tracing (328 API files) pass.
- Poppler-rendered neutral PDF page inspected: unique page-2 header, hidden page-2 footer and shared page-3 footer.

GitHub CI is not awaited. No hosted resources were created or live integrations used.
