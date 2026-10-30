# Codex brief — Phase 2: UI, live billing, playbook integration, AI drafting

*Written 29 October 2026. Phase 1 (`HANDOFF_PHASE1.md`, `DECISIONS.md`) is the starting point: read both, plus `README.md`, before changing anything. Where this brief contradicts the pricing section of the 7 October Phase 1 brief, this brief wins.*

## Current redesign model — owner update, 30 October 2026

The redesign brief/spec and the owner's confirmed test-data reset supersede the old flat Line proposal shape and its compatibility/migration instructions. Proposals and MCP accept current `items` with `sublines`; provider billing lines are internal DTOs only. Native test proposals are purged by the owner, never by an implementation task, and Proposify imports are excluded. Future signed versions/hashes stay immutable. Playbook payloads use `/schemas/quote-draft.v2.json`. Validity may be null for an indefinite proposal; omitted creation validity uses the workspace default.

## Confirmed by the owner (29 October 2026) — not open questions

1. **Existing subscriber with a working card:** new monthly lines are added to their existing subscription with no billing link; the signed proposal is the authority and the client is emailed the new monthly total. Everyone else gets a Stripe Checkout link (D2 / D3).
2. **Own It Over Time is always its own subscription**, because it carries a scheduled step-down (D6).
3. **Screens without wireframes** (login, clients, catalogue, templates, content library, imports/archive, settings, AI assistants) are built straight from the design system, consistent with the wireframed screens (E).
4. **Pricing:** the platform stores and bills the numbers it is given and never calculates a price (ground rules).
5. **Custom offerings** (e.g. a $2,000/mo bespoke retainer) bill as custom lines under service-named custom product families, never as per-client products (C2a).

Designs are in `design/` — read `design/README.md` first.

You are continuing the self-hosted proposal and e-signature system in `marketfreshstudios/mktfresh-proposals`. Work autonomously on feature branches, open PRs, merge your own once CI is green. Record every judgment call in `DECISIONS.md`. Stop only at the two **STOP** points below.

## What the owner needs from this phase

1. **Two signatures on every proposal.** The client reviews and signs, then MarketFresh counter-signs. Phase 1 built and tested this. Keep it intact; the UI must make it obvious who has signed and who is next.
2. **Manual create and edit.** A person can build a proposal from a template, write and rearrange content, add and price lines, preview it as the client will see it, and send it.
3. **Claude drafts proposals through the platform.** After a discovery conversation, the owner tells Claude (claude.ai or ChatGPT) what the client needs, and Claude creates the draft — wording, line items, prices — inside the platform for a person to review and send.
4. **Integration with the MarketFresh sales playbook and its Stripe catalogue.** Prices come from the playbook, monthly items bill on the same Stripe prices the playbook's payment links use, and nothing in the platform can quietly drift from either.
5. **A product, not a one-off.** The owner may sell this to other small service businesses. MarketFresh is the first workspace, not hard-coded behaviour.

## Ground rules (unchanged from Phase 1, plus three)

- Same stack, migrations, RLS, tests-with-every-feature, `.env.example`, CI.
- **Isolation:** the owner's GitHub, Supabase and Vercel accounts also hold HappyU and TeamKeep. Never touch their repos, projects, env vars or deployments. This app gets its own Supabase project and its own Vercel project (the owner creates both; see STOP 1).
- **No money moves during development.** Stripe test mode and QuickBooks sandbox only. Live keys never enter CI, previews or the repo.
- **The platform does not calculate prices.** The playbook calculator does. The platform stores, displays and bills the numbers it is given. This reverses the 7 October brief's "three things the data model has to handle": do **not** add `price_base` / `price_per_unit`, and do **not** compute the Own It Over Time kickoff. Delete any Phase 1 code that derives a price; keep code that *checks* consistency and warns (below).

## Workstream A — Workspace foundation

- Add `workspaces` and a `workspace_id` (not null, FK, indexed, in every RLS policy) to every application table. One workspace exists for now; build as if there were many.
- `workspace_settings`: company name, owner, email, phone, address, logo (Storage), accent colour, email sender name/address, e-signature consent text, reminder cadence (default +3 / +7 days), default validity days, timezone. Variables `company.*` read from here, not env. Move `COMPANY_*` env vars into the seed.
- `staff_users` gains `workspace_id` and `role` (`owner|member`; both can do everything for now).
- The MarketFresh catalogue, template and settings become **seed data for workspace 1**, not code paths. No MarketFresh service name, price or rule appears in application code.

## Workstream B — Quote model

Replace the line shape with:

