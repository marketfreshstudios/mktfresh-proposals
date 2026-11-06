# Starter proposal templates — owner decisions needed

Baseline: main `d5a431d` (approved spec, after email editor `a109d83`). Source: `design/templates/starter-templates.md`. No application, hosted data or existing proposals have been changed.

The request says to stop and ask in the PR when the spec conflicts with the code. These decisions are needed before implementing the six templates:

1. **Tables are not supported.** The spec uses timeline/goal tables in templates 1, 5 and 6 and explicitly says to ask if no table block exists. `Block` in `src/lib/model.ts` supports heading, paragraph, image, pricing table, signatures, page break, variable and contract; the rich-text editor does not have a table extension either. Adding a table would expand the proposal block format and require editor/client/PDF/pagination support, contrary to the request's format/editor exclusions. Options: authorize that additional scope, or approve an existing-block representation of each table that preserves all words and row order.

2. **The cover validity row duplicates a sentence.** The approved row is `{{proposal.date}} · Valid until {{proposal.validity}}`. In `src/lib/presentation.ts`, `proposal.validity` already resolves to `This proposal is valid until November 6, 2026.` (or empty for indefinite proposals). Literal seeding would render `November 6, 2026 · Valid until This proposal is valid until December 6, 2026.` and leave the prefix for indefinite proposals. Options: use separate existing date and validity cover lines; approve custom wording with `proposal.valid_until` and its indefinite warning; or provide revised wording. Existing field behavior and frozen versions should remain unchanged.

3. **Clause 4.4 outside MarketFresh.** The exact seed body names $175/$100 and its unchanged `show_when` condition selects product `00000000-0000-4000-8000-000000000103`. New workspaces deliberately get no MarketFresh products/default quotes, so that condition cannot match there. Should their Website design & build starter omit 4.4 until the workspace authors its own plan terms, or retain the exact clause and condition as an inactive starting point? MarketFresh will retain the exact existing clause body and rule either way.

Other verified details:

- Choice groups already permit zero preselected options. No choice/signing rule change is needed for the care-plan starter.
- The MarketFresh seed contains build `…101`, combined Own It Over Time `…103`, the current website template's optional Hosting + Essentials item `…104`, Care Lite/Standard/Pro `…105`/`…106`/`…107`, visibility Core/Growth `…109`/`…110`, and Audit `…100`. The backfill will verify actual item availability before writing; it will not create or change prices.
- Business state can be stored in existing workspace settings JSON; no standalone settings column is necessary.
- The detailed template sections and final creation order (6, 1, 2, 3, 4, 5) are the intended construction/order rules. No existing proposal or frozen version will be rewritten.
- A separate one-time hosted backfill will be provided for the owner; it will not be run against the hosted workspace during implementation.
