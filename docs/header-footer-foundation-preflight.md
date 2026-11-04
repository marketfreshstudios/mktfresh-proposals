# Header/footer foundation preflight

Base: main `f3c6181` (PR #56). Branch: `codex/header-footer-foundation`.

Read the owner decisions, build spec, and Editor v2 references. Served Redesign 13 locally and opened frames 1a, 1i, 3a and the spec card in Chromium. The owner decisions override the spec; the requested PR excludes client-page changes, band editing and override UI.

## Owner decisions (resolved in this chat)

The request says: “If the spec is silent or conflicts with the code, stop and ask in the PR.” The owner resolved both current-code conflicts:

1. **Responsive editor projection versus fixed Letter geometry.** `PagedPaper` / `projectPageSheets` currently render responsive-width, content-sized sheets. Narrow browser wrapping can extend a displayed page; the canonical Letter-width pagination remains authoritative. Redesign 13 uses Letter-height sheets and fixed bands, and the request requires each editor content area to equal the PDF's. Chosen: use exact Letter geometry when the editor has room; retain the approved narrow-screen, full-size text projection and allow only its visual sheet to extend, keeping bands outside its displayed content. Geometry assertions compare canonical editor/PDF areas; narrow projections retain source break points. The fixed-Letter-with-horizontal-scrolling alternative was not selected. PagePlan and PDF page size are unchanged.

2. **Built-in workspace-logo source.** Existing image blocks accept embedded PNG/JPEG data only (`presentation.ts`), while workspace logos are private storage paths served through the existing logo route and embedded separately by the PDF renderer. Chosen: permit a reserved `workspace-logo` source in `Band.image` for the built-in default, resolving it with the existing editor logo route / PDF logo data; uploaded band images retain the existing embedded-data convention. The embed-at-creation alternative was not selected. The default follows workspace-logo changes, matching the cover mechanism; uploaded images remain embedded. No asset store or migration is introduced.

## Independent CI timing fix

The edge-word regression now flushes the scheduled responsive pagination pass, waits for `data-layout-settled=true`, then asserts the identical page count and exact PagePlan directly. It no longer relies on the default five-second polling predicate after resizing. The first/last word, frozen-source-plan and unchanged-font-size assertions are retained. Three consecutive focused runs passed (19.2 seconds); formatting passed.

Delivered: implementation commits A (model/publication), B (shared variable-height geometry), C (rest/PDF rendering), D (Styles accordions/switches), followed by the requested 1440px editor and PDF evidence. Frozen versions lacking `header_footer` must remain band-free.
