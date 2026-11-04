# Header/footer foundation preflight

Base: main `f3c6181` (PR #56). Branch: `codex/header-footer-foundation`.

Read the owner decisions, build spec, and Editor v2 references. Served Redesign 13 locally and opened frames 1a, 1i, 3a and the spec card in Chromium. The owner decisions override the spec; the requested PR excludes client-page changes, band editing and override UI.

## Decisions needed before the geometry/model commits

The request says: “If the spec is silent or conflicts with the code, stop and ask in the PR.” Two current-code conflicts need a decision:

1. **Responsive editor projection versus fixed Letter geometry.** `PagedPaper` / `projectPageSheets` currently render responsive-width, content-sized sheets. Narrow browser wrapping can extend a displayed page; the canonical Letter-width pagination remains authoritative. Redesign 13 uses Letter-height sheets and fixed bands, and the request requires each editor content area to equal the PDF's. Proposed: use exact Letter geometry when the editor has room; retain the approved narrow-screen, full-size text projection and allow only its visual sheet to extend, keeping bands outside its displayed content. Geometry assertions compare canonical editor/PDF areas; narrow projections retain source break points. Alternative: fixed Letter sheets at all editor widths, with horizontal canvas scrolling where they do not fit. Neither option changes PagePlan or PDF page size.

2. **Built-in workspace-logo source.** Existing image blocks accept embedded PNG/JPEG data only (`presentation.ts`), while workspace logos are private storage paths served through the existing logo route and embedded separately by the PDF renderer. Proposed: permit a reserved `workspace-logo` source in `Band.image` for the built-in default, resolving it with the existing editor logo route / PDF logo data; uploaded band images retain the existing embedded-data convention. Alternative: materialize the current logo as embedded PNG/JPEG when default settings are created/loaded. This affects whether the default follows later workspace-logo changes or remains a snapshot. No new asset store or migration is proposed.

## Independent CI timing fix

The edge-word regression now flushes the scheduled responsive pagination pass, waits for `data-layout-settled=true`, then asserts the identical page count and exact PagePlan directly. It no longer relies on the default five-second polling predicate after resizing. The first/last word, frozen-source-plan and unchanged-font-size assertions are retained. Three consecutive focused runs passed (19.2 seconds); formatting passed.

After decisions: implementation commits A (model/publication), B (shared variable-height geometry), C (rest/PDF rendering), D (Styles accordions/switches), followed by the requested 1440px editor and PDF evidence. Frozen versions lacking `header_footer` must remain band-free.
