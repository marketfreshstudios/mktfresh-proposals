# Header/footer PR 4 — client desktop sheets

Base: merged #60 (`d69a976`). Letter sheets at ≥1100px; the existing flowing client document below 1100px.

## Owner's page-plan decision

The server preserves `version.pagination` when choices change and freezes that same plan at signature. The owner confirmed this PR must keep those published breaks: no client-computed pagination is accepted or persisted, and signing remains unchanged. Client choices update the content within the published pages using the same source and plan projection as the PDF renderer.

Acceptance replaces the original re-pagination check: ticking an optional item (including one with a conditional clause) keeps the published breaks, and the sheets match the PDF generated for that selection.

## Implementation

Desktop client sheets use the existing trusted print source and `applyPagePlan`, with shared `pageGeometry` and band rendering. The projection owns its split DOM so React cannot lose live controls during range splitting. A scoped shadow root prevents print document styles from affecting the unchanged tablet/phone client layout. A version without a stored plan uses the existing print paginator, as the PDF does.

Header/footer data comes from the published version. Only the client-visible plan-terms copy is exposed, separately from internal billing metadata. No editor, geometry, PDF renderer, PagePlan or signing logic is changed.

The count-wording fix is isolated in its own commit, with a shared helper and unit test: `1 page` / `N pages`; for a single shared page, `Changes show on this page only`.

Read and opened Redesign 13 frame 3a in a browser.

## Review images

Captured from the actual local client page using neutral fixtures, at a 1440px viewport (page crops and the pricing/choices view) and 1100px (the scaled pricing page beside the choices panel):

- [Page 1 at 1440px](screenshots/header-footer-pr4/page-1-1440.png)
- [Page 2 at 1440px](screenshots/header-footer-pr4/page-2-1440.png)
- [Page 3 at 1440px](screenshots/header-footer-pr4/page-3-1440.png)
- [Pricing and choices at 1440px](screenshots/header-footer-pr4/pricing-choices-1440.png)
- [Scaled pricing page at 1100px](screenshots/header-footer-pr4/client-1100.png)

## Verification

The checks compare actual PDF page count, each page's extracted band text, canonical DOM content heights before scaling, and published PagePlans. Choice/conditional-clause changes retain those breaks and appear on the same PDF page. Split pricing rows retain their product IDs, choice radios stay exclusive, and scaled controls retain 44px targets. Whole-page axe runs at 1440px. Width transitions keep selections/the current section and an in-progress signature. Historical frozen-band absence and internal terms privacy have unit coverage.

Existing desktop client selectors and measurements now target the print-source projection and undo its scale; their expected typography, spacing and alignment values remain unchanged. The existing PagePlan, frozen-break, PDF and hash assertions are unchanged. The existing full signing scenario runs at 1440px.

**331 unit/database checks pass. The full browser suite passes: 164 passed and 3 optional capture tests skipped (167 total).** The final screenshot/geometry/logo/overflow/a11y check also passes. TypeScript, formatting, neutrality and the production build pass. The PDF runtime trace verifies 328 files. All providers remained mocked; no hosted resources or live credentials were used. GitHub CI was not awaited.

## CI control-stability follow-up (4 November 2026)

At 4× CPU slowdown, the original checkbox click succeeded and saved, but optimistic/busy/response redraws detached the clicked native input before action completion. Inputs now retain their identity across projections; busy changes patch their disabled state without rebuilding sheets. Equivalent response/status updates do not redraw the document. Frames are sized before reveal, readiness waits for stable column width, and published plans do not rebuild on late font events. The active control preserves scroll position across continued pricing pages.

The unchanged original checkbox assertions and the new slow-save/identity/geometry/viewport regression passed five consecutive repetitions each at 4× slowdown. The added regression also dispatches a late font signal and resizes the viewport, checking stable geometry after readiness. The published PagePlan, PDF generation, signing and billing are unchanged. No new screenshot gallery was captured.

Final follow-up verification: 331 unit/database tests and the full browser suite (164 passed, 3 optional capture tests skipped) pass. TypeScript, formatting, neutrality and production build/PDF-runtime tracing (328 files) pass.

```sh
CLIENT_SHEETS_CPU_RATE=4 npx playwright test e2e/client-page-sheets.spec.ts --grep 'pricing controls keep|ready client sheets' --repeat-each=5
```

The final-source stress run passed all 10 checks (five repetitions of each case), including later-sheet visibility during the held response and after it completes.
