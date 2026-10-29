# Phase 1 implementation decisions

- The handoff in AGENTS.md defines scope: backend only, required company countersignature, no production deployment or live billing during development.
- The supplied PDF contradicts the handoff's audit/build prices. Its current sections explicitly supersede older prices: audit $295 and minimum build $2,750; legacy $750 audit/$2,500 build remain inactive catalog entries for reference. No existing client terms are changed. New OIOT default is $500 kickoff + $175/month, $75 build credit for 30 paid months, then $100/month. Legacy terms can be entered explicitly; the supplied Carolina example requires 35 paid months.
- Store monetary values as integer cents. Proposal line prices, quantities, client details, and provider mappings are snapshots. Clients can change only optional selection flags. Signature requests require the revision the client reviewed.
- Supabase stores an authoritative proposal JSON aggregate plus relational projections in one compare-and-swap transaction. This makes state, evidence, and job enqueue atomic. Staff have read-only table access; only authenticated application services perform mutations. Staff membership is a protected allowlist, never user-editable metadata.
- Local mode is file-backed and single-process for development; it is refused on Vercel and with NODE_ENV=production. Missing provider credentials use explicit mocks locally; production queues retain needs_review/failed status instead of pretending live operations succeeded.
- PDF and provider effects are durable jobs with leases, deterministic idempotency keys, retries, and manual reruns. Signing commits before effects. Browser PDF rendering blocks all outbound requests; images must be embedded PNG/JPEG.
- Each sent version is retained. Optional selections update the current unsigned version. Client signature freezes content, quote, and variables with canonical SHA-256. Countersigning cannot change the frozen content.
- Sealed PDFs retain a separately hashed original body PDF plus the final PDF hash. This avoids claiming a PDF can contain its own final hash. Audit pages contain the body and frozen-content hashes; the verify endpoint checks both stored artifacts.
- QuickBooks “draft” means create an invoice without sending it (EmailStatus NotSet), not a fictional draft entity. Company-name/email mismatches require review. Live adapter activation awaits credentials and sandbox validation.
- Supabase full-text search uses the database's indexed English `websearch` parser. The local mock uses case-insensitive all-term matching; do not use it to validate stemming/ranking.
- IP evidence trusts only Vercel's platform-provided `x-vercel-forwarded-for`. Local/non-Vercel requests record an unavailable IP instead of trusting arbitrary forwarded headers. A different production reverse proxy needs an explicit trusted-header adapter.
- Next.js 16.3 uses `proxy.ts` for the middleware convention. Authorization is repeated in handlers, so middleware is not the only security boundary. See the bundled route/proxy/authentication docs used during implementation.
- The development PDF was visually inspected across all pages; Poppler required a temporary fontconfig path on this Mac. This is a local preview-tool issue, not an application dependency.
- Production QBO/Stripe adapters deliberately remain disabled behind the tested interfaces while credentials are absent, per AGENTS.md. No live customer billing, external email, historical account downloads, hosted database writes, or deployment was performed.

## Phase 2 foundation — 29 October 2026

