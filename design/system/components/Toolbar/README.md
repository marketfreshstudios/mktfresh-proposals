# Toolbar

One grouped row of small controls: a set of actions, or — when you pass `selected` — a segmented choice.

**You provide** `items` (each `{id, label, icon, title, disabled}`, or `{separator: true}`), `onSelect`, an `aria-label` via `label`, and optionally `selected` and `size`.

**`selected` changes what it means.** Without it, the items are actions and the component renders as a `toolbar` — the editor's block inserter is the case it was built for. With it, the items are a choice, one is pressed, and the component renders as a `group` with `aria-pressed` on each. Same visual grammar, two different promises; pick by whether clicking an item *does* something or *selects* something.

**Separators group, so they are `border-strong`.** Use one where the items genuinely divide — content blocks on one side, structural blocks on the other. A toolbar with a separator between every pair has no grouping at all.

**Labels beat icons alone.** Every item here carries its word by default. An icon-only item needs `title`, which the component also uses as the accessible name.

**`size="lg"`** is for a toolbar a client touches. The default 30px row is internal-only — it is below `tap-min` and does not belong on a client page.

## Do

- Keep one toolbar per region. Two adjacent toolbars read as one confusing row.
- Order items by how often they are used, not alphabetically.

## Don't

- Don't put a destructive action in a toolbar; it has no confirmation step.
- Don't use the default size anywhere a client will tap.
