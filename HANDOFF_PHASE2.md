# Phase 2 handoff — STOP 1

29 October 2026. Phase 2 is implemented through the pre-hosting checkpoint. **No hosted resources were created and no live credentials were used.** Initial implementation used mocks. The owner subsequently supplied a Stripe restricted test key; the initial catalogue check incorrectly required a retired illustrative key. After the owner correction, the gate and core D2/D3/schedule/custom-retainer checks passed, as detailed below. QuickBooks sandbox credentials remain unavailable. The remaining provider and hosted checks are pending; this is not a live-billing launch approval. STOP 2 imports require a separate owner-initiated run.

## What is delivered

- Workspace-scoped repositories, RLS, immutable tenant ownership, protected staff membership and private Storage; five ordered migrations, including an upgrade of editable Phase 1 catalogue rows without rewriting frozen evidence.
- Entered quote amounts, monthly/yearly/one-time totals, custom service families, minimum terms, generic paid-invoice step-downs, list-price warnings, legacy blocking, paginated catalogue sync, versioned pricing references and the playbook handoff schema.
- Staff dashboard/list/create, Tiptap block editor with autosave and conflict handling, preview, readiness/send, record, countersignature, audit and verification; clients, catalogue, templates, reusable content, imports/archive, settings and AI assistants.
- Mobile client password, reading, optional selection, stale-document review, dedicated signature step, billing setup, signed/completed copies and ended-link states. Typed/drawn signatures, exact consent, two signature slots and sealed PDF/audit evidence remain intact.
- Workspace identity, logo and accent in client pages, HTML emails and PDFs. Supplied fonts are self-hosted; PDFs embed their document font. Dark-mode document surfaces stay white.
- Stripe test-only HTTP adapter: lookup-key resolution, D2 individual subscription-item additions without proration/replacement, D3 customer-bound Checkout, custom inline prices, separate scheduled subscriptions, explicit first-invoice finalization/sending, durable action journals and replay-protected snapshot webhooks.
- QuickBooks sandbox HTTP adapter: exact customer matching/review, encrypted rotating OAuth tokens, paginated item sync and unsent invoices. Successful provider effects retain idempotency results; failures do not undo signing.
- OAuth PKCE/dynamic registration and Streamable HTTP MCP at `/mcp`, workspace-bound grants, rotating refresh tokens, revocation, read tools and draft-only writes. Both tool dispatch and sensitive services deny prohibited AI operations. See [AI connector instructions](docs/ai-connector.md).
- Immediate post-response job draining after send/sign/countersign, authenticated hourly cron recovery, serverless Chromium packaging and custom-domain settings.

## Verification and evidence

- TypeScript and production build pass; CI runs neutrality, type, unit/database and browser checks.
- 45 Vitest tests cover quote validation, tenancy/RLS/CAS, immutable evidence, imports, OAuth/PKCE/token rotation, AI capability denial, provider contracts, webhook signature/replay, encrypted tokens and document-hash review checks.
- Browser acceptance: MCP creates a draft → person edits a price in the staff UI and sends → client chooses an optional line and signs → staff countersigns → mock QBO/Stripe jobs finish → both PDFs download and hash verification passes. D2/D3 and custom inline billing are separately exercised against mocked HTTP contracts, not real provider accounts.
- Real **local** Supabase: migrations applied to the Phase 1 database, staff login/outsider denial, private Storage, full-text search, both signatures, both sealed PDFs, append-only audit and mocked billing passed. Database lint reported no schema errors. PGlite also verifies cross-workspace visibility, immutable ownership and CAS on a fresh schema.
- [Screenshot index](docs/screenshots/README.md): every requested screen in light/dark at 1440px; all eight client states also at 390px. These are neutral visual fixtures rendered by the actual app. Checkout/review/archive example states are fixtures, not provider acceptance evidence. The normal full-flow browser test uses the actual API and local repository.
- Generated signed PDF evidence remains in ignored `.data/evidence/countersigned-proposal.pdf`. CI uploads browser screenshots and test artifacts. Secrets and runtime data are not committed.

## What still needs live verification

“Live verification” here means actual **test-mode/sandbox/hosted** services, not permission to use production billing credentials.

1. **Stripe test catalogue:** sync passed on 29 October (41 imported), but the initial acceptance gate incorrectly required the retired illustrative key `storage-30gb-60`. The owner clarified that `hosting-upgrade-60` is its replacement and is present in test mode. `hosted-standard-100` and `oiot-monthly-175` are present. No catalogue copy is needed. The corrected gate passed at 18:00 UTC. Actual pagination and legacy exclusion still need test data (this response was one page and no imported prices carried `metadata[legacy]=true`). Compare names, amounts and intervals with the owner's catalogue.
2. **D2:** the core monthly scenario passed on 29 October (details below). Broader acceptance still includes an existing test customer with active monthly subscription and working card. Sign a proposal; confirm original items unchanged, one new item per selected line, no proration, correct customer company and plan metadata, unchanged existing subscription description/collection method, no Checkout link, and accurate new recurring totals/email. Repeat for yearly items, mixed intervals and retry/replay.
3. **D3:** new-customer Checkout completed with a test card on 29 October; signed webhook processing/replay remains blocked by the CLI snapshot-version mismatch described in the latest verification below. Broader cases: no card/no usable subscription/new customer. Confirm Checkout uses the same stored customer; complete it using Stripe test payment data; deliver the signed snapshot webhook and confirm no duplicate subscription on replay. Test abandoned/expired sessions and correction/retry behavior.
4. **Scheduled subscriptions:** the separate subscription, two-phase schedule and a real test-clock run through 30 paid $175 invoices followed by a paid $100 `hosted-standard-100` invoice passed on 29 October (latest evidence below). Remaining: failed/unpaid invoice handling and webhook-driven recalculation, legacy 35-payment terms, additional month-end anchors, and `send_invoice` first-invoice finalize/send.
5. **Custom retainer:** actual $2,000/month billing passed under a newly created generic test-only Custom Retainer family. Full sign → billing → PDF acceptance with the actual provider remains pending; the existing browser flow uses mocked billing. Confirm signed amount/scope, reuse of the generic family on subsequent proposals, no lookup-key price creation, correct inline price and plan metadata. Duplicate family names must be refused across all product pages. Check restricted-key permissions with actual test requests.
6. **QuickBooks sandbox:** initial grant, encrypted token rotation, exact email/stored-ID matching and same-company/different-email review; correct line items/amounts, `EmailStatus=NotSet`, no customer email, fallback Custom services item and durable retry without duplicate invoices.
7. **Hosted deployment:** Vercel Chromium binary size/runtime/memory, embedded fonts/logo, both PDFs, private downloads, cron authentication and timing, webhook delivery/replay, custom-domain links and actual Resend delivery/DNS.
8. **Actual Claude and ChatGPT accounts:** add deployed HTTPS MCP connector, authorize/refresh/revoke, read pricing references and imported text, draft/review/send through the human UI. Local protocol tests do not prove the hosted clients' account-specific connector behavior.
9. **Historical export:** actual Proposify browser selectors/profile and small-batch reconciliation remain STOP 2 work. No real historical proposals were downloaded during Phase 2.

## Owner setup — exact order

1. **Keep the projects separate.** Create a new Supabase project solely for this repository. Do not reuse HappyU or TeamKeep. Save the project reference, URL, anon key and server service-role key privately. Use the default supported Postgres configuration; no public application tables or public Storage bucket.
2. **Apply schema and seed.** On a trusted machine, link the CLI explicitly to that new project, review `supabase/migrations/`, then run `supabase db push`. Run the seed with `APP_MODE=supabase` and this project's keys only. It seeds workspace `00000000-0000-4000-8000-000000000001`; it does not invent live billing mappings. The migration creates private bucket `proposal-files`. Re-sync catalogue rather than trusting old Phase 1 price IDs.
3. **Provision staff.** Disable public signup. Create the two email/password Auth users in the new project, then insert their UUIDs into `public.staff_users` with the workspace UUID and role `owner` (or `member`; only an `owner` can configure the company signatory and signing permissions). Do not grant staff the service-role key. Configure Auth Site URL to the eventual canonical HTTPS origin; no OAuth callback to Supabase is needed for password login. Use Supabase administration for password recovery/staff changes.
4. **Create a new Vercel project** importing only `marketfreshstudios/mktfresh-proposals`, repository root, framework Next.js, Node 24, build `npm run build`, dependency install `npm ci`. Production branch `main`. Set the server variables below; `APP_MODE=supabase`, `BILLING_MODE=mock` until sandbox acceptance. Never deploy `APP_MODE=local` or `DEV_STAFF_TOKEN`. Preview environments must use separate test resources or leave provider keys absent.
5. **Attach your proposal domain** (for example `proposals.<your-domain>`) to this new Vercel project; use the DNS records Vercel gives you and wait for HTTPS. Set `APP_URL` and `OAUTH_ISSUER` to this exact origin (no path). Client links use `APP_URL`; there is no workspace URL field. Redirect alternate hostnames to the canonical one so login, MCP issuer and client links agree.
6. **Create/verify a Resend sending domain** for this app, install its supplied SPF/DKIM records, and create a sending-only API key scoped to that domain. Set the key on Vercel. In Settings enter sender name/address on that verified domain, contact identity, logo, accent, consent, timezone, validity and reminder cadence. Existing proposals retain their settings snapshot; configure this before creating real agreements.
7. **Add test credentials only**, as described next. Set `BILLING_MODE=test` explicitly, redeploy, sync catalogues and complete every actual provider check above. Keep production credentials out of previews and CI. The current code deliberately refuses live Stripe keys and QBO production: activation is a later reviewed change, not an environment flip today.
8. **Verify deployed operation** with a disposable test proposal, both signatures/PDFs, email, cron and MCP. Configure a Stripe test webhook endpoint. Review errors in the record/integrations queue. Only after that review should the owner request a separate live-activation run.

