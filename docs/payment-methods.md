# Payment methods — implementation checkpoint

## Owner clarification required

The requested default is **Card**, with the exact existing Checkout request preserved. The current request does not specify `payment_method_types` (in either subscription or setup mode). Stripe therefore uses the payment methods enabled in its Dashboard; the app does not currently enforce Card only.

These requirements cannot both be guaranteed by the app:

1. Preserve the default request exactly. Card retains the current Dashboard-controlled behavior; opting into ACH can send an explicit `card` / `us_bank_account` list. The Card label relies on the Dashboard remaining configured for cards only.
2. Enforce the two choices in the app. Card sends `payment_method_types: ["card"]`; Card + ACH sends `["card", "us_bank_account"]`. This changes the default request by adding that field, while leaving its other parameters unchanged.

Implementation is paused for the owner's choice. No Stripe account settings have been read or changed, and no payment requests have been made.

Source: [Stripe dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods), which documents Dashboard-controlled payment methods when `payment_method_types` is omitted. The app remains pinned to API version `2024-06-20`.

## Existing flow findings

- The recurring provider creates subscription-mode Checkout for automatic collection, and setup-mode Checkout for scheduled plans or invoice collection. The payment-method choice needs to cover both paths.
- The existing-subscriber path adds subscription items without creating Checkout. It must remain unchanged.
- The webhook receiver already accepts `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid` and `invoice.payment_failed`. It currently ignores `checkout.session.async_payment_failed`.
- Subscription Checkout completion currently requires immediate payment. An unpaid ACH Checkout must instead enter a durable processing state without retrying an otherwise successful completion event as a job failure.
- Setup-mode completion currently creates the subscription and sends the billing-complete emails once the bank/card setup succeeds. For ACH, successful bank setup alone does not establish that a subsequent debit succeeded. Payment confirmation must be checked separately before reporting paid/active or sending the completion notification.
- Existing invoice-failure handling records the Stripe event. The new delayed-payment path must retain that failure reporting and must not send a success notification.
- The Stripe transport rejects non-test keys and live-mode responses. Those guards and the API version remain unchanged.

## Planned validation after clarification

Mock-only tests will cover default request compatibility (according to the owner's choice), the ACH allow-list, processing/success/failure and duplicate/out-of-order events, setup-mode ACH, Staff authorization, existing subscribers and QuickBooks routing. The full local suite and the requested Billing defaults screenshots follow implementation. No hosted SQL is expected: the setting belongs in the existing workspace settings JSON.
