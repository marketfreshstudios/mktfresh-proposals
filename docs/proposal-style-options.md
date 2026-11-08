# Proposal style options

Studio v3 §10.3 uses existing style/settings JSON; **no hosted SQL or backfill**.

Existing defaults are body **16px** and **0.75-inch margins** on every side. New presets are opt-in: Narrow 0.6 / Normal 0.9 / Wide 1.1 inches. An unchanged margin remains “Current · 0.75 in”; existing custom margins remain available. Existing per-level Ink/Accent/Custom heading controls and advisory contrast warnings are reused, with no second heading-color setting.

Workspace defaults apply through the existing inheritance model. Templates and proposal Styles offer the same overrides. Publication freezes the resolved values; later workspace/template changes cannot change stored versions. Legacy resolved JSON, generated CSS and Cards HTML remain byte-for-byte unchanged until a setting is chosen.

Owner-approved Table mapping: one item per row, with stacked Qty / Price / Total values for each stored sub-line. Description holds the labels and terms. One-time/monthly/yearly amounts are never added together. Fitting choice groups stay together; only over-tall groups split between item rows. A single over-tall row remains intact and visible with the existing overflow warning. Native checkboxes/radios retain their IDs, names and exclusive group behavior.

The same table typography, columns and row structure serve editor, PDF and client. Headers repeat at saved row boundaries. PagePlan's existing unit IDs remain the source of truth; display-only table spacer rows never enter stored content or PDF measurement.

## Local verification — November 8, 2026

- 624 unit tests passed across 119 files; typecheck, formatting, neutral-business check and production build passed.
- Full configured browser suite: 327 passed, 4 existing skips (331 tests), 19.9 minutes on final application code.
- All 15 new browser checks passed: the margin × body-size × layout matrix, long-table row splitting and repeated headers, stable native choices and keyboard interaction, shared settings persistence, and intentionally empty previews. Continuation headers start within 1px of the content edge. The existing page-aware insertion tests also pass with the selected-page highlight assertion.
- Five consecutive long-table interaction runs passed with 4× CPU throttling. Desktop Table axe and 44px target checks passed; phone Table retains the chosen body size without horizontal page scroll.
- Requested 1440px editor/PDF/Workspace and 375px client captures are in `docs/screenshots/proposal-style-options/`. No hosted SQL or backfill.
