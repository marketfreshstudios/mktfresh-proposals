# Starter templates rollout — owner action required before merge

Two steps are required on the hosted project. Codex has not run either against hosted data.

1. In the Supabase SQL editor, run the complete file [`20261106151436_starter_templates.sql`](../supabase/migrations/20261106151436_starter_templates.sql). It creates an insert-only provisioning function, a unique workspace/starter-key index and an AFTER INSERT trigger for future workspaces. It does not alter any existing proposal, template or workspace row by itself. Functions are invoker-security, with execution revoked from public/anon/authenticated and granted to service_role. Existing template RLS remains in force.
2. With this branch checked out, the existing hosted environment configured locally, and **APP_MODE not set to local**, run:

   ```sh
   node --env-file-if-exists=.env.local --import tsx scripts/backfill-starter-templates.ts
   node --env-file-if-exists=.env.local --import tsx scripts/backfill-starter-templates.ts --confirm
   ```

   The first command is read-only. Review its six names/default-quote counts, then apply. The script targets workspace 1 explicitly. It inserts missing starter keys only and patches the old sample's name/active status without changing its content. Reruns keep every existing starter, even if renamed or edited. Never use the older general seed command for this hosted backfill.

Expected default-quote counts, in display order: **0, 3, 3, 2, 1, 0**. Products resolve by SKU first, falling back to the old seeded ID only if that SKU is absent:

| Starter | Catalog SKUs |
| --- | --- |
| Website | `build`, `oiot-monthly-175` (choose one; Own It Now default), `hosted-essentials-25` (optional, unticked) |
| Care | `care-lite-49`, `care-standard-85`, `care-pro-149` (choose one; no default) |
| Visibility | `retainer-core-295`, `retainer-growth-495` (choose one; no default) |
| Audit | `audit` |

If any required member is missing, inactive or legacy, the whole starter quote stays empty. The dry run prints each requested SKU, its actual resolved ID, and any issue. An inactive SKU match never falls back to an old active seed row. Catalogue prices/mappings are copied, never calculated.

Own It Over Time's starter option contains its recurring line only; it does not copy a preset kickoff amount. The Website Investment section includes the owner-approved guidance: “[If the client chooses Own It Over Time, add the kickoff as a one-time Custom line with its amount, then delete this note.]” The existing bracket guard blocks sending until the note is handled and removed. There is no blank-amount schema change.

### Clause 4.4 audit and preservation

New MarketFresh starters keep clause 4.4's wording, but resolve its `show_when.pricing_item_id` to the actual `oiot-monthly-175` item (old seeded ID fallback for older catalogs). If the item is absent, the quote stays empty and its original predicate remains, reported as missing.

The repository's old “Website proposal sample” points to seed ID `00000000-0000-4000-8000-000000000103`. Proposals created from it copied that predicate. That ID will not match an OIOT product with a Stripe-synced UUID. Hosted records have **not** been inspected by Codex. The owner-run dry run now reports every existing clause 4.4 condition in templates, current proposals and all stored versions, with its product/mismatch status. These are read-only findings: neither the dry run nor `--confirm` rewrites their content, quotes, predicates, frozen versions or files. The old sample's rename/hide metadata patch remains the only change to an existing template.

The embedded SQL has been regenerated for the guidance change. If the previous SQL file was already applied, run the updated complete file again before the backfill: it replaces the future-workspace trigger payload, without rewriting existing starters. Review the dry run before `--confirm`; reruns never overwrite edited or previously inserted starters.

Business state uses existing workspace settings JSON; no separate column/backfill is required. Set it in Workspace → Brand → Workspace contact details. Starter placeholders intentionally block sending until staff replace them. Nothing rewrites existing proposals or frozen versions.
