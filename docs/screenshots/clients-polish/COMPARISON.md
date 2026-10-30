# Clients polish visual comparison

90 application screenshots cover 15 scenes at 375 / 768 / 1440 in light and dark. The test asserts the actual `data-theme`, viewport fit, row focus ring, and row hover color before capture. All data is synthetic; Stripe reads are mocked and there are no provider writes.

- **Client detail (6d–6f):** retains the shell, heading, cards, billing summary and proposal rows. Jonathan’s additions take precedence: a labelled contact card near the top, visible Edit/Delete controls, and explicit Stripe customer choices with confirmation. Desktop candidate cards sit side by side; tablet and phone stack. One and zero matching-customer states are included. An unavailable-billing fixture proves the saved customer can still be unlinked after a failed read. No summary claims an unlinked client has no active subscriptions.
- **Clients directory (list treatment from 6a–6c):** the source has no dedicated directory frame. Uses its table/card patterns with the seven requested columns; all seven labels remain on phone cards. Contact email/phone remain independent links over the stretched row link.
- **New/edit contact and confirm sheets (client context 6d–6f):** no exact original frame exists for these additions. Uses the shared modal/bottom sheet, labelled controls and focus management. Captures show structured address inputs, international formatting, invalid-phone inline help, and named deletion/link confirmations.
- **Editor (2a–2c/2f, 5g/5h):** multiline address field chips and the blocked Review & send panel are captured at each width/theme. The blocker provides a direct link to the client chooser.
- **Proposals (6a–6c), Home (3d–3f), Activity (7e):** preserve content and layout while moving hover and keyboard focus to the entire clickable row. Activity entries without a proposal link are not made clickable. The desktop Activity source is the closest available reference at narrower widths.
- Some exported reference frames provide only one visual variant. The gallery marks identical light/dark reference exports; the application captures are independently verified in both themes.

The gallery pairs each capture with its contextual frame. Full-height detail captures intentionally retain the fixed phone navigation at the capture viewport boundary; scrolling content has bottom clearance in the application.
