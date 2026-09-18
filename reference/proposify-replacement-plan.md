# Replacing Proposify — feature map, architecture, MVP, migration

*Drafted 2026-09-18 for Jonathan / MarketFresh. Stack decision: Next.js + Supabase + Vercel + Stripe. Proposify plan: Basic/Team (no API). Volume: hundreds of historical proposals.*

## 1. What Proposify actually does (feature inventory)

Grouped by how much each matters to a two-person shop sending its own proposals.

**Core (must replicate for MVP)**
- Proposal builder: sections, rich text, images, pricing tables, variables (`{client_name}`, etc.), templates, reusable content library.
- Send: unique client link, optional password/expiry, email delivery, reminders.
- Client view: web-rendered proposal, optional interactive quote (pick options / quantities), accept + e-sign.
- E-signature: typed or drawn signature, multiple signers, counter-signature by the sender, audit trail (IP, timestamp, email, status changes) appended to the signed PDF.
- Status tracking: draft → sent → viewed → signed/won or lost/expired. Open/view notifications.
- PDF export of any proposal (signed PDF includes audit trail if enabled in template settings).
- Stripe payment collection on acceptance (deposit / first invoice).

**Nice-to-have (v2)**
- Engagement analytics (time per section), reports dashboard, CSV export.
- Client input forms, video embeds, custom domain for client links, comments/redlining.
- CRM sync, Zapier, custom fields, fee catalog.

**Enterprise-only (skip)**
- Roles/permissions, approval workflows, SSO, multi-workspace, API (Business plan, from ~$3,900/yr).

**Proposify pricing you're escaping:** Basic $29/user/mo monthly ($19 annual) with 10 sends/mo and $0.50 per extra send; Team $49 quarterly ($41 annual) with 30 sends/mo and $0.30 overage. The "sends" meter is the clunkiest part of the model and disappears entirely when self-hosted.

## 2. The signature question — what "legally binding" actually requires

US law (federal ESIGN Act + state UETA, adopted in 49 states; NY has its own equivalent ESRA) is technology-neutral. A signature is enforceable when four things are true:

1. **Intent to sign** — the signer takes a deliberate action (click "I agree and sign", draw/type a name).
2. **Consent to do business electronically** — a disclosure the signer affirms before signing ("By signing electronically I agree that my e-signature is the legal equivalent of a handwritten signature…").
3. **Attribution / association** — the signature is logically attached to the specific record and you can show who signed (email-link authentication, IP, user agent, timestamps, the exact document hash they saw).
4. **Retention & integrity** — the signed record is stored so it can be accurately reproduced by all parties, and any tampering after signing is detectable.

Proposify itself uses exactly this kind of "simple electronic signature" (typed/drawn + audit trail). It does not use certificate-based digital signatures. So you don't need PKI to match it; you need a clean audit trail and a tamper-evident sealed PDF. Notable exceptions where e-sign doesn't apply (wills, some family-law and court documents, certain notices) don't touch a marketing services agreement.

**Build vs. buy for the signing layer**

| Option | Cost | Effort | Notes |
|---|---|---|---|
| **Build it in-house** (recommended for MVP) | $0 | ~2–3 days | Signature canvas + typed option, consent checkbox, event log table, SHA-256 of the rendered PDF, sealed PDF with audit page appended. Optionally add a certificate-based PDF signature later with `@signpdf/signpdf` and a cheap or self-signed cert. |
| **DocuSeal self-hosted** (AGPL, Docker) | server only (~$5–20/mo) | ~1 day to wire | Free tier includes API + webhooks + audit log + signed-PDF download. Embedded signing forms, HTML→template API, branding and reminders are Pro ($20/user/mo). AGPL is fine since you won't modify or redistribute it. |
| **Documenso self-hosted** (AGPL) | server only | ~1 day | Comparable; hosted Teams tier is $40/mo for 5 users with API + embedded signing. |
| **Dropbox Sign API** | from ~$15/mo, request-metered | ~1 day | Bulletproof audit certificates, but you re-introduce a per-send meter and a vendor. |

Recommendation: build the signing in-house. Your proposals are your own HTML, so you control the whole document; the legal weight comes from the process and the evidence, not from a vendor's logo on the certificate. Keep DocuSeal as the fallback if you ever want a third-party-hosted audit trail for a big contract.

## 3. Architecture (Next.js + Supabase + Vercel)

