# Editor v2 shell — owner decisions

Source: `design/editor-v2/specs/editor-v2.md`, the browser-served `Redesign 10 - Editor Prototype.dc.html`, and the PR 1 request. Implementation starts from main `76ea8f2`.

## Confirmed: preserve the phone editor below 700px

Jonathan confirmed that PR 1 keeps the current phone header and editor layout below 700px. The Redesign 11 phone header belongs to PR 4. The 375px PR screenshot therefore intentionally shows the existing phone header. An automated check verifies Review & send remains fully inside that viewport.

## Confirmed: 409 temporarily locks editing

Jonathan confirmed that a revision conflict is an exception to “Never block typing”. The stale bar offers Reload; document text, block actions and quote fields are read-only until reload. The existing reloadConflict/recovery callbacks remain unchanged. Reload retains the local version as a suggestion; Keep reapplies it through normal revision-checked saving. Saving itself never disables typing.

## Confirmed: Redesign 11 tablet header at 700–959px

Jonathan selected Redesign 11 frame 1a (`design/editor-v2/Redesign 11 - Editor v2 Tablet and Phone.dc.html`), inspected in the browser. At 700–959px, keep the 56px single row with its 8px gaps and 10px outer padding: Proposals, divider, ellipsized title (minimum 120px), dot and short status, spacer, text-only AI pill, PDF, Preview, Review & send.

The visible status drops the Draft prefix: Saved, Saving…, Offline, Unsaved, Recovered, Reload or Retry (Locked for the header's locked prop). The full status and last-saved time remain in its tooltip, with the full action label on Reload/Retry. Undo/Redo buttons are absent at these widths; the unchanged history controller and keyboard shortcuts remain available. Clicking the AI pill still calls showReview().

At 960px and above, retain PR 1's existing desktop header with Undo/Redo. Below 700px, retain the existing phone header and editor layout until PR 4. No overflow menu or two-row fallback is introduced.

Playwright verifies fit at 700/768/924/959px and the desktop boundary at 960px, using a 200-character title and AI sections. At 768 and 924px it also verifies absent history buttons, Control and Command undo/redo, and AI navigation. All owner questions are resolved; mark PR #51 ready after local validation passes, without waiting for CI or merging.
