# Ink and clay redesign (Claude Design, Redesign 15–18)

Imported 8 Nov 2026 from the Claude Design project. This is the current visual direction for the staff app.

- `specs/ink-and-clay.md` — the build spec. Where it disagrees with older docs in `design/` on color, type or chrome, it wins.
- `specs/tokens.css` — the design tokens (light and dark).
- `specs/README.md` — the updated overall build spec (supersedes `design/redesign/specs/README.md`).
- `specs/editor-v2.md` — updated editor spec (supersedes `design/editor-v2/specs/editor-v2.md`).
- `specs/table-action-icons.json` — Lucide icons for the Proposals table row actions.
- `Redesign 18 - All Desktop Screens.dc.html` — every desktop screen at 1440 (frames A1–F7). Main reference for desktop builds.
- `Redesign 16 - Reports.dc.html` — Reports at 1440, empty, 1024 and 375.
- `Redesign 15 - Rich Direction.dc.html` — the palette (1a) and the first screens in this direction.
- `Redesign 17 - Client Dark Tablet.dc.html` — client phone screens, dark mode, tablet staff screens.
- `Redesign 14 - Studio v3.dc.html` — latest Studio layouts (newer than `design/studio-v3/`).
- `src/components/icons.json` — the design's icon set, for reference only (the app's own `src/components/icons.json` is the source of truth).

Open the `.dc.html` files in a browser next to `support.js`. Sample names, emails and amounts in the frames are fictional placeholders.

Rule carried over from the spec: client view and proposal pages keep the tenant's brand (`--accent`, `paper-*`); ink and clay never leak into them except the optional "Powered by Yeswell" footer.