**Data model (Postgres via Supabase)**
- `clients` (name, company, email, phone, address, notes)
- `proposals` (id, client_id, title, status, currency, total, valid_until, token for public link, password_hash?, created_by, sent_at, viewed_at, signed_at, won/lost, source: 'native' | 'proposify_import')
- `proposal_versions` (immutable JSON snapshot of content at each send; the signed version is frozen)
- `sections` / `blocks` (JSON content model: heading, rich text, image, pricing table, signature block, variables)
- `pricing_items` (catalog: MarketFresh Audit $750, Build $2,500 or $500 + $175/mo, Hosting + Essentials $25/mo, care plans, Local Visibility, etc. — one place to change a price)
- `templates` (reusable proposals; `content_library` for reusable sections)
- `signers` (proposal_id, role: client | company, name, email, order, signed_at, signature_image, typed_name, ip, user_agent)
- `events` (proposal_id, type: created/sent/viewed/section_viewed/downloaded/signed/declined/payment, actor, ip, ua, timestamp, metadata) — this table *is* the audit trail
- `files` (Supabase Storage: rendered PDFs, sealed signed PDFs, imported Proposify PDFs, signature PNGs)
- `quotes` (per proposal: line items with `optional: bool`, `selected: bool`, qty fixed by sender; client toggles optional items only — no editable quantities or prices)
- `qbo_links` (proposal_id → QuickBooks customer id, invoice id, sync status, last error)

**Dynamic variables**
Two kinds, both resolved at render time and frozen into the signed snapshot:
- *Client/proposal fields:* `{{client.first_name}}`, `{{client.company}}`, `{{proposal.title}}`, `{{proposal.valid_until}}`, `{{company.owner}}`.
- *Computed:* `{{quote.total_one_time}}`, `{{quote.total_monthly}}`, `{{quote.selected_items}}` — recalculated live as the client ticks optional items, so a sentence like "Your investment is {{quote.total_one_time}} plus {{quote.total_monthly}}/mo" always matches the table. Unresolved variables block sending.

**Services**
- Next.js App Router. Internal app behind Supabase Auth (you + your wife). Public client route `/p/[token]` with no login; optional password and expiry.
- PDF rendering: Playwright/Chromium on a Vercel function or a tiny Fly/Railway worker rendering the same React view to PDF (print CSS). `pdf-lib` to append the audit-trail page and stamp signatures; store the SHA-256 in `proposals` and print it on the audit page.
- Email: Resend (or Postmark) from `proposals@mktfresh.com` with open tracking via your own pixel/link so view events land in `events`.
- QuickBooks Online (no card charging in the proposal itself): on client signature, a server job (1) searches QBO customers by email, then company name; (2) creates the customer if none matches — flag near-matches for manual review rather than guessing; (3) creates a draft invoice from the *selected* line items, mapping each `pricing_items` row to a QBO Product/Service (store the QBO item id on `pricing_items`); (4) writes ids and status to `qbo_links` and shows a "View in QuickBooks" link on the proposal. Only *one-time* items go to QuickBooks. OAuth via Intuit developer app; retries and a manual "re-sync" button for failures.
- Stripe for anything monthly: on client signature, the same job finds-or-creates the Stripe customer (by email) and creates the subscription from the selected recurring items (care plan, hosting, Option 2 $175/mo), reusing the logic in the existing `stripe_new_oiot_client.py` / `stripe_oiot_schedule.py` scripts. Each `pricing_items` row therefore carries either a QBO item id (one-time) or a Stripe price id (recurring), never both. Subscription start date and trial/proration follow the OIOT schedule rules; store the Stripe ids in `qbo_links` (rename to `billing_links`).
- Notifications: email + optional Slack message on view/sign.

**Signing flow (client side)**
1. Client opens `/p/[token]` → `viewed` event (IP, UA, time).
2. Reads; ticks or unticks optional line items → totals and `{{quote.*}}` variables recompute; selections saved.
3. Clicks "Accept & sign" → consent disclosure + checkbox → draws or types signature → confirms name/title/email.
4. Server freezes the content version, renders PDF, computes hash, stamps signature and audit page, stores sealed PDF, emails copies to client and you.
5. You counter-sign from the internal app (same mechanism) — required on every proposal; final sealed PDF re-issued with both signatures and the full trail. QuickBooks customer + draft invoice is created on the client's signature (step 4) so the invoice is waiting when you counter-sign.

## 4. MVP scope (replace Proposify for MarketFresh only)

Goal: stop paying Proposify within ~4–6 weeks of part-time work.

**Week 1–2 — Author & send**
- Auth, clients, proposals CRUD, block editor (Tiptap) with variables and a pricing-table block driven by `pricing_items`.
- Templates: recreate your 3–5 live Proposify templates (Audit, Build, Care plan, Local Visibility, All-inclusive).
- Public proposal link, email send, view tracking, PDF download.

**Week 3 — Sign & invoice**
- Signature block, consent, audit trail, sealed PDF, mandatory counter-signature, expirations and reminders.
- Optional-item checkboxes in the pricing block with live totals and computed variables.
- QuickBooks: OAuth connect, customer find-or-create, draft invoice from selected one-time items, re-sync button.
- Stripe: customer find-or-create, subscription from selected monthly items (port the OIOT scripts).

