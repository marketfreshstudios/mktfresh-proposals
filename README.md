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

The config uses dedicated `553xx` ports and project ID `mktfresh-proposals`. It does not reference other projects. The migration enables RLS on every application table and makes audit records/signatures/files immutable. Bootstrap one active `owner` membership in `staff_users`; invite subsequent users from Studio → Workspace → Team. Stored `owner` / `member` roles display as Super admin / Staff. See [Team management](docs/team-management.md) for lifecycle rules and hosted rollout ordering.

```sh
npx supabase start
npx supabase status -o json > .data/supabase-status.json
chmod 600 .data/supabase-status.json
npm run verify:supabase
```

On this Mac, CLI 2.117.0 stalled before container startup. The acceptance test was completed using `npx --yes supabase@2.76.7 start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta` and the same pinned-version `status -o json` command. The older CLI is a verification fallback, not a runtime dependency downgrade. Do not publish the status JSON: it contains local keys. The verifier refuses non-loopback Supabase URLs and creates test users/records only in this local stack.

## API contract

Internal routes use `Authorization: Bearer <Supabase access token>`, checked with `auth.getUser()` plus the protected staff allowlist in both Proxy middleware and route handlers. For local development only, use `DEV_STAFF_TOKEN`. Browser login returns `{authenticated:true}` (plus `password_change_required:true` when needed), never tokens, and stores access/refresh tokens in HttpOnly, SameSite=Lax cookies (Secure in production). Both cookies slide for 30 days of inactivity; both cookies use Path `/` so staff pages can refresh before rendering. Expired access tokens refresh server-side before staff requests continue, including forwarding rotated cookies from Proxy to the route and browser. Concurrent refreshes share a short result window; Supabase’s refresh-token reuse protection covers requests across server instances. Logout clears both cookies and revokes the browser session. There is no public signup route or anonymous design-preview bypass.

