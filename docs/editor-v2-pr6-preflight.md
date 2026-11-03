# PR 6 owner-review preflight

Base: `30297b8` (PR #55 merged). Reference: `design/editor-v2/Redesign 10 - Editor Prototype.dc.html`, opened in a local browser with the bundled fonts.

## Confirmed TEST 3 page-break cause

Measured the existing neutral TEST 3 regression fixture at 1440px with Sections and Quote open:

- Main width: 820px; sheet width: 760px.
- Sheet left/right padding: 88px / 86.4px.
- Visible text column: 585.6px; canonical PDF content column: 672px (Letter with 0.75in margins).
- Page 2 starts in `regression-9` at source offset 312.
- In a decoration-free display-width clone, the space after “hear” and the “a” in “about” have the same line top (4054.28125px). The stored PDF break therefore lands inside an on-screen line.

The before capture is [break-before.png](screenshots/editor-v2-pr6/break-before.png). The raw owner export remains outside git; only the existing neutral fixture was used for this capture.

## Signature grouping question

The prototype's `isSig` is one paired block, but the app stores client and company signatures as independent blocks. They can be separated by an explicit page break and body text; `e2e/editor-round4.spec.ts:457` deliberately exercises that authored layout.

For fix 5, should pairing apply only to adjacent client/company signature blocks, preserving intentional separation, or should all unsigned signature blocks be brought together regardless of their current positions?

Recommended: pair adjacent blocks; retain explicitly separated blocks in their authored positions. All frozen PagePlans remain authoritative either way. No choice has been implemented yet.

## Delivery sequence

Each numbered fix will have its own implementation commit: (1) wrapping and widow/orphan rules, (2) Sections handle alignment, (3) pricing rows, (4) totals, (5) signatures, (6) cover, (7) sub-lines. Cover data can use the existing proposal/template/version JSON; no schema migration is currently indicated. Stripe, billing, readiness policy, publication policy and the sealed certificate page are outside this PR.
