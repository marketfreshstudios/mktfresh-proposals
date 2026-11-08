# American English starter copy — apply BEFORE deploy

Owner-approved exception to the original “no SQL” expectation: future hosted workspace defaults and untouched existing library starters must use the corrected spelling too.

1. Apply `supabase/migrations/20261108220213_american_english_starter_copy.sql` through the Supabase connector. It redefines the existing new-workspace seed function with exactly two phrase substitutions. Expected: one function definition changes (zero on rerun), no existing template/proposal rows change, existing service-only grants remain unchanged. Historical migrations are not edited.
2. On the PR checkout, generate the existing-row dry run with `APP_MODE=supabase node --env-file-if-exists=.env.local --import tsx scripts/americanize-starters.ts`. It reads workspace catalogs/templates, compares the entire customizable state and description to shipped seed variants, and writes `.data/american-english-starters.sql`. It performs no hosted writes and prints no content, addresses or credentials.
3. Review its reported counts and apply the generated compact SQL through the Supabase connector before deploying. The generated transaction uses `service_role`, the existing table permissions and a whole-row PostgreSQL JSON checksum. It changes only the two approved phrases inside `content`. Expected: 0–2 eligible starters per workspace (care and social), exactly 1 changed row per generated statement on first execution, 0 if already applied or concurrently edited. No modified/copy templates, proposals or frozen versions are eligible. Name and availability are preserved.
4. Run the dry run again: expected 0 eligible. Verify the new-workspace function contains the American phrases, and `anon`/`authenticated` still cannot execute it. If a statement returned 0 because staff edited it concurrently, keep that staff edit and rerun the dry run; do not remove the checksum guard.

The script recognizes literal historical generic seeds and the shipped MarketFresh variants (SKU-based quote snapshots). If a quote, cover, band, style or content was customized, it is skipped. Historical equality tests keep their original spellings; a separate current-migration test asserts the hosted trigger matches the current application seed, idempotence, edit protection and unchanged grants.

## Without a local service key

Claude can export the snapshot below using its Supabase connector, save the `snapshot` value to a temporary JSON file, then run `node --import tsx scripts/americanize-starters.ts --input /tmp/yeswell-starter-copy.json`. This mode never opens a Supabase connection and does not read any key. The optional `--output /tmp/yeswell-starter-copy.sql` selects another output path. Keep the snapshot out of git; it is only a temporary deployment artifact.

```sql
select jsonb_build_object('workspaces', coalesce(jsonb_agg(jsonb_build_object(
  'id', w.id,
  'catalog', (select coalesce(jsonb_agg(p.data), '[]'::jsonb)
    from public.pricing_items p where p.workspace_id=w.id and p.sku in
      ('care-lite-49','care-standard-85','care-pro-149',
       'social-starter-595','social-growth-995','social-pro-1650','social-premium-2200')),
  'templates', (select coalesce(jsonb_agg(t.data), '[]'::jsonb)
    from public.templates t where t.workspace_id=w.id and t.data->>'starter_key' in
      ('website-care-hosting','social-media-management'))
)), '[]'::jsonb)) as snapshot
from public.workspaces w
where exists (select 1 from public.templates t where t.workspace_id=w.id
  and t.data->>'starter_key' in ('website-care-hosting','social-media-management'));
```

The generated SQL still uses the service role and the same whole-row guards. Apply it through the connector; exporting/generating performs no hosted write. The credential-free path is covered by an end-to-end generator test that executes its SQL locally, preserves name/availability, and verifies the second execution changes nothing.
