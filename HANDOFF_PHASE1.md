# Phase 1 handoff — STOP checkpoint

Completed September 18, 2026. Phase 1 is implemented and verified using the brief's permitted mock boundary for missing billing credentials. Stop here: the next phase starts with the separately produced wireframes. No product UI or live deployment has been built.

## What exists

- Next.js 16 App Router backend with TypeScript, request validation, explicit error codes, protected staff API routes, and an unstyled local-only signing harness.
- Supabase migration for clients, catalog, templates, content library, proposals, versions, signers, append-only events, immutable files, billing links, durable jobs, and an explicit staff allowlist. All application tables have RLS. Proposal mutations and relational projections commit atomically with revision checks.
- Templates and draft authoring; frozen send snapshots; unguessable rotating links; optional password and expiry; server-calculated optional-line totals; dynamic variables with send-time unresolved-variable errors.
- Typed/PNG client signatures, exact consent text, stale-revision protection, required authenticated countersignature, immutable signed content, request evidence, and private signature files.
- Real Chromium PDF rendering with embedded signatures, appended audit pages, stored original-body/final-file hashes, and verification endpoints. Both client-signed and fully countersigned copies are retained and queued for delivery.
- Durable effect jobs with leases, retry delays, manual reruns, deterministic provider/email keys, staff notifications, signed-copy emails, day-3/day-7 reminders, and expiry handling. PDF/billing failures cannot roll back a recorded signature.
- Real Supabase Auth/Storage/persistence adapters, a real Resend HTTP adapter, and explicit QBO/Stripe provider interfaces plus mocks. Unconfigured live billing reports `needs_review`; it never claims to have billed anyone.
- Customer matching, QBO one-time invoice routing, Stripe monthly routing, and the supplied OIOT rules. Buyout credits count qualifying paid invoices; current defaults produce 30 payments, while the legacy Carolina example produces 35. Kickoff is kept in QBO; the monthly step-down is $175 → $100 with no proration.
- CSV upsert importer, resumable browser PDF downloader, private PDF uploader/text extractor, and reconciliation reports. Imported proposals are archived and cannot accidentally start billing.
- Catalog seed and sample template; indexed PostgreSQL full-text search and status/client/date/source filters; CI workflow; setup and complete endpoint documentation in README.md.

## How to run

See README.md for exact commands. Local quick start: `npm ci`, `npx playwright install chromium`, copy `.env.example` to `.env.local`, set a random `DEV_STAFF_TOKEN`, `npm run seed`, then `npm run dev`. A local `.env.local` with a generated development token and seeded catalog was prepared on this Mac; it is ignored by Git.

Local mode is explicitly enabled and single-process, with data under `.data/`. It cannot run in production or on Vercel. Supabase mode is the persistence path for real operation. Two staff users must be provisioned through Supabase Auth and added to `staff_users`; being an authenticated Supabase user alone grants no access.

The local Supabase project is isolated by project ID `mktfresh-proposals` and ports `553xx`. CLI 2.117.0 stalled during startup on this machine; the verified fallback is documented in README.md. No HappyU or TeamKeep data, repo, deployment, or configuration was changed.

## Validation evidence

| Check                                | Result                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                           | Passed                                                                                                                                                              |
| Vitest                               | 19 tests passed across 6 files                                                                                                                                      |
| Playwright                           | 2 tests passed, including full real-browser signing flow                                                                                                            |
| Next.js production build             | Passed                                                                                                                                                              |
| Formatting and Git whitespace checks | Passed                                                                                                                                                              |
| Fresh local Supabase migration       | Applied; local migration history confirmed                                                                                                                          |
| Real local Supabase acceptance       | Staff login, denied outsider/anonymous access, private Storage, signing, countersigning, both sealed PDFs, hash verification, full-text search, and all jobs passed |
| Supabase security advisors           | No issues found                                                                                                                                                     |
| Signed PDF visual review             | All pages reviewed; readable signatures, hashes, consent, and audit events                                                                                          |
| Import fixtures                      | CSV quoting/upserts, PDF upload deduplication, text extraction, and missing-file reconciliation passed                                                              |

Tests include concurrent/stale signing, signing order, false consent, invalid PNG, expired/password links, required-line protection, missing mappings/variables, HTML escaping and blocked external image URLs, public response data filtering, RLS denial, frozen-version/append-only enforcement, billing near-matches, retries and idempotency, legacy/current OIOT math, and tampered-file detection.

