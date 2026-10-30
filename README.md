# MarketFresh proposal system

Phase 2 proposal workspace with staff authoring, client signing, required countersignatures, sealed PDF evidence, test-only billing adapters, OAuth MCP drafting and historical imports. STOP 1 deployment and verification instructions are in [HANDOFF_PHASE2.md](HANDOFF_PHASE2.md). The original brief is in [AGENTS.md](AGENTS.md); tradeoffs and source discrepancies are in [DECISIONS.md](DECISIONS.md).

## Local development

Requires Node 24 and npm. Docker is only needed for Supabase integration verification.

```sh
npm ci
npx playwright install chromium
cp .env.example .env.local
# Set a random DEV_STAFF_TOKEN in .env.local.
npm run seed
npm run dev
```

Next loads `.env.local`; seed/import commands load it too. `APP_MODE=local` persists to `.data/db.json` and `.data/files/`, uses mock billing and email, and runs in one Node process. Stop the dev server before running CLI seed/import commands against the same local data directory. Local mode is refused in production and on Vercel. Never put credentials in `NEXT_PUBLIC_*` variables.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Playwright starts an isolated server on port 3100, creates fixture records, signs in a real Chromium browser through the client interface after MCP drafting and staff editing, processes PDFs and mock billing, countersigns, downloads the final PDF, and verifies its hashes. Artifacts are in `.data/evidence/`. CI runs the same commands and uploads the evidence.

### Fresh local Supabase acceptance

The config uses dedicated `553xx` ports and project ID `mktfresh-proposals`. It does not reference other projects. The migration enables RLS on every application table and makes audit records/signatures/files immutable. Staff membership is explicitly provisioned in `staff_users`.

```sh
npx supabase start
npx supabase status -o json > .data/supabase-status.json
chmod 600 .data/supabase-status.json
npm run verify:supabase
```

On this Mac, CLI 2.117.0 stalled before container startup. The acceptance test was completed using `npx --yes supabase@2.76.7 start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta` and the same pinned-version `status -o json` command. The older CLI is a verification fallback, not a runtime dependency downgrade. Do not publish the status JSON: it contains local keys. The verifier refuses non-loopback Supabase URLs and creates test users/records only in this local stack.

## API contract

Internal routes use `Authorization: Bearer <Supabase access token>`, checked with `auth.getUser()` plus the protected staff allowlist in both Proxy middleware and route handlers. For local development only, use `DEV_STAFF_TOKEN`. Successful login returns a Supabase session; Phase 2 can use the Supabase client for session refresh/sign-out. There is no public signup route.

