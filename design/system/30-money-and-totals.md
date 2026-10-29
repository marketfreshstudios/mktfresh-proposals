# Money, totals and the quote

## Two totals, never one

Every surface that shows money shows **two** figures side by side: **one-time** and **monthly**. There is no combined number anywhere in the product — not in the list, not in the sticky bar, not in an email, not in the PDF. A blended figure would be wrong in a way nobody could catch.

Both totals are set in `ink` at the same size (`amount-display` in the sticky bar and record header, `amount-lg` in a subtotal row). **Neither is coloured.** The temptation to make the recurring one green is the single most likely mistake here: a colour that reads as "good" attached to one of two figures a client is comparing is a thumb on the scale.

They are told apart by label and suffix, always both:

```
ONE-TIME              MONTHLY
$12,400.00            $175.00/month
```

The label is `ui-label`. The monthly figure always carries `/month` — in the bar, in a sentence, in a table cell, in the PDF. A monthly amount without its suffix is a bug.

When a total is zero, show `$0.00` rather than hiding the column. A proposal with no recurring items still needs the client to see that the monthly figure is zero.

Apply `.tnum` to every amount so columns align and a figure does not change width as it recalculates.

## Live recalculation

Ticking an optional line updates both totals and **every sentence in the document that quotes them** — the computed variables `{{quote.one_time_total}}` and `{{quote.monthly_total}}` resolve live. The update is instant and unanimated; digits do not roll or fade. A brief `accent-soft` flash on the changed row is permitted; a changing number is not.

## Line anatomy

A quote line carries, in this order: selection state, name, description, quantity, unit price, amount, and cadence.

- **Required lines** are visibly fixed — no checkbox, a `lock` icon in `ink-muted`, and the row is not hoverable. Do not render a disabled checkbox; an unusable control invites a click.
- **Optional lines** carry a real checkbox with a `tap-min` hit area, and may start ticked or unticked as staff set. A ticked optional row gets a `selected` ground.
- **Overridden price** shows the list price beside it in `amount-sm` `ink-muted` with a strikethrough, plus the word "was". Staff-side only; a client never sees the override marker, only the price they are being quoted.
- **Custom lines** — anything priced outside the catalog — render identically to catalog lines on the client page. Internally they carry a `custom` badge, because they have no accounting mapping until one is set and that is what blocks sending.
- **Grouped lines** show the client one all-in figure and one name. The constituent lines stay visible to staff, collapsed by default. A group is ticked or unticked as a unit.
- **Minimum term** renders under the line as `doc-small` / `ui-small`: "12-month minimum."
- **Price schedule** renders as its own sub-row, never buried in a tooltip: "$175.00/month for 30 months, then $100.00/month." A client agreeing to a schedule must be able to read the whole schedule.

## Cadence is structural

One-time and monthly lines are separated into two blocks with `ui-subheading` headings, not interleaved with a per-row cadence label. A client scanning a pricing table should be able to answer "what do I pay now, and what do I pay every month" without reading a column.

## Currency

Currency is per-proposal and comes from workspace settings. Format with the proposal's locale and always show the symbol and two decimals. Never show a bare number in a money column.