Local evidence: `.data/evidence/countersigned-proposal.pdf` and `.data/evidence/signing-harness.png`. These are generated fixtures and not production client records. `scripts/verify-supabase.ts` repeats the real local-service acceptance test and refuses non-loopback URLs. CI uploads browser/PDF evidence when it runs.

## Missing credentials and live activation boundary

No credentials were requested, per the brief. Missing connections were mocked or made explicitly unavailable.

| Connection                | Needed before live use                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated hosted Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; apply migration, seed without mock IDs, add two staff users; private `proposal-files` bucket                                                                              |
| Resend                    | `RESEND_API_KEY`, verified `EMAIL_FROM`, verified sending domain; live delivery acceptance                                                                                                                                                  |
| QuickBooks                | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`, `QBO_REALM_ID`, environment and real catalog item IDs; implement/activate the live provider behind `BillingProvider` and verify it in sandbox                                    |
| Stripe                    | `STRIPE_SECRET_KEY`, actual monthly price IDs, `STRIPE_HOSTED_STANDARD_PRICE_ID`; implement/activate the live provider behind `BillingProvider`, payment-method/Checkout handoff, paid-invoice schedule application, and sandbox acceptance |
| Vercel / PDF runtime      | Dedicated project, `APP_MODE=supabase`, `APP_URL`, `CRON_SECRET`; compatible Chromium executable or a separate PDF worker using the existing renderer interface                                                                             |
| Company data              | Confirm `COMPANY_NAME`, `COMPANY_OWNER`, `COMPANY_EMAIL`, `COMPANY_PHONE`, `STAFF_EMAIL`                                                                                                                                                    |
| Proposify export          | Actual report CSV, dedicated browser profile/login, verified list/pagination/download selectors, initial small-batch live validation                                                                                                        |

**Setting QBO/Stripe keys alone does not enable live billing.** The delivered mock boundary is intentional and clearly labeled. No actual QBO invoice, Stripe subscription, external email, production deployment, or bulk Proposify account export was performed. Resend's HTTP adapter has not been exercised against a live account. Browser exporter selectors are configurable, not claimed to be validated against the live account.

Vercel deployment also needs an explicit Chromium packaging/worker decision. The local browser binary is not automatically bundled into a serverless function. Failed PDF jobs remain retryable until the runtime is configured.

## Decisions for the owner / next phase

1. **Pricing source discrepancy:** the handoff says $750 audit and $2,500 build. The supplied PDF explicitly supersedes these with $295 audit and $2,750 minimum build. The active seed follows the newer PDF; older prices are inactive reference entries. Confirm before a live proposal is sent.
2. **OIOT current vs legacy:** new default = $500 kickoff and 30 paid monthly cycles. Preserve signed legacy terms; the supplied Carolina example remains a 35-cycle calculation. The 12-month minimum commitment is not the buyout payoff count.
3. **Live recurring collection:** the reference script uses Stripe Checkout to collect a card, while the brief requests subscription creation on signature. The production provider needs a clear `needs_payment_method`/Checkout state rather than claiming payment succeeded without a card.
4. **QBO draft semantics:** create an unsent invoice, never send it automatically. Review company-name/email mismatches; do not silently link them.
5. **Sending domain, public domain, PDF execution target, and live credentials** remain activation decisions. No infrastructure was provisioned in existing hosted accounts.
6. **Non-Vercel proxy deployments:** choose and validate a trusted source of client IP. The current adapter trusts Vercel's platform header and records “Not available” locally rather than trusting arbitrary forwarded headers.
7. **Proposal amendments:** the implemented edit operation is draft-only; resending retains the previous version and rotates the link. Design an explicit revision/amendment workflow before allowing edits to already sent content. Signed versions must remain immutable.

## Every UI surface required for Phase 2

Suggested frontend routes below are **wireframe targets, not implemented product pages**. The corresponding API contract is in README.md. Shared requirements: show loading/error/empty states, expose queued/failed/needs-review work, require reload on a revision conflict, and never silently sign or overwrite a stale document.

| Screen / route                             | Data it needs                                                                                        | Actions it must expose                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                   | Email/password, auth error, session                                                                  | Sign in; session refresh/sign-out via Supabase client; no open signup                                                                                                |
| `/dashboard`                               | Proposal summaries by status, awaiting countersignature, failed jobs/billing                         | Open proposal, start proposal, filter work needing attention                                                                                                         |
| `/proposals`                               | Paginated results, title, client, status, dates, source, search query                                | Search, filter status/client/date/source, paginate, open/create                                                                                                      |
| `/proposals/new`                           | Clients, active templates, currency/expiry/password, OIOT terms                                      | Choose client/template, set title/terms, create draft                                                                                                                |
| `/proposals/:id/edit`                      | Draft revision, block tree, quote snapshots, pricing catalog, variables, reusable blocks             | Edit content and staff-controlled quantities/prices, mark optional items, preview, save draft; show missing variables/mappings                                       |
| `/proposals/:id/send`                      | Resolved content and totals, recipient, expiry, password state, billing mappings                     | Confirm send/resend; show email queued/failure status; copy current link                                                                                             |
| `/proposals/:id`                           | Status, current/prior versions, recipient, totals, signers, audit, jobs, billing links, sealed files | Open evidence, download, verify, countersign, retry failed jobs, resend eligible unsigned proposals                                                                  |
| `/proposals/:id/countersign`               | Frozen client-signed content/hash, consent, client signature, current revision                       | Review, type/draw company signature, explicitly consent and confirm; no quote editing                                                                                |
| `/proposals/:id/audit`                     | Append-only events with actor/IP/UA/timestamp, consent, hashes, file versions                        | Inspect/download audit evidence; verify original body and sealed file                                                                                                |
| `/clients`                                 | Client list, names, companies, contacts                                                              | Search/select, create client                                                                                                                                         |
| `/clients/:id`                             | Full client contact/address/notes/provider IDs, related proposals                                    | Update full client record, start proposal, review customer matching discrepancies                                                                                    |
| `/pricing`                                 | Active/inactive SKUs, prices, billing type, QBO/Stripe mappings                                      | Add/update/deactivate items; distinguish missing mappings; display OIOT vs hosted-care pricing                                                                       |
| `/templates`                               | Active/inactive template names and default quotes                                                    | Create/open/deactivate templates                                                                                                                                     |
| `/templates/:id/edit`                      | Renderer-agnostic blocks, Tiptap-compatible content, catalog references, variables                   | Edit/save template, default quote, preview; ensure both signer roles are represented                                                                                 |
| `/content-library`                         | Named reusable blocks                                                                                | Create/edit/select reusable content                                                                                                                                  |
| `/p/:token`                                | Safe rendered content, current revision, optional lines, totals, expiry/status                       | Read, toggle optional items, proceed to consent/signature, decline, download signed copies                                                                           |
| `/p/:token` password state                 | Password-required response only                                                                      | Enter password; pass it in the request header; show failures without leaking proposal data                                                                           |
| `/p/:token` signature state                | Reviewed revision, exact server consent, recipient email, name/title, signature input                | Explicit consent; type/draw signature; confirm; handle revision conflict by reloading and re-reviewing                                                               |
| `/p/:token` signed/completed state         | Client-signed vs fully countersigned status, available PDFs, verification result                     | Download/retain copies, verify, see when countersignature is pending                                                                                                 |
| `/p/:token` expired/declined/invalid state | Safe status/error                                                                                    | Explain unavailable link and provide studio contact; do not expose internal records                                                                                  |
| `/integrations`                            | Provider configuration state, failed/needs-review billing links, attempts, safe error messages       | Resolve ambiguous customers, initiate future provider connection/payment-method setup, retry after correction; never expose secrets in the browser                   |
| `/imports`                                 | Import/reconciliation report, success/failure counts, missing/unmatched IDs                          | Run documented local import workflow, inspect discrepancies, retry selected exports/uploads; an HTTP import-control API can be added if UI-triggered runs are chosen |
| `/archives/:id`                            | Imported metadata, original PDFs, extracted searchable text                                          | View metadata, download original archive; no native-signature or billing controls                                                                                    |
| `/settings`                                | Company identity/contact, sending domain/configuration status, staff membership                      | Edit approved company settings, manage staff through secure administration; settings persistence/administration APIs are a Phase 2 decision                          |

The block renderer accepts headings, paragraphs with a restricted Tiptap-compatible JSON subset, embedded PNG/JPEG images, pricing tables, role-specific signature blocks, page breaks, and variables. Remote image fetching and arbitrary HTML are intentionally not part of this phase. Build the editor to this contract or extend renderer validation and tests alongside new block support.

**STOP — Phase 1 handoff delivered. Do not begin product UI work without the next instruction and wireframes.**