| Method / route                                | Purpose                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/auth/login`                        | `{email,password}` → `{authenticated:true}` plus HttpOnly cookies for allowlisted staff                   |
| `POST /api/auth/set-password` | Invite/reset acceptance or own password change; verifies one-time link or current password, returns no credentials |
| `GET /api/team` | Workspace staff/status/last sign-in and recent audit changes |
| `POST /api/team/invite` | Super admin invite using app email |
| `POST /api/team/:userId` | Guarded name, role, password, reset, activation and removal actions |
| `GET, POST, PUT /api/clients`                 | List or upsert client records; PUT accepts the full record with its `id`              |
| `GET, POST, PUT /api/pricing_items`           | Products and billing mappings; deactivate instead of deleting                          |
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

- **Supabase:** real repository, Auth, private Storage, and full-text search adapter. Production requires a dedicated project, migrations and one bootstrapped active Super admin. Other users are invited through Team; invite/reset mail uses the app provider, not Supabase SMTP.
- **Resend:** real HTTP adapter with deterministic idempotency keys; local mock unless configured. Production needs a verified sending domain and API key. It was not exercised against a live account.
- **QuickBooks and Stripe:** real HTTP adapters are implemented behind `BILLING_MODE=test`, with contract tests for D2, D3, custom services, scheduled step-downs and unsent invoices. Stripe refuses live keys; QuickBooks refuses production. Actual provider acceptance is pending owner-supplied test credentials.
- **PDF:** Playwright locally, bundled `@sparticuz/chromium` on Vercel, with embedded fonts and workspace branding. Hosted size/runtime acceptance remains pending.
- **Proposify:** CSV/PDF import is tested with fixtures. Browser exporter requires actual account selectors and a dedicated authenticated profile. See [import instructions](scripts/proposify-import/README.md).

Do not treat a passing mocked billing flow as a live-provider acceptance test. Keep the `mock_` object identifiers visible in development.

## Phase 2 workspace and quote foundation

Apply migrations in order. Existing records are assigned to workspace 1 without rewriting signed version evidence. Staff membership includes a workspace, role and status. Super admins manage Team and the existing workspace security settings; Staff retain authoring and their own profile changes. Company-signature delegation remains separate and unchanged. Seed data lives in `seed/marketfresh.ts`. Edit workspace settings before sending proposals, including consent, sending domain and fallback QuickBooks item. The deployment origin comes from APP_URL; the send screen chooses a staff sender. Development always mocks email; billing stays mocked unless explicitly configured for test mode.

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
Open `/login` and use the local token form while developing; hosted sessions use Supabase email/password and server-refreshed HttpOnly cookies. If a refresh token is revoked or expired, open **Sign in** from the save bar, authenticate in the separate tab, then return and choose **Retry**; the editor and its device recovery copy stay intact. A valid account missing staff membership remains a distinct 403 error. Start at `/`, then `/proposals/new`. All content edits autosave with a revision check. Public toggles/signatures additionally send `reviewed_hash` from the API: it binds acceptance to the actual reviewed document while allowing unrelated background job updates. A changed hash requires explicit reload/re-review.

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


### Redesign Phase 4

Proposals use the current item/sub-line model only. Run the owner-maintenance purge before the current-only release; never delete Proposify imports. Signed evidence created from now on remains frozen. See the latest sections of `DECISIONS.md` and `HANDOFF_PHASE2.md`.

An omitted `valid_until` defaults to the workspace validity (30 days); explicit null means indefinite. `{{proposal.validity}}` inserts a complete dated validity sentence or disappears cleanly. The custom date field `{{proposal.valid_until}}` remains supported. Staff actions use revision-checked `/api/proposals/:id/actions`; AI cannot send, sign, change outcomes, archive or delete. Client deletion is reference-guarded and audited.

### Redesign Phase 5

Studio contains Templates & blocks, Products, Connections (including pricing references, assistants and Proposify import), Workspace and Activity. Workspace owns brand/contrast, proposal fonts, currency/cents, the signatory/delegates, staff display names, and client-link defaults. Uploaded WOFF2/TTF fonts require a PDF-embedding license confirmation and are retained as immutable private assets for signed copies. Public Sans is no longer served.

Validity is the end of the selected day in the workspace timezone, including daylight saving; null stays indefinite. Password defaults are owner-managed, stored as hashes and applied only to new drafts. Existing proposals keep their own password. Currency selection does not convert catalog prices: the chosen catalog/provider currency must match.

Review the responsive Studio/state evidence in [the Phase 5 comparison gallery](docs/screenshots/phase5/index.html). Regenerate it after browser tests with `node --import tsx scripts/verify-proposal-fonts.ts`, render its first page with `pdftoppm`, then run `node --import tsx scripts/package-phase5-evidence.ts`. No environment file or provider credentials are needed for the PDF check. Native test proposals were already purged by the owner; do not rerun the hosted purge as part of this phase.

Clients use validated E.164 phone numbers, formatted contact views and structured optional addresses. The [AI connector guide](docs/ai-connector.md#client-contact-data) describes contact create/get/update and `{{client.address}}`. Staff explicitly review and link Stripe test customers on the client page; ambiguous unlinked matches block sending. Apply the client-contact/link migration to this app’s project before deploying this release; see the [handoff](HANDOFF_PHASE2.md#clients-polish--separate-pr-after-phase-5) and [Clients polish visual gallery](docs/screenshots/clients-polish/index.html).

### Live review controls and curated fonts

Products lives at `/studio/products`; `/studio/catalog` redirects and the MCP tool remains `list_catalog`. Home’s setup checklist reads provider configuration and workspace data rather than static connection instructions. Linked clients show only their selected Stripe customer until staff confirm an audited unlink. Contact values copy by default, with explicit Mail/dial icon links and phone-width dialing.

The heading/body font picker has Serif/Sans groups and self-hosted previews. Nine added Google Fonts families retain their OFL licenses and pinned-source/hash provenance in `public/fonts/GOOGLE-FONTS-SOURCES.json`; `LICENSES.txt` lists every family. Source Serif 4 remains the default. Space Grotesk has no upstream italic and uses browser synthesis. `npm run verify:fonts` creates offline PDF specimens for all 12 curated families, checks embedding and frozen-version integrity, and runs in CI. No Google Fonts request is made at runtime.

### Client completion and attached editor controls

Proposal/reminder emails contain one View proposal button, the sender note and branding; prices and the printed HTML URL are omitted. Newly sealed PDFs end with a one-page completion certificate with the frozen content hash and signer/delegation facts. Existing sealed files and staff raw Evidence remain unchanged.

Billing itemizes each pending Checkout separately from subscription additions and one-time invoices. It uses Stripe’s actual shared Product names, preserves catalogue Prices, and explains card-only setup. Signed document views keep the main reading width and a single sender contact footer.

Proposal/template blocks and clauses share an attached toolbar, gutter drag handle and persistent selection with Escape to clear. Hover/focus actions never change block geometry. Reproduce the geometry/capture test with `npx playwright test e2e/block-controls.spec.ts`. The [comparison gallery](docs/screenshots/client-completion/index.html) also includes real main-branch before captures at 375/1440; all new surfaces include 375/768/1440 light/dark evidence. Package with `node --import tsx scripts/package-completion-evidence.ts`; email/billing/certificate captures come from `e2e/client-completion.spec.ts` (requires Poppler for PDF preview rendering).

Workspace email defaults live in **Studio → Emails** (`/studio/emails`). Staff can edit client subjects, rich bodies and managed-button labels, preview sample or real proposal data, reset with confirmation, and send a test only to themselves. Staff notifications are read-only. The Send panel starts from the Proposal sent template; each delivered message retains its rendered snapshot in the proposal Email log. Apply `supabase/migrations/20261030214155_workspace_emails.sql` to this app's project before deploying this change. See the [preview gallery](docs/screenshots/emails/index.html) and [native-client verification limits](docs/screenshots/emails/COMPATIBILITY.md). Reproduce with `npx playwright test e2e/emails.spec.ts` and `node --import tsx scripts/package-email-evidence.ts`; all test mail is mocked.

Verified Stripe webhooks now trigger an immediate post-response proposal drain; cron remains recovery. Checkout returns poll `/api/public/:token/state` (same token/password checks, no view mutation) for up to one minute, then retain an honest pending state. Only verified completion displays products/rates, card and next billing date and queues client/sender confirmations. See [billing confirmation evidence](docs/screenshots/billing-confirmations/index.html) and the [handoff](HANDOFF_PHASE2.md#billing-confirmation-fixes--31-october-2026). No new migration is required; PR #35's email tables are reused.

The proposal editor uses the cover as its single editable title. AI content review has individual/bulk controls and an undo; it never clears held prices. Sections and pricing rows support keyboard sorting, selected blocks have insertion menus, and browser page sheets provide the saved print break points. See the [editor review gallery](docs/screenshots/editor-ux/index.html) and the latest `HANDOFF_PHASE2.md` entry. The staff-only `POST /api/proposals/:id/review` accepts a revision, section IDs and a reviewed boolean; it is not exposed to AI connectors.


## Editor controls and fields

Write on the document and use the grouped pinned formatting bar for the current text selection (icons only below 900px). Undo/Redo cover this session’s last 100 editing steps, including quote changes, and use normal autosave/revision checks. In a text block, shortcuts use that block’s text history first; plain form inputs retain native undo. Reload clears history. Write on the document and use the pinned formatting bar for the current text selection. Select a block for its gutter actions and edge insertion buttons; click outside or press Escape to clear selection. Save for reuse opens a name dialog; ordinary deletion offers Undo for eight seconds. Pricing/signature deletion asks first. Set or clear expiry in Review & send.

Fields show their friendly labels, current values and tokens. Search by label or token, then insert at the last text cursor/selection. Without a text target the editor asks where to insert. Use the Fields sheet on phone/tablet. PDF page guides keep whole pricing cards, choice groups and signatures together; shorten any complete unit that cannot fit one page. Historical signed records and sealed files are immutable.

The edge + buttons and an empty paragraph’s `/` open the shared anchored block menu. Search built-in and saved blocks; use arrows/Enter/Escape. A second pricing table is hidden. The menu flips above its insertion point when space is limited. Text and contract blocks can be duplicated with new IDs; required pricing/signature blocks are not duplicated.

### Proposal typography

Workspace → Proposal styles sets Title, Heading 1/2/3 and Body defaults, with contrast checking and a desktop/phone sample. Templates can override those defaults; draft proposals have a Styles tab and Reset to workspace. Sent versions freeze their resolved styles alongside their signed-content hash. The editor, client reading view and PDF use the same resolved map and fonts.

Use the pinned Text style selector or start an empty paragraph with `# `, `## ` or `### `. Heading 1 starts an outline section; Heading 2 and 3 are indented subheadings. Existing draft/template headings gain level 1 via `20261102065523_editor_heading_levels_styles.sql`; sent and signed content is never migrated. Apply that migration through the normal migration process for this app's project only.