- Tenant isolation uses explicit workspace filters in the server repository plus database RLS for staff reads, composite foreign keys for children, and an immutable-workspace trigger. Staff membership is read from the database rather than editable JWT metadata. A token lookup returns only the workspace selector before scoped public access. Background processing enumerates workspaces only behind cron authentication.
- Historical frozen version JSON is never rewritten. Rendering supports the old line shape through a read-only adapter. New quote lines use entered amounts and three separate totals; schedule progress counts distinct paid invoices against supplied terms. No kickoff or price is derived.
- Company variables, consent, reminders, client URL and the custom QuickBooks item come from workspace settings. Settings are snapshotted on proposal creation so later branding or consent edits cannot silently change an existing agreement. Catalogue/template/business-specific data moved to `seed/marketfresh.ts`; CI checks application source for business-specific rules.
- Legacy catalogue keys block send; unknown keys and price/term inconsistencies warn. Catalogue sync is the sole permitted price-list pagination use; billing lookup uses Stripe's `lookup_keys[]` filter. Custom family creation scans every active product page and refuses duplicate names before any write.
- Local development always uses the mock mailer, even if unrelated Resend credentials are present. No hosted resources or live credentials were used.
- Supabase RLS documentation checked 29 October 2026: https://supabase.com/docs/guides/database/postgres/row-level-security . Explicit grants and policies are both required. The changelog Markdown endpoint was not readable through the web tool; no new Supabase feature or package upgrade is assumed.
- Owner update (29 October): no test credentials exist yet. Finish with mocks and record actual Stripe test-mode / QBO sandbox acceptance as pending in HANDOFF_PHASE2.md. Never read shell `STRIPE_KEY` or the Stripe/webhook folder (live). Only `STRIPE_SECRET_KEY` beginning `sk_test_` or `rk_test_` may be used. The owner will copy the lookup-key catalogue into test mode and supply credentials through the ignored repo-root `.env.local`.
- Changelog follow-up: fetched the Markdown index directly and reviewed the October TLS CBC cipher removal and September Postgres 15.19/17.11 notes. Node 24 uses modern TLS; this app has no ltree, btree_gist, custom operators, or legacy pgcrypto ciphertext requiring migration.

## Phase 2 providers and deployment

- Actual provider adapters are explicitly opt-in with `BILLING_MODE=test`; default local development remains mocked. Environment test credentials are bound to workspace 1. Stripe requests pin 2024-06-20 and reject live keys/responses; QuickBooks has only the sandbox hostname. Provider actions retain request fingerprints and completed responses in workspace-scoped durable storage, in addition to provider idempotency keys.
- A catalogue override uses inline price data on the resolved catalogue product, retaining the original lookup key in plan metadata. This bills the entered amount without creating a lookup-keyed price or mutating an existing item. If the catalogue itself changed unexpectedly, billing enters review.
- Monthly and yearly additions are grouped separately. Scheduled lines always create their own subscription; they reuse a usable card when present, otherwise use setup-mode Checkout. Paid invoice counting drives schedule updates on paid/failed invoice events. Phase metadata explicitly carries both the original terms and the next plan key.
- QuickBooks refresh tokens are AES-256-GCM encrypted with workspace ID as associated data; refreshed credentials are persisted before subsequent calls. Invoice creation specifies NotSet and never calls the email/send endpoint.
- Webhooks require signed, recent, test-mode snapshot payloads at the pinned API version. Verified receipts become deduplicated durable jobs; a failed worker can retry without losing the webhook. Checkout sessions must match the previously recorded customer and session IDs.
- Chromium uses @sparticuz/chromium in Vercel and local Playwright elsewhere. Rendering remains script/network-disabled. Existing authenticated cron handles reminders, expiry and the durable job queue. Hosted function size/runtime acceptance remains pending owner deployment.
- Installing serverless Chromium exposed pre-existing dependency advisories. Updated compatible pinned Next, Zod and Vitest versions and their vulnerable transitive dependencies; `npm audit` reports zero vulnerabilities.
- Provider references checked 29 October 2026: https://docs.stripe.com/api/subscription_items/create ; https://docs.stripe.com/api/checkout/sessions/create ; https://docs.stripe.com/api/subscription_schedules/create ; https://docs.stripe.com/webhooks ; https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice ; https://github.com/Sparticuz/chromium . These are implementation references, not evidence of real sandbox acceptance.

## AI connector compatibility research — before implementation, 29 October 2026

Verified official sources: https://developers.openai.com/plugins/build/auth ; https://developers.openai.com/api/docs/guides/custom-mcp-server ; https://claude.com/docs/connectors/building ; https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp .

