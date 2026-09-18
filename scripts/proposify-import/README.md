# Archive import

1. Export Proposify CSV, then map its headings to `proposify_id,company,first_name,last_name,email,title,created_at,url`. `created_at` and `url` are optional. IDs must contain only letters, digits, hyphens. Dates use ISO 8601. Missing recipient emails must be resolved before import; no fabricated customer data.
2. Run `npm run import -- csv export.csv`. Repeating it updates by Proposify ID and matches clients by normalized email; archived proposals never generate billing jobs.
3. Download PDFs manually or run `npx tsx scripts/proposify-import/download.ts export-config.json`. Provide JSON keys `list_url`, `profile` (a NEW dedicated directory), `output`, `csv`, `row_selector`, `link_selector`, `next_selector` (optional), `download_selector`. Verify selectors against the live UI before use; none are hard-coded guesses. The browser pauses for interactive login, discovers proposal links across list pages, downloads one at a time, allows up to 120 seconds for rendering, and waits 5–10 seconds between documents. `checkpoint.json` records only successful PDF downloads; reruns skip them. Failed IDs are printed as JSON and retried next run. Do not use an open personal Chrome profile.
4. Run `npm run import -- upload pdf-directory`. Filenames begin `{proposify_id}_`. Uploads are hashed, deduplicated, stored privately, text-extracted, and attached to archive rows.
5. Review JSON reconciliation: row/PDF counts, missing PDFs, unmatched files, and per-file errors. Nonzero discrepancies return exit code 1. Inspect a sample of historical signed PDFs before cancelling Proposify.

The CSV/upload path is fixture-tested. Live Proposify selectors and account access require validation on the owner's actual account.
