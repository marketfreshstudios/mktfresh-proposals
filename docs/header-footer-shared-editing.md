# Shared band editing (header/footer PR 2)

Desktop-only editing of shared header/footer content. Geometry, PagePlan, client pages, billing and readiness remain outside this PR.

## Owner clarification pending

- Proposal “Reset to template”: should it use the template's current saved bands (there is no creation-time template-band snapshot), and should the template editor reset to built-in defaults? Keep `showHeader`, `showFooter` and per-page overrides, resetting only `shared`, `divider`, `bandHeightIn` and `showOnCover` as requested.

## Reference

Read Redesign 13 frames 1b, 1c, 1g and 1l in the browser. Frame 1l demonstrates each menu separately; screenshots will show both menu states separately, preserving the existing one-popover-at-a-time behavior.
