# TotalsPair

Both totals, side by side — one-time and monthly. There is deliberately no single-total variant.

**You provide** `oneTime` and `monthly` as numbers, optionally `currency`, `size`, `layout`, and a note under either figure.

**Neither figure is coloured.** Both are `ink` at the same size. Making the recurring one green is the mistake this component exists to prevent: a colour that reads as "good" attached to one of two figures a client is comparing is a thumb on the scale.

**The monthly figure always carries `/month`.** In the bar, in a sentence, in a table cell, in the PDF. A monthly amount without its suffix is a bug.

**Zero still renders.** A proposal with no recurring items must show the client that the monthly figure is `$0.00`, not hide the column.

**Notes are where terms live.** A minimum term or a price schedule goes in `monthlyNote` in full — "$175.00/month for 30 months, then $100.00/month. 12-month minimum." A client agreeing to a schedule must be able to read the whole schedule.

## Do

- Use `size="lg"` in the sticky bar and the record header, `md` elsewhere.
- Use `layout="stack"` in a narrow panel; keep them adjacent either way.

## Don't

- Don't compute or display a combined figure anywhere in the product.
- Don't animate the digits when a client ticks a box. Update instantly.
