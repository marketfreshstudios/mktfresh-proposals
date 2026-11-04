# Sealed PDF recovery and job alerts

Started from main `ed303be` (PR #64). This change leaves signing, provider billing operations, header/footer geometry and the PagePlan format unchanged.

## What was confirmed

The exact cause of TEST 2's two historical `Page.printToPDF: Printing failed` errors **could not be confirmed**. Vercel no longer retained Chromium stderr, memory measurements or a stack identifying the failing print. As agreed with the owner, treat them as a transient print failure, rather than claiming a proven geometry defect.

Read-only inspection found that the actual version predates **styles, cover, header/footer settings and PagePlan**. Both original PDF job payloads render successfully in the baseline PR #64 renderer using the packaged x86 Linux Vercel Chromium, their saved workspace branding, bundled font choices and stored logo. The original content box has 18mm margins, width 679.937px and height 919.937px: finite, positive and within Letter. The company render has six body pages and one certificate.

This rules out a deterministic failure caused by those missing fields, invalid Letter dimensions in that payload, or certificate inheritance of the document's margin string. The certificate already uses a separate Letter document with zero margins; only font declarations are shared. PDF jobs embed the saved logo from private storage, rather than requesting the public logo route. The full-brand replay succeeds too. Resource pressure and Chromium's internal print state remain possible explanations, not established causes.

Attempt 3 already completed on 4 November 2026 at approximately 4:00 PM America/New_York. Read-only verification downloaded its existing sealed file, matched its SHA-256 to the database, and confirmed and visually inspected page 7 as the **Certificate of completion**, containing both signatures, signing times and the signed-content hash. The application email log contains **one client completion copy and one staff completion notification**; there are no duplicate completion sends. The two historical billing-labelled failure emails are separate from those completion messages. No hosted retry, write or outbound email was performed during this investigation. Private payloads and assets stay in ignored local files.

## Rendering and recovery

- Frozen versions without cover data use the old cover (logo/workspace, proposal-for eyebrow, title and sender/validity line), instead of inheriting the new editable-cover defaults. Missing bands remain absent. Existing version objects, hashes and stored PDFs are not rewritten.
- Versions with frozen PagePlans retain those exact starts. TEST 2 itself has no plan, so no plan is invented for it. New versions retain the current cover and independent header/footer geometry.
- Before printing, validate configured margins, content width/height and sheet height against Letter. Validate each rendered sheet's configured dimensions again, plus the certificate box. Zero physical page margins remain valid in full-page mode. Invalid values fail with a named `Invalid PDF print geometry` error before Chromium prints. Naturally flowing content on an overflowing frozen page remains visible; it is not clipped or converted into a new plan.
- On Chromium's specific opaque `Printing failed` protocol error, close that target and retry **once** in a fresh script-disabled, network-blocked page, using the same already-laid-out HTML. Do not recompute content, selections, signatures, breaks or hashes. Other errors do not receive that retry. The normal persisted job retry schedule remains the next recovery path.
- Each failed print emits structured diagnostics: client/company/preview stage; proposal body or certificate; attempt; page count; shared geometry; Node RSS/heap/external memory and Chromium RSS when available (all in bytes); Chromium version; bounded console/stderr tails; time and error. The browser process is owned through Playwright's loopback-only BrowserServer so stderr can be captured and the process is closed reliably.
- A short diagnostic copy is saved on the append-only `sync_failed` Evidence event. A successful fresh-target recovery records `pdf_print_recovered` with the same short diagnostics. URLs/embedded data are redacted from captured log tails; document HTML and credential values are never logged.

## Retry and alerts

The existing Retry endpoint resets exhausted jobs to pending with zero attempts. The record keeps the failed **Signed PDF and certificate** row and its Retry button; alert links scroll to, focus and highlight that row. A failed job also replaces the misleading “Everything is complete” headline. Existing sealed-file and deterministic email-job identities prevent a later retry from creating duplicate completion files or copies.

Staff alerts are queued only at exhaustion or when billing needs a staff decision. Their durable identity includes job ID, error and recipient, preventing repeats across process restarts and manual retries. Alert email failures cannot recursively generate alerts. Resolved jobs suppress unsent stale alerts; old queued intermediate PDF notices are also suppressed. Raw attempt details remain in Evidence.

Subjects and bodies name **Client-signed PDF**, **Signed PDF and certificate**, **Stripe billing**, **QuickBooks invoice** or **Email delivery**, as appropriate. Known errors have plain explanations; unknown messages appear in a small Details line. One **Open proposal** button leads to the highlighted job. PDF failures never use billing copy.

Studio → Emails exposes **Job needs attention** as an editable staff template. Its internal key remains `staff_billing_failed` for stored references. Only the unchanged old subject/body/button default is migrated, with an activity entry; custom wording is preserved. Other staff templates remain read-only. Sent email snapshots remain immutable.

## Verification and evidence

`npm run verify:pdf-jobs` runs real client/company jobs, exhausted-job Retry, preview, certificate extraction, version/hash integrity and exact-once completion-copy checks for old planned, old unplanned and Large-header/X-Large-footer versions. On Linux, `VERCEL=1 npm run verify:pdf-jobs` uses the production packaged Chromium. CI runs that path explicitly; Poppler is required for PDF text assertions.

Browser coverage also forces a transient print failure in the actual pipeline, confirms its fresh-page recovery, and checks that console/stderr and memory diagnostics survive in Evidence. Unit tests cover invalid dimensions, bounded retry, five-attempt alert deduplication, decision alerts, email delivery failures, safe Details rendering and unchanged-default migration. Full-suite results are recorded in [HANDOFF_PHASE2.md](../HANDOFF_PHASE2.md).

Requested neutral-fixture screenshots:

- [New failure email, 1440px](screenshots/pdf-job-fix/failure-email-1440.png)
- [Failed Signed PDF job, highlighted Retry row, 1440px](screenshots/pdf-job-fix/failed-job-retry-1440.png)

All new tests run with local/mock providers. No signing, billing-provider behavior, hosted resource or client-link changes. GitHub CI is not awaited.

Final local checks: 365 unit/database tests and 187 browser tests passed; three optional capture tests skipped. TypeScript, formatting, neutrality, all 12 embedded fonts, production build and the 328-file API/PDF trace pass. Offline packaged x86 Linux/Vercel Chromium checks pass for all three sealing/preview fixtures.
