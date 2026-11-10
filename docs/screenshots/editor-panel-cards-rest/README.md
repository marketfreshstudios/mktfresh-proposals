# R23 tools cards, second PR

Turn 2 references 2b–2e are captured from the supplied HTML. Each comparison pairs the reference (left) with the live 380px panel (right). Full editor captures cover 1440, 768 and 375 in light and dark modes.

- 2b: searchable field cards, readable values and tokens; search opens matching groups.
- 2c: grouped block insertion, disabled reasons and card disclosures.
- 2d: shared typography/page/cover/band controls, header expanded, shared-band actions, and Reset/Save actions.
- 2e: Readiness, Email, Link settings and the final Send card. Existing Subject, rich Note, manual delivery and client contact remain available.
- Save screenshots: the enabled action and its confirmation. Cancel receives initial focus; differences are listed before the staff write.

The fixture has the fields and saved blocks it actually defines. The first-run empty groups are not populated with invented values. Header/footer per-page rows appear only when real unique overrides exist. The live sans totals and solid readiness icons follow the owner's explicit R19/#151 decisions.

No client/PDF renderer or document geometry changes. Save to template uses existing revision helpers and requires no migration. The code and tests preserve per-page overrides, untouched content/cover/pricing, saved-block links, conflict handling, and frozen/sent snapshots.
