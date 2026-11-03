# Editor v2 shell — owner decisions

Source: `design/editor-v2/specs/editor-v2.md`, the browser-served `Redesign 10 - Editor Prototype.dc.html`, and the PR 1 request. Implementation starts from main `76ea8f2`.

## Confirmed: preserve the phone editor below 700px

Jonathan confirmed that PR 1 keeps the current phone header and editor layout below 700px. The Redesign 11 phone header belongs to PR 4. The 375px PR screenshot therefore intentionally shows the existing phone header. An automated check verifies Review & send remains fully inside that viewport.

## Confirmed: 409 temporarily locks editing

Jonathan confirmed that a revision conflict is an exception to “Never block typing”. The stale bar offers Reload; document text, block actions and quote fields are read-only until reload. The existing reloadConflict/recovery callbacks remain unchanged. Reload retains the local version as a suggestion; Keep reapplies it through normal revision-checked saving. Saving itself never disables typing.

## Pending: new header between 700px and approximately 840px

With a 200-character title (minimum 120px), the AI pill and the exact requested controls/gaps, the new 56px header needs approximately 840px even with the compact PDF/Preview labels. At 768px the header scroll width is 840px and Review & send extends outside the viewport. The requested 924/1024/1180/1440px cases fit.

The prompt requires the new header at 700px and above and Review & send visible at every width. These cannot both be met with the fixed control sizes and single-row order. Per “If the spec is silent, or it contradicts the prototype or this prompt, stop and ask in the PR. Don't guess”, a decision is pending on [PR #51](https://github.com/marketfreshstudios/mktfresh-proposals/pull/51#issuecomment-6594692239):

1. Keep the current header until 924px.
2. Put secondary actions in an overflow menu at narrow tablet widths.
3. Permit a two-row header at those widths.

No exception has been selected without the owner's answer. The extra 768px geometry regression remains active to expose the unresolved fit. The PR stays a draft until this decision and its test are resolved.
