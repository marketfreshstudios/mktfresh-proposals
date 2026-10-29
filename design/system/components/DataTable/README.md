# DataTable

The proposals list and every other record table: sticky header, right-aligned money, loading skeletons.

**You provide** `columns` with optional `render` functions, `rows`, and an `empty` node. `loading` renders skeleton rows in the real column shape.

**Both money columns are `numeric`.** That right-aligns them and applies tabular figures so the digits line up and a number does not change width as it updates. One-time and monthly are always both present, and the monthly cell carries `/mo`.

**Status is a pill in a column, never a tinted row.** A list of mixed statuses with coloured rows is unreadable; a column of pills scans in one pass.

**Loading keeps the table's shape.** Skeletons in the real columns tell the user what is coming. A spinner over an area that already has a known structure does not.

**`empty` is the consumer's decision** because "nothing yet" and "nothing matching" are different messages with different actions. Pass an `EmptyState`; see its guidelines.

## Do

- Keep the header sticky at `z-sticky` and paginate at 100.
- Say when a search hit came from extracted PDF text, and highlight it.

## Don't

- Don't right-align anything that is not a number.
- Don't render an empty `<tbody>`; pass `empty`.
