# Ink and clay redesign (Claude Design, Redesign 15–19)

Imported 8–9 Nov 2026 from the Claude Design project. This is the current visual direction for the staff app.

**Palette update, November 10:** Harbor cool neutrals replace beige in the running app. The archived references below are unchanged; use `src/app/ink-clay-tokens.css` for the live staff palette and `src/app/foundation-tokens.css` for client and paper neutrals. Page is `#F1F4F5`, sunken and segmented controls are `#E8EDEF`, editor canvas is `#D5DEE1`, and Mist hover stays `#F4F7F7`. Ink, Clay, and the hero and semantic status hues keep their roles.

**Start with `Redesign 19 - Review Fixes.dc.html`.** It supersedes Redesign 18: the same screens and ids prefixed with 2 (2a1 = A1), plus review fixes 1a–1e, with these rules applied everywhere (where they conflict with older frames or `specs/ink-and-clay.md`, they win):

1. Cards only for things you act on; reference info sits on the page between hairlines.
2. Small labels used sparingly, never "Studio" above Studio titles.
3. Ink card only for the hero (Home pipeline) and "next step".
4. Pills are buttons only. Status chips are 6px-radius rectangles; proposal views are tabs.
5. One filled button per screen; every other action is outline.
6. DM Serif for page titles, the hero number, and section headings on the staff page background (as on Home, frame 2b1). Card titles and subsections are Instrument Sans 16/600. Totals are sans, bold, tabular. Heading levels follow nesting: one page H1, page sections H2, card titles within a section H3, and titled groups within those cards H4. A card directly under the H1 uses H2 with the card style. Dialogs use H2 for the title and H3 for internal groups. Proposal documents keep their own outline.
7. No cards inside cards: a choice group is one frame with rows split by lines; the selected row gets a tint and a 3px left marker.
8. All icons from Lucide.

Kept from Redesign 15 · 1a: the Home layout (ink pipeline card) and the calm editor panel.

- `specs/ink-and-clay.md` — the build spec. Where it disagrees with older docs in `design/` on color, type or chrome, it wins.
- `specs/tokens.css` — the design tokens (light and dark).
- `specs/README.md` — the updated overall build spec (supersedes `design/redesign/specs/README.md`).
- `specs/editor-v2.md` — updated editor spec (supersedes `design/editor-v2/specs/editor-v2.md`).
- `Redesign 21 - First Run.dc.html` — connection detail pages for Stripe and QuickBooks (frames 3a–3k, every state, Staff view, phone) and first run / empty states (1a–1i, 2b: setup checklist on Home, Staff welcome, empty Proposals/Clients/Reports/Templates/Products). Follows the Redesign 19 rules.
- `Redesign 22 - Account.dc.html` — Your account at /account (frames 1a–1h): Profile, Sign-in & security (password, sign-in links, two-step verification, sessions), Notifications, Signature (company signatory draws; Staff see it read-only), Preferences (theme, time zone, date format), account menu, change-email flow, two-step setup, tablet and phone, and paused/removed/signed-out states. Follows the Redesign 19 rules.
- `Redesign 20 - Column Styles.dc.html` and `specs/column-styles.md` — column styling moves from the modal into Styles › Selection, plus copy/paste style (frames 1a–1f). Follows the Redesign 19 rules.
- `specs/table-action-icons.json` — Lucide icons for the Proposals table row actions.
- `Redesign 18 - All Desktop Screens.dc.html` — every desktop screen at 1440 (frames A1–F7), superseded by Redesign 19.
- `Redesign 16 - Reports.dc.html` — Reports at 1440, empty, 1024 and 375.
- `Redesign 15 - Rich Direction.dc.html` — the palette (1a) and the first screens in this direction.
- `Redesign 17 - Client Dark Tablet.dc.html` — client phone screens, dark mode, tablet staff screens.
- `Redesign 14 - Studio v3.dc.html` — latest Studio layouts (newer than `design/studio-v3/`).
- `src/components/icons.json` — the design's icon set, for reference only (the app's own `src/components/icons.json` is the source of truth).

Open the `.dc.html` files in a browser next to `support.js`. Sample names, emails and amounts in the frames are fictional placeholders.

Rule carried over from the spec: client view and proposal pages keep the tenant's brand (`--accent`, `paper-*`); ink and clay never leak into them except the optional "Powered by Yeswell" footer.

## Screens without a wireframe

Use the ink-and-clay spec and the eight Redesign 19 rules for new screens,
dialogs, and panels. Choose the closest designed frame and reuse its shared
components and structure: connection marks and status chips (2e8), Workspace
label/value rows and hairlines (2e10–2e13), and pill actions. Avoid bare stacks of
paragraphs. For every new or revised surface without a wireframe, include a
screenshot in the PR and name the frame or pattern it follows.