### PDF-accurate authoring and previews

The editor uses fixed US Letter geometry (816 CSS px, configurable margins defaulting to 0.75in) with Fit / 100% zoom. Pages and the right tools panel can collapse; narrow windows use drawers instead of shrinking the internal page. Cmd+backslash / Ctrl+backslash toggles tools. Fields lives beside Quote, Styles and Review & send; per-item Look up opens pricing references.

Preview PDF opens the actual server-rendered document, watermarked “Preview — not signed”, with thumbnails/zoom/download. The editor paginates its own Letter-width DOM on the next animation frame after layout changes; there is no render request or updating-pages wait. Range line boxes provide paragraph/list splits, with whole fitting pricing tables, cards, choice groups and signature blocks kept together. Browser source positions are saved with the draft, frozen and hashed at send, and applied by preview, sealing and client print. Server layout runs for explicit PDF preview and readiness overflow/pricing checks. `Page N overflows in the PDF · Preview PDF` reports a metric overflow; that logical page can flow onto an extra physical PDF page without clipping content. The authenticated preview endpoint remains read-only and revision checked, with a session PDF cache.

The former server-fragment alignment and approximate-browser fallback have been removed. Fonts, images, styles, quote changes and resize all trigger the browser measure. Phone single-section editing retains its normal layout while an inert Letter projection computes the complete document; Full document shows its sheets. Existing frozen versions without saved break points retain their original hashes and natural print pagination.

