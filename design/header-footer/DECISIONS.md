# Header & footer: owner decisions (3 Nov 2026)

These override `specs/header-footer.md` and the Redesign 13 file where they differ.
The editor v2 references (Redesign 10/11, editor-v2.md, tokens, icons) live in `design/editor-v2/`.

1. **Client web page:**
   - On desktop (≥1100px), the client page draws each page as a Letter sheet with its header and footer, matching the PDF (frame 3a), scaled to fit the document column.
   - Below 1100px (tablet and phone), the client page stays the current flowing layout with no bands.
   - Choosing options can change totals and conditional clauses, but client sheets keep the published PagePlan breaks, matching the sealed PDF for that selection. No client-computed pagination is accepted or persisted. This owner clarification in PR #61 supersedes the initial live-repagination requirement; signing stays unchanged.
2. **Existing data:** every proposal and template is a test, so there is no backward-compatibility requirement.
   - Proposals and templates without `header_footer` get the defaults when loaded.
   - Frozen versions without `header_footer` still render without bands, so a sealed PDF never changes.
3. **Defaults:**
   - Header (50/50): logo + `{{workspace.name}}` | `{{proposal.title}}`.
   - Footer (50/50): "Prepared for `{{client.company}}`" | "Page `{{page.number}}` of `{{page.count}}`".
   - Each template in Studio → Templates holds its own header/footer settings and shared bands, edited in the template editor.
   - New templates start from these defaults. A new proposal copies its template's settings.
4. **Image button:** the band edit bar includes Image (spec §4.2), styled exactly like the other edit bar buttons, in the same place in the header and footer bars.
5. **Safe defaults:**
   - **Storage:** `header_footer` lives in proposal/template JSON data, next to `style_overrides`; no SQL migration.
   - **Versions:** it is frozen into each version and its hash.
   - **Geometry:** it lives in a new `src/lib/page-bands.ts`, built on `pageMetrics()`, and is used by the editor, pagination and PDF. Pages can have different heights (the cover differs).
   - **Image:** `Band.image` is `{ src, alt, slot }`, like image blocks. There is no asset store.
   - **Line:** it toggles the single `divider` setting.
   - **Anchors:**
     - a page that starts at an explicit break uses that page_break's id
     - otherwise, the id of the block that starts the page
     - page 1 is `cover`
     - every repeated non-cover start is suffixed: `id`, `id#2`, `id#3`, and so on (two starts already need distinct keys)
   - **Page count:** `{{page.count}}` counts proposal pages only. The certificate page has no bands.
   - **Templates:** they also store `showHeader`/`showFooter`. Templates have no per-page overrides.
   - **Styles tab:** it becomes the accordions shown in 1i (Text styles, Page & margins, Header & footer). Existing controls are unchanged.
   - **Live editing:** band edits go live on the same link and lock after a signature.
   - **AI connector:** it gets no header/footer tools.
   - **File names:** `pages-outline.tsx` in the spec is `src/components/editor/sections-nav.tsx`.
6. **Build order:**
   - PR 1: model and pagination
   - PR 2: editing shared bands
   - PR 3: overrides, cover pill, Sections markers, tablet/phone editor
   - PR 4: client desktop sheets

7. **PR 3 owner clarifications:**
   - Header and footer collisions resolve independently. An exact match to the page's current anchor wins; otherwise the earlier anchor in document order wins and is re-keyed to the current page anchor. Other entries are dropped with the eight-second removed-band Undo toast. A deleted anchor does not transfer over an existing destination override.
   - Editing a hidden band creates an empty unique band with the shared layout; Undo restores `hidden`. A hidden band's menu has Edit and Use shared only.
   - “Shared on N pages” includes only pages actually showing shared content. Unique and hidden bands are excluded. Styles states the exclusions (`· 1 unique`, `· 1 hidden`, or both); edit bars, menus and the phone header use the same shared N. Frame 1i's Footer “8” was a design slip.
