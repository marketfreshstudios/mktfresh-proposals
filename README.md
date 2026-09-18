# MarketFresh proposal system

Phase 1 backend for proposals, required countersignatures, sealed PDF evidence, retryable integrations, and historical Proposify imports. The product UI is intentionally deferred to the separate wireframes. The original brief is in [AGENTS.md](AGENTS.md); tradeoffs and source discrepancies are in [DECISIONS.md](DECISIONS.md).

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

Playwright starts an isolated server on port 3100, creates fixture records, signs in a real Chromium browser through the unstyled development harness, processes PDFs and mock billing, countersigns, downloads the final PDF, and verifies its hashes. Artifacts are in `.data/evidence/`. CI runs the same commands and uploads the evidence.

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
| `POST /api/proposals`                         | `{client_id,template_id,title,valid_until,currency?,password?,oiot?}`                 |
| `GET /api/proposals/:id`                      | Full internal aggregate: versions, signers, events, jobs, billing, files              |
| `PATCH /api/proposals/:id`                    | Draft-only changes with `revision`; title/content/quote/expiry                        |
| `POST /api/proposals/:id/send`                | Validate mappings/variables, write a version, rotate token, queue email               |
| `POST /api/proposals/:id/countersign`         | Staff signature payload; client must already have signed                              |
| `POST /api/proposals/:id/jobs`                | Drain due jobs for this proposal                                                      |
| `POST /api/proposals/:id/retry`               | Requeue failed/pending integrations and drain; successful billing stays idempotent    |
| `GET /api/proposals/:id/files/:fileId`        | Authorized download, including imported PDFs                                          |
| `GET /api/proposals/:id/files/:fileId/verify` | Verify sealed file, original body, and frozen version hashes                          |
| `GET /p/:token`                               | Rendered current proposal; unstyled signing harness in local mode only                |
| `GET /api/public/:token`                      | Safe rendered proposal, optional quote lines, revision, consent, sealed-file IDs      |
| `POST /api/public/:token/quote`               | `{revision,item_id,selected}`; optional items only                                    |
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
- **QuickBooks and Stripe:** interface-based mocks, as permitted by the brief when credentials are absent. Supabase/production mode uses explicit `needs_review` adapters; setting keys alone does not enable live billing. Customer matching, one-time/monthly routing, idempotency, retries, and OIOT buyout/schedule rules are implemented and tested. Production HTTP adapters and sandbox acceptance are an activation task; no real invoices, subscriptions, or payment requests were created.
- **PDF:** Playwright/Chromium + pdf-lib. Configure a compatible Chromium binary or move the renderer behind the same interface to a worker before Vercel deployment. Vercel cron configuration is included; no deployment was made.
- **Proposify:** CSV/PDF import is tested with fixtures. Browser exporter requires actual account selectors and a dedicated authenticated profile. See [import instructions](scripts/proposify-import/README.md).

Do not treat a passing mocked billing flow as a live-provider acceptance test. Keep the `mock_` object identifiers visible in development.
