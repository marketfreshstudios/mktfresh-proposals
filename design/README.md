# Designs

> **Superseded for UI by `redesign/` (29 October 2026).** Build from `redesign/specs/README.md` and the `redesign/Redesign 0X - *.dc.html` files; see `redesign/CODEX_BRIEF.md`. The material below remains the reference only where the redesign is silent.

Exported from Claude Design on 29 October 2026. These are the visual source of truth for the Phase 2 UI (`PHASE2.md`, workstream E). Reference material, not application code: nothing here is built, imported or type-checked (`tsconfig.json` excludes this folder).

## `system/` — the design system

Read in this order:

1. `README.md` — content fundamentals, colour layers, type, spacing, iconography, and the usage rules that are not negotiable.
2. The numbered sections: `20-status-vocabulary.md`, `30-money-and-totals.md`, `40-trust-and-integrity.md`, `50-client-pages.md`, `60-ai-authorship.md`, `70-internal-app-and-email.md`.
3. `components/<Name>/README.md` for each component you build, and its `preview.html` for how it looks with sample data.

Implementation inputs:

- `tokens.json` — every token, light and dark themes. `tokens.css` is the same as CSS custom properties, with `@font-face` rules pointing at `fonts/`.
- `components/bundle.css` — the component styles, written entirely in tokens. Port these to the app's styling approach; keep class names or equivalents so the visual result matches.
- `components/bundle.js` + `components/index.d.ts` — the reference React implementations (exposed as `window.ProposalDS`) and their prop contracts. Rebuild them as typed React components in `src/`; the `.d.ts` is the API to match.
- `fonts/` — Public Sans, Source Serif 4, IBM Plex Mono (all SIL OFL). Self-host these.
- `assets/Icons/README.md` — the icon set (Font Awesome Free 6 Solid, CC BY 4.0) and the semantic name for each glyph. Install `@fortawesome/fontawesome-free` and map the names; keep the attribution.

## `screens/` — the 17 wireframed screens

`canvas.json` lists every artboard with its title and size. Staff side at 1440 px desktop: `Main` (dashboard), `Proposals`, `New`, `Editor`, `Send`, `Record`, `Countersign`, `Audit`, `Integrations`. Client side at 390 px phone: `ClientPassword`, `ClientReading`, `ClientStale`, `ClientSign`, `ClientBilling`, `ClientSigned`, `ClientCompleted`, `ClientEnded`.

Each `*.dc.html` is a Claude Design component file. It will not render on its own (it expects that tool's runtime), so read it as markup: layout, hierarchy, copy and states are what matter. `<x-import component-from-global-scope="ProposalDS.Button" …>` means "the design-system `Button` with these props". Sample data lives in each file's `renderVals()`.

## Things to know before building from them

- **Sample data is neutral and illustrative.** "Meridian Studio", "Brightline Foods", "Rowan Vale" and the prices are placeholders; never ship them. In particular, `ClientBilling` and `ClientReading` show a "12-month minimum" on the $175/mo line — the real figure comes from the line's `min_term_months` (currently 18 for MarketFresh's Own It Over Time). Render whatever the data says.
- **Where a screen and `PHASE2.md` disagree, `PHASE2.md` wins.** The screens were drawn before custom product families, yearly intervals and the playbook handoff were specified.
- **Nav items rendered as plain text** (Clients, Pricing, Templates, Content library, Imports, Settings) are the screens without wireframes; build them from the system per `PHASE2.md` §E.
