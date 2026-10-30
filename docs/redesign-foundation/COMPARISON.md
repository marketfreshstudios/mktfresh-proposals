# Phase 1 Foundation — design comparison

Reviewed 30 October 2026. Source: design/redesign/CODEX_BRIEF.md, specs/README.md, specs/tokens.css and the rendered Redesign 0X HTML files.

[Open the side-by-side review](index.html). The [manifest](screens/manifest.json) lists every application capture, its route, width, theme and reference frames. These are neutral test fixtures, not live workspace data or provider acceptance evidence.

## Captures and method

- 19 existing staff surfaces, plus New proposal and Studio sheets, at **375 / 768 / 1440**, in **light / dark**: 126 full-page captures.
- Six additional Home viewport captures use the source frame heights (375×780, 768×1100, 1440×960), for direct shell comparisons.
- Original reference frames: 3a–3f in both supported themes; 2a/2c/2d/2f, 5g/5h, 6a–6f, 7a–7g and 8c; Design System board 04 contains both component themes.
- Reference exports are served as HTML and rendered through their own supplied runtime. Instrument Sans is supplied locally to the reference renderer. No exported sample data is copied into application code.
- Automated checks enforce staff surface colors, Instrument Sans, 232px desktop / 64px tablet navigation, phone-tab visibility and no horizontal page overflow on every captured surface.
- Visual inspection compared Home at all three widths, the dark phone shell, the design-system type/colors and legacy paper. Feature bodies are deliberately not pixel-matched in Foundation.

## Findings

| Area | Reference | Phase 1 result |
|---|---|---|
| Desktop navigation | 3d, 6a | 232px sidebar; primary Home / Proposals / Clients; global New proposal and Studio menu. |
| Tablet navigation | 3e, 6b | 64px rail, word-labelled icons, compact New proposal, Studio access. |
| Phone navigation | 3f, 6c | Five slots: Home / Proposals / + / Clients / Studio. Hidden inside proposals; draft editor retains Preview / Review & send as its phone action bar. |
| Theme | 04 | Supplied warm light/dark tokens, fixed semantic colors, tenant accent and derived soft colors. White document paper remains white. |
| Typography | 04 | Self-hosted Instrument Sans staff chrome, Source Serif 4 display/document text, IBM Plex Mono evidence. |
| Status | 04; 3a–3c | Stored signed/client-complete map to Won; declined maps to Lost; Needs countersign and Billing to finish are tags. Stored statuses/events are unchanged. |
| Money | §4; 04 | Auto whole dollars, exact cents when present, optional always-cents preference; staff interval rows use /mo and /yr. Yearly amounts are kept separate. |
| Loading | 8c; 04 | Announced skeleton primitives, no content spinner, reduced-motion support. Full table-specific loading layouts remain Phase 5. |
| Routes | 01 IA; §2 | Canonical Studio and proposal addresses, server redirects from old addresses, draft editor at /proposals/:id, existing send/evidence/countersign flows reachable by query views. |
| Legacy integrity | brief non-negotiables | Client/PDF rendering keeps its original CSS, Public Sans files and fixed-cent formatter. Staff sent-document paper uses legacy text tokens. Tests preserve old HTML, flat quote shape and signed hashes. |

## Deliberate differences and deferrals

- **Scope:** Home still contains the current dashboard metrics and tables; the redesigned grouped Home is Phase 4. Record, editor, lists and Studio retain their current feature bodies under the new foundation.
- The prototype desktop sidebar declares width 232px but its content-box padding/border makes its painted width about 261px. The implementation follows the higher-precedence explicit **232px** spec using border-box sizing. Tablet similarly follows the explicit 64px.
- The source tablet rail renders small words; the implementation uses icons **with words**, satisfying the icon-rail and accessibility rules.
- Phone tab graphics use real accessible links/buttons and a 44px New target. Source frame device outlines are presentation furniture and are not part of the app.
- The export notes misnumber the tablet editor range: actual frames 5g/5h contain the editor; 5e contains Billing. The gallery follows the actual frame contents.
- Some Studio reference frames are light-only. Their application dark captures use board 04's dark tokens; no invented dark reference is claimed.
- New proposal is now a native modal/bottom sheet reusing the existing form. Send remains the existing form in a query view until Phase 3; countersign remains the current guarded form until its Phase 4 sheet.
- Activity has its canonical address and a pointer to current per-proposal evidence. Workspace-wide filtering and CSV export remain Phase 5.
- Public Sans is intentionally retained because current sent/signed client pages and PDFs still use it. It cannot be dropped without violating frozen-rendering precedence.
- No new quote model, migration, choice-group billing, MCP input shape, contract clauses or manual outcome actions are introduced in Foundation. Their migration/adapter/compatibility tests belong to Phase 3/4 and are explicitly deferred.

## Reproduction

Run npm run test:e2e -- e2e/redesign-foundation.spec.ts. Playwright starts the app and a separate static server for design/redesign. Output: .data/evidence/foundation. Copy that directory's PNGs and manifest into docs/redesign-foundation/screens after a verified run.

The gallery is static, self-contained HTML with local PNGs; serve docs/redesign-foundation to review it.
