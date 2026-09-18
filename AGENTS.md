# Codex handoff — MarketFresh proposal & e-signature system

You are building a self-hosted replacement for Proposify for MarketFresh (a two-person marketing/web services LLC). Work autonomously. The owner is hands-off; do NOT stop to ask questions except at the single checkpoint marked **STOP** below. Where this brief is silent, make a sensible choice, record it in `DECISIONS.md`, and keep going.

## Ground rules

- Stack: **Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage) + Vercel**. Email via **Resend**. PDF rendering via **Playwright/Chromium**. Integrations: **QuickBooks Online API** and **Stripe**.
- Phase 1 (this brief) is **backend, data, services, scripts and tests only. No UI.** Build everything as API routes / server actions / library modules with tests, plus a minimal unstyled dev harness page only if needed to exercise a flow manually. Do not design screens, layouts, or components. Wireframes are being produced separately in Claude Design and the UI phase starts from those.
- **STOP** when Phase 1 is complete: write `HANDOFF_PHASE1.md` summarizing what exists, how to run it, test coverage, open decisions, and exactly which UI surfaces the next phase needs (list every screen/route with the data and actions it must expose). Then end the run.
- Commit small, often, with clear messages. Keep `DECISIONS.md` and `README.md` current. Every feature ships with tests (Vitest for units, Playwright for the signing flow against the dev harness).
- Secrets come from `.env.local` (never committed). Create `.env.example` listing every variable needed. If a credential is missing, mock the integration behind an interface, make tests pass against the mock, and list the missing credential in `HANDOFF_PHASE1.md`.
- Use Supabase migrations (`supabase/migrations/*.sql`) for all schema. Row Level Security on for every table; internal tables readable only by authenticated staff; public proposal access only via the token route.

## Product summary

Staff (2 users) author proposals from templates, send a client a unique link, the client ticks optional line items, accepts, and e-signs. Staff always counter-sign. On client signature the system creates a QuickBooks draft invoice for one-time items and a Stripe subscription for monthly items. Every proposal produces a sealed PDF with an audit trail. Hundreds of historical Proposify proposals are imported as archived PDFs plus metadata.

## Data model (Postgres)

- `clients` — id, company, first_name, last_name, email, phone, address (jsonb), notes, qbo_customer_id, stripe_customer_id, timestamps.
- `pricing_items` — id, sku, name, description, unit_price (cents), billing: `one_time | monthly`, qbo_item_id (nullable), stripe_price_id (nullable), active. Constraint: monthly ⇒ stripe_price_id required; one_time ⇒ qbo_item_id required (enforce at send time, not DB).
- `templates` — id, name, content (jsonb block tree), default_quote (jsonb), active.
- `content_library` — id, name, block (jsonb).
- `proposals` — id, client_id, template_id, title, status (`draft|sent|viewed|signed_by_client|completed|declined|expired|archived`), token (unique, unguessable), password_hash (nullable), valid_until, currency, source (`native|proposify_import`), proposify_id (nullable), created_by, sent_at, first_viewed_at, client_signed_at, completed_at, timestamps.
- `proposal_versions` — id, proposal_id, version_no, content (jsonb), quote (jsonb), variables_resolved (jsonb), content_hash (sha256), created_at. A new version is written at every send and frozen at client signature.
- `quote_items` (or embed in `quote` jsonb) — line: pricing_item_id, name, description, unit_price, qty (fixed by staff), optional (bool), selected (bool, default true for required). Clients may only toggle `selected` on `optional=true` lines. Totals: one_time_total, monthly_total, computed server-side.
- `signers` — id, proposal_id, role (`client|company`), name, email, title, order, signed_at, signature_kind (`drawn|typed`), signature_image_path, typed_name, ip, user_agent, consent_text, consent_at.
- `events` — append-only audit trail: id, proposal_id, type (`created|sent|viewed|quote_changed|downloaded|consent_given|signed|counter_signed|declined|expired|reminder_sent|invoice_created|subscription_created|sync_failed`), actor (`client|staff:<user_id>|system`), ip, user_agent, metadata (jsonb), created_at. No updates or deletes (enforce via RLS/trigger).
- `files` — id, proposal_id, kind (`render|sealed|import|signature`), storage_path, sha256, bytes, created_at.
- `billing_links` — id, proposal_id, provider (`qbo|stripe`), external_customer_id, external_object_id (invoice or subscription), status, last_error, attempts, timestamps.

## Variables

Syntax `{{path}}`. Resolve at render time; freeze the resolved map into `proposal_versions.variables_resolved`.
- Client/proposal: `client.first_name`, `client.last_name`, `client.company`, `client.email`, `proposal.title`, `proposal.valid_until`, `proposal.date`, `company.name`, `company.owner`, `company.email`, `company.phone`.
- Computed from the quote (live as optional items toggle): `quote.one_time_total`, `quote.monthly_total`, `quote.selected_items` (comma list), `quote.item.<sku>.price`.
- Currency-format money variables. Sending must fail with a clear error if any variable is unresolved.

