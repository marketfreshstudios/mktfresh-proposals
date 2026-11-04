# Header/footer PR 4 — client desktop sheets

Base: merged #60 (`d69a976`). The owner decision in `design/header-footer/DECISIONS.md` §1 wins: Letter sheets at ≥1100px; the existing flowing client document below 1100px.

## Plan-persistence decision needed

The current code preserves `version.pagination` in `ProposalService.toggle()` and freezes that same plan in `sign()`. The PDF renderer uses it via `applyPagePlan()`. The public response currently omits header/footer data as well.

A browser-only re-pagination after choices would therefore diverge from the signed PDF. To satisfy both live re-pagination and exact PDF page matches, this PR needs a narrow, revision/hash-guarded way to validate and save the client's computed plan. That requires an exception to the instruction to leave signing flows unchanged. The alternative is to retain published breaks after choices and omit live re-pagination. Asked in the PR and chat; dependent persistence work awaits the owner's decision.

## Independent work

The count-wording fix is isolated in its own commit, with a shared helper and unit test: `1 page` / `N pages`; for a single shared page, `Changes show on this page only`.

Read and opened Redesign 13 frame 3a in a browser. Desktop geometry must come from the existing shared functions; the editor, PDF renderer and PagePlan format remain unchanged.
