# Proposal style options — review notes

Existing defaults are body 16px and 0.75-inch margins on every side. The new margin presets are opt-in: Narrow 0.6 / Normal 0.9 / Wide 1.1 inches; an unchanged existing margin remains “Current · 0.75 in”. Existing custom margins remain available. Existing per-level Ink/Accent/Custom heading controls are reused, with their contrast warning; no second heading-color setting.

## Table rendering decision needed

The quote supports one item with multiple independently priced sub-lines, possibly mixing one-time and recurring intervals. Proposed: one table row per item, with stacked Qty / Price / Total entries per sub-line (no cross-interval addition), and labels/terms in Description. Choice groups stay together when they fit a page; a group taller than a full page may split between item rows, with the header repeated and the same radio group identity. A single row taller than a page remains intact/visible and uses existing overflow reporting; content is never discarded.

Table implementation is pending owner confirmation of those two mapping/splitting details. No hosted changes have been run; existing styles/settings JSON is preferred.