## Content model

A block tree in jsonb: `heading`, `paragraph` (rich text, Tiptap-compatible JSON), `image`, `pricing_table` (references the quote), `signature_block` (one per signer role), `page_break`, `variable`. Keep it renderer-agnostic; Phase 2 UI will use Tiptap. Provide a server renderer to HTML (for the public page and for PDF) with print CSS. Styling minimal and neutral for now.

## Flows to implement (all server-side, with tests)

1. **Author & send:** create proposal from template → resolve variables → write version → generate token → email client (Resend) with link → `sent` event. Reminders: scheduled job (Vercel cron) emails unsigned proposals at +3 and +7 days; expiry job flips `expired` after `valid_until`.
2. **Public access `/p/[token]`:** server route returns the rendered current version + quote; records `viewed` (IP, UA); optional password check; blocks expired/declined. Quote toggle endpoint: only `optional` lines, recompute totals, `quote_changed` event.
3. **Client signature:** endpoint takes consent acknowledgement (store exact consent text + timestamp), signature (PNG data URL or typed name), name/title/email → freeze version (compute `content_hash` over content + quote + variables) → status `signed_by_client` → render PDF → stamp signature and append audit page → store sealed file → email copies → trigger billing job.
4. **Counter-signature (required on every proposal):** same mechanism for a staff user; produces the final sealed PDF with both signatures and the full audit trail; status `completed`.
5. **Sealed PDF:** Playwright renders HTML → PDF; `pdf-lib` appends an audit page listing every event (type, actor, IP, UA, timestamp), the signers' details and consent text, and the SHA-256 of the frozen version and of the PDF body. Store hash in `files.sha256`. Provide a `verify` endpoint that recomputes and compares.
6. **Billing on client signature (idempotent job with retries, records in `billing_links`):**
   - QuickBooks: find customer by email, else by company name (exact); if none, create. If a near-match exists (same company name, different email) do NOT auto-link — mark `billing_links.status='needs_review'` and continue with the rest. Create a **draft invoice** with one line per selected one-time item mapped via `pricing_items.qbo_item_id`.
   - Stripe: find-or-create customer by email; create a subscription with one price per selected monthly item via `stripe_price_id`. Port the scheduling rules from the owner's existing scripts `stripe_new_oiot_client.py` and `stripe_oiot_schedule.py` (copies in `/reference`); read them before designing this step.
   - Failures never block the signing flow; they surface as `sync_failed` events plus a re-run endpoint.
7. **Notifications:** staff email on viewed, signed, completed, sync_failed.
8. **Proposify import (`/scripts/proposify-import`):** Proposify has no API on the owner's plan. Build (a) a CSV importer for Proposify's report/list export that upserts `clients` and `proposals` with `source='proposify_import'` and `proposify_id`; (b) a Playwright script meant to run on the owner's Mac against a logged-in browser profile that iterates the Proposify proposal list, triggers "Download as PDF" for each, waits for the render (30–60 s), saves as `{proposify_id}_{client}_{title}.pdf`, logs successes/failures, and resumes from a checkpoint file; (c) an uploader that pushes the PDFs to Supabase Storage as `files.kind='import'`, links them to the imported rows, and extracts text (pdftotext or pdf-parse) into a `search_text` column. Pace requests one at a time with human-like waits. Verify counts (rows vs PDFs) and print a reconciliation report.
9. **Search/list API:** proposals list with filters (status, client, date range, source) and full-text search over title, client and `search_text`.
10. **Auth:** Supabase Auth, email/password for two staff users; middleware guarding all internal routes.

## Reference material in `/reference`

- `proposify-replacement-plan.md` — the full plan and rationale.
- `MarketFresh_Master_Pricing_Guide_INTERNAL.pdf` — seed `pricing_items` from it (Audit $750; Build $2,500 one-time or $500 setup + $175/mo; Hosting + Essentials $25/mo; care plans Lite $49 / Standard $85 / Pro $149 + $15 hosting; Local Visibility $295/$495). Monthly items are always Stripe.
- `stripe_new_oiot_client.py`, `stripe_oiot_schedule.py` — existing Stripe logic to port.

## Definition of done for Phase 1

- Migrations apply cleanly to a fresh Supabase project; seed script loads pricing items and one sample template.
- Full flow runs headless in a test: create → send → view → toggle optional item → client sign → counter-sign → sealed PDF with audit page → billing job produces (mocked or real) QBO draft invoice + Stripe subscription → verify endpoint passes.
- Import scripts run end-to-end against fixture CSV/PDFs.
- `HANDOFF_PHASE1.md` written, including the UI surface list for the wireframing step. Then **STOP**.