### Pages, density and margins

Authoring has a Pages sidebar for all computed pages, their starting H1 sections/block groups and continued sections. Use the per-page add control or Add page, and drag a page or section to reorder with a pointer or keyboard. Page deletion offers “Page deleted · Undo” for eight seconds; Cmd/Ctrl+Z also restores it. Sidebar arrows remember their state, with Cmd/Ctrl+backslash for tools and Shift+Cmd/Ctrl+backslash for Pages. Collapsed tools rails open Quote, Fields, Styles or Review & send directly.

Page, section and document-block moves preserve every original block, including page-break IDs. Dropping onto an overflow page may add explicit page separators to retain the chosen destination; the complete original block permutation is validated first, and a single undo restores it exactly. Start on next page / Remove page break is available in the formatting bar and block rail. A failed integrity check cancels the move with an error instead of recording or saving it. Section ranges stop at explicit page breaks, and late text callbacks address stable IDs. Creation-time removal of a redundant leading title-field heading never runs on existing draft edits or editor load. Docked sidebar headers/tabs stay fixed; only their content scrolls. Sorting uses translation only, keeping text at its normal scale.

Document block gaps use the larger of the previous block’s space below and the next block’s space above. Editor, client and print share this rule; paragraph/list trailing margins do not stack. Pricing items use compact name/price rows, smaller optional descriptions and indented sub-lines. Optional/choice controls and required locks convey inclusion without extra status rows. Only page sheets are white; the gaps show the canvas background.

Proposal styles now include Standard/Comfortable density and per-side margins in inches (default 0.75in). New sends freeze these with the existing styles; earlier frozen documents keep their prior metrics. The editor and templates show Letter sheets with PDF-derived page starts. Their spacers are display-only, and source content keeps its normal undo/autosave behaviour. A pricing table stays whole when it fits a page; larger ones split between cards and produce a measured readiness warning.

### Editor v2 live proposals

Staff open a sent proposal's **Edit** action on the same record and client link. Until a signature, readiness-passing saves publish a new version immediately without sending email; invalid work stays staff-only and the client keeps the last good version. The header shows **Not live** with the first blocker until the next passing save. AI connectors remain drafts-only. A client must reload a newly published version before signing it.