`vercel.json` schedules `/api/cron` hourly (`0 * * * *`). The function checks `Authorization: Bearer <CRON_SECRET>`. Route maximum duration is 300 seconds; select a Vercel plan/runtime that supports this. Queued work survives interruptions and can be retried from the record; verify actual plan limits before launch. There is no external PDF worker yet because local packaging/build checks have not demonstrated a need for one.

## Environment variables and sources

Store local values only in the ignored repository-root `.env.local`. Set hosted secrets only in this new Vercel project's server environment. No `NEXT_PUBLIC_*` secret variables.

| Variable | Value/source |
|---|---|
| `APP_MODE` | `local` for mock development; `supabase` for hosted/private database operation. |
| `DATA_DIR` | Local data folder, default `.data`; not used as hosted persistence. |
| `APP_URL` | Canonical origin, loopback in development or owner-configured HTTPS domain. |
| `DEV_STAFF_TOKEN` | Long random local-only login token; never deploy it. |
| `SUPABASE_URL` | New project's API URL from its settings. |
| `SUPABASE_ANON_KEY` | New project's anon key, used server-side for password authentication. |
| `SUPABASE_SERVICE_ROLE_KEY` | New project's server-only service-role key. Never expose it in browser code. |
| `STORAGE_BUCKET` | `proposal-files`, private bucket created by migration. |
| `CRON_SECRET` | Generate a strong random secret; Vercel cron supplies it as bearer authorization. |
| `RESEND_API_KEY` | Sending-only key for the verified domain. Local mode always uses mock email. Sender identity is chosen from Team at send; the owner sets the already-verified sending domain in workspace Settings. |
| `BILLING_MODE` | Default `mock`; explicit `test` enables available test adapters for workspace 1. Missing hosted providers remain needs-review, not simulated success. |
| `STRIPE_SECRET_KEY` | Owner-provided `rk_test_…` restricted key (or `sk_test_…`). Constructor and request code refuse every other prefix. Shell `STRIPE_KEY` is never read. |
| `STRIPE_WEBHOOK_SECRET` | Local: signing secret printed by `stripe listen` configured for the test account. Hosted: signing secret for this app's test webhook endpoint. These differ. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` | Intuit app's Development credentials. |
| `QBO_REFRESH_TOKEN` | Initial token obtained by owner authorization of a sandbox company; subsequent rotations are encrypted in the workspace database. |
| `QBO_REALM_ID` | Numeric sandbox company ID from that grant. |
| `QBO_ENVIRONMENT` | Must be `sandbox`. Production is refused. |
| `INTEGRATION_ENCRYPTION_KEY` | Generate 32 cryptographically random bytes encoded as base64. Keep it stable/backed up; rotating it requires re-encrypting stored QBO tokens. |
| `OAUTH_ISSUER` | Exact canonical app origin. MCP resource is `<origin>/mcp`. |
| `OAUTH_REDIRECT_URIS` | Optional comma-separated additional exact Claude/ChatGPT callback URIs; no wildcards. Built-in stable callbacks are documented in `docs/ai-connector.md`. |
| `CHROMIUM_EXECUTABLE_PATH` | Optional trusted local browser executable; leave unset on Vercel to use bundled Chromium. |
| `PROPOSIFY_PROFILE` | Local dedicated exporter browser profile, default `.data/proposify-profile`; STOP 2 only. |
| `PROPOSIFY_BASE_URL` | Owner's Proposify account URL; STOP 2 only. |

Never use the live `STRIPE_KEY` in the shell or anything in the owner's Stripe/webhook folder. The app neither reads nor falls back to them.

## Stripe activation checklist — later owner-initiated run

- First complete all test-mode checks. The current live-key refusal is intentional and must remain until a separately reviewed activation change.
- Create a separate restricted key for this app. Required capabilities correspond to: Customers read/write; Products read/write (only generic family creation uses writes); Prices read (lookup and catalogue); Subscriptions/subscription items read/write; Subscription schedules read/write; Checkout Sessions read/write; Payment Methods read; Setup Intents read; Invoices read/write (list, finalize, send). Stripe may expose subscription items under Subscriptions in its permission UI. Verify the smallest accepted permissions against actual test calls, including inline `price_data`, before issuing a live restricted key. No Refunds, Payouts, Balance or broad account administration is used.
- Endpoint: `https://<canonical-origin>/api/webhooks/stripe/00000000-0000-4000-8000-000000000001`. API version **2024-06-20**, payload **snapshot**, events **checkout.session.completed**, **invoice.paid**, **invoice.payment_failed**. Do not inherit the older account default. Set the endpoint's own signing secret.
- Confirm generic product family names, lookup-key ownership, workspace collection method for newly created subscriptions, company names on customers, proposal descriptions for newly created subscriptions, plan/terms metadata and no replacement of existing subscription items. The platform never cancels, refunds or archives products/prices.
- Changing to live requires coordinated code guards, isolated keys/webhook secret and a reviewed smoke-test plan. Merely adding a live key today fails closed.

## QuickBooks activation checklist — later owner-initiated run

- Create/complete the Intuit production app requirements and use production credentials/company only after sandbox acceptance. Request `com.intuit.quickbooks.accounting` scope.
- Initial owner authorization currently uses Intuit's OAuth playground; register the exact redirect URI `https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl`. [Intuit setup instructions](https://help.developer.intuit.com/s/article/Configuring-the-Oauth-2-0-Playground-for-QuickBooks-Online). This app does not implement a `/qbo/callback` route; do not register an invented one.
- Record the correct realm ID and initial refresh token privately. Verify encryption/rotation and customer matching before invoice creation. Keep token records tenant-scoped and back up the encryption key.
- Production host/environment support is deliberately disabled in this build and requires a separate activation change. Invoice creation remains unsent (`EmailStatus=NotSet`); no send-email API is called.

## Playbook handoff contract

The owner deploys the button in the separate playbook. This run did not modify that site.

- `GET /proposals/new?draft=<base64url UTF-8 JSON>`; staff login is required. Validated payload is shown for review before draft creation.
- Schema: `quote-draft.v1.json` (retired; the current schema is [quote-draft.v2.json](public/schemas/quote-draft.v2.json), served at `/schemas/quote-draft.v2.json`).
- Required: `source: "playbook"`, `source_version`, `lines`. Optional: title, client `{company,first_name,last_name,email}`, notes (Markdown text). Every line needs a unique UUID `id`, entered integer-cent `amount`, interval, quantity, optional/selected flags; nullable catalogue/family IDs, list amount, minimum term, schedule, plan terms and billing refs follow the schema.
- The chosen template supplies content; playbook lines replace its default quote. Original payload is preserved on the first event and the editor/record shows the source/version badge. The platform never recomputes prices. Review errors and warnings before sending.
- [README](README.md) includes the UTF-8-safe URL construction example. Large payloads may exceed browser/proxy URL limits; use short discovery notes and bounded quotes. Do not put secrets into this URL. Supply pricing references through Settings → Pricing reference for assistants instead.

## Decisions and operating limits

See [DECISIONS.md](DECISIONS.md) for the complete rationale and official connector/provider references. Settings/consent are snapshotted on creation. Paid schedule logic is generic. Draft edits use aggregate revision CAS; public acceptance uses reviewed document hash, retaining revision-only compatibility. Customer-match correction changes provider mapping only, not frozen evidence. Sessions expire and require signing in again. Staff administration is through Supabase; imported history is read-only. Local mode is single-process and must be stopped before CLI seed/import writes to the same data folder.

**STOP 1. Do not create resources, use live credentials, activate billing, or start the real Proposify import without the owner's next instruction.**


## Review corrections — 29 October 2026

- D2 adds new items with no proration and updates only `metadata.plan` / `metadata.plan_items` on the existing subscription. It never changes the existing description, collection method, due-day setting, proposal metadata or existing items. Regression tests assert the exact update payload.
- `plan_items` is comma-separated for D2 and new Checkout subscriptions. Existing `plan=multi` expands its existing `plan_items`; `multi` is never appended as a plan key. Existing lookup keys are retained and deduplicated.
- Client action-bar height is measured with ResizeObserver and reserved in document padding. Each client state has one totals group; one-time/monthly remain visible and yearly appears only when a yearly line exists. Real signature blocks show role, name and the typed/drawn signature after signing, without exposing internal signature evidence fields.
- Staff quote intervals and job labels use human wording. Pending/running/failed/review jobs use the supplied design system's JobState structure, tokens, spinner and Retry/Resolve behavior; successful jobs show Complete.
- Validation: 40 unit/database tests, three browser tests, type checks, production build, neutrality and formatting. Browser assertions cover one totals group, hidden absent-yearly totals, both signature blocks, typed final signatures and the last document line scrolling above the sticky bar at both widths/themes. Affected screenshots were regenerated.
- Actual Stripe checks are authorized only after these fixes merge. `scripts/verify-stripe-catalogue.ts` reads only the explicitly selected repository `.env.local`, validates the test prefix before every request, sets `BILLING_MODE=test`, syncs read-only and stops on missing required lookup keys. No catalogue price creation is permitted. QuickBooks remains pending credentials.


## Initial post-merge Stripe check — superseded by current-key results below

