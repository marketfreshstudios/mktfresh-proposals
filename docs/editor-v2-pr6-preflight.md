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

## Confirmed signature grouping

Jonathan chose adjacent pairs only: client/company signature blocks are paired when adjacent; intervening text and explicit page breaks stay where the author placed them. A frozen PagePlan that starts a new page between the two blocks remains authoritative. Signature roles display Client on the left and Company on the right without changing the stored block order.

## Delivery sequence

Each numbered fix has its own implementation commit: (1) wrapping and widow/orphan rules, (2) Sections handle alignment, (3) pricing rows, (4) totals, (5) signatures, (6) cover, (7) sub-lines. Cover data can use the existing proposal/template/version JSON; no schema migration is needed. Stripe, billing, readiness policy, publication policy and the sealed certificate page are outside this PR.

## Final implementation and evidence

The wide editor column is now 672px at the measured 1440px layout (788px sheet, 64px left / 52px right). Larger canvases may use an 848px sheet with wider gutters. Painted sheet heights round outward to keep fractional browser margin/top rounding from putting the last unit inside bottom padding; this never changes source boundaries or PDF dimensions. Narrow displays snap only their visual continuation to a line boundary; saved offsets stay canonical. The TEST 3 first new computation starts at the whole “Coming Soon” list item (`regression-9`, offset 229, paragraph 6), rather than at offset 312 inside its text.

New computations apply two-line widow/orphan protection, including short contract clauses. Hidden measurement copies have independent radio names so they cannot change the visible selected option. Keyboard section traversal skips computed-page label drop targets, retaining explicit-page targets; pointer page/section drops retain their existing handlers.

[Before/after screenshots and matching PDF images](editor-v2-pr6-evidence.md) use the neutral TEST 3 fixture at a 1440px viewport. The raw owner export is not committed.
