# Editor v2 shell — owner clarification before implementation

PR 1 is paused at the request's instruction: “If the spec is silent, or it contradicts the prototype or this prompt, stop and ask in the PR. Don't guess.” No application code or behavior has changed.

Source: `design/editor-v2/specs/editor-v2.md` and the browser-served `Redesign 10 - Editor Prototype.dc.html`, from main `76ea8f2`.

## 1. Phone header for PR 1

The request says “Review & send” must always remain fully visible, retains the exact desktop header order/minimum title width, and asks for a 375px screenshot. The supplied Redesign 10 prototype clips the header at that width. In the browser at 375px, the header has `clientWidth = 375` and `scrollWidth = 832`; Review & send spans approximately x=711–832. At 924px it fits (the button ends at x=912 inside a 924px header).

The new phone header is described separately in §6.5, assigned to PR 4, and is outside PR 1's listed scope.

**Decision needed:** should PR 1 retain the current functional phone header until PR 4, or bring the Redesign 11 phone header forward into this PR? Alternatively, confirm that temporary Redesign 10 header clipping below 700px is intended for this intermediate PR.

## 2. Typing after a 409

The request's status rules say “Never block typing.” Its acceptance checks and spec §12 say a forced 409 disables editing until Reload. The current editor permits continued typing after a conflict while preventing saves and keeping the newest local text for recovery.

**Decision needed:** confirm that 409 is an explicit exception to “Never block typing,” and that this PR should disable editing until Reload; or keep the current editable conflict-recovery behavior.

Once these are resolved, implement the agreed shell without changing save/autosave/history/review/readiness/pagination/sorting/API behavior, run the existing browser suite and new shell checks, and add implementation screenshots at 1440/1024/375 to this same PR.
