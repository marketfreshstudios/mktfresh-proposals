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
5. **Attach your proposal domain** (for example `proposals.<your-domain>`) to this new Vercel project; use the DNS records Vercel gives you and wait for HTTPS. Set `APP_URL` and `OAUTH_ISSUER` to this exact origin (no path). Set workspace `client_url` to the same origin. Redirect alternate hostnames to the canonical one so login, MCP issuer and client links agree.
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
| `RESEND_API_KEY` | Sending-only key for the verified domain. Local mode always uses mock email. Sender name/address live in workspace settings. |
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
- Schema: [quote-draft.v1.json](public/schemas/quote-draft.v1.json), served at `/schemas/quote-draft.v1.json`.
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