| field | notes |
|---|---|
| `pricing_item_id` | nullable — **custom lines** have none |
| `custom_family_id` | custom recurring lines: which custom product family bills it (see C2a) |
| `name`, `description` | always stored on the line (snapshot) |
| `amount` | cents, as entered; staff may override a catalogue default |
| `list_amount` | the catalogue default at the time, for "differs from list" display |
| `qty` | fixed by staff |
| `interval` | `one_time \| month \| year` (yearly plans exist, e.g. Hosting + Care Essentials $300/yr) |
| `min_term_months` | nullable; printed beside the line ("18-month minimum") |
| `schedule` | nullable: `{ after_paid_invoices: 30, then: { amount, lookup_key } }` — a generic price step-down |
| `plan_terms` | nullable jsonb copied verbatim into Stripe metadata (see D) |
| `stripe_lookup_key` | recurring lines: which Stripe price bills it (see C) |
| `qbo_item_ref` | one-time lines: which QuickBooks item to invoice against; falls back to a workspace "Custom services" item |
| `group` | nullable label; lines sharing a group can be shown to the client as one all-in line |
| `optional`, `selected` | unchanged; clients toggle optional lines only |

- **Own It Over Time becomes ordinary data:** a one-time kickoff line plus a monthly line with `min_term_months: 18`, `schedule: { after_paid_invoices: 30, then: hosted-standard-100 }` and `plan_terms: { full_price, kickoff_qbo, build_credit_mo, buyout_at_signing, term_months, payoff_months }`. Keep Phase 1's paid-invoice payoff logic; drive it from these fields instead of `proposal.oiot`. Legacy terms (35 payments for one existing client) remain expressible by entering different numbers.
- **Consistency warnings, never blocks, never auto-fixes:** if a line has `plan_terms`, warn when `kickoff + payoff_months × build_credit_mo ≠ full_price`. Warn when a line's amount differs from its catalogue default. Warn when a recurring line's lookup key is legacy or unknown. Show these in the editor and on the send screen.
- Totals: one-time, monthly and yearly, shown separately everywhere. Never blend them.

## Workstream C — Playbook and Stripe catalogue integration

The owner's Stripe account is the shared catalogue. Since 15 October 2026 every sellable recurring price carries a **`lookup_key`** that encodes plan and amount (`hosted-standard-100`, `oiot-monthly-175`, `blog-weekly-595`), and legacy prices carry `metadata[legacy]=true`. The playbook's payment links and the owner's billing scripts are built on those keys. Hard-won rules from that work — treat them as requirements:

1. **Resolve prices by lookup key at billing time,** using Stripe's `lookup_keys[]` filter. Never store or hard-code `price_…` IDs for catalogue items. Never list prices and filter locally (the account has >150 active prices; pagination will bite).
2. **Never create Stripe prices with lookup keys, and never create per-client products.** Lookup-keyed catalogue prices are owned by the owner's own catalogue script; the platform only reads them.
2a. **Custom offerings are first-class.** Some clients won't fit the catalogue — e.g. a $2,000/mo retainer for a specific set of services. Support them without touching the catalogue:
   - **Custom product families**, managed in settings: generic, service-named Stripe products such as "Custom Retainer", "Custom Project Services", "Custom Hosting". Each is tagged `metadata[custom_family]=true`, carries no lookup-keyed prices, and is listed in the editor's "custom line" picker. Staff can create a new family from settings when none fits; the platform checks Stripe for an active product with the same name first and refuses duplicates (duplicate-named products have caused real damage in this account). Family names describe the service, never the client.
   - **A custom line** picks a family, and has a name, a description of exactly what is included, an amount, an interval, and optionally a minimum term and schedule. At billing it becomes a subscription item with inline `price_data` on that family's product, so the receipt reads e.g. "Custom Retainer", the subscription description carries the proposal title, and `metadata[plan]=custom:<family>`.
   - **The signed proposal is the contract** for what a custom line covers, so its description is frozen with the version like everything else and appears in full on the sealed PDF.
   - One-time custom lines invoice against a workspace "Custom services" QuickBooks item (or a QBO item the staff member picks).
   - **Promoting a custom offering to the catalogue** (when it becomes something sold repeatedly) is the owner's job in Stripe. Once it has a lookup key, the catalogue sync picks it up. The platform does not do this itself.
   - The AI connector may propose custom lines; they show as "custom — check scope and price" in review.
