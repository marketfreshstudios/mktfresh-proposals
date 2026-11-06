# Covers and header defaults rollout

## PR A — owner action

Run [`20261106194431_cover_brand_defaults.sql`](../supabase/migrations/20261106194431_cover_brand_defaults.sql) in the hosted SQL editor after deploying the matching app code. It updates only the future-workspace starter payload and adds a service-role-only, invoker-security compare-and-swap helper. It does not update existing templates or proposals on its own.

To opt in unchanged MarketFresh starters, use the hosted environment with APP_MODE not local:

```sh
node --env-file-if-exists=.env.local --import tsx scripts/upgrade-starter-branding.ts
node --env-file-if-exists=.env.local --import tsx scripts/upgrade-starter-branding.ts --confirm
```

Review the dry run first. It compares the **entire** saved starter with its PR #83 seed, including names, content, quotes, cover, bands and availability. Changed/missing/already-updated starters are skipped. A catalogue change that makes the old seed impossible to verify also skips it. Confirmation checks the complete row again atomically. It updates cover/header defaults only; old sample, non-starters, proposals, published/frozen versions and sealed files are never updated. The script targets workspace 1 explicitly and is safe to rerun.

New automatic logo elements prefer the uploaded wide logo; otherwise the icon with the workspace name; otherwise the name. Explicit compositions remain authored content. Old covers without `logo_mode: "brand"` and old band image sources retain their prior rendering. No settings columns or storage policies are added.

The page-2 overlap was a display projection issue: replacing a small collapsed margin by a page-sized margin consumed the cover's trailing 24px. The projection now verifies the actual position after replacing that margin. Canonical geometry, PagePlan decisions and frozen page breaks remain unchanged. Tests compare the editor's header reservation with the client sheet and actual PDF content box.

Codex has not run hosted SQL or either script against hosted data.

## PR B — owner action

After PR A's SQL, run [`20261106203920_cover_layout_defaults.sql`](../supabase/migrations/20261106203920_cover_layout_defaults.sql). **Hosted SQL is required for the future-workspace seed payload only.** Cover and palette settings are optional JSON, with no new columns or storage policy. The SQL does not rewrite existing rows.

Then use the same dry-run and `--confirm` commands above to opt unchanged MarketFresh starters into Editorial. The script now recognizes either the complete unchanged PR #83 seed or PR A seed; it never derives a baseline from the new layout. Any edit to content, quote, name, availability, bands or cover protects the whole starter. The existing service-only atomic comparison protects against edits between the dry run and confirmation. Existing custom covers and every existing proposal/published version remain unchanged.

Original icons smaller than 1024×1024 still work in navigation and browser tabs. Upload a larger PNG to offer it as a cover graphic; otherwise covers use their built-in vector fallback. Palette suggestions remain pending until explicitly accepted. Codex has not executed the hosted SQL or the update script against hosted data.