A signature locks the accepted content. If unpublished work existed, the editor identifies it and **Duplicate as new draft** recovers it without changing signed evidence. **Reopen** handles unsigned Lost/client-declined/Expired proposals using the workspace validity default, the same token, a readiness check and no email.

Tablet tools use an overlay drawer. Phone reading uses full sheets, and selecting a block opens its section-editing view; Done returns to reading. Quote/Fields/Styles/Send open focus-trapping bottom sheets, and formatting follows the keyboard viewport. Real iOS Safari/Android Chrome docking remains a manual device check.

### Sealed PDFs and job alerts

For sealed-PDF recovery and staff alerts, see [PDF job reliability](docs/pdf-job-reliability.md). The renderer validates Letter dimensions and retries Chromium's opaque print failure once on a fresh target. Stage, geometry, page count, memory and bounded Chromium logs are retained in staff Evidence. Old frozen versions keep their old cover, absent bands and stored breaks; current header/footer geometry is unchanged. Run `npm run verify:pdf-jobs` for real sealing/preview regressions, or `VERCEL=1 npm run verify:pdf-jobs` on Linux for the packaged production Chromium (requires Poppler).

Failure alerts are sent only when retries exhaust or a job needs a staff decision, deduplicated by job/error/recipient. Studio → Emails → Job needs attention is editable; unchanged stored defaults migrate while custom copy is preserved. Its Open proposal button highlights the relevant Retry row. Re-running an already sealed job does not duplicate completion copies.

### Page headers and footers

Proposal and template Styles group Text styles, Page & margins, and Header & footer. Shared bands default to on after the cover, with a workspace-logo/title header and a client/page-count footer. Header and Footer have independent distance, content height, divider-side spacing and content gap settings, with one shared divider switch. Shared geometry grows each effective margin to fit its enabled band's stack. Every page uses those margins, including cover and hidden-band pages; switching a band off globally removes its stack. Old distance settings normalize on load. Unsigned proposal edits use normal autosave/live publication; templates retain Save template. New versions freeze band settings into their content hash, while older frozen versions with no band settings remain band-free.

Click or tap a band to edit rich text, layout, fields and inline embedded images or the workspace logo. Images share locked-proportion resize handles and history with body images and cover logos; band images can move between columns or be cut/pasted. Normal autosave/publication and Undo apply to every shared occurrence. Styles offers Edit shared and a reset to the current template (built-in defaults in Studio). Per-page bands support unique copies, hidden bands, anchor-aware reflow and Undo, with Styles/Sections indicators and cover-margin controls. Phone editing uses a keyboard dock and an actions sheet. Templates stay shared-only. New proposals have a cover-only first page and content starting on page 2. Each cover line is editable with rich text, fields, alignment and spacing; hiding its title preserves the record title. Cover logos can align or drag to a free horizontal position, with left/center/right snapping. Image toolbars size to their own content and fit inside the sheet and viewport. At ≥1100px, client web pages show scaled Letter sheets with the published bands and page breaks; below 1100px, they keep the flowing layout. Choices retain the published breaks, matching the selected sealed PDF. See [current owner-review behavior and evidence](docs/owner-review2.md); earlier [margin/image](docs/owner-review-margin-images.md), [client sheet](docs/header-footer-client-sheets.md), [override](docs/header-footer-overrides.md), [foundation](docs/header-footer-foundation.md) and [shared-editing](docs/header-footer-shared-editing.md) notes record the preceding PRs.

Proposal ownership can be handed off from the record/editor menu or in bulk from Team. Staff can reassign their own work; Super admins can reassign anyone’s. Lists provide an Owner column/filter. Apply the hosted reassignment SQL before deploying; see [Proposal reassignment](docs/proposal-reassignment.md).

Review & send can publish a client link with **I'll send it myself**, without an app email. Scheduled reminders default off in that mode; the record can enable them, and Send reminder still works explicitly. Client-triggered signature/payment/completion emails continue. See [Manual delivery](docs/manual-delivery.md); no hosted SQL or new setup is required.