3. **Refuse legacy keys** for new proposals (warning in the editor, hard error at send).
4. **Catalogue sync:** `scripts/sync-stripe-catalog.ts` (read-only against Stripe) reads every active price that has a lookup key, its product name, nickname, amount, interval and `metadata[legacy]`, and upserts `pricing_items` (legacy → inactive). One-time items come from the QuickBooks item list the same way. Run on demand and from settings; it never writes to Stripe.
5. **Calculator handoff.** The playbook (static pages, password-protected, not in this repo) will get a "Start proposal" button. Define and document the contract it calls:
   `GET /proposals/new?draft=<base64url JSON>` (staff session required), payload
   `{ "source": "playbook", "source_version": "v1.17 · 15 October 2026", "title?", "client?": {company, first_name, last_name, email}, "lines": [Line…], "notes?": "markdown" }`
   using the current item/sub-line shape in the redesign spec. The platform validates it, shows a "From playbook v1.17" badge on the draft, and stores the payload on the proposal's first event. Ship a JSON Schema for it at `public/schemas/quote-draft.v2.json` and an example in README. The playbook-side button is a separate change the owner deploys; do not attempt it.
6. **Pricing reference for AI drafting.** `workspace_documents` (markdown or JSON, named, versioned). MarketFresh's first one is the playbook's `pricing.js` and plan rules, uploaded by the owner. The AI connector (F) exposes these read-only so Claude prices from the same numbers the calculator uses.

## Workstream D — Live billing providers (behind the existing interfaces)

**Stripe**, on client signature, for the recurring lines:

1. **Find the customer:** stored `stripe_customer_id` → exact email → otherwise none. A same-company, different-email match goes to `needs_review`, never auto-linked. Payment Links always create a new customer, so the platform must never use them for an existing client.
2. **Existing customer with an active subscription and a working default payment method:** add each new line as its own subscription item (`POST /v1/subscription_items`, one at a time — **never** send an `items[]` array on subscription update; it replaces the whole set). `proration_behavior=none`. Update `metadata[plan]` (`plan=multi`, `plan_items=<keys>` when more than one). Email the client the new monthly total. No link needed.
3. **No customer, no usable subscription, or no working card:** create the customer if needed, then a **Stripe Checkout Session** with `customer=<id>` (mode `subscription`, or `setup` + server-side subscription for scheduled plans). Email the link and show it on the client's post-signature page. On `checkout.session.completed` create or finish the subscription.
4. **Every subscription the platform creates or touches:** `customer.name` = client company (it is the "Billed to" line on receipts); `subscription.description` = proposal title; `metadata[plan]` = lookup key; `metadata[proposal_id]`. Collection method follows the workspace default.
5. **If collection is `send_invoice`,** finalize and send the first invoice explicitly. Stripe does not email a draft, and a subscription-generated draft cannot be deleted later.
6. **Price schedules (Own It Over Time):** a subscription schedule; phase 1 carries `plan_terms` metadata; phase 2 points at the `then.lookup_key` price and carries its own `metadata[plan]` (phase metadata overwrites subscription metadata when a phase starts, so a phase without it wipes the plan). Port and keep the paid-invoice counting from Phase 1. Always its own subscription — never merged into an existing one.
7. **Pin API version `2024-06-20`** on every call and on the webhook endpoint (the account default is 2019-12-03). Webhook payload style: snapshot.
8. **Never** change an existing item's amount, cancel anything, issue refunds, or archive products/prices. Those stay with the owner's own scripts.

**QuickBooks:** implement the live provider (OAuth refresh-token flow, token storage encrypted per workspace). Unsent invoice (`EmailStatus=NotSet`), one line per selected one-time item, custom lines against the workspace's "Custom services" item. Verify against the sandbox.

Every provider action is a durable job with an idempotency key, as in Phase 1, and failure never undoes a signature.

## Workstream E — UI

- **Source of truth for screens:** the Claude Design canvas "Proposal & E-Sign — Screens" (17 artboards, exported to `design/screens/`) and the design system "Proposal & E-Sign System" (exported to `design/system/`). Build those screens faithfully: staff dashboard, proposals list, new, editor, send, record, counter-sign, audit, integrations queue; client password, reading, revision conflict, signing, billing setup, signed, completed, ended.
- **Screens without wireframes — build them from the design system's components and tokens, consistent with the wireframed ones:** login, clients list + detail, catalogue (with sync status, legacy shown separately), templates list + template editor, content library, imports report + archived proposal viewer, workspace settings, AI assistants (F).
- **Editor (manual create/edit):** Tiptap with the Phase 1 block contract (heading, rich paragraph, embedded image upload, pricing table, signature block per role, page break, variable). Variable picker with live resolved values; unresolved ones flagged. Quote panel: add from catalogue or as a custom line, override amount (list price shown beside it), qty, interval, minimum term, schedule, group, optional/default-ticked. Readiness checklist mirroring the send validation. Autosave with revision handling.
- **Signatures in the UI:** the record and list show both signature slots ("Client — signed 3 Nov · MarketFresh — awaiting you"). Counter-sign is the record's primary action whenever the client has signed.
- **Client pages:** mobile first. Optional checkboxes update totals and any sentence that quotes them instantly. Signing is its own step. After signing, the billing-setup step appears only when D3 applies; when D2 applies, show "added to your existing monthly billing" with the new total.
- **White-label:** client pages, PDFs and emails take name, logo and accent colour from workspace settings. No MarketFresh strings in components.
- Accessibility: real buttons, links and labels; 4.5:1 text contrast; keyboard reachable; 44px touch targets on client pages.

