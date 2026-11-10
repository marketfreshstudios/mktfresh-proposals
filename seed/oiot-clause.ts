export const oldOiotClauseBody =
  "If you choose Own It Over Time, you agree to a minimum commitment of 18 monthly payments. The website is paid off after 30 monthly payments of $175; billing then continues at $100/month for hosting and care. If payments stop before the 30th payment, {{workspace.name}} may take the website offline.";

export const paymentPlanClause = {
  id: "payment-plan",
  heading: "4.4 Own It Over Time",
  body: `**Fees and Term.** Client pays a kickoff payment of {{oiot.kickoff}} and a monthly fee of $175. The kickoff payment and the first monthly fee are both due at signing, and the monthly fee is billed automatically on the same day of each month thereafter. The initial term is eighteen (18) months beginning on the date this Agreement is signed — not the date the website launches — after which it continues month to month until either party gives thirty (30) days’ written notice.

**What the Monthly Fee Covers.** The monthly fee covers web hosting and the staging environment, WordPress core, plugin and theme updates, off-site backups, security scanning, a monthly report, uptime and broken-link monitoring, and one (1) hour of edit time per month. Hosting, updates, backups and security scanning begin at signing. Included edit time, the monthly report and monitoring begin at launch. Included edit time does not accrue and does not roll over from month to month.

**Build Credit, Buyout and Step-Down.** Of each monthly fee actually received, $75 is applied as a build credit reducing the price at which Client may purchase the website outright. The full purchase price is {{oiot.purchase_price}} as of the date of signing, and the buyout price is that amount less the kickoff payment and less all build credits accrued to date. Client may purchase the website at any time by paying the then-current buyout price together with any past-due amounts. Any additional pages or build work paid for in full after launch credits in full toward the buyout price. Build credit accrues only on payments actually received, is not cash, and is not refundable or redeemable except as a reduction of the buyout price. Any month in which payment is not received does not accrue build credit and correspondingly extends the period to payoff.

When the buyout price reaches zero through accrued build credits, two things happen automatically and at no further charge: ownership of the website transfers to Client, and the monthly fee is reduced from $175 to $100 per month, being MarketFresh Studios’ Hosting & Care Standard Plan. Provided every monthly payment is made when due, that occurs after thirty (30) monthly payments. From that point forward the $100 monthly fee covers hosting, updates, security, backups and included edit time only; no further build credit accrues, and Client may cancel on thirty (30) days’ written notice at any time.

**Ownership.** Until ownership transfers as described above, MarketFresh Studios owns the website as built — its design, layout, code and configuration — together with the hosting environment, and grants Client a license to use and display the website throughout the term. Client’s domain name is registered in Client’s name and in Client’s account and is owned by Client at all times; MarketFresh Studios does not and will not take ownership of Client’s domain under any circumstance. Client’s logo and brand assets, all content Client supplies, Client’s business listings and email accounts, and all form submissions, leads and customer data generated through the website are Client’s property at all times, regardless of payment status. WordPress core, plugins and themes are licensed from their respective publishers rather than owned by MarketFresh Studios; on transfer, Client receives the website as built and is responsible for maintaining any third-party licenses or subscriptions it relies on.

**If Payment Stops or Client Cancels.** If Client cancels or an amount goes past due, MarketFresh Studios will provide the current buyout price in writing and the website will remain live for thirty (30) days. Care services and edit work pause after fifteen (15) days. On day thirty (30) the website is taken offline unless Client has completed the buyout; Client’s domain is unaffected and may be redirected immediately. A complete backup is retained for a further sixty (60) days, during which the buyout remains available at the price frozen on day thirty, after which the backup is deleted with at least fifteen (15) days’ advance notice.`,
  body_format: "oiot_run_in" as const,
  show_when: {
    kind: "item_selected" as const,
    pricing_item_id: "00000000-0000-4000-8000-000000000103",
  },
};

export const planAwarePaymentPlanClause = {
  ...paymentPlanClause,
  body: paymentPlanClause.body
    .replaceAll("$175", "{{oiot.monthly}}")
    .replaceAll("$100", "{{oiot.step_down}}")
    .replace("Hosting & Care Standard Plan", "{{oiot.step_down_plan}}"),
  show_when: { kind: "oiot_plan_selected" as const },
};
