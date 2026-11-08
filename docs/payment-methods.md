# Payment methods

## Checkout compatibility

The owner approved making payment methods explicit (PR #100): `payment_method_types: ["card"]` for Card, `["card", "us_bank_account"]` for Card + US bank account (ACH). This is the sole change to Checkout request parameters; regression snapshots cover the remaining parameters in subscription, invoice-setup and scheduled-setup modes. Apple Pay / Google Pay remain card wallets; eligibility still depends on Stripe and the browser. Dashboard-only methods such as Link are excluded until explicitly added later.

The setting is optional in existing workspace settings JSON and defaults to Card on read. Only Super admins may change it. No database migration or hosted SQL is required. Existing subscribers with a usable default card keep the existing add-items path without another payment step; one-time fees remain on QuickBooks.

## ACH confirmation and events

Bank-account setup is not payment success. After verified Checkout/setup, the application stores a durable processing state and checks each subscription's latest invoice. The invoice must belong to that test customer and subscription and report `status=paid` and `paid=true` before billing-complete notifications are queued and the subscription is reported active. A pending debit stays processing, even if Stripe reports the subscription itself active. Invoice-collection and scheduled-plan setups wait for their first paid invoice too.

Webhook event subscriptions used:

- `checkout.session.completed`: verify the current session and payment method; finish setup-mode subscriptions with the same stable keys; record processing instead of failing an unpaid bank payment.
- `checkout.session.async_payment_succeeded`: reconcile the current state; it is not itself trusted as proof of a paid invoice.
- `checkout.session.async_payment_failed`: reconcile failure, including a later bank failure on an already-confirmed session.
- `invoice.paid`: reconcile processing Checkouts/subscriptions, and retain the existing paid-invoice schedule progression.
- `invoice.payment_failed`: record invoice evidence and reconcile the current bank debit without success notifications.

Receipt IDs deduplicate the durable webhook jobs. Provider keys are stable across receipts for a session. Completion and both notification jobs are committed together through the proposal CAS and deduplicated by Checkout session. Current invoice state protects against stale success/failure snapshots; concurrent changes to bank metadata require fresh verification instead of overwriting the other worker. If invoice success arrives before Checkout completion, the later Checkout receipt reads that paid invoice. Repeated processing notifications do not add duplicate timeline events. Later invoice failures remove the active label while preserving the historical confirmation/email log.

Stripe remains pinned to `2024-06-20`; test-key and live-response rejection are unchanged. No Stripe account configuration is changed. All validation uses fixtures/mocks, with no credentials or real payment requests.

References: [Checkout ACH](https://docs.stripe.com/payments/ach-direct-debit/accept-a-payment?payment-ui=checkout), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods).
