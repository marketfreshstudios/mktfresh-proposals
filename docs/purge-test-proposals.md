# Owner-run test proposal purge

Jonathan confirmed on 30 October 2026 that every native proposal is disposable test data and there is no pre-redesign client evidence to preserve. **Imported Proposify records are excluded**, including their versions and stored files.

The script keeps clients, catalogue, templates, content/library/reference documents, workspace settings and integrations. It removes only the specified workspace's native proposals, dependent versions/events/signers/jobs/billing links/file records, and their private bucket objects (including orphaned uploads under those proposal prefixes). It appends a workspace activity entry. It never calls Stripe, QuickBooks or email providers.

The agent has not run this against the hosted project. Jonathan runs it during the release maintenance window, before using the current-model-only app:

1. Stop app/cron workers while purging. A worker already performing an external job must finish or stop first.
2. In the repository's gitignored `.env.local`, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`. The last is the **database-owner** PostgreSQL connection URL from this app's Supabase Connect panel. It is needed only by this maintenance script because app credentials cannot delete immutable signed evidence. The script refuses a DB URL for a different project; hosted pooler usernames must be `postgres.<project-ref>`.
3. Supply the exact workspace UUID. Default invocation prints dry-run counts and makes no writes:

```sh
node --env-file=.env.local --import tsx scripts/purge-test-proposals.ts --workspace WORKSPACE_UUID
```

4. Review those counts, then explicitly confirm:

```sh
node --env-file=.env.local --import tsx scripts/purge-test-proposals.ts --workspace WORKSPACE_UUID --confirm
```

Database changes happen inside one transaction. The script takes write-excluding locks, temporarily disables only the four evidence guards, and restores them before commit. On any error PostgreSQL rollback restores the guards and rows. No application bypass/RPC is installed and future signed-version/hash protections remain enforced.

Storage deletion uses the authenticated Storage API, not SQL against storage metadata. If storage fails after a batch, already removed objects cannot be rolled back; rows and the manifest remain, and the script can be safely retried. `stored_files` counts planned unique paths, including recorded keys that may already be missing on a retry. Do not empty the whole bucket. Bucket branding or unrelated/imported files are not removed.

Run the dry-run again to confirm the native proposal count is zero, then remove the maintenance DB URL from `.env.local` and restart workers. No legacy draft migration is needed. Keep the earlier migrations already applied to the project; the retired, unneeded `20261030055549_draft_quote_items_v3.sql` is removed from this source tree, not replaced by a conversion.
