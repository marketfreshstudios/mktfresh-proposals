# R23 tools cards, first PR

Compare `2a-comparison.png` and `2a2-comparison.png`: R23 turn 2 on the left, the live 380px Quote panel on the right. The full editor captures are at 1440; phone and dark captures cover the expanded line.

The evidence uses the reference's option names and amounts. Frame 2a2 adds a real zero-valued one-time sub-line, with the new label focused. The original prices and selections are unchanged. R19's sans, tabular totals remain; R23's panel-only card and ink-button exceptions are applied.

Billing mapping, custom families, plan terms, optional/default selection, the add-product picker and existing range totals remain reachable. Amounts of $10,000 or more use a full-width amount field; the six-digit input has no horizontal clipping on desktop or phone. This wrapping changes only the editor form.

Intentional browser updates: default-selection labels, removal of “Shown as the item price,” the Add sub-line label, opening the single add-product disclosure, and including visible native summaries in the drawer's keyboard focus check. A separate visibility check fixes Chromium's retained layout boxes for controls inside closed disclosures. Both collapsed and expanded tools arrows stay 40px square.

No document renderer, PagePlan, price calculation, billing, SQL or hosted-data change.