Use authenticated Streamable HTTP with protected-resource metadata, authorization-server discovery, PKCE S256, dynamic registration, short-lived audience-bound access tokens and rotating refresh tokens. ChatGPT requires S256 discovery and supports DCR; its stable callback is `https://chatgpt.com/connector_platform_oauth_redirect` when issuer responses are supported, with connector-specific callbacks otherwise. Claude supports DCR and the 2025-11-25 authorization spec; allow its exact `https://claude.ai/api/mcp/auth_callback`. Configure additional exact callback URIs explicitly; no wildcard redirects. Claude's published identity/CIMD is optional: choose Register automatically with this implementation. Remote connector setup requires a public HTTPS endpoint and therefore real Claude/ChatGPT account connection checks await owner deployment. Local protocol, OAuth, capability-denial and workflow tests do not claim actual hosted-client acceptance.
- OAuth protocol registrations contain only public client metadata and are stored under workspace 1 as the issuer registry. Authorization codes, grants and tokens use the actual staff workspace. No OAuth record is readable directly by staff/anonymous database roles; the assistants screen receives sanitized grant metadata only. Authorization code consumption and refresh-token use are atomic database operations; no tokens are stored in plaintext.
- The connector uses the official MCP TypeScript SDK with stateless Streamable HTTP, JSON responses and bounded text results. AI capabilities are checked in the tool dispatcher and sensitive proposal services; staff REST endpoints do not recognize connector tokens. Markdown supports a deliberately bounded subset and rejects unsupported scope text rather than silently dropping it.

## Phase 2 interface and acceptance

- Rebuilt the exported screens with their supplied tokens, self-hosted fonts and Font Awesome icons. Staff screens are desktop-first; client screens are captured at 390px and 1440px, in both themes. Visual fixtures explicitly simulate provider-specific states; screenshots do not claim provider acceptance.
- Document surfaces stay white in dark mode. Entered workspace accent colours choose black or white button text by measured luminance. PDFs embed the document font and workspace logo; emails use the same identity and separate totals.
- Browser sessions use HttpOnly cookies and same-origin mutation checks against the request origin or explicitly configured APP_URL/OAUTH_ISSUER. Local development sign-in is unavailable in production. Sessions expire and require sign-in again; there is no open staff signup.
- Signing/toggling can supply the reviewed version hash in addition to the aggregate revision. This prevents background email/job writes from invalidating an unchanged document while still rejecting any changed scope/price. Staff draft editing retains full revision CAS.
- Immediate post-response queue draining uses Next `after`; cron remains recovery. Provider-match corrections read only reviewed customer IDs from the current client record at retry, without changing signed identity or content.
- Catalogue upgrade migration converts only editable Phase 1 catalogue JSON, never proposal/version evidence. Old price IDs cannot be converted reliably to lookup keys; re-sync the catalogue before new sends. Supabase entity reads now paginate too.
- Scheduled billing preserves the current schedule phase anchor and extends its end from current billing periods and distinct paid invoices. The current paid period is included once; month-end boundaries are clamped. Actual Stripe schedule acceptance remains a required test-mode check.
- Local Supabase used this repository's own project and ports. Its mail-test port changed from 55324 to 56324 because another project already occupied 55324; no other project was stopped or changed. Migrations, actual local Auth/Storage/full-text search, both signed PDFs, immutable evidence checks and schema lint passed.
- QuickBooks initial authorization uses the owner's Intuit OAuth playground (exact redirect `https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl`); the application implements encrypted refresh-token persistence, not a public QuickBooks authorization callback. Source: https://help.developer.intuit.com/s/article/Configuring-the-Oauth-2-0-Playground-for-QuickBooks-Online .

## Phase 2 owner review corrections

The 29 October review supersedes the earlier instruction to update every touched subscription's description/collection method: D2 changes only plan metadata and adds items. New subscriptions still use the proposal description and workspace collection method. Stripe reports require comma-separated plan_items, including expansion of existing multi metadata. Client totals use one group per state; absent yearly lines hide the yearly group, and a measured bar spacer prevents final content occlusion. JobState is a typed port of the supplied design-system component. Original checkout contained untracked duplicate “2” files; they were left untouched and development used a clean clone of the same repository.

- Post-review actual Stripe acceptance stopped at the catalogue gate on 29 October 2026: 41 prices imported, but the owner-example D2 addition key `storage-30gb-60` was absent. No substitute key or catalogue price was created; all later Stripe scenarios and webhook forwarding remain pending per the owner's explicit stop rule.

