# Owner review 4

From merged Yeswell PR #71 (`34ee4d9`).

- First publication issues a stable 12-character, case-sensitive, unambiguous random code. Existing 43-character links remain accepted. The existing unique token index enforces collision retries; no new lookup column is needed.
- Records expose Edit beside Preview as client, or Duplicate as new draft for signed native records. The record menu omits Edit; list menus retain their shortcut.
- New drafts/templates get an editable Signatures heading before an unheaded signature run. Existing drafts/templates receive the default once; sent/frozen versions remain untouched.
- Rich text supports exact-selection preset font sizes, Default/Mixed, keyboard stepping, typing, history, paste and shared editor/client/PDF rendering. Bands enforce their content-height limit. Floating toolbars avoid neighbouring editable content and visible hit targets, using nearby above/below space inside the sheet and viewport. Dense pages retain horizontally scrolling actions in clear margin space.

## Hosted setup required before merge

The owner approved durable abuse protection after the source audit found no prior app-side limiter. Apply `supabase/migrations/20261105063146_client_link_limits.sql` in this app's Supabase SQL editor before merging. The PR description includes the SQL. It creates a service-role-only, RLS-protected counter table and atomic invoker function; it stores salted HMAC keys, never raw IP addresses, client tokens or passwords.

Production uses the existing server-only `INTEGRATION_ENCRYPTION_KEY` as the HMAC secret (at least 32 characters). It must be configured consistently across serverless instances. No new secret value is committed or exposed. If protection is unavailable, public lookups fail closed with 503.

Limits are fixed windows: **30 failed unknown-token lookups per IP per 10 minutes** and **10 failed submitted passwords per link per 15 minutes**. Successful requests and initial password-required page loads do not consume the budget. Exhaustion returns 429 with `Retry-After`; unknown links otherwise retain the same generic 404. Expired counters are cleaned after one day. Vercel's trusted forwarded-IP header is used in production. Local development uses locked durable files and permits local forwarded-IP simulation for isolated tests.

A Vercel Firewall rate-limit rule would be a sensible additional coarse burst/bot layer, rejecting floods before they invoke the app or Postgres. No Vercel settings are changed in this PR.

The local Supabase advisor could not connect because no local stack is running on port 55322. PGlite executes the migration and verifies grants, RLS and atomic concurrent increments. No hosted database was queried or changed.

## Validation

Local follow-up validation: **431 unit/database tests passed** (85 files); **full browser suite: 216 passed, 4 optional capture tests skipped (15.0m)**. Types, formatting, neutral-code check, the clean production build and 330-file PDF trace passed. The original CI-reported cover test remains unchanged and passes in the full suite. No CI wait or merge.

The shared collision-aware positioner keeps cover, body, image and band toolbars clear of editable content and visible hit targets. It uses nearby space within the sheet and viewport, preserving horizontal scroll and menu focus on dense pages. The original CI-reported `owner-review2.spec.ts` test is unchanged; new checks exercise both editors at 1440/1024 with separate and inline covers. No extra hosted SQL is needed for this follow-up.