Review fixes merged in [PR #6](https://github.com/marketfreshstudios/mktfresh-proposals/pull/6), commit `50b013d`, after both CI runs passed. The screenshot test was corrected to click the optional checkbox and assert the revision warning, since that warning replaces the checkbox. All 40 unit/database tests and three browser tests pass; typecheck, build and neutrality checks pass. Affected screenshots are committed in `docs/screenshots/`.

The actual provider run started at **17:32:45 UTC**, after the merge, with `BILLING_MODE=test` and API version `2024-06-20`. It read only `STRIPE_SECRET_KEY` from the original repository's ignored `.env.local`. The test-key prefix guard passed before the run and before the request. No shell `STRIPE_KEY`, external credential file or CLI account credentials were read.

| Check | Result |
|---|---|
| Test-key guard | Passed; secret value withheld. |
| Read-only catalogue sync | Passed: `GET /v1/prices` returned HTTP 200; 41 recurring catalogue entries imported locally. One page exhausted the result. No live-mode objects returned. |
| `hosted-standard-100` | Present, active: $100/month. |
| `oiot-monthly-175` | Present, active: $175/month. |
| `storage-30gb-60` | Retired 15 October; illustrative example only. The initial gate incorrectly required it and stopped (exit 2). Use `hosting-upgrade-60`, already present; do not copy the retired price. |
| Restricted-key permission errors | None on the catalogue read. Write/Checkout/schedule permissions remain untested. |
| Legacy exclusion / pagination | Pending actual test data: no imported entries were flagged legacy and only one page was returned. Keys containing `legacy` are not by themselves the required metadata flag; review those test prices' metadata separately; no catalogue copy is required. Mock tests cover these paths. |
| D2 existing working-card customer | Not run: stopped at the missing-catalogue gate. |
| D3 new customer / completed Checkout | Not run: stopped at the missing-catalogue gate. |
| Own It Over Time schedule | Not run: stopped at the missing-catalogue gate. |
| $2,000/month Custom Retainer | Not run: stopped at the missing-catalogue gate. |
| Webhook delivery | Pending. Stripe CLI 1.53.1 is available, but `stripe listen` was not started after the required stop. `STRIPE_WEBHOOK_SECRET` remains unset. Use the explicit repository test key when resuming, not a saved CLI account. |
| QuickBooks sandbox | Pending: credentials do not exist. |

**Zero Stripe writes:** no customers, subscriptions, products, catalogue prices or webhook endpoints were created. The sanitized local result is `.data/stripe-review/catalogue-check.json` in the review checkout (ignored, no secret values). Work was performed in `mktfresh-proposals-review` to preserve unrelated untracked duplicate files in the original checkout.

Owner correction: use `hosting-upgrade-60`; no catalogue copying is required. The initial run stopped without writes. The authorized continuation reran `BILLING_MODE=test node --import tsx scripts/verify-stripe-catalogue.ts <original-repository>/.env.local` and completed the core scenarios reported below.


## Current-key correction — merged in PR #8

The owner confirmed that `storage-30gb-60` was retired on 15 October and used only as an illustrative CSV example. The catalogue gate and provider regression fixtures now use `hosting-upgrade-60`. The earlier missing-key stop was caused by this incorrect acceptance prerequisite, not a missing required catalogue price. The correction merged as `4d2c233` after both CI runs passed. The corrected gate and authorized test-mode scenarios then ran successfully, with the webhook limitation below.


## Actual Stripe results after current-key correction — 29 October 2026

[PR #8](https://github.com/marketfreshstudios/mktfresh-proposals/pull/8) replaces the retired illustrative key in the gate and provider fixtures. Both CI runs passed (40 unit/database tests, three browser tests, typecheck, build and neutrality). **No retired price needs to be copied.**

Every actual run re-read only `STRIPE_SECRET_KEY` from this repository's ignored `.env.local`, required a `sk_test_`/`rk_test_` prefix before proceeding, and used `BILLING_MODE=test`. The HTTP adapter rechecked the prefix on every request and pinned **2024-06-20**. All created customer/subscription objects were test-mode; no live key, shell `STRIPE_KEY`, saved CLI credential file or external Stripe folder was used.

| Scenario | Actual result |
|---|---|
| Catalogue gate, 18:00 UTC | **Passed.** 41 recurring prices imported. `hosted-standard-100`, `hosting-upgrade-60`, and `oiot-monthly-175` all resolved uniquely through the lookup-key API filter. No permission errors. |
| D2, 18:01 UTC | **Passed.** Created a dedicated test customer with Stripe's test Visa payment method and a $100/month baseline subscription. Added `hosting-upgrade-60` as a separate item, total $160/month, no Checkout. Readback preserved original item, description, collection method and unrelated metadata. `plan=multi`, `plan_items=hosted-standard-100,hosting-upgrade-60`. Repeating the same provider action produced no duplicate item. |
| D3, 18:01–18:02 UTC | **Passed for Checkout and subscription creation.** Created a new dedicated test customer and customer-bound Checkout. Completed Stripe's Sandbox form with the 4242 test card. API readback confirmed `status=complete`, `payment_status=paid`, same customer, active subscription, expected plan and proposal description. Webhook application/replay is separately pending below. |
| Own It Over Time, 18:02 UTC | **Passed for initial subscription/schedule creation.** A separate $175/month subscription was created for the D2 test customer; the original subscription was not reused. Stripe accepted two phases: `oiot-monthly-175` with entered 18-month minimum/30-payment terms, then `hosted-standard-100` at $100/month with its own plan metadata; `end_behavior=release`. Initial phase runs 29 October 2026 to 29 April 2029. No test-clock advancement was performed, so paid/unpaid invoice progression and the eventual phase transition remain unverified. |
| Custom Retainer, 18:03 UTC | **Passed for actual billing.** No active Custom Retainer family existed, so the application created one generic, service-named test product tagged `custom_family=true` after its duplicate-name scan. Created a $2,000/month test subscription with inline `price_data` on that family. Readback confirmed amount 200000 cents, monthly interval, family product, null lookup key, `plan=custom:<family-id>`, and proposal description. No catalogue price or per-client product was created. |
| Stripe CLI / webhook forwarding | CLI 1.53.1 `whoami` authenticated using the explicit repository test key and `/dev/null` config; reported test key available, live key unavailable. **`stripe listen` failed:** restricted key lacks **Debugging Tools Write (`stripecli_session_write`)**. Listener exited 1 before receiving events. No webhook signing secret was generated or saved; no hosted webhook endpoint was created. |
| QuickBooks | **Pending:** no sandbox credentials; no QuickBooks requests. |

These are actual provider-adapter checks plus an actual hosted Stripe Checkout test. They do **not** certify the complete signed-proposal → live webhook → email/PDF flow. Existing end-to-end UI/PDF checks use mocked billing. D2 notification delivery, signed webhook verification/replay, Checkout abandonment/error recovery, yearly/mixed-interval scenarios, send-invoice behavior, paid-invoice/test-clock schedule progression, and custom-retainer signed PDF scope remain in the acceptance backlog above.

Test objects retained for inspection (not cancelled or deleted):

- D2 customer `cus_VX1hcn6P6Sb3CU`; original subscription `sub_1UVxdhCyTuAwrO6j2KMhkswt`.
- D3 customer `cus_VX1hlufHgdHDx7`; subscription `sub_1UVxemCyTuAwrO6j9phL1NaT`.
- OIOT subscription `sub_1UVxerCyTuAwrO6j8eQ9rX8r`; schedule `sub_sched_1UVxewCyTuAwrO6j5JwrEvW7`.
- Custom Retainer product `prod_VX1iT46oNV26LR`; subscription `sub_1UVxfDCyTuAwrO6j4ILDBWhG`.

Sanitized results and request statuses are committed in `docs/stripe-test-results-2026-10-29.json`. Detailed local journals and Checkout screenshots remain ignored under `.data/stripe-acceptance/` in the review checkout. No Stripe provider request failed in the four core billing scenarios; the only permission failure was starting the CLI listener. **Stopped after recording results. At that point webhooks required the test-key CLI permission. The owner subsequently granted it; see the latest verification below. QuickBooks remains pending.**


## Webhook and test-clock continuation — 29 October 2026

The owner granted Debugging Tools Write and Test Clocks Write and authorized this continuation. Each run read only the repository `.env.local` test key, validated its test prefix, and used test mode. API calls retained the `2024-06-20` version and per-request key guard. No saved CLI account credentials, live resources, or account-wide API settings were used or changed.

### Webhook forwarding result

- **CLI permission issue resolved.** `stripe listen` starts using the explicit repository key and `/dev/null` configuration, with test mode (no `--live`). A local signing secret was obtained and kept only in ignored local files.
- Actual clock-subscription `invoice.paid` events reached the local production webhook verifier. Timestamp and HMAC verification succeeded; the verifier then returned HTTP 400 with `Webhook must use pinned snapshot API version` because the CLI renders snapshots at the account default **2019-12-03**, whereas this app deliberately requires **2024-06-20**.
- Installed CLI 1.53.1 rejects `listen --api-version 2024-06-20` with `unknown flag: --api-version`. Its latest-version option would also differ from the app's pinned version. [Stripe CLI version explanation](https://github.com/stripe/stripe-cli/issues/1143).
- **Application webhook processing and replay remain blocked**, now by version compatibility rather than permission. No payload version was rewritten, no fabricated accepted event was substituted, and the app's guard was not weakened. Checkout completion/replay and failure-event application checks remain pending a compatible pinned-version delivery path. Do not change the shared account's default version merely to work around this local CLI limitation.

### Test-clock method

A fresh test clock, customer and OIOT subscription were created solely for this simulation; earlier test subscriptions were left untouched. The application provider created its normal separate subscription and two-phase schedule from the entered 18-month minimum / 30-payment terms. The clock advanced one monthly boundary at a time. Each invoice had to be automatically paid before proceeding, with its amount, plan metadata, lookup key, absence of proration, and cumulative paid-invoice count checked through Stripe's pinned API.

The initial runner expected collection after a short advance and stopped on the second invoice still being draft. Stripe reported `automatically_finalizes_at` 72 hours after invoice creation and `webhooks_delivered_at=null`. The runner resumed the same clock/customer/subscription and advanced to the reported finalization time plus an hour; no manual invoice finalization or payment was used. This is an observed test-account invoice delay, not an OIOT schedule failure.

Because the incoming CLI snapshots are rejected before application job processing, this run tests Stripe's execution of the application's initially configured schedule. It does not certify the webhook-driven schedule recalculation path for unpaid/failed invoices. That remains a separate pending test.


### Test-clock result — passed

- **Exactly 30 distinct, automatically paid invoices at $175**, followed by **invoice 31 automatically paid at $100**. Total test payments: **$5,350**. No manual invoice finalization/payment or catalogue writes occurred.
- Payments 1–30 retained `oiot-monthly-175` in both the price lookup key and subscription `metadata.plan`. The first $100 invoice and subscription both use **`hosted-standard-100`**. The transition starts **29 April 2029** in simulated time, after the 30th paid billing period. The subscription remains active, with no proration lines in any checked invoice.
- The 18-month minimum did not cause an early transition. The simulation traversed February billing dates while retaining the subscription's monthly anchor behavior.
- All test-clock/customer/subscription API requests succeeded; **no restricted-key permission errors** occurred in this continuation. The temporary draft-invoice wait was resolved by honoring Stripe's reported automatic-finalization time.
- Stripe signed and forwarded the clock's `invoice.paid` events, but the local verifier rejected their incompatible version before enqueueing application jobs. Thus the successful schedule result proves Stripe's execution of the schedule created by the provider, **not** the blocked webhook-driven recalculation or replay path.

Retained test objects:

- Clock: `clock_1UVxqMCyTuAwrO6jhg53JOqk`.
- Customer: `cus_VX1uKscBTFS7Zl`.
- Subscription: `sub_1UVxqOCyTuAwrO6jNoRNRSxF`.
- Schedule: `sub_sched_1UVxqUCyTuAwrO6jxuoWDn7V`.

The clock is left frozen after the first $100 payment; no further advances or cancellations were performed. Evidence: [stripe-clock-results-2026-10-29.json](docs/stripe-clock-results-2026-10-29.json), containing all 31 invoice checks and 31 matching forwarded webhook results. Local runtime evidence remains ignored under `.data/stripe-clock/`.

**Stopped.** Local forwarding was stopped and its temporary signing-secret file removed. Remaining webhook work requires a delivery path that emits snapshot payloads at **2024-06-20**; the shared account default and the app's version guard remain unchanged. Failed-payment recalculation/replay remains pending. QuickBooks remains pending credentials.


## Single company signatory — 29 October 2026

Every new company counter-signature uses the workspace's designated name, title and stored PNG signature. The actual authenticated staff member remains the actor. Delegated signing requires the additional exact checkbox text, stored verbatim with the signature and counter-sign event: `I'm authorized to sign on behalf of [signatory] for [company].` Staff audit and the sealed PDF audit show the applier's name, email, user ID, timestamp, IP and authorization text. Client signature blocks show the designated identity; the PDF audit contains the actor evidence. AI signing remains forbidden.

**One-time owner setup after deploying this change:** sign in with an `owner` staff account, open **Settings → Company signatory**, set **Jonathan Garces / Owner**, select Jonathan's staff account, and confirm the company name is **MarketFresh Studios**. Draw Jonathan's actual signature and choose **Use drawn signature**, or upload his PNG (under 350 KB). Select each staff account permitted to apply it, including Jonathan if he will sign, then save workspace settings. No real signature was supplied or fabricated during development; until this is configured, counter-signing is blocked. A staff account omitted from the allowed list cannot counter-sign, even if it is an owner. Owner status allows configuration, not an implicit signing bypass.

The server ignores submitted signatory names/images, verifies allowed staff membership, and requires a matching configuration version. Changes to the signatory configuration affect future counter-signatures, including already-sent proposals; completed signatures and queued PDF evidence keep their saved identity/image/authorization. Earlier completed agreements are not rewritten. Reusable images and signing permissions are omitted from draft snapshots available to AI. Current configuration and signature evidence use existing JSON storage; no database migration or hosted changes are required for this feature.

Validation: 45 unit/database tests, four browser tests (including delegated authorization and PDF text verification), typecheck, production build, format and neutrality checks. Regenerated affected settings/counter-sign/audit/client screenshots; delegated screenshot and sealed PDF evidence are produced under `.data/evidence/` and uploaded by CI. PDF body and audit pages were also visually inspected. Local Supabase acceptance script now uses an isolated test workspace with explicit test signatory setup; the hosted project was not changed by this implementation. Existing Stripe webhook and QuickBooks pending items above remain unchanged.

## Vercel PDF runtime correction — 29 October 2026

Production commit `f9ad4ba` exposed an eager dependency chain: the API imported the shared worker, which imported the PDF renderer and Playwright before handling even `/api/auth/session`. The packaged function lacked Playwright's runtime `browsers.json`, so requests failed during module initialization.

The worker now dynamically imports the renderer only inside a PDF job, within the existing failure/retry handling. Auth, email and billing can run with the renderer unavailable. The renderer uses an explicit `playwright-core` dependency with `@sparticuz/chromium`'s executable and arguments on Vercel; local rendering still uses the installed development browser. Next externalizes both renderer packages and explicitly traces their runtime files, Chromium Brotli assets, and document fonts into the API function.

Added regression tests that make renderer/browser imports throw, then load the actual API route and verify an auth response, email delivery, retryable PDF failure and continued billing. Restoring the old static import was checked to make the guard fail. `npm run build` now runs `check:pdf-trace`: it inspects the actual API trace and copies only traced dependencies to an isolated directory. On Linux it cold-starts the packaged serverless Chromium under `VERCEL=1` and generates a PDF with the bundled document font. No credentials are passed to this smoke process. Local checks: 47 unit/database tests, four browser tests, typecheck, format, neutrality and production build. Linux serverless smoke runs in CI before merge. The owner will verify live Vercel logs after main automatically deploys; this is not a claim of live production acceptance.


## Canonical links and staff email senders — 29 October 2026

New proposals derive client links, HTML/text email links and Stripe Checkout return URLs from `APP_URL` (canonical origin; HTTPS required except localhost/127.0.0.1). Removed Client website URL, Sender name and Sender email from Settings. Historical proposals retain their saved `workspace_settings.client_url`, including a path if present; migration does not rewrite proposal or version snapshots. Old already-sent proposals without a staff sender retain their saved legacy email identity until a permitted re-send chooses a staff sender.

Settings → Team edits `staff_users.display_name`. Existing/new staff names are seeded from Auth full_name/name, falling back to the Auth email; emails themselves remain managed through Auth. Members can edit their own display name, owners can edit all members, and the endpoint cannot change roles, emails or workspace membership. Sending domain is owner-controlled and must be a domain **already verified in the email provider**. A blank domain blocks sending with a setup message; a sender's email domain must match it exactly (case-insensitive, no implicit subdomain allowance). This setting records provider setup; it does not perform DNS verification or create a domain.

The send screen lists every staff member and defaults to the current user. The server resolves only the selected user ID against current workspace membership and Auth email, saves the sender identity/company/domain on the proposal and sent audit event, and freezes From/Reply-To on each queued email. Format: `"<display name> · <company name>" <staff email>` with the staff email as Reply-To. Re-sending can choose another sender; later profile edits do not change existing/queued mail identity. All client email types and staff notifications share this identity. Relevant staff recipients are the selected sender, sending staff member and proposal creator (if a staff member), plus the actual company-signature applier once known, deduplicated. AI tools cannot choose/change the sender or send proposals.

Migration: `20261029200247_staff_senders_and_canonical_links.sql` adds and backfills staff display names, adds a safe insert/update seed trigger, and removes only the obsolete fields from editable workspace-settings JSON. It adds no client grants or staff write policies. The intended hosted target is only app project `btvcyrixxswuedrnjbfh`; dry-run listed exactly this migration. After deployment, an owner must set **Settings → Verified sending domain** to the domain already verified in Resend (for example `mktfresh.com`), and review names in Team. Keep `APP_URL=https://proposals.mktfresh.com` for this deployment.

Validation: 55 unit/database tests, five browser tests, typecheck, format, neutrality and production build/trace validation pass locally. Tests cover migration preservation, profile seeding and permissions, domain mismatch, sender defaults/selection/re-send, every email type and Reply-To, legacy Checkout links, HTTPS validation, and attempted AI sender edits. Settings/Team/Send screenshots refreshed. No live client mail or billing requests were sent. Pre-migration Supabase security advisors reported no errors; the existing leaked-password-protection warning is unrelated to this change.

## Dropdown spacing follow-up (29 October 2026)

Global select styling now covers fields, toolbars, paper and client surfaces with theme-aware 12px chevrons and 36px right padding. Refreshed affected desktop screenshots in both themes, including Send's From dropdown. Browser coverage checks visible selects across screen captures and verifies From hover, focus and disabled behavior. Validation: 55 unit tests, five browser tests, typecheck, formatting, neutrality and production build/renderer trace passed locally.

## Catalogue sync correction (29 October 2026)

Updated sync and billing lookup to recognize `legacy=yes/true/1` case-insensitively. Regression tests cover an already sellable row becoming legacy without changing its ID, rejection at lookup, and false/missing flags remaining sellable.

Re-ran the corrected sync on app project `btvcyrixxswuedrnjbfh`, workspace `00000000-0000-4000-8000-000000000001`, at 21:20 UTC using only the repository's test-mode Stripe key and GET requests. All 41 existing synced lookup keys were present in the source. All 12 retired plans are now legacy/inactive; no Stripe objects were modified.

The workspace actually contained 14 seeded items total, including Audit and Build: ten active superseded placeholders were deactivated and two already inactive placeholders retained. Verified final catalogue: 55 rows, 31 active, 12 legacy/inactive, 12 inactive placeholders; Audit and Build are the only active items without lookup keys. No proposal/version rows changed (both tables were empty before and after). Local before/after catalogue evidence is saved under `.data/catalogue-before.json` and `.data/catalogue-after-sync.json` (the latter precedes the separate placeholder cleanup).

Validation: 69 unit tests, five browser tests, typecheck, formatting, neutrality and production build/renderer tracing passed locally.

## Linked pricing references (29 October 2026)

Implemented linked HTTPS sources alongside pasted references in Settings. Save performs the first fetch; Refresh now retries immediately; the existing hourly cron refreshes linked sources. Optional Basic auth username/password are encrypted using INTEGRATION_ENCRYPTION_KEY in the existing private provider credential store. Neither credential is returned to staff or AI. Settings permits replacing/removing credentials without showing the saved values.

Success stores an immutable fetched version (content, hash, label, fetch time). PLAYBOOK_VERSION assignment lines supply the label; otherwise the hash prefix identifies the version. Errors preserve the last good version and appear with its version and last success time in both Settings and the dashboard. An overlapping older refresh cannot overwrite a newer result. No schema migration or hosted-resource setup is required. A Basic-auth link requires a base64 32-byte INTEGRATION_ENCRYPTION_KEY in the deployment environment.

The AI tools expose current version metadata and text. get_document records a grant-scoped receipt; create_proposal_draft copies read version IDs, labels, hashes, fetch/read times onto the first event, even if the reference has refreshed since the read. Content stays inert text throughout.

Coverage includes successful fetch, encrypted Basic auth and removal, fallback after failure, empty first-fetch failure, declared/streamed size limits, DNS/body timeout, public-address checks (including encoded and mapped IPs), redirect restrictions and DNS rebinding, hourly refresh, overlapping refreshes, AI provenance and grant isolation. Browser coverage exercises saving/editing without revealing credentials, refresh failure, last-good content and dashboard status. Updated Settings/dashboard screenshots and added linked-reference failure screenshots in both themes. No owner URL or credentials were supplied, so owner-host acceptance remains to be checked after adding the reference in Settings; automated tests use controlled fixtures.

Validation: 95 unit/database tests and six browser tests pass locally, along with typecheck, formatting, neutrality and production build/renderer tracing. Existing RLS tests now explicitly verify document tenant isolation, append-only fetched versions and denial of staff reads from credential/receipt stores.

## Template defaults and reference label fixes (29 October 2026)

create_proposal_draft now accepts omitted lines. Supplied lines replace defaults completely, including an explicitly empty list, so inactive template defaults cannot block creation. Without supplied lines, defaults are filtered to active, nonlegacy catalogue items. Skipped inactive/missing entries are returned as warnings, saved as creation_warnings, recorded on the first event and shown in the staff editor. Playbook replacements also bypass defaults. Existing send validation remains in effect for the actual quote.

Templates display warnings for inactive/missing catalogue references, and Settings → Pricing lists affected templates and item names. Warnings derive from current catalogue data and therefore include sync deactivations; they clear after references are repaired or items reactivated.

PLAYBOOK_VERSION extraction recognizes const/let/var and bare assignments, single/double quotes and non-ASCII labels such as v1.17 · 15 October 2026. Refresh the linked document to create a correctly labelled fetched version; historical version records remain immutable.

Validation: 103 unit/database tests, seven browser tests, typecheck, formatting, neutrality and production build/PDF trace pass locally. New browser coverage runs a real mocked Stripe catalogue sync to retire a template default, verifies warnings on template and Pricing settings, and checks they clear after repair. Updated affected screenshots and added warning fixtures in both themes.

## Client preview, catalogue display names and manual invoices (29 October 2026)

Editor and record Preview as client open the real client-page component at /p/<id>?preview=1, including drafts before send. Staff-authenticated preview data and logo loaders are scoped to the workspace and read only; draft versions are built in memory. Preview has persistent Preview, not sent branding, desktop/phone controls, working optional selections and totals, and reading/signing/billing layouts. Signing and checkout are disabled; client submit helpers are guarded, and no public view, client write, email or billing action occurs.

Catalogue pickers share alphabetical effective display-name ordering and hide inactive/legacy items. Display name can be edited in the catalogue; it defaults to the synced name when blank, survives sync, and is copied into newly created proposal lines. No schema migration is required. The requested oiot-monthly-175 override is Website Build — Own It Over Time; the live workspace correction is applied after merge. Existing proposal snapshots are preserved.

Absent QuickBooks item mappings no longer block send. Unconfigured or unmapped one-time billing becomes an Invoice manually needs-review item after signature, without calling QuickBooks. Mapped/connected invoice creation is unchanged.

Validation: 108 unit/database tests, eight browser tests, typecheck, format, neutrality and production build/PDF trace passed locally. Coverage checks preview authentication and state preservation, no public requests/writes, optional totals, filled signature form remaining disabled (including Enter), preview width controls, catalogue filtering/order, display-name sync persistence and snapshotting, and manual invoice send/sign/billing behavior. Added 12 preview screenshots across reading/signing/billing, desktop/phone, light/dark, and refreshed affected staff screenshots.

## Send-time settings snapshots (29 October 2026)

Moved persisted workspace_settings capture from draft creation to SEND. Re-send refreshes the snapshot before readiness and variable resolution. New drafts store no settings snapshot; staff API reads/edits return a transient current-settings view, and editing a legacy draft removes its stale stored snapshot. Draft editor/send-screen readiness, the readiness endpoint and AI check_ready all use current workspace settings. Client preview already resolves current settings for drafts.

Signed proposals keep their saved settings and versions when the workspace changes, and the existing resend guard prevents changing signed snapshots. Existing sent versions' resolved variables remain unchanged by later re-sends.

Validation: 113 unit/database tests, eight browser tests, typecheck, format, neutrality and production build/PDF tracing passed locally. Added tests for absent persisted draft snapshots, current read/preview values, current staff/AI/API readiness (including a value becoming unresolved), send/re-send settings and variable updates, unchanged earlier versions, and signed snapshot preservation. No migration is required.

## Redesign Phase 1 — Foundation (30 October 2026)

Read design/redesign/CODEX_BRIEF.md and its full spec, served design/redesign locally and opened all eight Redesign 0X .dc.html files. Applied the brief's precedence and limited this PR to Foundation.

Implemented:
- Supplied theme/type/space tokens scoped to staff chrome; Instrument Sans variable WOFF2 self-hosted with OFL/source attribution. Source Serif 4 and IBM Plex Mono retained. Focus ring 2px/2px, reduced motion, accessible sheets and loading skeleton primitives.
- Responsive shell: 232px sidebar ≥1100px, 64px labelled icon rail ≥700px, five phone slots below 700px. Phone proposal routes hide the global tabs; the current draft editor's Preview / Review & send actions remain available at the bottom.
- Home / Proposals / Clients, global New proposal sheet with N shortcut, Studio menu and canonical Studio routes. Server redirects preserve access from old routes. Draft /proposals/:id opens the current editor; existing send, evidence, archive and countersign workflows are adapted to query views. Full feature layouts are deferred.
- Display-only status pills/tags: Draft / Sent / Viewed / Won / Lost / Expired, Archived as legacy flag display, AI, Needs countersign and Billing to finish. No stored statuses or audit events were renamed.
- Separate staff money formatter: auto whole dollars unless cents are present, always mode supported via optional workspace money.cents; /mo and /yr on rows and separate yearly values. Legacy document/client/PDF formatting remains fixed cents.

Integrity: no quote/data migration, provider requests, live credentials, hosted configuration or signing/billing behavior changed. Public Sans remains necessary for current sent/signed client/PDF rendering and must not yet be dropped. Regression tests verify unchanged old HTML, flat quote shape, frozen hashes and database versions when money preferences change. The prior auth file received whitespace-only formatting to satisfy the repository-wide format check; its temporary design-preview behavior is unchanged.

Evidence: docs/redesign-foundation/index.html provides a side-by-side reviewer; COMPARISON.md records actual matches and deliberate deferrals. 126 full-page application captures cover 19 staff surfaces plus New/Studio sheets at 375/768/1440 in light/dark, with six exact-height Home captures, 33 rendered references and one skeleton capture. Automated checks enforce geometry/colors/fonts, no horizontal page overflow, redirects, keyboard flow, reduced motion and no external font requests. Feature bodies are not claimed to match later-phase designs.

Open defaults accepted for their appropriate phases: clause 4.4 uses studio draft wording as seed data with draft:true/readiness warning; manual Won reason optional and audited; Source Serif 4 proposal defaults with curated OFL fonts and PDF-embedding license confirmation for uploads.

Deferred: Phase 2 client flow; Phase 3 item/sub-line/choice-group migration, old-snapshot adapter, MCP compatibility, contract/editor/review panels; Phase 4 record/countersign sheet/Home/lists/outcome audit; Phase 5 complete Studio and state layouts, workspace font/money controls and activity CSV. Activity currently points to per-proposal evidence. No new model migration/choice-group/MCP tests are applicable until those phases.

Validation: 129 unit/database tests, nine Playwright tests, typecheck, formatting, neutrality and production build/PDF runtime tracing pass locally. The Foundation test itself captures all required widths/themes and renders the original frame sources. Existing signing, company delegation, sender selection, linked-reference, catalogue and client-preview browser flows remain green.

Stop: Phase 1 only. Submit one PR, leave it open for Jonathan's review, and do not start Phase 2.

## Redesign Phase 2 — Client flow (30 October 2026)

Built the client-flow phase from design/redesign/CODEX_BRIEF.md and spec §7 after Foundation PR #24 merged. Served and opened Redesign 01, 05 and 08; compared the rendered frames, not just their source. This is one PR for review, left unmerged.

Changes:
- New sends/re-sends save client_flow_version: 2 on the Version JSON. Unmarked earlier sent/signed versions keep the original client and signature renderer/styles; no old evidence is rewritten. Draft previews use the new flow locally.
- Review → Sign → conditional Billing progress, branded header, page outline, optional checkbox rows with whole-row targets, live separate totals, 340px desktop choices panel and measured phone/tablet sticky-bar padding. One-time and Monthly are always visible; Yearly appears when a yearly item exists. New UI reads the snapshotted cents preference; white document paper remains white in both themes.
- Sign step order: acceptance summary/terms and actual contract Read link → editable prefilled name/title and fixed email/date → Draw/Type signature → exact full consent/checkbox → Sign proposal. Optional client title can now be saved on a contact; unknown titles remain blank/editable. Draw defaults on touch, Type on mouse; tabs support keyboard arrows. Every disabled action explains why.
- Synchronous double-submit guard and sealing state; network errors retain signature/identity/consent and offer a deliberate retry. Stale conflicts retain the form and require explicit reload. No automatic reload or retry.
- Signed-first Checkout and Later paths; new Checkout return URLs come back to the canonical proposal. Existing-subscriber results explain next-invoice changes without a payment control. Signed/Completed checklist, sealed-copy download, copy visibility and verification remain. Billing/sealing delays never undo the signature.
- Password gate reveals no proposal content; shared expired/declined/inactive pattern uses named saved sender contact when available. Unknown/rotated links remain private and ask the recipient to reply to the sender. Decline requires confirmation, accepts an optional note, records it in the audit event and queues the staff notification; loading uses a paper skeleton. Preview has a persistent banner and no public view, signature, email or billing writes.
- Sidebar footer theme/sign-out now have proper bordered controls; Home's recent-proposals table hides Yearly unless at least one shown proposal contains a yearly line. Removed designPreviewStaff and the DESIGN_PREVIEW_OPEN auth bypass/check. No hosted settings were changed.

Evidence: docs/redesign-client-flow/index.html is the interactive comparison gallery; COMPARISON.md lists matches and explicit deferrals. 114 application captures at 375/768/1440 light/dark cover 16 client states plus the staff fixes/contact-title field, with 12 additional matching-height Review/Sign images and 38 source references. Redesign 01 supplies real dark variants; 05/08 are light-only and the gallery labels that fallback, using board 04 for dark tokens.

Validation: 134 unit/database tests and 11 browser tests pass locally, including the full signing/PDF/download/verification path. Typecheck, formatting, neutrality and production build/PDF tracing pass. Tests cover new/legacy version selection and immutable hashes, JSON persistence, obsolete-env unauthenticated requests returning 401, read-only recipient email, prefilled title, consent ordering, optional totals, no duplicate totals, bar padding, all widths/themes, sealing/double-submit, touch drawing and keyboard tabs, failure retention, stale sign/quote without reload, no-billing one-time acceptance, D2/Checkout/later states, completed copies, password privacy, ended contacts, preview isolation, conditional Yearly and footer controls. Providers were mocked; no live credentials or hosted resources were used.

Deferred by the phased brief: Phase 3 quote items/sub-lines/choice groups, migration/old-quote adapter/MCP compatibility and conditional contract clauses; Phase 4 staff records/Home/lists/outcomes/countersign sheet; Phase 5 full Studio/font controls/states. The contact-title field and version marker fit existing JSON storage and need no SQL migration. Existing unresolved QuickBooks/live activation items above remain unchanged.

Stop: Phase 2 only. Leave the PR open for owner review and do not start Phase 3.

## Redesign Phase 3 — Quote model and editor (30 October 2026)

Built Phase 3 from design/redesign/CODEX_BRIEF.md and spec §§5/6/8, after PR #25. This is one PR for review; leave it unmerged and stop before Phase 4.

Changes:
- Draft quote items own ordered sub-lines, separate one-time/monthly/yearly amounts and provider mappings, optional/default selection, linked alternatives, and generic catalogue terms/schedules. Required items are always included. Sortable cards support pointer and keyboard movement, including whole groups and options within groups. Catalogue choices are active, alphabetized, and exclude items already present.
- `20261030055549_draft_quote_items_v3.sql` converts stored **drafts only** one old line → one item → one sub-line, preserving identities, entered amounts, quantities, intervals, mappings and terms. It appends a system migration event under the existing revision check and is idempotent. Sent/viewed/signed/completed/closed states and every version row remain unchanged. The pure read adapter handles both old flat generations without mutating or hashing its inputs. The database test installs an additional trigger that rejects any version UPDATE/DELETE during this migration.
- Client alternatives use radio groups, independent optionals use checkboxes, and required items have no selection control. Choices update totals, field values and conditional contract clauses together. Signature requires exactly one choice per group, freezes the visible clauses, and resolves selected item IDs/sub-lines **before** queueing billing. The billing worker validates again; QBO, existing-subscriber and Checkout adapters continue to receive their established flat line DTOs. New PDF quotes render each item name once above its sub-lines and show the chosen alternative; the old flat HTML renderer is retained unchanged.
- Canonical draft items and legacy flat `lines` inputs both work with MCP create/update/set. Tool descriptions and docs describe the transition; proposal responses include `items`/`quote` and compatible `lines`, and catalog responses include presets/defaults. AI approvals are reset, draft scope stays pending per section, and catalogue overrides need an explicit staff Use list price/Keep decision. Quote-only assistant updates reopen the quote section for review, including on previously reviewed drafts. Saving does not dismiss review; send confirmation lists unreviewed sections and cannot bypass price holds. AI send/sign/sender restrictions remain.
- Editor: 236px outline, paper document and 452px Quote / Pricing reference / Review & send panel; 440px tablet drawer; phone section list, single-section navigation, quote/item/reference sheets. Default totals and ranges stay visible. Field atoms resolve live or show names through node-view decorations (no document replacement or stale chip text); typing `{{` opens the field picker. Text/list/image/contract/signature blocks can be inserted, reordered and saved for reuse. Contract clauses can be edited/reordered/conditioned per proposal, with readiness warnings. Reference text is read-only/searchable with its actual version, fetch time and hash. Send includes staff From, recipient, note, password, preview and named send action.
- Financing presets and the supplied draft clause 4.4 are seed data only. The clause is marked `draft:true` and warns until the Studio replaces it. Existing seeded templates/catalogue rows are not overwritten. The full Studio management screens remain Phase 5.
- Staff decline notifications now include the client's decline note. New sends/re-sends freeze `money_format_version: 2`, applying auto/always money formatting to quote variables; old variable maps keep fixed cents. Removed client theme controls while retaining theme preference support. The billing step no longer repeats the sealing/email sentence already covered by confirmation.

Evidence: `docs/redesign-quote-editor/index.html` compares the responsive application captures against rendered source frames 2a–2f and 5e–5h. Board 02 provides real light/dark reference variants. Board 05 is light-only; its fallback is labelled. In this export 5e is desktop Billing and 5f is tablet Signed; both now have current application counterparts, while 5g/5h are the actual tablet editor/drawer. The gallery includes all touched editor/client screens at 375/768/1440 in light/dark. `COMPARISON.md` records the comparison and practical differences.

Validation: 149 unit/database tests, the complete 12-test Playwright suite, typecheck, formatting, neutrality and production build/PDF runtime tracing. Coverage includes migration preservation/idempotence/permissions, old snapshot adapters and rendering, group selection to queued/provider billing, visible-clause freezing and countersign preservation, MCP old/new input, AI approval rejection/price holds, per-section IDs, decline note and money-version formatting. Browser checks cover all required widths/themes, reference search, keyboard sorting, explicit price review, sender selection, note/send, client radios, no client theme control, sealing text, signing/PDF/download verification and preview safety.

Deployment note: the new migration is committed and tested against local PostgreSQL (PGlite), but has **not** been pushed to any hosted project. No live credentials, provider calls or hosted resources were used. Review the migration as part of this PR; apply it only to this app's Supabase project during the eventual release. QuickBooks/live provider verification remains as previously documented.

Stop: Phase 3 only, one open PR for Jonathan's review. Do not begin Phase 4.

## Phase 4 Part A — current-model reset (30 October 2026)

The owner confirmed there is no pre-redesign client evidence. `scripts/purge-test-proposals.ts` is prepared but **has not been run against the hosted project**, including dry-run. See `docs/purge-test-proposals.md` for the owner-run workflow. It requires an explicit workspace and confirmation; the default prints counts. Imports and their files, other workspaces, clients, catalogue, templates, library/reference content, settings and integrations are preserved. Proposal-dependent evidence rows are removed only in the owner-run transaction; protections are restored before commit and on rollback. No Stripe/QBO/email calls are made.

Legacy client/signature files and readers, generation flags, old flat MCP inputs and the draft quote migration were removed. The application and MCP use current items/sub-lines only; billing still resolves selected sub-lines into provider DTOs. New playbook payloads use `items` and `/schemas/quote-draft.v2.json`. Future signed snapshots/hashes are still immutable. This is Part A's separate commit before the Phase 4 UI work and Jonathan's additional validity/client/Studio requests.

Part A local validation: 148 unit/database checks and TypeScript passed. Eleven existing browser tests passed; the broad screenshot fixture was updated to use the current client flow and is being rechecked with Phase 4. No hosted purge or database change was performed.

## Redesign Phase 4 — records, countersign, Home and lists (30 October 2026)

This section supersedes the Phase 3 compatibility/migration notes above. Phase 4 includes Jonathan's follow-up additions because no Phase 4 PR had been opened when they arrived. **Stop for review after this PR; do not merge or start Phase 5.**

Implemented:

- Record: a named Next action, lifecycle, timeline with evidence, frozen selected/not-chosen quote summary, separate billing/manual invoice states, retry and files. Countersigning opens as a focused sheet over the record, with frozen items/totals/version/hash, client signature, stored company signature, delegate authorization and full consent in that order. A stale 409 blocks further submission; an already-applied signature shows who applied it and when. Own success shows the sealing state, closes the sheet and removes the Sign link. Return navigation preserves the list view and scroll position.
- Home: actionable groups, default-selection pipeline totals, actual client signatures this month and recent proposals. Lists: all specified views, native select on tablet/phone, whole row/card links, separate Sign links and action menus (phone bottom sheets). List summaries include a read-only version count so Lost proposals can reopen without including full evidence in list responses. Duplicate, unsigned edit as new version/link rotation, PDF preview/download, manual win/loss with reason, reopening Lost by sending again, archive/unarchive and surviving Undo are supported. Manual wins never manufacture signatures or start billing.
- Client detail leads with current test-mode Stripe billing, card and QuickBooks link availability, then proposals and editable notes. Contact/provider fields remain editable through the menu. Delete client names the client in a confirmation, is disabled with the required explanation when any proposal exists, and writes an atomic workspace audit event. AI cannot delete clients. The current Activity screen can show that deletion; Phase 5 still owns the complete filter/export interface.
- Editor polish: icon-only accessible drag handles, no Choose one/Edit item collision on phone, aligned Optional switch and default selection, visible sub-line label fields, structured blocker/warning rows, readable document dates and field chips. The application remains neutral; catalogue-specific schedules and contract clause wording remain seed data.
- Validity: staff/MCP/API creation defaults to the workspace day plus its validity setting (30 days by default). Clear × stores null, meaning indefinite. Access, signing, cron expiry and Home consistently honor null; client/sign summaries hide expiry. `{{proposal.validity}}` renders the full sentence or disappears without an empty paragraph; `{{proposal.valid_until}}` remains available and warns when indefinite. The Fields panel and picker include the new field, and the seed template uses it.
- New proposal: “Create new client instead” opens an independent nested modal/sheet, keeps entered values, selects a saved client, keeps validation errors inside the modal and offers “Use the existing client” for a duplicate email.
- Studio: desktop section plus five links, tablet popover, phone `/studio` page. The canonical routes are unchanged.

Database/release notes:

- Part A was committed separately as `422fccc`. The purge script remains owner-run only: **no hosted dry-run or deletion was performed**. Follow `docs/purge-test-proposals.md`, including pausing workers and providing the project-matching owner database URL. Imports, clients, catalogue, templates, content, settings and other workspaces are preserved.
- Apply `20261030125514_phase4_client_delete.sql` to this app's project during the owner-approved release. It adds only the service-role client-delete transaction; ordinary users/AI cannot execute it. It was tested locally with PostgreSQL/PGlite, including reference guards, rollback and permissions. Do not deploy the current-only application before the owner has purged native test proposals. The retired draft-conversion migration is removed and has no replacement; reconcile its migration-history entry if the CLI reports it as already applied, without running a conversion.
- No hosted resources, live credentials, Stripe catalogue/customer/subscription changes, QuickBooks requests or real emails were used for this work. Existing provider acceptance and webhook-version/QuickBooks pending items above remain pending.

Validation: **159 unit/database checks and all 13 browser checks passed**, plus TypeScript, formatting, neutrality and the production build with PDF tracing. After correcting the switch height during visual review, the editor browser test was re-run and its full screenshot matrix regenerated successfully. Browser runs now own a fresh temporary local database, avoiding duplicate test clients between runs. Obsolete page/menu assertions were replaced with the current sheet, row and Studio flows; dedicated client-flow coverage remains intact.

Visual evidence: [committed Phase 4 comparison gallery](docs/screenshots/phase4/index.html). It includes **85 Phase 4 captures and 44 editor captures**, at 375/768/1440 in light/dark, with matching 3a–3f, 6a–6f and editor reference frames. The countersign sheet includes both its frozen summary and its authorization/consent end. Screenshots were inspected for overflow, readable controls, sheet order, phone Choose one spacing, visible sub-line fields and default-selection control alignment. Studio navigation and indefinite/inline-client states extend the supplied frames per Jonathan's additions. The stored-signature fixture is intentionally not a real signature. CI also uploads the full evidence folder.

Stop: one Phase 4 PR for Jonathan's review. No Phase 5 work, hosted purge, hosted migration or merge was performed.

Final billing-panel follow-up: before a verified Stripe ID has been stored, an exact-email read can identify an existing subscriber. Ambiguous email matches are refused, the lookup is not persisted automatically, and no customer is created. A variable-price item is reported for review rather than displayed as a false $0. The added regression check passed locally with the full 159-check unit/database suite, TypeScript, formatting and production/PDF tracing.

Final record-state verification: archived drafts open as read-only records and return to the editor only after unarchiving; readiness blocks sending while archived. Home recent proposals omit archived/imported records. Completed jobs are omitted from the queue display, running/retry states are explicit, and failed PDF/email work retains retry controls. The expanded record browser test passed and the 85 affected Phase 4 captures were regenerated.

Final visual pass: desktop/tablet action menus are anchored popovers; phone action menus stay bottom sheets. The matrix now includes those menus and the manual-invoice dialog in every width/theme. Invoice conflicts stay inside the dialog with the entered reference preserved, and Escape from the nested client dialog preserves the New proposal sheet. The complete 13-check browser suite was re-run successfully after these corrections; unit/database checks remain 159, with type, format, neutrality and production/PDF-tracing checks passing.

## Redesign Phase 5 — Studio and states (review checkpoint)

Built from the brief/spec precedence and the served Redesign 07/08 frames. This is one Phase 5 PR, left open for Jonathan's review. Phase 4 is merged; the hosted test purge and client-delete function were already handled by the owner. No hosted migration, resource or provider action was run for Phase 5.

- Desktop sidebar footer controls explicitly retain readable theme colors; browser checks verify their text contrast in both themes.
- Studio saves refresh data without resetting the selected template or open form. Successful Workspace saves clear password/upload fields.
- **Templates & blocks:** one Studio surface for templates and saved blocks, with ordered blocks, pointer/keyboard drag handles and explicit move controls. Clicking a clause opens that exact clause; browser checks cover the conditional clause/radio/selector state. Clause editing includes the show-when catalog condition, draft-wording warning, ordering and reusable contracts. On phone/tablet the inspector is a sheet. Template defaults can use current items, sub-lines, optionals and choice groups. Existing sent/signed agreements are unaffected.
- **Catalog:** active items first, search and explicit inactive/legacy inclusion, custom families, app-only display names, minimum commitment/paid-invoice schedule controls, accounting mappings and a client-copy preview. Additional client copy is retained by Stripe sync and appears in new proposal/client/PDF item terms. No price is calculated or suggested.
- **Connections:** one card each for Stripe, QuickBooks, Email, Pricing reference, AI assistants and Proposify import. Cards distinguish configured test/sandbox/mock status from actual verification; email DNS is not falsely reported as verified. Reference refresh failures retain the last good version, including on first-run Home. Assistant access/revocation and import reconciliation stay inside Connections.
- **Workspace:** brand/contact/logo/accent with the 4.5:1 white-text check and same-hue suggestion; currency and cents; three self-hosted OFL font choices plus licensed WOFF2/TTF upload, independent heading/body selection and phone-width preview; signatory, stored image, delegates and consent; Team display names; default link validity (30 days), timezone, reminders, owner-only password default and sending domain. Fonts apply to staff documents, client reading pages and sealed PDFs. Font paths/license evidence are private, immutable and workspace-scoped. Selected descriptors freeze at send/re-send; product controls remain in Instrument Sans. No Public Sans runtime files remain.
- **Activity:** combines proposal and Studio events, filterable by actor (staff, assistant, client/system), type and date; CSV export uses the same filters, quotes values and neutralizes formula prefixes. Reference bodies and credentials do not enter this projection.
- **States:** first-run/all-clear Home, skeleton loading, catalog failure without clearing saved quote items, offline editor recovery, conflict reload with retained suggestions, assistant connection recovery, explicit send blockers, PDF and pending Checkout states, and existing client loading/offline/payment/replaced/decline/already-signed states. Pending billing links can be re-emailed by staff without altering the signed version or starting billing. The one-time manual invoice path is preserved.

Owner fixes:

1. `defaultValidUntil` and `ValidityField` save workspace-local end-of-day. America/New_York winter, summer and both DST boundaries are covered; displayed dates and `{{proposal.validity}}`/`{{proposal.valid_until}}` use that same timezone. New-proposal creation submits the resulting instant directly. Indefinite behavior remains unchanged.
2. Timeline labels are readable sentences for all emitted event types, including “Client gave consent”, company consent, downloads, invoices, webhooks and billing setup. Unknown future types show “Activity recorded”; stored audit names/hashes remain unchanged.
3. Countersign uses the actual stored company image. The browser test draws a non-production fixture in Workspace, saves/reloads it, then verifies that exact 720px image in the countersign sheet. A missing image says **“No signature saved — add one in Workspace”** and links to setup. No empty signature box is rendered.

Visual evidence: [Phase 5 comparison gallery](docs/screenshots/phase5/index.html), with application screenshots at 375/768/1440 in light/dark alongside 7a–7g and 8a–8r. The gallery identifies source exports with only one visual variant. It includes a rendered local PDF using curated headings and an uploaded body font. The Studio layouts use neutral fixture data; no real owner signature is copied into committed evidence.

Practical differences: existing MCP writes are atomic; the 8d counterpart shows the saved assistant draft ready for review, without a fictitious live-stream indicator. Team account provisioning remains in the existing Auth administration workflow. Recurring Checkout is not silently canceled or converted into a manual subscription; the pending state offers a real resend action and preserves the existing one-time manual invoice workflow. All hosted Stripe/QuickBooks verification statuses from earlier sections remain unchanged; QuickBooks remains pending.

Validation: **170 unit/database checks and all 14 browser checks passed locally**, plus TypeScript, formatting, neutrality, and the production build with PDF runtime tracing. The affected Studio matrix and client-font checks were re-run after visual polish; all passed. The local uploaded-font PDF was rendered and visually inspected. CI on the Phase 5 PR is the final release gate; no merge is performed here.

**STOP after Phase 5.** Leave the PR unmerged for Jonathan's review.

## Clients polish — separate PR after Phase 5

Implemented on `codex/clients-polish`, stacked behind Phase 5 PR #28. This work is deliberately excluded from Phase 5. Stop for Jonathan’s review after this PR; do not merge it automatically.

- Shared new/edit contact forms format US/international phones as typed, validate inline and store E.164; legacy values normalize on next save. MCP create/get/search/update share the same contact rules and return a formatted phone projection. Invalid legacy values remain reviewable without rewriting stored data on read.
- Client detail adds a labelled contact card (name, title, mailto email, tel phone, structured address) and visible Edit/Delete buttons on every width. Delete remains reference-guarded, named-confirmed and audited. Directory has Company / Contact / Title / Email / Phone / Billing / Proposals, becoming labelled cards on phone.
- Structured optional address fields are behind Add address in the new-client modal and editable in the client sheet. Country defaults to United States. `{{client.address}}` is multiline and empty-safe in text and field chips. New Stripe/QBO customer creation receives the contact address/phone; existing provider addresses are never updated. Signed snapshot data/hash integrity is preserved.
- Stripe test-mode chooser lists every case-insensitive exact-email match with name, ID, creation date, saved card, active/current subscriptions and monthly totals. Zero/one/many states, explicit link/change/unlink confirmations, optimistic conflict protection and actual staff audit entries are included. No customer is linked merely by opening the page. Matching scans paginated test customers because Stripe’s optional email filter is case-sensitive; the chooser, readiness check and billing worker share that same match rule. Ambiguous unlinked matches block send and MCP readiness with the chooser link; billing uses only the linked ID when one exists and refuses fallback to another match.
- Proposals, Clients, Home groups and clickable Activity rows use the shared light/dark `--row-hover` token, full-row focus treatment and independent inner actions. Non-clickable activity rows have no hover affordance.

Validation: 183 unit/database tests; full Playwright regression suite, typecheck, neutral-source check, production build/serverless PDF tracing, and formatting. The complete local browser suite passed 15/15; the final Clients matrix/recovery check passed again after the last focus and error-state refinements. The production API trace loaded all renderer packages (295 traced files). Commit-specific CI results are on the PR checks. The new browser test captures 90 application screenshots at 375/768/1440, light/dark, plus 32 contextual reference frames. See [visual gallery](docs/screenshots/clients-polish/index.html), [comparison notes](docs/screenshots/clients-polish/COMPARISON.md), and `e2e/clients-polish.spec.ts`.

Deployment prerequisite after review, before merging/deploying this PR: apply `supabase/migrations/20261030160513_client_stripe_link.sql` **only to this app’s explicitly linked Supabase project**. It adds staff-only transactional link/audit and contact-save functions; no data conversion is required. The hosted migration has not been applied by this task.

Hosted verification remains pending: exercise customer matching/linking with the repository’s test-mode restricted Stripe key (Customers, Subscriptions, and saved Payment Methods read access), and new-customer address forwarding in test Stripe / QuickBooks sandbox. All provider checks here use mocks; no real provider or hosted workspace records changed. QuickBooks credentials and its hosted verification remain pending as before. No live key or hosted resource was used or created.

## Live review small fixes — review checkpoint

One PR based on the merged Phase 5 / Clients polish baseline. Leave it **unmerged for Jonathan’s review**, then stop. No hosted migration or provider operation is required or performed by this task.

1. Linked Stripe customer cards now use a direct lookup and show only the linked customer’s ID, creation date, saved card, active subscriptions and monthly totals. Unlink names the client and customer in a confirmation, retains the transactional staff activity event, and restores candidates only after success. Provider read errors still retain a recoverable saved-ID/unlink view.
2. Client directory/detail email values copy with a “Copied” toast and a labelled Open in Mail icon. Desktop phone values copy their formatted display with a separate dial icon; phone-width number links dial the stored E.164 value. Inner actions do not open the client row. Clipboard errors are explicit.
3. First-run Home uses actual configured test/sandbox provider status, active synced-product count, ready template and assistant access. Completed steps have checks and no action. QuickBooks remains optional with manual one-time invoicing explained. When required setup is complete, Home shows only “Send your first proposal” / New proposal.
4. Shared native checkbox, radio and switch labels place the control left, centered with an 8px gap and a whole-row target of at least 44px on touch. Inline fields/actions share bottom alignment and 44px input/button height across template headers, search/new-client, product filters, field pickers and Team forms.
5. Products replaces Catalog throughout staff navigation, page headings, pickers, buttons, empty states and human-readable errors. `/studio/products` is canonical and `/studio/catalog` redirects. MCP `list_catalog` keeps its name and describes products.
6. Product accounting states say Stripe, QuickBooks, Invoice manually, Needs QuickBooks item or Needs Stripe price, with explanatory tooltips and live detail copy. Mapping outcomes are visible on smaller screens as well. An unavailable connection status gets an explicit check-connection state.
7. The font license confirmation is directly below the upload field. Both heading/body pickers include Playfair Display, Fraunces, Lora, Merriweather, Inter, Montserrat, Poppins, DM Sans and Space Grotesk, grouped as Serif/Sans with real self-hosted name previews. Existing Mono/uploaded choices and the Source Serif 4 default remain. All files/licenses/provenance are in `public/fonts`; Space Grotesk’s upstream has no italic, so italic is synthesized. The other new variable families include native upright/italic faces; Poppins includes six static weight/style faces. PDFs embed the selected families/available faces locally and keep signed snapshots untouched.

Validation: **197 unit/database tests**, the **15 existing browser regressions** and the **new responsive review check** passed locally. The final review matrix was regenerated after correcting phone setup-action wrapping and the editor touch target. TypeScript, formatting, neutrality, production build and API/PDF output tracing pass (327 traced runtime files). `npm run verify:fonts` passes for all 12 curated families and now runs in CI. Its PDFs and embedding report are included with the visual evidence.

See [comparison gallery](docs/screenshots/live-review/index.html), [comparison notes](docs/screenshots/live-review/COMPARISON.md), and [capture manifest](docs/screenshots/live-review/manifest.json): **90 application screenshots at 375/768/1440, light/dark**, alongside 32 contextual/matching design references. The gallery marks source exports that have only one visual variant. Reproduce with `npx playwright test e2e/live-review.spec.ts`, `npm run verify:fonts`, and `node --import tsx scripts/package-review-evidence.ts`.

All billing/customer responses in these checks are local mocks. No hosted data or provider configuration changed. The previous hosted Stripe / QuickBooks verification status remains unchanged; QuickBooks sandbox verification is still pending. Commit-specific CI results are the final PR gate.

**STOP after this PR. Leave it unmerged for Jonathan’s review.**

## Live end-to-end review — client completion and editor actions

One PR on `codex/client-completion-polish`, based on merged main `734b026`. Leave it **unmerged for Jonathan’s review**, then stop.

1. Proposal/reminder HTML keeps branding, title, the authored sender note, one **View proposal** button and the one-line sender/workspace footer. Automatic pricing and the duplicate printed URL/link are removed. Plain text retains the URL. Reminders reuse the note from the matching send version, including previously queued jobs.
2. Newly generated sealed PDFs append one Letter-page **Certificate of completion** with proposal title/ID/version, the frozen signed-content SHA-256, each signer’s name/title/email/signature/time/IP, actual delegated applier/authorization, and sent/first-viewed times. Times use the workspace timezone. The certificate excludes internal events; staff Evidence and raw database events are unchanged. Client-only copies say countersignature pending; unsigned previews do not claim completion. Existing sealed files are retained, never rewritten, and frozen version/hash checks remain intact.
3. The billing step itemizes only the selected recurring sub-lines belonging to each pending Checkout, with separate monthly/yearly figures and amount-labelled Checkout buttons. Existing subscription additions use the same separation. One-time fees have their own **Invoiced separately** section with actual QuickBooks/manual copy. Card-only setup explicitly takes no payment and displays names/rates in Stripe’s submit text. Unknown multi-session older metadata never guesses a charge.
4. Shared Stripe Products/Prices are preserved. The billing step uses their actual resolved Stripe names so it matches Checkout; no per-proposal Products/Prices or shared-name mutations are introduced. Signed proposal display names remain frozen. A setup summary exceeding Stripe’s supported 1,200-character limit goes to staff review.
5. Expanded signed documents on billing/completed steps use the same reading-column width as the main proposal at all widths. Client verification actions are removed; staff Evidence/hash verification remains. Each client state has one bottom contact footer, with a mailto sender name and copyable email.
6. Proposal/template blocks and contract clauses share attached top-right actions, gutter drag handles and one active selection. Hover/focus changes only paint/visibility; clicking/tapping keeps selection when the pointer leaves, another block takes ownership, and Escape clears it. AI markers/review and rich-text formatting live in the owning toolbar. Touch actions are reachable without hover and scroll horizontally when needed. Template content taps select; the explicit settings action opens the inspector/sheet. Inspector formatting rows retain fixed space.

Evidence: **112 application/baseline captures plus 18 design-frame exports** in the [comparison gallery](docs/screenshots/client-completion/index.html), [comparison notes](docs/screenshots/client-completion/COMPARISON.md), and the [rendered local PDF](docs/screenshots/client-completion/completed-proposal.pdf). All touched surfaces have 375/768/1440 light/dark captures. Editor before/after comparisons additionally use an isolated main-branch copy at 375/1440, including clauses. The certificate PNG is rendered from the actual PDF and was visually inspected; signatures and provider data are synthetic.

Validation: 208 unit/database checks pass. Browser checks cover email HTML/plain text, actual PDF page count/content/delegated signatures, exact billing session subsets and names, manual/QBO states, single contact footer, reading width, and every editor block’s coordinates/sizes/scroll (maximum 1px change) during hover/focus/selection/Escape/review. The full **18-test browser regression suite passed locally**, followed by the affected billing/certificate matrix and the final editor matrix after the last refinements. The editor check also verifies keyboard drag/reordering and handle ownership on nested clauses. TypeScript, formatting, neutrality, all 12 curated font embeddings, and the production build with API/PDF output tracing pass (327 traced runtime files). Commit-specific CI is the final PR gate; see the PR checks for its authoritative status.

Reproduce: `npm test`, `npm run typecheck`, `npm run check:neutral`, `npm run verify:fonts`, `npm run build`, `npm run test:e2e`; `node --import tsx scripts/package-completion-evidence.ts` packages the two capture manifests. `e2e/client-completion.spec.ts` uses Poppler (`pdftoppm`) to inspect the real certificate; CI installs it. To regenerate before captures, serve an isolated checkout of main `734b026` at a separate local origin and set `BLOCK_BASELINE_URL` for `e2e/block-controls.spec.ts`.

No hosted migration, credential read, provider call, email delivery or resource creation was performed. Prior hosted Stripe verification remains unchanged and QuickBooks sandbox verification remains pending.

**STOP after this PR. Leave it unmerged for Jonathan’s review.**
