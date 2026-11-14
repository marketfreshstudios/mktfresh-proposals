"use client";
import { useEffect, useRef, useState } from "react";
import type { PlanState } from "../lib/plan";
import { PLANS, priceLabel, type BillingInterval } from "../lib/yeswell-plans";
import { api, post, Banner, Button } from "./ui";
import { Switch } from "./form-controls";

type Overview =
  | { owner: false; owners: string[] }
  | {
      owner: true;
      owners: string[];
      plan: PlanState;
      people_in_use: number;
      subscribed: boolean;
      not_billed: boolean;
      subscription: {
        plan: "studio" | "agency" | null;
        interval: BillingInterval | null;
        people: number | null;
        domain: boolean;
        current_period_end: string | null;
        cancel_at_period_end: boolean;
      } | null;
      launch_price: boolean;
      launch_spots_left: number;
      card: { brand: string; last4: string } | null;
      billing_ready: boolean;
    };
type Plan = "studio" | "agency";
const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 ? 2 : 0,
  });
const longDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
const weekday = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { weekday: "long" }) : "";

export function BillingPage({ returned }: { returned: boolean }) {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(returned);
  async function load() {
    try {
      const next = await api<Overview>("/api/billing");
      setData(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }
  useEffect(() => {
    void load();
  }, []);
  // After Checkout the webhook can take a few seconds to arrive.
  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const timer = setInterval(async () => {
      const next = await load();
      if ((next?.owner && next.subscribed) || ++tries >= 10) {
        setWaiting(false);
        clearInterval(timer);
        history.replaceState(null, "", "/billing");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (error)
    return (
      <Banner tone="danger" title="Billing couldn't load">
        {error}
      </Banner>
    );
  if (!data) return <div className="billing-page" aria-busy="true" />;
  if (!data.owner)
    return (
      <div className="billing-page">
        <section className="card billing-card">
          <h2 className="t-card-title">Ask your workspace owner</h2>
          <p className="muted">
            Only owners can choose or change the plan.
            {data.owners.length
              ? ` ${data.owners.join(", ")} ${data.owners.length > 1 ? "manage" : "manages"} billing for this workspace.`
              : ""}
          </p>
        </section>
      </div>
    );
  if (data.not_billed)
    return (
      <div className="billing-page">
        <section className="card billing-card">
          <h2 className="t-card-title">Not billed</h2>
          <p className="muted">This workspace isn't charged for Yeswell.</p>
        </section>
      </div>
    );
  if (data.subscribed && data.subscription?.plan)
    return <CurrentPlan data={data} />;
  return <ChoosePlan data={data} waiting={waiting} />;
}

function CurrentPlan({ data }: { data: Extract<Overview, { owner: true }> }) {
  const sub = data.subscription!;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pastDue =
    data.plan.notice === "payment_failed" ||
    data.plan.notice === "payment_overdue";
  return (
    <div className="billing-page">
      {error && (
        <Banner tone="danger" title="Couldn't open billing">
          {error}
        </Banner>
      )}
      <section className="card billing-card">
        <div className="billing-current-head">
          <h2 className="t-card-title">
            {PLANS[sub.plan!].name}{" "}
            <span className={`pill ${pastDue ? "warning" : "success"}`}>
              {pastDue
                ? "Payment due"
                : sub.cancel_at_period_end
                  ? "Ends soon"
                  : "Active"}
            </span>
          </h2>
          <Button
            variant="primary"
            className="action"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                location.href = (
                  await post<{ url: string }>("/api/billing/portal")
                ).url;
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Manage billing
          </Button>
        </div>
        <dl className="billing-facts">
          <dt>Billed</dt>
          <dd>
            {sub.interval === "year" ? "Yearly" : "Monthly"}
            {data.launch_price ? " | Launch price" : ""}
          </dd>
          <dt>People</dt>
          <dd>
            {data.people_in_use} of {sub.people} in use
          </dd>
          <dt>Own email domain</dt>
          <dd>{sub.domain ? "On" : "Off"}</dd>
          <dt>{sub.cancel_at_period_end ? "Ends" : "Next charge"}</dt>
          <dd>
            {longDate(sub.current_period_end)}
            {data.card && !sub.cancel_at_period_end
              ? ` | ${data.card.brand[0].toUpperCase()}${data.card.brand.slice(1)} ending ${data.card.last4}`
              : ""}
          </dd>
        </dl>
      </section>
    </div>
  );
}

function ChoosePlan({
  data,
  waiting,
}: {
  data: Extract<Overview, { owner: true }>;
  waiting: boolean;
}) {
  const [plan, setPlan] = useState<Plan>("studio"),
    [interval, setBillingInterval] = useState<BillingInterval>("month"),
    [people, setPeople] = useState(
      Math.max(data.people_in_use, PLANS.studio.included),
    ),
    [domain, setDomain] = useState(false),
    [total, setTotal] = useState<{ cents: number; key: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const minPeople = Math.max(1, data.people_in_use);
  const selection = {
    plan,
    interval,
    people,
    domain: plan === "studio" && domain,
  };
  const key = JSON.stringify(selection);
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
    if (!data.billing_ready) return;
    const timer = setTimeout(async () => {
      try {
        const preview = await post<{ total_cents: number }>(
          "/api/billing/preview",
          selection,
        );
        if (latest.current === key)
          setTotal({ cents: preview.total_cents, key });
      } catch {
        if (latest.current === key) setTotal(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [key, data.billing_ready]);
  const extra = Math.max(0, people - PLANS[plan].included);
  const unit = interval === "month" ? "/mo" : "/yr";
  const trialEnd =
    data.plan.notice === "trial" || data.plan.notice === "trial_ending";
  // Stripe keeps the rest of the trial free when it ends at least 2 days out.
  const trialFree =
    trialEnd &&
    Date.parse(data.plan.trial_ends_at ?? "") - Date.now() > 2 * 86400000;
  return (
    <div className="billing-page">
      {waiting && (
        <Banner tone="info" title="Payment received">
          Finishing setup. This takes a few seconds.
        </Banner>
      )}
      {error && (
        <Banner tone="danger" title="Couldn't start checkout">
          {error}
        </Banner>
      )}
      <p className="billing-lead muted">
        {trialEnd
          ? `Your trial ends ${weekday(data.plan.trial_ends_at)}. `
          : ""}
        Your proposals and client links keep working whatever you choose.
      </p>
      <div
        className="segmented billing-interval"
        role="radiogroup"
        aria-label="Billing period"
      >
        {(["month", "year"] as const).map((i) => (
          <label key={i}>
            <input
              type="radio"
              name="interval"
              checked={interval === i}
              onChange={() => setBillingInterval(i)}
            />
            <span>{i === "month" ? "Monthly" : "Yearly"}</span>
          </label>
        ))}
        <small className="billing-save">Yearly: 2 months free</small>
      </div>
      <div className="billing-plans" role="radiogroup" aria-label="Plan">
        {(["studio", "agency"] as const).map((p) => (
          <label
            key={p}
            className={`billing-plan ${plan === p ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="plan"
              checked={plan === p}
              onChange={() => {
                setPlan(p);
                setPeople((n) => Math.max(n, PLANS[p].included, minPeople));
              }}
            />
            <span className="billing-plan-name">{PLANS[p].name}</span>
            <span className="billing-plan-price">
              {priceLabel(p, interval).replace(/\/(mo|yr)$/, "")}
              <small>{unit}</small>
            </span>
            <span className="muted">
              {p === "studio" ? "For small teams" : "For growing agencies"}
            </span>
            <ul>
              {(p === "studio"
                ? [
                    "2 people included",
                    "Unlimited proposals and e-signatures",
                    "Stripe and QuickBooks billing",
                    "Claude connector",
                  ]
                : [
                    "5 people included",
                    "Everything in Studio",
                    "Send from your own email domain",
                    "Priority support",
                  ]
              ).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </label>
        ))}
      </div>
      <section className="card billing-extras">
        <div className="billing-extra">
          <span>
            <strong id="billing-people">People</strong>
            <span className="muted">
              {PLANS[plan].included} included. Extra people{" "}
              {priceLabel("seat", interval)} each.
            </span>
          </span>
          <span
            className="billing-stepper"
            role="group"
            aria-labelledby="billing-people"
          >
            <button
              type="button"
              aria-label="Fewer people"
              disabled={people <= minPeople}
              onClick={() => setPeople((n) => Math.max(minPeople, n - 1))}
            >
              −
            </button>
            <output aria-live="polite">{people}</output>
            <button
              type="button"
              aria-label="More people"
              disabled={people >= 100}
              onClick={() => setPeople((n) => Math.min(100, n + 1))}
            >
              +
            </button>
          </span>
        </div>
        {plan === "studio" && (
          <label className="billing-extra">
            <span>
              <strong>Send from your own email domain</strong>
              <span className="muted">
                Proposals come from you@yourbusiness.com.{" "}
                {priceLabel("domain", interval)}.
              </span>
            </span>
            <Switch
              checked={domain}
              onChange={(e) => setDomain(e.target.checked)}
            />
          </label>
        )}
      </section>
      <div className="billing-total">
        <div>
          <strong aria-live="polite">
            {total?.key === key ? `${money(total.cents)}${unit}` : " "}
          </strong>
          <span className="muted">
            {PLANS[plan].name}
            {extra
              ? ` + ${extra} extra ${extra === 1 ? "person" : "people"}`
              : ""}
            {plan === "studio" && domain ? " + own email domain" : ""}
          </span>
          {data.launch_spots_left > 0 && (
            <span className="pill clay">
              Launch price, locked in while you stay subscribed
            </span>
          )}
        </div>
        <Button
          variant="primary"
          className="action"
          busy={busy}
          disabled={!data.billing_ready}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              location.href = (
                await post<{ url: string }>("/api/billing/checkout", selection)
              ).url;
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Continue to payment
        </Button>
      </div>
      <p className="muted billing-fine">
        {data.billing_ready
          ? trialFree
            ? "You won't be charged until your trial ends. Cancel anytime from this page."
            : "Cancel anytime from this page."
          : "Billing isn't set up yet."}
      </p>
    </div>
  );
}
