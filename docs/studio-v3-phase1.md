# Studio v3 — Phase 1, PR 1

Source: `design/studio-v3/specs/studio-v3.md` (spec before prototype before older docs). The clickable prototype was inspected before implementation. This PR covers the Studio shell/list pages, Products/detail, Connections, all existing Workspace sections, and Activity. Existing template, saved-block and email editors remain in place for PRs 2–3.

## Resolved owner decisions

- Workspace header/footer defaults and inheritance are deferred to Phase 2. Workspace Proposal styles has the existing style controls only; no band group. Templates keep their existing built-in **Reset to default**, including in PR 2.
- Workspace default link validity remains **1–365 days**. No “Never” option; individual proposals can still be indefinite.
- Phase 2 controls are hidden: saved-block linking/Used in, payment methods, reply-to, separate reminder timing, stop-after, countersign reminders, the new body-size/margin presets and quote-layout options. Existing per-level text-style controls remain; the Workspace page-margin editor is hidden.

## Implementation

- Desktop: Yeswell shell and static workspace label; tablet: Studio chips and bottom navigation; phone: six area rows with real counts/status, plus an Account menu for theme/sign-out actions and a grouped phone list.
- Templates: static first-page cards, search, usage counts from proposals, recent saved blocks. Saved blocks: type filters and table, no Used in column. New `/studio/blocks/:id` opens the existing block editor. Existing routes and redirects remain.
- Emails: client/staff tabs and delivery-stage groups. Exactly nine staff emails; the job failure template is listed once. Default wording and every email editor remain unchanged.
- Products: filter/search table, canonical `?item=` detail panel, existing custom-family creation and product/plan controls. Synced prices are read-only; Stripe links use the configured mode and lookup-key search (price IDs are deliberately not persisted). A successful existing catalog sync records its timestamp as workspace activity. Prices are not computed or suggested.
- Connections: Billing, Email, AI assistants, Imports, using existing health/grant/import data. Stripe mode comes from the server deployment status. Pricing references moved to Workspace; the former `?view=reference` location redirects there. Refresh/fallback/auth behavior is unchanged.
- Workspace: ten sections; text saves after 600ms idle or blur, other controls on change. Saves are serialized and drain newer changes. Errors keep local values and offer Retry; password mutations survive a failed save. Protected controls stay disabled for Staff, using the existing server permissions. Existing contact/consent/profile and advanced billing controls remain accessible.
- Team: role selects and every existing menu/profile/invite/reset/reassignment action. Removal is disabled while unfinished proposals remain, with links and reassignment/deactivation alternatives. Deactivated rows use muted surfaces rather than reduced text opacity, preserving contrast.
- Activity: timezone day groups, categories including Team, search, Load more and CSV of the current filter. Team history uses the existing staff-only Team endpoint with an explicit `history=all` read; its default recent list stays at 40. The backing read paginates with the existing workspace filter and stable created-at/ID order, verified with mocked Supabase responses. No role checks, auth flows or policies changed. [Supabase range reference](https://supabase.com/docs/reference/javascript/range).

Missing edit metadata is labelled Default; timestamps/authors are not invented. Billing copy remains workspace-neutral (project/kickoff fees); actual service names and plan terms come from product data.

## Validation and evidence

Final results are recorded in HANDOFF_PHASE2.md and the PR. Browser tests cover route aliases, nine staff emails/groups, autosave success/error recovery, protected controls, Team actions, every Workspace section at narrow widths, no horizontal scroll, and axe. Existing Studio/editor tests use the new list/section navigation while preserving their behavior, frozen-version and PDF assertions.

All captures use local mock data. The [side-by-side reference index](screenshots/studio-v3-phase1/COMPARISONS.md) pairs every list and Workspace section with its source render, plus dark mode, tablet Team and phone Studio/Emails. Reproduce captures with `STUDIO_V3_CAPTURE=1 npx playwright test e2e/studio-v3.spec.ts`.

**No hosted SQL, migration, credentials or resource changes are needed.** Signing, readiness, billing routing, PagePlan, sealed files, short links/rate limits and proposal editor behavior are unchanged. CI is not awaited; no merge is performed.

Final local results (November 5, 2026): 445 unit tests across 89 files; full browser suite 237 passed / 4 existing skips (15.8 minutes); final Studio-specific run 4 passed. Types, formatting, neutral checks, production build / 330-file PDF trace, font embedding and real PDF-job checks passed. All 26 refreshed comparison images were checked for presence and representative desktop, tablet, phone and dark captures were visually inspected.

## Owner-review corrections on PR #77

All 23 review details are applied. The refreshed comparisons include the Super admin Team action menu, dark Brand and Connections, and a **viewport** capture of 768 Team scrolled to its bottom. Your profile stays compact beneath Team; menu actions and permissions are unchanged. Dark mode and Sign out moved into Account (desktop user row, tablet avatar, phone Account row), and shell theme initialization preserves the saved theme without opening the menu.

Studio statuses use success/warning/neutral tokens and links use Ink. Synced product prices and intervals are shown as read-only display text, app-priced inputs stay available, and mapping details remain accessible in More product details. Subject chips are a list reading layer; stored email wording is unchanged. Saved appears only after a session save, never by default. No hosted SQL.

Owner-review final validation: 445 unit tests; 237 browser tests passed / 4 existing skips (15.8 minutes); Studio + the older Workspace contrast regression 5 passed; types, formatting, neutral checks and production build / 330-file PDF trace passed. The older contrast test now targets the retained hex input instead of the deliberately removed native color picker, with every contrast assertion unchanged. Connected Claude and sandbox-configured QuickBooks are covered as green states; disconnected AI is neutral. No tests were disabled or assertions weakened.
