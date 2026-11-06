# Starter templates rollout — owner action required before merge

Two steps are required on the hosted project. Codex has not run either against hosted data.

1. In the Supabase SQL editor, run the complete file [`20261106151436_starter_templates.sql`](../supabase/migrations/20261106151436_starter_templates.sql). It creates an insert-only provisioning function, a unique workspace/starter-key index and an AFTER INSERT trigger for future workspaces. It does not alter any existing proposal, template or workspace row by itself. Functions are invoker-security, with execution revoked from public/anon/authenticated and granted to service_role. Existing template RLS remains in force.
2. With this branch checked out, the existing hosted environment configured locally, and **APP_MODE not set to local**, run:

   ```sh
   node --env-file-if-exists=.env.local --import tsx scripts/backfill-starter-templates.ts
   node --env-file-if-exists=.env.local --import tsx scripts/backfill-starter-templates.ts --confirm
   ```

   The first command is read-only. Review its six names/default-quote counts, then apply. The script targets workspace 1 explicitly. It inserts missing starter keys only and patches the old sample's name/active status without changing its content. Reruns keep every existing starter, even if renamed or edited. Never use the older general seed command for this hosted backfill.

Expected default-quote counts, in display order: **0, 3, 3, 2, 1, 0**. A missing/inactive required product leaves that template's quote empty and is printed for review. The existing catalogue supplies every price and billing mapping.

Business state uses existing workspace settings JSON; no separate column/backfill is required. Set it in Workspace → Brand → Workspace contact details. Starter placeholders intentionally block sending until staff replace them. Nothing rewrites existing proposals or frozen versions.
