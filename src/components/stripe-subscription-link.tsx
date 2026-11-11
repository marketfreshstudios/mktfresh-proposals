"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "../lib/money";
import type { Proposal } from "../lib/model";
import { stripeTestDashboard } from "../lib/stripe-connect-status";
import type {
  AdoptedStripeSubscription,
  StripeLinkedPrice,
  StripeSubscriptionOptions,
} from "../lib/stripe-subscription-link";
import { DialogActions } from "./dialog-actions";
import { Sheet } from "./foundation";
import { api, Banner, Button, post } from "./ui";

export function stripeLinkedAmount(price: StripeLinkedPrice) {
  if (price.amount === null || !/^[a-z]{3}$/i.test(price.currency))
    return "Amount set in Stripe";
  const period =
    price.interval === "month"
      ? "mo"
      : price.interval === "year"
        ? "yr"
        : price.interval;
  const interval =
    price.intervalCount === 1 ? period : `${price.intervalCount} ${period}`;
  return (
    formatMoney(price.amount, price.currency) + (interval ? `/${interval}` : "")
  );
}
function PriceDetails({ prices }: { prices: StripeLinkedPrice[] }) {
  return (
    <ul className="stripe-adopted-prices">
      {prices.map((price, index) => (
        <li key={`${price.id}:${index}`}>
          {price.name} | {stripeLinkedAmount(price)}
          {price.quantity > 1 && ` per unit | Quantity ${price.quantity}`}
        </li>
      ))}
    </ul>
  );
}

export function LinkedStripeSubscription({
  subscription: link,
  date,
}: {
  subscription: AdoptedStripeSubscription;
  date: (value: string) => string;
}) {
  const dashboard = link.accountId
    ? `https://dashboard.stripe.com/${link.accountId}/test`
    : stripeTestDashboard;
  return (
    <div className="stripe-adopted-details">
      {(link.prices.length > 1 || link.prices[0]?.quantity > 1) && (
        <PriceDetails prices={link.prices} />
      )}
      {link.schedule ? (
        <details className="record-provider-details">
          <summary>Stripe schedule</summary>
          <ol className="stripe-adopted-phases">
            {link.schedule.phases.map((phase, index) => (
              <li key={index}>
                <strong>Phase {index + 1}</strong>
                {phase.startsAt && (
                  <span>
                    {" "}
                    | {date(phase.startsAt)}
                    {phase.endsAt ? ` to ${date(phase.endsAt)}` : ""}
                  </span>
                )}
                <PriceDetails prices={phase.prices} />
              </li>
            ))}
          </ol>
        </details>
      ) : link.stepDown ? (
        <p>
          {link.paidInvoices ?? 0} of {link.stepDown.after} paid | steps down to{" "}
          {stripeLinkedAmount(link.stepDown.price)} after payment{" "}
          {link.stepDown.after}
        </p>
      ) : typeof link.paidInvoices === "number" ? (
        <p>
          {link.paidInvoices} paid{" "}
          {link.paidInvoices === 1 ? "invoice" : "invoices"} | No confirmed
          step-down terms
        </p>
      ) : null}
      {link.stepDown && !link.stepDown.automatic && (
        <p className="muted">
          Review the step-down in Stripe. Yeswell cannot verify that it matches
          the signed proposal.
        </p>
      )}
      <a
        href={`${dashboard}/subscriptions/${link.id}`}
        target="_blank"
        rel="noreferrer"
      >
        Open in Stripe
      </a>
    </div>
  );
}

export function StripeSubscriptionLinkSheet({
  p,
  onClose,
  onLinked,
}: {
  p: Proposal;
  onClose: () => void;
  onLinked: (proposal: Proposal) => void;
}) {
  const [result, setResult] = useState<StripeSubscriptionOptions | null>(null);
  const [search, setSearch] = useState("");
  const [id, select] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/proposals/${p.id}/stripe-subscription`;
  useEffect(() => {
    const request = new AbortController();
    void api<StripeSubscriptionOptions>(url, { signal: request.signal })
      .then(setResult)
      .catch((e: Error) => {
        if (!request.signal.aborted) setError(e.message);
      });
    return () => request.abort();
  }, [url]);
  const query = search.trim().toLowerCase();
  const filtered =
    result?.choices.filter((s) =>
      [
        s.id,
        s.status,
        ...s.prices.flatMap((p) => [
          p.name,
          p.lookupKey,
          stripeLinkedAmount(p),
        ]),
      ].some((value) => value?.toLowerCase().includes(query)),
    ) ?? [];
  return (
    <Sheet
      title="Link a Stripe subscription"
      className="stripe-link-sheet"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !filtered.some((choice) => choice.id === id)) return;
          setBusy(true);
          setError("");
          try {
            onLinked(
              await post<Proposal>(url, {
                revision: p.revision,
                subscription_id: id,
              }),
            );
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <p>
          Choose an existing subscription for {p.client.company}. Linking
          records it in Yeswell. It does not change the subscription in Stripe.
        </p>
        {!result && !error && (
          <p role="status">Looking up Stripe subscriptions…</p>
        )}
        {error && (
          <Banner tone="danger" title="Unable to link">
            {error}
          </Banner>
        )}
        {result?.notice && (
          <div className="stripe-link-notice">
            <p>{result.notice}</p>
            <a href={`/clients/${result.clientId}`}>Open client record</a>
          </div>
        )}
        {!!result?.choices.length && (
          <>
            <label className="field">
              Search subscriptions
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Price name or subscription ID"
              />
            </label>
            {filtered.length > 0 ? (
              <fieldset className="stripe-link-options">
                <legend>Available subscriptions</legend>
                {filtered.map((choice) => (
                  <label key={choice.id} className="stripe-link-option">
                    <input
                      type="radio"
                      name="stripe-subscription"
                      value={choice.id}
                      checked={choice.id === id}
                      onChange={() => select(choice.id)}
                    />
                    <span className="stripe-link-option-copy">
                      <strong>
                        {choice.prices.map((price) => price.name).join(", ") ||
                          "Stripe subscription"}
                      </strong>
                      <span>
                        {choice.prices.map(stripeLinkedAmount).join(" | ")}
                      </span>
                      <small>
                        {choice.id} | {choice.status.replaceAll("_", " ")}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <p role="status">No subscriptions match this search.</p>
            )}
          </>
        )}
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="action"
            busy={busy}
            disabled={!filtered.some((choice) => choice.id === id)}
          >
            Link subscription
          </Button>
        </DialogActions>
      </form>
    </Sheet>
  );
}
