# QuickBooks customer review and connection details

All application screenshots use synthetic sandbox fixtures. Stripe uses test-mode fixtures.

## Connection detail pages

The provider mark and rectangular chip follow Redesign 19 **2e8**. The title, hairlines and label/value layout follow **2e12**.

| R19 2e8: Connections | R19 2e12: Billing defaults |
| --- | --- |
| ![Connections reference](r19-2e8.png) | ![Billing defaults reference](r19-2e12.png) |

| State | 1440 | 375 |
| --- | --- | --- |
| QuickBooks: connected | ![QuickBooks connected desktop](quickbooks-connected-1440.png) | ![QuickBooks connected phone](quickbooks-connected-375.png) |
| QuickBooks: not connected | ![QuickBooks not connected desktop](quickbooks-not_connected-1440.png) | ![QuickBooks not connected phone](quickbooks-not_connected-375.png) |
| QuickBooks: reconnect needed | ![QuickBooks reconnect desktop](quickbooks-reconnect-1440.png) | ![QuickBooks reconnect phone](quickbooks-reconnect-375.png) |
| Stripe: connected in test mode | ![Stripe connected desktop](stripe-connected-1440.png) | ![Stripe connected phone](stripe-connected-375.png) |
| Stripe: not connected | ![Stripe not connected desktop](stripe-not_connected-1440.png) | ![Stripe not connected phone](stripe-not_connected-375.png) |

[Disconnect confirmation](quickbooks-disconnect-confirm-1440.png) uses the shared destructive dialog, with Cancel first.

[Email sending](connection-email-1440.png), [AI assistants](connection-assistants-1440.png), and [Proposify imports](connection-imports-1440.png) use the same 2e8/2e12 connection-detail pattern.

## Item mapping

[Billing defaults](billing-defaults-1440.png) and the [searchable default item](billing-default-item-1440.png) use the setting rows from **2e12**. The [per-product picker](product-item-picker-1440.png) follows the product details from **2e7** and uses the same combobox.

## Proposal Billing

The [customer chooser](customer-chooser-1440.png), [draft invoice](record-draft-invoice-1440.png), and [billing failure with one retry](record-retry-1440.png) use the record sheet from **2c8**. Customer choices use one frame with separated rows and a marker for the selected row (Redesign 19 rule 7).