**Week 4 — Import & cut over**
- Proposify archive import (below), dashboard listing everything (native + imported) with status, client, value, dates, full-text search.
- Send one real proposal end-to-end, then cancel Proposify.

**Explicitly deferred:** per-section engagement analytics, comments/redlining, CRM sync, roles, multi-workspace, custom domain (can just be `proposals.mktfresh.com` on Vercel from day one though — trivial).

## 5. Where "better than Proposify" comes from

- No per-send meter or per-seat pricing; unlimited proposals.
- Pricing catalog is the single source of truth (fixes the recurring "stale number in one doc" failure) — proposals, the Master Pricing Guide and the playbook calculator can read the same table.
- Claude-assisted drafting: generate a first draft from a website-audit result + client name, using your templates and pricing rules (trade-don't-discount, Option 2 new-builds-only, hosting never unmaintained).
- Interactive quotes that actually map to your ladder (Audit → Build → Care → Local Visibility) with upsell toggles.
- Acceptance triggers real work: Stripe subscription, onboarding email, task creation — not just a "won" status.
- Client portal later: the same `/p/` route can become "your documents with MarketFresh" (proposal, agreement, invoices).

## 6. Importing hundreds of Proposify proposals (Basic/Team, no API)

Proposify gives you two exits on your plan: a per-proposal "Download as PDF" (30–60 s each; the signed PDF includes the audit trail when the template had it enabled) and CSV exports from Reports / list views. No bulk download and no data export on cancellation, so automation runs against the logged-in web app.

**Plan**
1. **Metadata first:** export the proposals list/reports CSV (client, title, value, status, sent/viewed/signed dates). Import into `proposals` with `source='proposify_import'` and the Proposify ID.
2. **PDFs via browser automation:** a Playwright script running on your Mac in a logged-in Chrome profile (or driven by Claude in Chrome) iterates the proposal list, opens each, triggers Download as PDF, waits for the render, saves as `{proposify_id}_{client}_{title}.pdf`. At ~45 s each, 300 proposals ≈ 4 hours unattended; run overnight. Retry list for failures.
3. **Upload & link:** push PDFs to Supabase Storage, attach to the imported rows, extract text (pdftotext) for search.
4. **Templates and content:** don't scrape — rebuild your handful of live templates by hand in the new editor from the PDFs; it's faster and cleaner than parsing Proposify's markup.
5. **Verify:** count rows vs. PDFs, spot-check 10 signed ones for audit pages, then keep the Proposify account one more billing cycle as insurance before cancelling.

Risk: Proposify's web app may rate-limit or block scripted downloads; pace the script (one at a time, human-like waits) and, if the internal JSON endpoints the web app uses are stable, capture them from the network tab to download PDFs directly with the session cookie.

## 7. Decisions made (2026-09-18)

- Both parties sign every proposal; counter-signature is mandatory.
- Interactive quote = optional-item checkboxes only. No client-editable quantities or prices.
- Dynamic variables in content, including computed totals that follow the checkboxes.
- No payment collection in the proposal. On client signature: one-time items → find-or-create QuickBooks customer + draft invoice; monthly items → always Stripe (find-or-create customer + subscription).

## 8. Open decisions

- Customer matching rule when email doesn't match but company name is close (auto-link vs. flag).
- Whether to add a certificate-based PDF signature layer (cheap, but only matters if a client's legal team asks).
- Domain: `proposals.mktfresh.com` vs. a product-style name if this could ever be sold as a product.

## Sources

- Proposify pricing — https://www.proposify.com/pricing
- Proposify features — https://www.proposify.com/proposal-software
- Proposify API (Business plan only) — https://www.proposify.com/platform/api
- Proposify audit trails — https://legacy-support.proposify.com/hc/en-us/articles/4848139042587-Audit-Trails
- Proposify PDF download — https://support.proposify.com/hc/en-us/articles/39519674997787-Downloading-documents-as-PDFs
- Proposify reports CSV — https://legacy-support.proposify.com/hc/en-us/articles/5167982340379-Reports
- Migration experience — https://betterproposals.io/learn/switching-from-proposify
- ESIGN/UETA requirements — https://www.signwell.com/resources/ueta-and-esign-act/
- Open-source e-sign comparison — https://www.esign.ai/blog/open-source-e-signature-api
- DocuSeal repo & pricing — https://github.com/docusealco/docuseal, https://www.docuseal.com/pricing
- DocuSeal API — https://www.docuseal.com/docs/api
- Documenso pricing — https://documenso.com/pricing
- Dropbox Sign API pricing — https://sign.dropbox.com/products/dropbox-sign-api/pricing
