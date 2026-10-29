# Phase 2 handoff — STOP 1

29 October 2026. Phase 2 is implemented through the pre-hosting checkpoint. **No hosted resources were created and no live credentials were used.** The owner explicitly instructed completion with mocks because Stripe test and QuickBooks sandbox credentials do not yet exist. The actual provider and hosted checks below remain pending; this is not a live-billing launch approval. STOP 2 imports require a separate owner-initiated run.

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
- 37 Vitest tests cover quote validation, tenancy/RLS/CAS, immutable evidence, imports, OAuth/PKCE/token rotation, AI capability denial, provider contracts, webhook signature/replay, encrypted tokens and document-hash review checks.
- Browser acceptance: MCP creates a draft → person edits a price in the staff UI and sends → client chooses an optional line and signs → staff countersigns → mock QBO/Stripe jobs finish → both PDFs download and hash verification passes. D2/D3 and custom inline billing are separately exercised against mocked HTTP contracts, not real provider accounts.
- Real **local** Supabase: migrations applied to the Phase 1 database, staff login/outsider denial, private Storage, full-text search, both signatures, both sealed PDFs, append-only audit and mocked billing passed. Database lint reported no schema errors. PGlite also verifies cross-workspace visibility, immutable ownership and CAS on a fresh schema.
- [Screenshot index](docs/screenshots/README.md): every requested screen in light/dark at 1440px; all eight client states also at 390px. These are neutral visual fixtures rendered by the actual app. Checkout/review/archive example states are fixtures, not provider acceptance evidence. The normal full-flow browser test uses the actual API and local repository.
- Generated signed PDF evidence remains in ignored `.data/evidence/countersigned-proposal.pdf`. CI uploads browser screenshots and test artifacts. Secrets and runtime data are not committed.

## What still needs live verification

“Live verification” here means actual **test-mode/sandbox/hosted** services, not permission to use production billing credentials.

1. **Stripe test catalogue:** owner copies lookup keys (including `hosted-standard-100`) into test mode. Run catalogue sync with pagination; confirm legacy entries inactive and unknown/missing mappings visible. Compare imported names, amounts and intervals with the owner's catalogue.
2. **D2:** existing test customer with active monthly subscription and working card. Sign a proposal; confirm original items unchanged, one new item per selected line, no proration, correct customer company/title/plan metadata, no Checkout link, and accurate new recurring totals/email. Repeat for yearly items, mixed intervals and retry/replay.
3. **D3:** no card/no usable subscription/new customer. Confirm Checkout uses the same stored customer; complete it using Stripe test payment data; deliver the signed snapshot webhook and confirm no duplicate subscription on replay. Test abandoned/expired sessions and correction/retry behavior.
4. **Scheduled subscriptions:** test clocks/payment failures/paid invoices, supplied 18/30 and legacy 35-payment terms, month ends, phase metadata, separate subscription, generic step-down key/amount, retry after failed payment, and `send_invoice` first-invoice finalize/send. Mock contracts cannot establish Stripe's acceptance of schedule phase updates.
5. **Custom retainer:** $2,000/month under an existing Custom Retainer family, full sign → billing → PDF flow. Confirm entered amount/scope, no new product/lookup-key price, correct inline price and plan metadata. Duplicate family names must be refused across all product pages. Check restricted-key permissions with actual test requests.
6. **QuickBooks sandbox:** initial grant, encrypted token rotation, exact email/stored-ID matching and same-company/different-email review; correct line items/amounts, `EmailStatus=NotSet`, no customer email, fallback Custom services item and durable retry without duplicate invoices.
7. **Hosted deployment:** Vercel Chromium binary size/runtime/memory, embedded fonts/logo, both PDFs, private downloads, cron authentication and timing, webhook delivery/replay, custom-domain links and actual Resend delivery/DNS.
8. **Actual Claude and ChatGPT accounts:** add deployed HTTPS MCP connector, authorize/refresh/revoke, read pricing references and imported text, draft/review/send through the human UI. Local protocol tests do not prove the hosted clients' account-specific connector behavior.
9. **Historical export:** actual Proposify browser selectors/profile and small-batch reconciliation remain STOP 2 work. No real historical proposals were downloaded during Phase 2.

## Owner setup — exact order

1. **Keep the projects separate.** Create a new Supabase project solely for this repository. Do not reuse HappyU or TeamKeep. Save the project reference, URL, anon key and server service-role key privately. Use the default supported Postgres configuration; no public application tables or public Storage bucket.
2. **Apply schema and seed.** On a trusted machine, link the CLI explicitly to that new project, review `supabase/migrations/`, then run `supabase db push`. Run the seed with `APP_MODE=supabase` and this project's keys only. It seeds workspace `00000000-0000-4000-8000-000000000001`; it does not invent live billing mappings. The migration creates private bucket `proposal-files`. Re-sync catalogue rather than trusting old Phase 1 price IDs.
3. **Provision staff.** Disable public signup. Create the two email/password Auth users in the new project, then insert their UUIDs into `public.staff_users` with the workspace UUID and role `owner` (or `member`; both currently have the same permissions). Do not grant staff the service-role key. Configure Auth Site URL to the eventual canonical HTTPS origin; no OAuth callback to Supabase is needed for password login. Use Supabase administration for password recovery/staff changes.
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
- Confirm generic product family names, lookup-key ownership, workspace collection method, company names on customers, proposal descriptions, plan/terms metadata and no replacement of existing subscription items. The platform never cancels, refunds or archives products/prices.
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
