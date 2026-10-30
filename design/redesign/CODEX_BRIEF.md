# Redesign build brief (Codex)

Build the redesign in `design/redesign/` into the app. The visual source of truth is the eight `Redesign 0X - *.dc.html` files, and the build spec is `specs/README.md` (with `specs/countersign-from-list.md` and `specs/tokens.css`).

## How to view the designs

- The `.dc.html` files render on their own. Serve this folder (`npx serve design/redesign`) or open the files in Chromium.
- Frame ids (`1a`, `2c`, `8f`…) in the spec point to frames in those files.
- Sample data is illustrative. "Brightline Foods", "Rowan Vale" and the amounts are placeholders and must never ship.

## Precedence

1. **Safety and integrity rules in `PHASE2.md`, `DECISIONS.md` and `AGENTS.md` always win.** This covers:
   - Stripe test mode only
   - AI never sends or signs
   - frozen signed snapshots and content hashes
   - the audit trail
   - the app never calculates or suggests prices
   - workspace isolation
   - `check:neutral`
2. **Then `design/redesign/specs/README.md`.** It deliberately changes behaviour: IA, status words, the quote model, sub-lines, choice groups and the contract block. Where it changes behaviour, it wins over `PHASE2.md` §E and over everything in `design/system` and `design/screens`.
3. **Then the older `design/system` docs**, for anything the redesign doesn't cover.

## Non-negotiables while rebuilding

- **Keep `src/` neutral.** "Own It Over Time", its 30-invoice step-down and the 18-month minimum are catalogue and seed data (`plan_terms`, `schedule`, `min_term_months`), never hardcoded in `src/`. Clause 4.4 is a seed contract clause with `show_when`. `npm run check:neutral` must pass.
- **Already signed, sealed or sent proposals must render exactly as they were signed.** Migrate stored drafts to the new quote shape: one item per old line, one sub-line each. Read old frozen snapshots through an adapter. Never rewrite a signed snapshot or change its hash.
- **Update the MCP connector with the model.** `create_proposal_draft`, `set_quote_lines` / `update_proposal_draft`, `get_proposal`, `check_ready` and `list_catalog` must accept and return the new quote shape: items, sub-lines, `optional`, `default_selected`, `choice_group_id` and `order`. Keep the old flat `lines` input working for one release by converting it. Update the tool descriptions. AI drafts must still go through review, and connectors never see countersign.
- **Billing:** sub-lines map to Stripe prices by interval exactly as lines do today. Choice groups resolve to the one selected item before any billing job is created. The existing-subscriber path (add items, no Checkout), the Checkout path and the manual invoice path all keep working. Recurring totals stay "Monthly", and yearly sub-lines show as `/yr` and are never folded into the monthly figure.
- **Status words:** map the existing stored statuses onto Draft / Sent / Viewed / Won / Lost / Expired plus the "Needs countersign" and "Billing to finish" tags. Don't rename stored audit events. Add `marked_won_by` / `marked_lost_by` per spec §3. Marking won by hand never creates a signature.
- **Fonts:** self-host Instrument Sans (SIL OFL) alongside Source Serif 4 and IBM Plex Mono in `public/fonts`, with no Google Fonts request at runtime. Drop Public Sans once nothing uses it. Custom proposal fonts per workspace (spec §11) go in phase 5.
- **Accessibility and motion** per spec §12, and responsive at 375 / 768 / 1440 for every screen you touch.

## Phases (one PR each, merge in order)

1. **Foundation.**
   - Tokens from `specs/tokens.css`.
   - App shell: sidebar ≥1100px, icon rail ≥700px, 5-slot bottom tab bar on phone.
   - New routes from spec §2, with redirects from the old routes.
   - Status pills and tags, money formatter (§4, `money.cents` auto/always) and skeleton components.
   - No feature changes yet.
2. **Client flow** (`/p/:token`, spec §7, frames 1a–1i, 5a–5d, 8-series client states). Review → Sign → Billing, the sticky totals bar on phone and tablet, the 340px "Your choices" panel on desktop, the sign step order, sealing and stale states, the existing-subscriber explanation, and the shared dead-end pattern. White-label logo and accent come from workspace settings.
3. **Quote model and editor** (§5, §6, §8, frames 2a–2f, 5e–5h).
   - Data migration and adapter for old snapshots.
   - Sub-lines and choice groups, with drag order via `@dnd-kit/sortable` and keyboard support.
   - The contract block with conditional clauses, frozen at signature.
   - Field chips, and AI review per section with "Use list price / Keep".
   - The Quote / Pricing reference / Review & send panel, the tablet drawer, and the phone section-by-section editor with sheets.
   - MCP tool updates.
   - The client page from phase 2 renders choice groups as a `radiogroup` and optional items as checkboxes.
4. **Record, countersign, Home and lists** (§9, §10, frames 3a–3f, 6a–6f, countersign spec). The "Next" card, lifecycle strip, timeline and evidence, the countersign sheet via `?action=countersign` (with the on-behalf checkbox and the stale 409 handling), list views and row actions (Sign as a link, ⋯ menu as a bottom sheet on phone), and client detail with "How they're billed" first.
5. **Studio and states** (§11, §12, frames 7a–7g, 8a–8r).
   - Templates & blocks, replacing the content library.
   - Catalog, with the plan terms editor and a preview of the client copy.
   - Connections, one card per integration with the Proposify import inside.
   - Workspace: brand with an accent contrast check, proposal fonts, money, team, signatory, link defaults.
   - Activity log with CSV export.
   - The remaining empty, loading and error states.

## Every PR

- Unit, database and Playwright tests updated, plus new tests for the migration and old-snapshot adapter, choice-group selection to billing, and the MCP old-shape compatibility.
- Screenshots at 375 / 768 / 1440 in light and dark for each screen touched, compared against the matching frames.
- Update `HANDOFF_PHASE2.md` with what changed and anything deferred.

## Open decisions (use these defaults unless Jonathan says otherwise)

1. **Clause 4.4 (Own It Over Time):** ship Claude Design's draft wording as seed data marked `draft: true`. Readiness warns "Contract clause 4.4 is draft wording" until the studio replaces it.
2. **Mark as won by hand:** an optional reason note, recorded in the audit trail.
3. **Default proposal fonts:** Source Serif 4 for headings and body, with a curated list of three to five OFL fonts. Uploaded fonts need a "licensed for PDF embedding" confirmation checkbox.
