# FilterChip

A filter that shows its current value without anyone opening anything.

**You provide** `label`, `value`, `active`, `onClick` to change it, and `onClear` to drop it.

**The value is on the chip, always.** "Status: Signed by client, Viewed" — not "Status ▾". The most common confusion in a list like the proposals table is "where did my proposal go", and a filter drawer that hides its own state is what causes it. An active filter set must be legible in one glance, above the table.

**`active` is a real distinction.** An inactive chip reads "Client: any" in neutral and is an invitation. An active one takes the accent and gains a clear control. A row of chips where nothing is set should look calm, not switched on.

**`onClear` only appears when active**, inside the chip. A separate ghost `Button` reading "Clear filters" sits at the end of the row for dropping all of them.

## Do

- Put the whole set on one row above the table, before the result count.
- Write the value the way a person would say it: "last 90 days", not "2026-06-20..2026-09-18".

## Don't

- Don't hide filters behind a panel or an icon.
- Don't use a chip for a sort order or a view toggle — that is `Toolbar` with `selected`.