| Method / route                                | Purpose                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/auth/login`                        | `{email,password}` → Supabase session for an allowlisted staff user                   |
| `GET, POST, PUT /api/clients`                 | List or upsert client records; PUT accepts the full record with its `id`              |
| `GET, POST, PUT /api/pricing_items`           | Catalog and billing mappings; deactivate instead of deleting                          |
| `GET, POST, PUT /api/templates`               | Block content and default quote line references                                       |
| `GET, POST, PUT /api/content_library`         | Reusable named blocks                                                                 |
| `GET /api/proposals`                          | Filters: `status`, `client`, `source`, `from`, `to`, `q`, `offset`, `limit` (max 100) |
| `POST /api/proposals`                         | `{client_id,template_id,title,valid_until,currency?,password?,playbook?}`                 |
| `GET /api/proposals/:id`                      | Full internal aggregate: versions, signers, events, jobs, billing, files              |
| `PATCH /api/proposals/:id`                    | Draft-only changes with `revision`; title/content/quote/expiry                        |
| `POST /api/proposals/:id/send`                | Validate mappings/variables, write a version, rotate token, queue email               |
| `POST /api/proposals/:id/countersign`         | Staff signature payload; client must already have signed                              |
| `POST /api/proposals/:id/jobs`                | Drain due jobs for this proposal                                                      |
| `POST /api/proposals/:id/retry`               | Requeue failed/pending integrations and drain; successful billing stays idempotent    |
| `GET /api/proposals/:id/files/:fileId`        | Authorized download, including imported PDFs                                          |
| `GET /api/proposals/:id/files/:fileId/verify` | Verify sealed file, original body, and frozen version hashes                          |
| `GET /p/:token`                               | Branded client reading, optional quote, signing and signed-copy interface                |
| `GET /api/public/:token`                      | Safe rendered proposal, optional quote lines, revision, consent, sealed-file IDs      |
| `POST /api/public/:token/quote`               | `{revision,reviewed_hash?,item_id,selected}`; optional items only                                    |
| `POST /api/public/:token/sign`                | Client signature payload, email must match recipient                                  |
| `POST /api/public/:token/decline`             | Close an unsigned proposal                                                            |
| `GET /api/public/:token/files/:fileId`        | Download a sealed copy after token/password authorization                             |
| `GET /api/public/:token/files/:fileId/verify` | Public sealed-copy integrity check                                                    |
| `GET, POST /api/cron`                         | Expiry, day-3/day-7 reminders, job drain; `Bearer CRON_SECRET`                        |

Public API calls for password-protected proposals supply `X-Proposal-Password`; never put passwords in URLs. The API returns `401` for missing credentials/password, `403` for unauthorized staff, `404` for unknown IDs/tokens, `409` for stale revisions/frozen state, and `410` for closed/expired proposals. Every response with proposal content is non-cacheable.

Signature body:

```json
{
  "revision": 4,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "title": "Owner",
  "consent": true,
  "kind": "typed",
  "typed_name": "Jane Doe"
}
```

For drawn signatures use `kind: "drawn"` and `image: "data:image/png;base64,..."`. The service validates the PNG, stores exact consent and request evidence, freezes the client version, and queues durable effects. Reload before retrying a `409`; never silently sign an unseen revision.

## Integration boundary

- **Supabase:** real repository, Auth, private Storage, and full-text search adapter. Production requires a new dedicated project, migrations, two auth users, and their IDs in `staff_users`.
- **Resend:** real HTTP adapter with deterministic idempotency keys; local mock unless configured. Production needs a verified sending domain and API key. It was not exercised against a live account.
- **QuickBooks and Stripe:** real HTTP adapters are implemented behind `BILLING_MODE=test`, with contract tests for D2, D3, custom services, scheduled step-downs and unsent invoices. Stripe refuses live keys; QuickBooks refuses production. Actual provider acceptance is pending owner-supplied test credentials.
- **PDF:** Playwright locally, bundled `@sparticuz/chromium` on Vercel, with embedded fonts and workspace branding. Hosted size/runtime acceptance remains pending.
- **Proposify:** CSV/PDF import is tested with fixtures. Browser exporter requires actual account selectors and a dedicated authenticated profile. See [import instructions](scripts/proposify-import/README.md).

Do not treat a passing mocked billing flow as a live-provider acceptance test. Keep the `mock_` object identifiers visible in development.

## Phase 2 workspace and quote foundation

Apply migrations in order. Existing records are assigned to workspace 1 without rewriting signed version evidence. Staff membership includes a workspace and role; both roles currently have equal capabilities. Seed data lives in `seed/marketfresh.ts`. Edit workspace settings before sending proposals, including the sender, consent, client URL, and fallback QuickBooks item. Development always mocks email; billing stays mocked unless explicitly configured for test mode.

New lines use `amount`, `list_amount`, `interval` (`one_time`, `month`, `year`), nullable catalogue/family IDs, lookup key, QuickBooks item reference, optional minimum term, schedule and plan terms. No price or kickoff calculation occurs. The readiness endpoint `/api/proposals/:id/ready` returns the same blockers used by send.

The playbook handoff is `GET /proposals/new?draft=<base64url JSON>` with a staff session. Schema: `/schemas/quote-draft.v2.json`. A payload has `source: "playbook"`, `source_version: "v1.17 · 15 October 2026"`, optional title/client/notes, and an `items` array using the current item/sub-line schema. For example, create the URL in the playbook using UTF-8 encoding:

```js
const bytes = new TextEncoder().encode(JSON.stringify(payload));
const draft = btoa(String.fromCharCode(...bytes))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
location.href = `${proposalOrigin}/proposals/new?draft=${draft}`;
```

The create API accepts the validated payload as `playbook` alongside selected `client_id`, `template_id`, title and validity. It preserves the original payload on the first audit event and sets the source/version badge data. The owner deploys the playbook button separately.

### Test-only billing adapters

Keep `BILLING_MODE=mock` until test credentials are ready. Set it to `test` to enable the Stripe/QuickBooks adapters for workspace 1. Stripe accepts only `sk_test_` or `rk_test_`; the shell's `STRIPE_KEY` is never read. QuickBooks requires `QBO_ENVIRONMENT=sandbox` and a base64 32-byte `INTEGRATION_ENCRYPTION_KEY` for its encrypted refresh-token store. Run catalogue sync with:

```sh
node --env-file=.env.local --import tsx scripts/sync-stripe-catalog.ts
```

Stripe sends snapshot webhooks (API version `2024-06-20`) to `/api/webhooks/stripe/00000000-0000-4000-8000-000000000001`. Subscribe to `checkout.session.completed`, `invoice.paid`, and `invoice.payment_failed`. Set `STRIPE_WEBHOOK_SECRET` from `stripe listen` for local testing. The endpoint verifies and queues receipts; the authenticated cron drains them. Do not substitute live credentials. Actual sandbox acceptance is pending owner setup.

### Staff interface and review checks
Open `/login` and use the local token form while developing; hosted sessions use Supabase email/password and an HttpOnly cookie. Start at `/`, then `/proposals/new`. All content edits autosave with a revision check. Public toggles/signatures additionally send `reviewed_hash` from the API: it binds acceptance to the actual reviewed document while allowing unrelated background job updates. A changed hash requires explicit reload/re-review.

Successful send/sign/countersign responses schedule an immediate durable-job drain with Next `after`; the authenticated hourly cron remains recovery. Settings and provider IDs are staff-only. Historical PDF imports are read-only at `/archives/:id`. Screenshots are indexed in `docs/screenshots/README.md`.

Company counter-signing requires owner setup in **Settings → Company signatory**: designated name/title/staff account, a stored PNG (upload or draw once), and an explicit list of staff allowed to apply it. Delegates must acknowledge the exact on-behalf authorization. Client copies show the designated signatory; audit/PDF evidence retains the actual authenticated applier. AI cannot sign. See `HANDOFF_PHASE2.md` for MarketFresh setup.

Client and Checkout links use `APP_URL` (HTTPS canonical origin). Configure the already-verified email sending domain in Settings, review display names in Settings → Team, and choose a staff sender on the send screen. Sender email comes from Auth; all client emails and staff notifications use that sender's name/company and Reply-To. Apply the staff-senders migration before deploying this version. Historical proposal URLs remain readable from their snapshots.

### Pricing reference sources

In Settings, choose **Pasted text** or **Linked HTTPS document**. Linked references fetch on save, on **Refresh now**, and hourly through the authenticated `/api/cron` job. Optional HTTP Basic auth requires `INTEGRATION_ENCRYPTION_KEY` to be a base64-encoded 32-byte key. Both credential fields are encrypted with workspace/document-bound AES-GCM in the private credential store; saved values are never returned. Leave both fields blank while editing to retain them, or explicitly remove/replace them. Moving to another host requires clearing or replacing credentials.

References are inert UTF-8 text, limited to 1 MiB and a total 15-second fetch deadline including DNS and redirects. Only public HTTPS destinations are allowed; DNS is validated and pinned, and redirects may only stay on the original HTTPS origin (maximum three). Compressed responses are refused. Every successful fetch creates an immutable `document_version` workspace event with content, SHA-256, fetch time and an extracted `PLAYBOOK_VERSION = '…'` label, or a short hash label when absent. Current reference fields remain in `workspace_documents`; no schema migration is needed. Failed fetches retain the last good content and show status in Settings and on the dashboard.

`list_documents` returns current version metadata; `get_document` returns that version's plain text and records a private read receipt. Draft creation copies the versions previously read by that authorized connector grant into its first audit event, including version IDs, hashes, labels, fetch times and read times. A later refresh cannot change those audit references. The connector cannot configure links or credentials.

Staff can open **Preview as client** from the editor (after autosave) or proposal record. It opens /p/<proposal-id>?preview=1 with a staff-authenticated read-only data loader; drafts do not need a sent token. Preview uses the client component with local optional selections, live totals, reading/signing/billing layouts, viewport controls and a persistent banner. Signatures, checkout, declines, public view tracking and client actions are disabled.

Catalogue **Display name** is an optional app-only override preserved by Stripe sync. New catalogue-based proposal lines snapshot this name; existing proposal snapshots stay as recorded. Dropdowns use alphabetical display names and exclude inactive/legacy items. Missing QuickBooks mappings warn at send; selected one-time lines receive an Invoice manually needs-review billing link when QuickBooks is unconfigured or mapping is absent.

Workspace settings remain live while a proposal is a draft. Draft API responses and readiness use current settings without persisting a snapshot. Send and re-send capture the current settings before validation and rendering; signed proposals retain their frozen snapshot.

### Redesign Foundation (Phase 1)

The staff interface now uses scoped redesign tokens and self-hosted Instrument Sans, with a 232px sidebar at ≥1100px, a 64px rail at ≥700px and five phone tabs. Studio routes live under /studio; old staff addresses redirect. Draft proposals open their editor at /proposals/:id, while transitional send/evidence/countersign views remain accessible by query parameter. New proposal is a sheet (shortcut N). Existing client/PDF typography and fixed-cent formatting remain unchanged.

Phase 1 introduces display-only status mapping, money auto/always formatting and skeleton primitives. It deliberately retains current feature content until its planned redesign phase. Review screenshots and scoped comparisons in docs/redesign-foundation/index.html and COMPARISON.md. No migration or hosted configuration is required.

Redesign Phase 2 adds the client Review → Sign → Billing flow for new sends, using the current client renderer. Review screenshots and source-frame comparisons in docs/redesign-client-flow/index.html; implementation, checks and deferred Phase 3 work are recorded in HANDOFF_PHASE2.md.

### Quote editor redesign

All proposals use the current item/sub-line quote shape. MCP callers supply `items`; flat `lines` input is no longer supported (see [connector guide](docs/ai-connector.md)). The owner confirmed every native hosted proposal is disposable test data; run the [owner maintenance purge](docs/purge-test-proposals.md) before deploying the current-model-only release. Imported Proposify records remain supported and are excluded from the purge. Choice groups must resolve before billing is queued, and AI prices/content remain subject to staff review.

The responsive comparison gallery is [docs/redesign-quote-editor/index.html](docs/redesign-quote-editor/index.html); validation and release notes are in [HANDOFF_PHASE2.md](HANDOFF_PHASE2.md).
