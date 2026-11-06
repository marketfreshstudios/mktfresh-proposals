# Starter proposal templates — resolved owner decisions

PR #83 builds on main `d5a431d`. Source wording: `design/templates/starter-templates.md`.

1. There is no table block. The owner approved existing list blocks, one row per item, first column bold; preserve wording and row order. A real table block is deferred.
2. The cover uses separate `{{proposal.date}}` and `{{proposal.validity}}` lines, with no literal “Valid until” prefix. Indefinite validity remains empty-safe.
3. Generic workspaces omit clause 4.4. MarketFresh keeps the seed's exact body and show-when condition.

The catalogue has the requested seed IDs. The owner-run backfill validates their availability, copies stored catalogue prices without computing/suggesting prices, and reports any missing defaults. Hosted provisioning/backfill instructions are in `docs/starter-template-rollout.md`. No hosted operation has been run by Codex.
