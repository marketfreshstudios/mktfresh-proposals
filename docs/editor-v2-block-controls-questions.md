# Editor v2 block controls — resolved owner decisions

PR 2 starts from merged PR 1 (`66139aa`). Redesign 10 was served locally and opened in a browser, including paragraph and cover states. The following owner answers govern differences from the prototype/spec.

- Cover/title editing stays fixed outside the content array, with no edit bar, insertion controls or drag handle. Add above on the first real block inserts at index 0, after the cover.
- A More block actions menu immediately before Delete retains Start on next page / Remove page break and contract Add clause, using their existing handlers. It is omitted when no extra command applies.
- Duplicate remains disabled for pricing tables and signatures, with the owner's explanatory titles. Existing duplicate/readiness rules remain unchanged.
- All editor chrome carries `data-editor-chrome`. The owner approved changing only the selector lists in `pagination-dom.ts`, `browser-pagination.ts` and `paged-paper.tsx` to exclude that shared attribute. Measurement, PagePlan, page-break algorithms and version hashing remain unchanged.
- Keep the exact floating prototype placement, even where the bar overlaps preceding text. Only the floating edit bar is exempted from the old overlap assertion; movement and gutter/AI overlap checks remain.

Below 700px, the existing phone controls remain. The desktop replacement uses PR 1's compact flag and existing command callbacks. No Send update action is introduced.

## Template history placement — resolved

The existing Studio template header had no Undo/Redo controls; they lived in the desktop formatting bar being removed. The owner explicitly approved adding only Undo/Redo to the template header at ≥700px, using the existing history handlers and supplied icons. The proposal shell and phone history controls remain unchanged.

Question: https://github.com/marketfreshstudios/mktfresh-proposals/pull/52#issuecomment-6596599369

## 924px modal-drawer acceptance — resolved

The owner confirmed preserving PR 1's modal tools drawer below 960px. Panel-open toolbar/Delete checks run at 1440/1180/1024px. At 924px, toolbar reachability is checked after closing the drawer; a separate test checks the modal scrim, focus trap, scrim close and Escape. No shell behavior or breakpoint changed.

Question: https://github.com/marketfreshstudios/mktfresh-proposals/pull/52#issuecomment-6596748174