- Owner correction: `storage-30gb-60` was illustrative and retired on 15 October, replaced by `hosting-upgrade-60`. The earlier acceptance gate used the wrong prerequisite. Updated the gate and provider fixtures to the current key; no catalogue copy or price creation is needed. Continue authorized Stripe test-mode acceptance after green CI and merge.

- After PR #8 merged, the corrected catalogue gate and actual Stripe D2, completed D3 Checkout, initial OIOT schedule and $2,000/month Custom Retainer billing passed using only the repository restricted test key. Generic Custom Retainer test family was absent and created through the application's duplicate-checked family path; no lookup-key prices or client-named products were created. CLI authentication worked, but `stripe listen` was denied for missing `stripecli_session_write`; webhook verification/replay stays pending rather than substituting a fabricated webhook. Detailed results and remaining scope are in HANDOFF_PHASE2.md.

- Owner-granted CLI/Test Clocks permissions were verified in the continuation. A new isolated clock confirmed 30 automatically paid $175 invoices and then a paid $100 hosted-standard-100 invoice. The local CLI now forwards real signed events but renders them at account-default 2019-12-03; the app correctly refuses them before jobs because it requires 2024-06-20. Installed CLI rejects a listen --api-version override. Kept account defaults and verification guards unchanged; recorded webhook processing/replay as blocked rather than rewriting events. The successful schedule simulation tests Stripe execution of the initially configured schedule; failed-payment webhook recalculation remains unverified.


## Designated company signatory

- Only workspace owners configure the signatory's staff identity, display name/title, stored PNG and explicit signing allowlist. The selected identity and all allowed users must belong to that workspace; its email is derived from Auth, not submitted display data. Owners must also be on the allowlist to sign.
- Delegation is determined by authenticated user ID, never name/email equality. The actual applier's user ID/name/email, trusted request IP, timestamp and exact delegation checkbox text are immutable signature/audit evidence. AI cannot sign. Submitted signature identity/image fields cannot override workspace configuration.
- A configuration hash binds the counter-sign screen to the server's current settings. The resulting signature is copied into the signed agreement and queued PDF payload. Future settings changes do not reinterpret old evidence. Existing completed agreements are preserved.
- Settings use existing workspace JSON; signer evidence uses existing proposal/signer JSON. No migration is necessary. New seeds suggest Jonathan Garces / Owner but intentionally leave the signature image, linked staff identity and allowed staff unset. Existing workspaces require explicit owner setup. PNG upload or canvas drawing is supported; invalid/oversize images are rejected.

