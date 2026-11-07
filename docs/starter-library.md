# Starter library and Reset

`starter_key` marks a protected library template. Normal template saves and DELETE return 403 for these rows. Opening, previewing and creating proposals still use the existing routes and renderer. New proposals keep their independent snapshots; no proposal or frozen version is rewritten.

The first editor mutation is held outside the starter model. The original document is restored, transient tools close and the inline copy prompt stays below the header. Make a copy names a normal template, applies that first valid operation and stores `source_starter_key`. The header/card resolve the source's current name. The naming dialog determines the copy name. All later copy edits use the normal template history/autosave path. If the retained operation fails the existing schema/font/content validation, the copy uses the original instead and explicitly says the unfinished change wasn't applied.

Super admins can hide/show a starter and Reset it to the current workspace seed. Reset preserves id/name/active; content, cover, bands, quote and style overrides return to the seed. Catalog products and conditional clauses use the existing SKU-first resolver (no invented prices). An incomplete/inactive product set leaves the quote empty, just like the starter backfill. Make a copy first saves an edited backup before Reset, then stays on the starter. The eight-second Undo restores the exact pre-reset row. A concurrent change causes 409 instead of being overwritten.

## Hosted rollout

Run [`20261106205000_starter_library.sql`](../supabase/migrations/20261106205000_starter_library.sql) **before deploying**. This installs a service-role-only, workspace-scoped compare-and-swap function and atomic audit insert. It changes no existing rows and requires no starter backfill. Codex has not run hosted SQL.

## Equality and future releases

Comparison is deep JSON equality of blocks, cover, bands, quote and styles, with object-key order ignored. Identity, name, availability, timestamps, metadata, read-model annotations and computed pagination are not authored edits. Restoring the seed's saved state therefore removes edited/reset indicators even if an old save event exists. The existing release branding updater shares this comparison and still compares the complete expected database row atomically before replacing anything. It retains metadata and discards obsolete computed pagination.

Owner decision: name and availability are workspace settings. Renaming/hiding does not mark the starter edited or block guarded updates. Reset and the branding updater preserve both.

Future starter rollouts continue through the guarded release path with the previous and current seeds, not through the staff save endpoint. Read-only UI/API protection does not block this maintenance path. Edited rows stay protected, and a complete expected-row check prevents concurrent overwrites. This PR adds no background updater and does not change the insert-only new-workspace trigger.