## Workstream F — AI connector (Claude, ChatGPT)

A remote **MCP server** at `/mcp` (Streamable HTTP), authenticated with **OAuth 2.1 + PKCE** against the staff user's workspace login, with dynamic client registration so claude.ai and ChatGPT can add it as a custom connector. Before building, verify both clients' current remote-MCP connector requirements and record what you found in `DECISIONS.md`.

**Tools (all scoped to the caller's workspace):**

- Read: `search_clients`, `get_client`, `list_templates`, `get_template`, `list_catalog`, `list_documents` / `get_document` (pricing reference), `search_proposals` (includes imported Proposify text, so Claude can reuse winning wording), `get_proposal`.
- Write, **drafts only:** `create_client`, `create_proposal_draft`, `update_proposal_draft`, `set_quote_lines`, `check_ready` (returns exactly what the send screen would block on).
- `create_proposal_draft` accepts `brief` (markdown — the client requirements Claude was given, stored on the proposal and shown to the reviewer beside the draft), `template_id`, `client_id`, `title`, `content_markdown`, `lines`.
- **Content goes in as Markdown plus `{{variables}}`**; convert server-side to the block contract. Reject unknown variables and unsupported constructs with a precise error so the model can correct itself.

**Hard limits, enforced server-side, not by tool omission alone:** an AI token can never send, resend, sign, counter-sign, decline, touch billing, change settings, or modify a proposal that has been sent. Every AI write is an event with actor `ai:<connector-name>`. A draft with unreviewed AI changes shows a "Drafted by AI — needs review" state; the send screen requires explicit confirmation until a person has opened and saved it. Highlight AI-entered amounts that differ from the catalogue default.

**Settings → AI assistants:** connected assistants, scopes, last used, revoke.

Ship `docs/ai-connector.md`: how to add the connector in claude.ai and ChatGPT, every tool with an example, and a sample prompt ("Draft a proposal for Acme Plumbing from the discovery notes below…").

## Workstream G — Deployment readiness

- Chromium on Vercel: use `@sparticuz/chromium` (or the current maintained equivalent) behind the existing renderer interface; if function size or time limits make that unreliable, fall back to a separate PDF worker and record why.
- Vercel cron for reminders, expiry and the job drain, authenticated with `CRON_SECRET`.
- Stripe webhook route (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`) with signature verification and replay protection.
- Custom domain support for client links (e.g. `proposals.<workspace domain>`), configured per workspace.

## STOP 1 — before any hosted resource or live credential

When workstreams A–C, E and F are done, and D and G are verified against test mode and sandbox, write `HANDOFF_PHASE2.md` and stop. Include:
- what the owner must create (Supabase project, Vercel project, domain, Resend domain), in order, with exact settings;
- every env var with where its value comes from;
- the live-activation checklist for Stripe (restricted key scopes needed, webhook endpoint, API version, payload style) and QuickBooks (production app, redirect URI);
- the playbook handoff contract, ready for the owner to add the "Start proposal" button;
- screenshots of every screen in light and dark, desktop and phone where relevant;
- any place this brief was ambiguous and what you chose.

## STOP 2 — after the owner activates live credentials (separate run, owner-initiated)

Run the Proposify import in small batches as Phase 1's README describes, reconcile counts, and report. Do not cancel anything in Proposify.

## Definition of done

- Headless test of the full path with mocks: Claude (MCP) creates a draft from a brief → person reviews, edits a line, sends → client toggles an option and signs → staff counter-signs → sealed PDF with both signatures and audit page → QBO unsent invoice + Stripe (D2 and D3 paths both covered) → verify passes.
- MCP tests proving every forbidden action is refused for an AI token.
- Playbook handoff payload round-trips into an editable draft with the badge and warnings.
- Catalogue sync against Stripe test mode imports lookup keys and marks legacy prices inactive.
- A $2,000/mo custom retainer line under a "Custom Retainer" family signs and bills end to end in test mode, with no new product or lookup-keyed price created; creating a family whose name already exists is refused.
- No MarketFresh-specific strings or prices outside seed data (add a CI grep check).
- `HANDOFF_PHASE2.md` written. Then **STOP**.