- PDF rendering is a lazy job-only dependency. Module-load failures are recorded as retryable PDF job failures, rather than preventing API initialization. Vercel uses `playwright-core` plus the packaged `@sparticuz/chromium` executable, following the [maintainer's Playwright example](https://github.com/Sparticuz/chromium#usage-with-playwright). Explicit API output tracing includes runtime package assets and fonts; the build verifies the trace and Linux CI generates a PDF from the isolated traced package set with Vercel environment detection enabled.


## Canonical links and staff senders

- New links use the validated `APP_URL` origin. Removed editable workspace client_url; historical proposal snapshots remain authoritative for legacy links, including Checkout returns. No proposal/version evidence is rewritten by the migration.
- Staff display names belong to `staff_users`, seeded from Auth metadata/email. Staff emails are resolved from Auth and cannot be supplied or edited through the proposal/team forms. Owners may edit all names; members only their own. Membership/role RLS and write restrictions remain unchanged.
- The workspace records an owner-configured domain already verified with the email provider; send refuses missing domains and exact-domain mismatches. DNS/provider verification is an owner setup action, not inferred from an email address. Migration leaves the new domain blank rather than claiming unverified setup.
- Each send freezes the chosen staff sender, company and domain on the proposal and sent event; queued emails freeze quoted From and Reply-To ([Resend API](https://resend.com/docs/api-reference/emails/send-email)). Re-send may choose another sender. Notifications go to the chosen sender, sending staff, staff creator, and later company-signature applier. Legacy sent proposals keep saved email identity until re-send. AI schemas/services cannot choose or change sender identity.

## Shared select chevrons (29 October 2026)

Native select arrows are replaced globally by the design system's Font Awesome Solid chevron, rotated down at 12px. Image tokens mirror each theme's ink-muted and ink colors; white paper keeps the light variants. All controls reserve 36px on the right with the arrow inset 12px. Hover excludes disabled controls and existing focus styles remain intact.

## Catalogue legacy metadata (29 October 2026)

Stripe price metadata `legacy` accepts `yes`, `true` and `1`, case-insensitively with surrounding whitespace ignored. Sync sets these entries to legacy/inactive, and lookup resolution rejects the same values before billing. Other values or an absent flag are not legacy. Superseded seed rows were deactivated as a workspace-specific data correction, not a rule that disables arbitrary items without lookup keys; Audit and Build stay active. Seed reruns preserve existing rows.

## Linked pricing references (29 October 2026)

References support pasted text and linked HTTPS sources. Successful fetched versions live in the existing append-only workspace event store; the workspace document points to the current good version. Credentials use the existing service-role-only provider credential table with workspace/document-bound AES-256-GCM. No new tables or hosted resources are needed. No fetched content is evaluated, imported or rendered as HTML.

Fetches enforce a total 15-second deadline, a 1 MiB UTF-8 limit, public IPs only, DNS pinning, and at most three redirects on the same HTTPS origin. Compression is refused. A refresh generation condition prevents an older in-flight refresh from replacing a newer result. Failures preserve the last successful version. The hourly cron refreshes linked references once per UTC hour; explicit refresh always fetches.

Document read receipts are private and scoped to the OAuth grant, not the connector's display name. Each unique document version returned by get_document is retained; create_proposal_draft snapshots those receipts on its first event. Listing metadata alone does not imply the document content was read. Pasted versions have no fetch timestamp; linked versions carry the successful fetch time and an extracted PLAYBOOK_VERSION label, falling back to the hash prefix.

## Inactive template defaults and declared reference labels (29 October 2026)

Explicit proposal quote lines, including an empty list, replace template defaults entirely. Playbook-supplied lines also bypass defaults. If lines are omitted, inactive, legacy or missing defaults are skipped; creation warnings are returned to AI, stored on the draft and recorded on its first event. Staff see skipped-default warnings in the editor. Sending still validates the actual proposal quote.

Template warnings are derived from the current catalogue rather than stored flags, covering manual and sync-driven deactivation without deleting template references. Both the template and Settings → Pricing list affected defaults with links for repair.

Reference version labels accept bare assignments and const/let/var declarations, either quote style and Unicode text. Existing immutable versions retain their recorded labels; Refresh now (or the hourly refresh) extracts the corrected label for a new fetched version.

## Client preview, catalogue labels and manual invoices (29 October 2026)

Staff preview uses the actual /p/... client component with a preview query flag, a workspace-scoped staff-only read endpoint and no public token. It materializes drafts in memory using current workspace settings; sent previews use their sent version and branding. Selections and view-step navigation are browser-local. Signature submission is disabled in both the form and submit handler; checkout is a disabled placeholder. No public-client APIs, view events, email, signature acceptance or billing jobs run. Desktop and phone controls retain the same rendering component.

Catalogue display_name is optional app-only JSON data; effective name falls back to the synced name. Sync preserves overrides. New catalogue-based lines snapshot the effective name; signed/existing proposal snapshots remain untouched. All catalogue pickers sort effective names alphabetically and hide inactive/legacy rows.

One-time lines with absent QuickBooks mappings warn rather than block sending. Billing records Invoice manually with needs_review for an unconfigured QuickBooks adapter or missing line/workspace mapping. This is an explicit review item, with no QuickBooks customer/invoice write attempted. A configured, mapped provider keeps its normal invoice flow.

## Workspace settings snapshot timing (29 October 2026)

New drafts persist no workspace_settings snapshot. Staff reads/edits and draft readiness resolve a transient view from current workspace settings; old draft snapshots are ignored and removed on edit. The editor and send screen also use the current session settings for draft variables/readiness. SEND and re-send capture a fresh sanitized settings snapshot before readiness validation and variable resolution. Existing signature-image/authorization redaction is retained. Signed and closed records keep their stored snapshot and cannot be re-sent.
