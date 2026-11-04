# Shared band editing (header/footer PR 2, PR #59)

Desktop staff can hover or focus a shared header/footer, then use Edit, double-click or Enter to edit it. Shared text, fields, marks, layout, divider and image changes use normal editor history and saving. Every shared occurrence updates together; published unsigned proposals keep their existing client link.

The 40px band bar has 44px hit areas and uses the existing Editor v2 menu manager. It sits 14px outside the band at 0.75in margins and flips over dimmed content below 0.6in. Its contents scroll inside narrow desktop canvases. Page fields are local to the band editor and PDF renderer; body field pickers do not receive them. Uploaded PNG/JPEG images remain embedded and obey the existing one-million-character image schema and 18px rendering limit. “Use workspace logo” restores the reserved source.

## Owner reset decision

- Proposal “Reset to template” reads the template's **current saved** shared bands, divider, height and Show on cover; a missing template uses built-in defaults.
- Studio uses “Reset to default” and “Restores the built-in header and footer.”
- Header/Footer visibility switches and page overrides remain independent. Reset supports history and an Undo toast. No snapshot storage was added.

## Scope

Editing starts at the existing desktop editor breakpoint (960px). Tablet and phone bands stay at rest; their editing and per-page override controls are PR 3. The client web page is PR 4. Geometry functions, PagePlan, PDF break computation, version hashes, readiness, billing and AI tools are unchanged.

Transparent section wrappers no longer trap block toolbars below rest bands. The tools drawer hides its redundant background rail from assistive technology while open. Closing commits the originating panel state before a resize; direct field-command closes retain their original completion callback. Native modal focus behavior remains in place.

## Visual review

Opened Redesign 13 in a browser and compared frames 1b, 1c, 1g and 1l. Both dropdown states are shown separately, preserving one open popover at a time. Screenshots use neutral local data at 1440×1000:

- [Header hover (1b)](screenshots/header-footer-pr2/header-hover-1440.png)
- [Header editing and Layout (1c / 1l)](screenshots/header-footer-pr2/header-layout-1440.png)
- [Header editing and Field (1l)](screenshots/header-footer-pr2/header-fields-1440.png)
- [Footer editing (1g)](screenshots/header-footer-pr2/footer-edit-1440.png)

## Validation

`e2e/band-editing.spec.ts` covers unchanged hover/focus geometry, live shared content in editor/PDF, undo, lossless column reduction, cursor and fallback insertion, keyboard/focus order, menu axe checks, touch targets, margin flip, desktop-only editing, image/workspace-logo commands, template editing/inheritance and both reset paths. The existing pagination, frozen-break, signing, geometry and certificate checks remain intact.

Owner Image default for PR #59: before any column is focused, Image uses the existing image’s column, or the **first** column if no image exists. After column focus, image commands use that column. Field insertion independently falls back to the end of the **last** column.

## Local check results

- Full browser suite: **154 passed, 3 optional screenshot-only checks skipped** (12.4 minutes).
- Final shared-band suite after owner clarification: **7 passed**, including exact 18px editor/PDF scaling of a 64px upload, both no-cursor image defaults, focused-column commands, last-column field insertion, removed-column fallback and complete page Tab order.
- Vitest: **321 passed** across 55 files.
- Typecheck, formatting, neutral-code guard and production build pass. API runtime tracing verifies **328 files** for the PDF renderer.
- No GitHub CI wait; no hosted resource changes or live-provider verification are part of this PR.

Band rich text removes Tiptap-only list/link metadata before storage while preserving text, fields and marks. The editor compares the normalized shape too, so ordinary typing does not replace the document or lose the cursor.

Word selection inside an open band retains its column. Edit shared is disabled when no page shows that band; enabling Show on cover makes it available for a one-page template. Both interaction regressions pass.
