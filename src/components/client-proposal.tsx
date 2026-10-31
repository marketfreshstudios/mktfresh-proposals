"use client";
import {
  BillingItems,
  BillingRecurringTotal,
  checkoutActionLabel,
  BillingConfirmationCard,
} from "./billing-breakdown";
import { billingDisplay } from "../lib/billing-display";
import { ContactToast, copyContactValue } from "./contact-value";
import { fontCss } from "../lib/proposal-fonts";
import { readableDate } from "../lib/validity";
import {
  chooseItem,
  quoteSublines,
  orderedItems,
  selectedContent,
} from "../lib/quote-model";
import type { QuoteItem } from "../lib/model";
import { useEffect, useRef, useState } from "react";
import { accentText } from "../lib/branding";
import { formatMoney, intervalSuffix } from "../lib/money";
import { money, totals, renderBlocks, resolve } from "../lib/presentation";
import type { BillingLine } from "../lib/model";
import type { publicResult } from "../lib/service";
import { ClientSignatureBlock } from "./client-signature-block";
import { SignatureForm } from "./signature";
import { api, ApiError, Banner, Button, Icon, date } from "./ui";
import { Skeleton } from "./foundation";
export type PublicProposal = ReturnType<typeof publicResult>;
type Brand = {
  name: string;
  email: string;
  logo?: string | null;
  accent_colour?: string;
  contact?: { name: string; email: string };
  ended?: string | null;
};
const emptyBrand: Brand = { name: "Proposal", email: "" };
export function ClientProposal({
  token,
  preview = false,
}: {
  token: string;
  preview?: boolean;
}) {
  const [route, setRoute] = useState<{
    brand: Brand;
    initial?: PublicProposal;
  } | null>(null);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    const preference = localStorage.getItem("proposal-theme");
    document.documentElement.dataset.theme =
      preference ??
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);
  useEffect(() => {
    let active = true;
    setRoute(null);
    setFailure(false);
    void api<any>(
      preview
        ? `/api/proposals/${token}/preview`
        : `/api/public/${token}/brand`,
    )
      .then((value) => {
        if (active)
          setRoute({
            brand: preview
              ? { ...value.company, contact: value.contact }
              : value,
            initial: preview ? value : undefined,
          });
      })
      .catch(() => {
        if (active) setFailure(true);
      });
    return () => {
      active = false;
    };
  }, [token, preview]);
  if (failure)
    return <NewClientFlow token={token} preview={preview} brand={emptyBrand} />;
  if (!route)
    return (
      <div className="client-flow">
        <div className="flow-loading">
          <Skeleton kind="document" label="Opening your proposal…" />
        </div>
      </div>
    );
  return (
    <NewClientFlow
      token={token}
      preview={preview}
      brand={route.brand}
      initial={route.initial}
    />
  );
}
function NewClientFlow({
  token,
  preview,
  brand: initialBrand,
  initial,
}: {
  token: string;
  preview: boolean;
  brand: Brand;
  initial?: PublicProposal;
}) {
  const [p, setP] = useState<PublicProposal | null>(initial ?? null),
    [brand, setBrand] = useState(initialBrand);
  const [step, setStep] = useState<"read" | "sign" | "billing" | "done">(
    "read",
  );
  const [checkoutReturned, setCheckoutReturned] = useState(false),
    [returnSession, setReturnSession] = useState(""),
    [returnTimedOut, setReturnTimedOut] = useState(false),
    [pollCycle, setPollCycle] = useState(0);
  useEffect(() => {
    if (preview) return;
    const query = new URLSearchParams(location.search);
    setCheckoutReturned(query.get("billing") === "returned");
    setReturnSession(query.get("session_id") ?? "");
  }, [preview, token]);
  const [locked, setLocked] = useState(false),
    [ended, setEnded] = useState(false),
    [password, setPassword] = useState("");
  const [declineNote, setDeclineNote] = useState("");
  const [showPassword, setShowPassword] = useState(false),
    [stale, setStale] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [declining, setDeclining] = useState(false),
    [phone, setPhone] = useState(false),
    [showCopy, setShowCopy] = useState(false);
  const bar = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [barHeight, setBarHeight] = useState(0);
  const [readSection, setReadSection] = useState<number | null>(null);
  const headers = { "x-proposal-password": password };
  const signed = !!p && ["signed_by_client", "completed"].includes(p.status);
  const recurring =
    !!p &&
    quoteSublines(p.quote as QuoteItem[]).some(
      (l) => (!l.optional || l.selected) && l.interval !== "one_time",
    );
  const billing =
    preview && step === "billing"
      ? [
          {
            requires_checkout: true,
            checkout: [],
            added_existing: [],
            status: "pending",
          },
        ]
      : (p?.billing ?? []);
  const display = p
    ? billingDisplay(
        p.quote as QuoteItem[],
        billing,
        preview && step === "billing",
        p.billing_collection_method,
      )
    : null;
  const checkout = display?.checkout ?? [];
  const requiresCheckout =
    recurring && billing.some((b) => b.requires_checkout);
  const existing = display?.added ?? [];
  const confirmations = p?.billing.flatMap((b) => b.confirmations ?? []) ?? [];
  const returnConfirmed = returnSession
    ? confirmations.some((c) => c.checkout_session_id === returnSession)
    : confirmations.length > 0 && !requiresCheckout;
  const finishingReturn = checkoutReturned && signed && !returnConfirmed;
  const contact = p?.contact ??
    brand.contact ?? { name: "", email: brand.email };
  const firstName = p?.recipient.name.split(" ")[0] ?? "";
  const review = step === "read" && !signed;
  const activeStep = signed ? (step === "done" ? "done" : "billing") : step;
  async function load() {
    setBusy(true);
    setError("");
    try {
      const value = await api<PublicProposal>(
        preview ? `/api/proposals/${token}/preview` : `/api/public/${token}`,
        { headers },
      );
      setP(value);
      setBrand({ ...brand, ...value.company, contact: value.contact });
      setLocked(false);
      setEnded(false);
      setStale(false);
      setStep(
        ["signed_by_client", "completed"].includes(value.status)
          ? value.billing.some((b) => b.requires_checkout) ||
            quoteSublines(value.quote as QuoteItem[]).some(
              (l) => (!l.optional || l.selected) && l.interval !== "one_time",
            )
            ? "billing"
            : "done"
          : "read",
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setLocked(true);
        if (password)
          setError("That password doesn’t match. Please try again.");
      } else if (e instanceof ApiError && [404, 410].includes(e.status))
        setEnded(true);
      else setError("We couldn’t open your proposal. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!initial) void load();
  }, [token]);
  useEffect(() => {
    if (
      preview ||
      !signed ||
      (checkoutReturned && (returnConfirmed || returnTimedOut))
    )
      return;
    let active = true;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void api<PublicProposal>(`/api/public/${token}/state`, {
        headers,
        signal: controller.signal,
      })
        .then((value) => {
          if (active) setP(value);
        })
        .catch(() => {});
    }, 3000);
    const deadline = setTimeout(
      () => {
        active = false;
        clearInterval(timer);
        controller.abort();
        if (checkoutReturned) setReturnTimedOut(true);
      },
      checkoutReturned ? 60000 : 180000,
    );
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [
    signed,
    token,
    password,
    preview,
    checkoutReturned,
    returnConfirmed,
    returnTimedOut,
    pollCycle,
  ]);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    if (step === "read" && readSection !== null) {
      document
        .getElementById(`section-${readSection}`)
        ?.scrollIntoView({ block: "start" });
      setReadSection(null);
    }
  }, [step, readSection]);
  useEffect(() => {
    const node = bar.current;
    if (!node || !review) {
      setBarHeight(0);
      return;
    }
    const measure = () =>
      setBarHeight(
        getComputedStyle(node).position === "fixed"
          ? node.getBoundingClientRect().height
          : 0,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [review, stale, p?.quote.length, phone]);
  async function submit(path: string, data: unknown) {
    if (preview) throw new Error("Preview cannot submit client actions");
    return api<PublicProposal>(`/api/public/${token}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }
  async function toggle(id: string, selected: boolean) {
    if (!p || pending.current || stale || signed) return;
    const previous = p,
      quote = chooseItem(p.quote as QuoteItem[], id, selected),
      t = totals(quote);
    const fmt = (n: number) => formatMoney(n, p.currency, p.money_cents);
    const variables = {
      ...p.variables,
      "quote.one_time_total": fmt(t.one_time_total),
      "quote.monthly_total": fmt(t.monthly_total),
      "quote.yearly_total": fmt(t.yearly_total),
      "quote.selected_items": quote
        .filter((l) => !l.optional || l.selected)
        .map((l) => l.name)
        .join(", "),
    };
    setP({
      ...p,
      quote,
      totals: t,
      variables,
      html: renderBlocks(
        p.content,
        quote as QuoteItem[],
        variables,
        p.currency,
      ),
    });
    if (preview) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      setP(
        await submit("quote", {
          revision: previous.revision,
          reviewed_hash: previous.reviewed_hash,
          item_id: id,
          selected,
        }),
      );
    } catch (e) {
      setP(previous);
      if (e instanceof ApiError && e.status === 409) setStale(true);
      else if (e instanceof ApiError && [404, 410].includes(e.status))
        setEnded(true);
      else
        setError(
          "Your selection wasn’t saved. Your previous choices are still here. Please try again.",
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function download(id: string) {
    if (preview) return;
    try {
      const response = await fetch(`/api/public/${token}/files/${id}`, {
        headers,
      });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "signed-proposal.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(
        "Your signature is safe. We couldn’t download the copy. Please try again.",
      );
    }
  }
  const hasContract = p?.content.some(
    (b) =>
      b.type === "contract" ||
      (b.type === "heading" &&
        /contract|statement of work/i.test(b.text ?? "")),
  );
  const missingChoice =
    !!p &&
    p.quote.some(
      (i) =>
        i.choice_group_id &&
        !p.quote.some(
          (v) => v.choice_group_id === i.choice_group_id && v.selected,
        ),
    );
  const go = (value: typeof step) => {
    setError("");
    setStep(value);
  };
  return (
    <div
      className={`client-flow ${phone ? "flow-phone-preview" : ""}`}
      style={
        {
          "--accent": brand.accent_colour ?? "#365C4A",
          "--client-accent": brand.accent_colour ?? "#365C4A",
          "--client-accent-text":
            accentText(brand.accent_colour ?? "#365C4A") === "#000000"
              ? `color-mix(in srgb, ${brand.accent_colour ?? "#365C4A"} 45%, black)`
              : (brand.accent_colour ?? "#365C4A"),
          "--on-accent": accentText(brand.accent_colour ?? "#365C4A"),
        } as React.CSSProperties
      }
    >
      {p && (
        <style>
          {fontCss({ proposal_fonts: p.proposal_fonts }, (f) =>
            preview
              ? `/api/workspace-fonts/${f.id}`
              : `/api/public/${token}/fonts/${f.id}`,
          )}
        </style>
      )}
      {preview && (
        <PreviewControls>
          <strong>Preview, not sent</strong>
          <div className="toolbar">
            {(
              [
                ["read", "Reading view"],
                ["sign", "Signing step"],
                ["billing", "Billing step"],
              ] as const
            ).map(([s, label]) => (
              <Button key={s} onClick={() => go(s)}>
                {label}
              </Button>
            ))}
            <Button onClick={() => setPhone(false)}>Desktop width</Button>
            <Button onClick={() => setPhone(true)}>Phone width</Button>
          </div>
        </PreviewControls>
      )}
      <header className="client-header flow-header">
        <div>
          {brand.logo ? (
            <img
              src={
                preview
                  ? `/api/proposals/${token}/preview-logo`
                  : `/api/public/${token}/brand/logo`
              }
              alt={brand.name}
            />
          ) : (
            <strong>{brand.name}</strong>
          )}
        </div>
        <div className="flow-header-end">
          {p && !locked && !ended && (
            <span>
              {activeStep === "done"
                ? "Done"
                : `Step ${activeStep === "read" ? 1 : activeStep === "sign" ? 2 : 3} of ${recurring || requiresCheckout ? 3 : 2} · ${activeStep === "read" ? "Review" : activeStep === "sign" ? "Sign" : "Billing"}`}
            </span>
          )}
        </div>
      </header>
      {p && !locked && !ended && (
        <ol className="flow-progress" aria-label="Proposal progress">
          {[
            "Review",
            "Sign",
            ...(recurring || requiresCheckout ? ["Billing"] : []),
          ].map((label, index) => (
            <li
              key={label}
              aria-current={
                activeStep === label.toLowerCase() ||
                (label === "Review" && activeStep === "read")
                  ? "step"
                  : undefined
              }
              className={
                activeStep === "done" ||
                index <=
                  (activeStep === "read" ? 0 : activeStep === "sign" ? 1 : 2)
                  ? "reached"
                  : ""
              }
            >
              <span className="sr-only">{label}</span>
            </li>
          ))}
        </ol>
      )}
      <main
        className={`client-body flow-body ${review ? "flow-review" : ""}`}
        ref={main}
        tabIndex={-1}
        style={{ paddingBottom: barHeight + 32 }}
      >
        {ended ? (
          <section className="flow-state">
            <Icon name="lock" />
            <h1>
              {brand.ended === "expired"
                ? "This proposal has expired"
                : brand.ended === "declined"
                  ? "This proposal was declined"
                  : "This link is no longer active"}
            </h1>
            <p>
              {brand.ended === "expired"
                ? "If you’d still like to go ahead, ask for a current version."
                : brand.ended === "declined"
                  ? "If your plans change, ask for a new proposal."
                  : "Check your email for the newest link, or ask the sender to send it again."}
            </p>
          </section>
        ) : locked ? (
          <section className="flow-state">
            <Icon name="lock" />
            <h1>Enter the password to open your proposal</h1>
            <p>{brand.name} sent the password separately from the link.</p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <div className="field">
                <label htmlFor="proposal-password">Password</label>
                <div className="flow-password">
                  <input
                    id="proposal-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              {error && <p role="alert">{error}</p>}
              <Button type="submit" variant="primary" busy={busy}>
                Open proposal
              </Button>
            </form>
          </section>
        ) : !p ? (
          <div className="flow-loading">
            {error ? (
              <Banner
                title="Please try again"
                tone="danger"
                action={<Button onClick={load}>Try again</Button>}
              >
                {error}
              </Banner>
            ) : (
              <Skeleton kind="document" label="Opening your proposal…" />
            )}
          </div>
        ) : (
          <>
            {error && (
              <Banner
                title={signed ? "Your proposal is signed" : "Please try again"}
                tone="danger"
              >
                {error}
              </Banner>
            )}
            {stale && !review && (
              <div className="flow-stale">
                <Banner
                  tone="warning"
                  title="This proposal changed while you were reading it"
                  action={<Button onClick={load}>Reload and review</Button>}
                >
                  The pricing or wording is different from what is on your
                  screen. Reload to see the current version before you sign.
                </Banner>
              </div>
            )}
            {signed || step === "billing" || step === "done" ? (
              <section className="flow-result stack">
                <div className="flow-result-summary stack">
                  <p className="flow-success">
                    <Icon name="verified" />{" "}
                    {p.status === "completed"
                      ? "Completed copy"
                      : `Signed. Thank you${firstName ? `, ${firstName}` : ""}.`}
                  </p>
                  <p>
                    {preview
                      ? "This is a preview. No signature or billing has been submitted."
                      : `Your proposal is signed. Your copy will be sent to ${p.recipient.email}.`}
                  </p>
                  {finishingReturn ? (
                    <>
                      <h1>Payment details received — finishing setup…</h1>
                      <p role="status">
                        {returnTimedOut
                          ? "This can take a minute. We'll email you when it's done."
                          : "We’re checking the confirmation from Stripe. Your signature is safe."}
                      </p>
                      {confirmations.length > 0 && (
                        <BillingConfirmationCard
                          confirmations={confirmations}
                          timezone={p.timezone}
                          cents={p.money_cents}
                        />
                      )}
                      {returnTimedOut && (
                        <Button
                          onClick={() => {
                            setReturnTimedOut(false);
                            setPollCycle((c) => c + 1);
                          }}
                        >
                          Check again
                        </Button>
                      )}
                    </>
                  ) : step !== "done" && requiresCheckout ? (
                    <>
                      <h1>
                        {checkout.length &&
                        checkout.every((s) => s.mode === "setup")
                          ? "Save a card for your subscription"
                          : checkout.length &&
                              checkout.every((s) =>
                                s.lines.every((l) => l.interval === "year"),
                              )
                            ? "Set up your yearly subscription"
                            : "Set up your monthly subscription"}
                      </h1>
                      {confirmations.length > 0 && (
                        <BillingConfirmationCard
                          confirmations={confirmations}
                          timezone={p.timezone}
                          cents={p.money_cents}
                        />
                      )}
                      <p>
                        Only the recurring services below are arranged through
                        Stripe. One-time fees are invoiced separately.
                      </p>
                      {checkout.length > 1 && (
                        <p>Each group has its own secure checkout.</p>
                      )}
                      <BillingRecurringTotal
                        lines={checkout
                          .filter((s) => s.mode !== "setup")
                          .flatMap((s) => s.lines)}
                        currency={p.currency}
                        cents={p.money_cents}
                      />
                      {billing.some(
                        (b) =>
                          b.status === "failed" || b.status === "needs_review",
                      ) && (
                        <Banner
                          tone="warning"
                          title="Your proposal is signed. Billing needs attention."
                        >
                          You can try secure checkout again, or contact{" "}
                          {contact.name || "the sender"} for help.
                        </Banner>
                      )}
                      {checkout.length ? (
                        checkout.map((session, index) => (
                          <section
                            className="flow-checkout-group"
                            key={session.url || index}
                          >
                            <BillingItems
                              lines={session.lines}
                              currency={p.currency}
                              cents={p.money_cents}
                            />
                            {session.lines.map((line) => (
                              <Terms
                                key={line.id}
                                line={line}
                                currency={p.currency}
                              />
                            ))}
                            {session.mode === "setup" && (
                              <BillingRecurringTotal
                                lines={session.lines}
                                currency={p.currency}
                                cents={p.money_cents}
                                setup
                              />
                            )}
                            {session.mode === "setup" && (
                              <p>
                                {(session.collection_method ??
                                  p.billing_collection_method) ===
                                "send_invoice"
                                  ? `Save a card for your ${session.lines.every((l) => l.interval === "year") ? "yearly" : "monthly"} subscription — no charge today; your first invoice will be emailed.`
                                  : "No charge is taken in this card-saving step. Your subscription starts after your card is saved, and the first charge follows."}
                              </p>
                            )}
                            {session.mode !== "setup" && (
                              <p>
                                You’ll be charged{" "}
                                {formatMoney(
                                  session.amount_due_today ??
                                    session.lines.reduce(
                                      (sum, l) => sum + l.amount * l.qty,
                                      0,
                                    ),
                                  p.currency,
                                  p.money_cents,
                                )}{" "}
                                today.
                              </p>
                            )}
                            {session.lines.length ? (
                              preview ? (
                                <Button variant="primary" disabled>
                                  {checkoutActionLabel(
                                    session,
                                    p.currency,
                                    p.money_cents,
                                    p.billing_collection_method,
                                  )}
                                </Button>
                              ) : (
                                <a className="btn primary" href={session.url}>
                                  {checkoutActionLabel(
                                    session,
                                    p.currency,
                                    p.money_cents,
                                    p.billing_collection_method,
                                  )}
                                </a>
                              )
                            ) : (
                              <p role="status">
                                The itemized checkout details are unavailable.
                                Contact the sender before continuing.
                              </p>
                            )}
                          </section>
                        ))
                      ) : (
                        <p role="status">
                          Your secure checkout link is being prepared. Your
                          signature is saved.
                        </p>
                      )}
                      {existing.length > 0 && (
                        <section className="flow-added-items">
                          <h2>Added to your subscription</h2>
                          <BillingItems
                            lines={existing}
                            currency={p.currency}
                            cents={p.money_cents}
                          />
                          <BillingRecurringTotal
                            lines={existing}
                            currency={p.currency}
                            cents={p.money_cents}
                            added
                          />
                        </section>
                      )}
                      <SeparateInvoice
                        proposal={p}
                        lines={display?.oneTime ?? []}
                      />
                      <Button variant="ghost" onClick={() => go("done")}>
                        I’ll do this later
                      </Button>
                      <small>
                        We’ll email the same billing link so you can finish
                        later.
                      </small>
                    </>
                  ) : step !== "done" &&
                    existing.length > 0 &&
                    !requiresCheckout ? (
                    <>
                      <h1>Billing is already taken care of</h1>
                      <p>
                        These services were added to your existing subscription
                        and will appear on your next invoice. No payment setup
                        is needed here.
                      </p>
                      <h2>Added to your subscription</h2>
                      <BillingItems
                        lines={existing}
                        currency={p.currency}
                        cents={p.money_cents}
                      />
                      <BillingRecurringTotal
                        lines={existing}
                        currency={p.currency}
                        cents={p.money_cents}
                        added
                      />
                      <SeparateInvoice
                        proposal={p}
                        lines={display?.oneTime ?? []}
                      />
                      <Button variant="primary" onClick={() => go("done")}>
                        Done
                      </Button>
                    </>
                  ) : (
                    <>
                      {confirmations.length > 0 && (
                        <BillingConfirmationCard
                          confirmations={confirmations}
                          timezone={p.timezone}
                          cents={p.money_cents}
                        />
                      )}
                      <p className="flow-eyebrow">
                        {p.status === "completed"
                          ? "Both signatures complete"
                          : "Signed by you · awaiting countersignature"}
                      </p>
                      <h1>
                        {p.status === "completed"
                          ? "Your completed copy"
                          : `You’re all set${firstName ? `, ${firstName}` : ""}.`}
                      </h1>
                      <p>
                        {p.status === "completed"
                          ? "The final sealed copy will be emailed to you."
                          : `${p.company.signatory_name || brand.name} will countersign, then we’ll email the final sealed copy.`}
                      </p>
                      <ol className="flow-checklist">
                        <li>
                          <Icon name="verified" />
                          <div>
                            You signed
                            <small>
                              {date(
                                p.signers.find((s) => s.role === "client")
                                  ?.signed_at,
                              )}
                            </small>
                          </div>
                        </li>
                        <li>
                          <Icon
                            name={requiresCheckout ? "clock" : "verified"}
                          />
                          <div>
                            {requiresCheckout
                              ? "Billing still to finish"
                              : billing.some(
                                    (b) =>
                                      b.status === "failed" ||
                                      b.status === "needs_review",
                                  )
                                ? "Billing will be reviewed separately. Your signature is safe."
                                : !recurring
                                  ? "One-time items are invoiced separately"
                                  : !billing.length ||
                                      billing.some(
                                        (b) => b.status !== "succeeded",
                                      )
                                    ? "Billing is being prepared. Your signature is safe."
                                    : "Billing arranged"}
                            {requiresCheckout && (
                              <Button onClick={() => go("billing")}>
                                Finish billing
                              </Button>
                            )}
                            <small>
                              One-time items are invoiced separately.
                            </small>
                          </div>
                        </li>
                        <li>
                          <Icon
                            name={
                              p.status === "completed"
                                ? "verified"
                                : "signature"
                            }
                          />
                          <div>
                            {p.status === "completed"
                              ? `${p.company.signatory_name || brand.name} countersigned`
                              : `${p.company.signatory_name || brand.name} countersigns`}
                            <small>
                              For {brand.name}.{" "}
                              {p.status !== "completed" &&
                                "Nothing needed from you."}
                            </small>
                          </div>
                        </li>
                        <li>
                          <Icon name="download" />
                          <div>
                            {p.files.some((f) => f.stage === "company")
                              ? "Final sealed copy available"
                              : "Final sealed copy will be emailed to you"}
                          </div>
                        </li>
                      </ol>
                    </>
                  )}
                  <div className="flow-copy-actions">
                    {p.files.map((f) => (
                      <Button
                        key={f.id}
                        icon="download"
                        onClick={() => download(f.id)}
                      >
                        {f.stage === "company"
                          ? "Download the final copy"
                          : "Download your signed copy"}
                      </Button>
                    ))}
                    {step === "done" && !p.files.length && (
                      <p role="status">
                        Your signature is saved. Your signed copy is being
                        sealed and will arrive by email.
                      </p>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => setShowCopy(!showCopy)}
                    >
                      {showCopy
                        ? "Hide the signed proposal"
                        : "View the signed proposal"}
                    </Button>
                  </div>
                </div>
                {showCopy && <FlowDocument proposal={p} frozen />}
              </section>
            ) : step === "sign" ? (
              <section className="flow-sign">
                <div className="flow-sign-intro">
                  <Button variant="ghost" onClick={() => go("read")}>
                    ← Back to proposal
                  </Button>
                  <h1>Sign the proposal</h1>
                  <p>Check what you’re agreeing to, then add your signature.</p>
                </div>
                <section className="flow-acceptance">
                  <p className="flow-eyebrow">You’re accepting</p>
                  <h2>{p.title}</h2>
                  <ChosenItems proposal={p} terms />
                  <FlowTotals proposal={p} />
                  {hasContract && (
                    <p>
                      and the Statement of Work &amp; Contract dated{" "}
                      {date(p.sent_at)}.{" "}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReadSection(
                            p.content.findIndex(
                              (b) =>
                                b.type === "contract" ||
                                (b.type === "heading" &&
                                  /contract|statement of work/i.test(
                                    b.text ?? "",
                                  )),
                            ),
                          );
                          go("read");
                        }}
                      >
                        Read
                      </Button>
                    </p>
                  )}
                </section>
                <SignatureForm
                  preview={preview}
                  consentText={p.consent_text}
                  name={p.recipient.name}
                  email={p.recipient.email}
                  signerTitle={p.recipient.title}
                  revision={p.revision}
                  reviewedHash={p.reviewed_hash}
                  label="Sign proposal"
                  contactName={contact.name}
                  contactEmail={contact.email}
                  company={brand.name}
                  blocked={stale || busy || missingChoice}
                  blockedReason={
                    missingChoice
                      ? "Go back and choose one item in each choice group."
                      : undefined
                  }
                  onSign={async (value) => {
                    if (preview || stale || busy) return;
                    try {
                      const valueP = await submit("sign", value);
                      setP(valueP);
                      go(
                        quoteSublines(valueP.quote as QuoteItem[]).some(
                          (l) =>
                            (!l.optional || l.selected) &&
                            l.interval !== "one_time",
                        ) || valueP.billing.some((b) => b.requires_checkout)
                          ? "billing"
                          : "done",
                      );
                    } catch (e) {
                      if (e instanceof ApiError && e.status === 409)
                        setStale(true);
                      else if (
                        e instanceof ApiError &&
                        [404, 410].includes(e.status)
                      )
                        setEnded(true);
                      throw e;
                    }
                  }}
                />
              </section>
            ) : (
              <>
                <FlowDocument
                  proposal={p}
                  frozen={stale}
                  busy={busy}
                  onToggle={toggle}
                />
                <aside
                  className="flow-choices"
                  ref={bar}
                  aria-label="Your choices"
                >
                  {stale ? (
                    <Banner
                      tone="warning"
                      title="This proposal changed while you were reading it"
                      action={<Button onClick={load}>Reload and review</Button>}
                    >
                      The pricing or wording is different from what is on your
                      screen. Review the current version before signing.
                    </Banner>
                  ) : (
                    <>
                      <div className="flow-desktop-choices">
                        <h2>Your choices</h2>
                        <ChosenItems proposal={p} />
                      </div>
                      <FlowTotals proposal={p} />
                      <Button
                        variant="primary"
                        disabled={busy}
                        note={busy ? "Saving your selection…" : undefined}
                        onClick={() => go("sign")}
                      >
                        Review and sign
                      </Button>
                      {p.valid_until && (
                        <small className="flow-desktop-choices">
                          Valid until {readableDate(p.valid_until, p.timezone)}
                        </small>
                      )}
                    </>
                  )}
                </aside>
                <div className="flow-document-footer">
                  {declining ? (
                    <section className="card stack">
                      <h2>Decline this proposal?</h2>
                      <p>
                        {contact.name || "The sender"} will be told you’ve
                        decided not to go ahead. The link will close.
                      </p>
                      <label className="field">
                        Note (optional)
                        <textarea
                          maxLength={2000}
                          value={declineNote}
                          disabled={busy}
                          onChange={(e) => setDeclineNote(e.target.value)}
                        />
                      </label>
                      <div className="actions">
                        <Button
                          variant="danger"
                          disabled={preview || busy}
                          onClick={async () => {
                            if (preview || pending.current) return;
                            pending.current = true;
                            setBusy(true);
                            try {
                              await submit("decline", { note: declineNote });
                              setBrand({ ...brand, ended: "declined" });
                              setEnded(true);
                            } catch {
                              setError(
                                "We couldn’t decline the proposal. Please try again.",
                              );
                            } finally {
                              pending.current = false;
                              setBusy(false);
                            }
                          }}
                        >
                          Decline proposal
                        </Button>
                        <Button onClick={() => setDeclining(false)}>
                          Go back
                        </Button>
                      </div>
                    </section>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={preview || stale}
                      onClick={() => setDeclining(true)}
                    >
                      Decline this proposal
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        <Contact
          name={contact.name}
          email={contact.email}
          company={brand.name}
        />
        <ContactToast />
      </main>
    </div>
  );
}
export function FlowTotals({ proposal: p }: { proposal: PublicProposal }) {
  return (
    <div className="totals flow-totals" aria-label="Proposal totals">
      <div>
        <span>One-time</span>
        <strong>
          {formatMoney(p.totals.one_time_total, p.currency, p.money_cents)}
        </strong>
      </div>
      <div>
        <span>Monthly</span>
        <strong>
          {formatMoney(p.totals.monthly_total, p.currency, p.money_cents)}
          <small>/mo</small>
        </strong>
      </div>
      {p.quote.some((i) => i.sublines.some((s) => s.interval === "year")) && (
        <div>
          <span>Yearly</span>
          <strong>
            {formatMoney(p.totals.yearly_total, p.currency, p.money_cents)}
            <small>/yr</small>
          </strong>
        </div>
      )}
    </div>
  );
}
function Terms({ line: l, currency }: { line: BillingLine; currency: string }) {
  return (
    <>
      {l.schedule && (
        <p className="flow-terms">
          {money(l.amount, currency)}/{l.interval === "year" ? "year" : "month"}{" "}
          for {l.schedule.after_paid_invoices} paid invoices, then{" "}
          {money(l.schedule.then.amount, currency)}/
          {l.interval === "year" ? "year" : "month"}.
        </p>
      )}
      {!!l.min_term_months && (
        <p className="flow-terms">
          {l.min_term_months}-month minimum commitment.
        </p>
      )}
    </>
  );
}
function ChosenItems({
  proposal: p,
  terms = false,
}: {
  proposal: PublicProposal;
  terms?: boolean;
}) {
  return (
    <ul className="flow-chosen">
      {orderedItems(p.quote as QuoteItem[])
        .filter((i) => !i.optional || i.selected)
        .map((i) => (
          <li key={i.id}>
            <span>
              {i.name}
              {terms && (
                <Terms
                  line={
                    quoteSublines([i]).find((l) => l.interval !== "one_time") ??
                    quoteSublines([i])[0]
                  }
                  currency={p.currency}
                />
              )}
            </span>
            <span>
              {i.sublines.map((s) => (
                <span key={s.id} style={{ display: "block" }}>
                  {formatMoney(s.amount * s.qty, p.currency, p.money_cents)}
                  {intervalSuffix(s.interval)}
                </span>
              ))}
            </span>
          </li>
        ))}
    </ul>
  );
}

function Contact({
  name,
  email,
  company,
}: {
  name: string;
  email: string;
  company: string;
}) {
  return (
    <footer className="flow-sender-contact">
      <span>
        Questions? Contact{" "}
        {email ? (
          <a href={`mailto:${email}`}>{name || company || "the sender"}</a>
        ) : (
          name || company || "the sender"
        )}
      </span>
      {email && (
        <button
          className="contact-copy"
          type="button"
          aria-label={`Copy sender email: ${email}`}
          onClick={() => void copyContactValue(email)}
        >
          {email}
          <Icon name="copy" />
        </button>
      )}
    </footer>
  );
}
function SeparateInvoice({
  proposal: p,
  lines,
}: {
  proposal: PublicProposal;
  lines: BillingLine[];
}) {
  return lines.length ? (
    <section className="flow-separate-invoice">
      <h2>Invoiced separately</h2>
      <BillingItems lines={lines} currency={p.currency} cents={p.money_cents} />
      <p>
        {p.invoice_method === "quickbooks"
          ? "You'll receive a QuickBooks invoice for these one-time fees."
          : "We'll send you an invoice for these one-time fees."}
      </p>
    </section>
  ) : null;
}
function FlowDocument({
  proposal: p,
  frozen = false,
  busy = false,
  onToggle,
}: {
  proposal: PublicProposal;
  frozen?: boolean;
  busy?: boolean;
  onToggle?: (id: string, selected: boolean) => void;
}) {
  const content = selectedContent(p.content, p.quote as QuoteItem[]);
  const sections = content
    .map((block, index) => ({ block, index }))
    .filter(
      ({ block, index }) =>
        block.type === "heading" &&
        !(index === 0 && resolve(block.text ?? "", p.variables) === p.title),
    );
  return (
    <article
      className="paper flow-document proposal-typography"
      id="proposal-document"
    >
      <p className="flow-eyebrow">Proposal for {p.recipient.company}</p>
      <h1>{p.title}</h1>
      <p className="flow-byline">
        From {p.contact.name || p.company.name}
        {p.valid_until && (
          <> · Valid until {readableDate(p.valid_until, p.timezone)}</>
        )}
      </p>
      {sections.length > 1 && (
        <details className="flow-outline">
          <summary>
            On this page <small>{sections.length} sections</small>
          </summary>
          <nav>
            {sections.map(({ block, index }) => (
              <a key={index} href={`#section-${index}`}>
                {(block.text ?? "").replace(
                  /\{\{([^}]+)\}\}/g,
                  (_, key) => p.variables[key] ?? key,
                )}
              </a>
            ))}
          </nav>
        </details>
      )}
      {content.map((block, index) =>
        index === 0 &&
        block.type === "heading" &&
        resolve(block.text ?? "", p.variables) ===
          p.title ? null : block.type === "pricing_table" ? (
          <section key={index} id={`section-${index}`}>
            <h2>Your investment</h2>
            {!frozen && (
              <p>Optional items are your choice. Totals update as you go.</p>
            )}
            <div className="flow-quote">
              <ClientItems
                proposal={p}
                frozen={frozen}
                busy={busy}
                onToggle={onToggle}
              />
            </div>
          </section>
        ) : block.type === "contract" ? (
          <section
            key={index}
            id={`section-${index}`}
            className="flow-contract"
          >
            <h2>{block.text || "Statement of Work & Contract"}</h2>
            {(block.clauses ?? []).map((c) => (
              <details key={c.id}>
                <summary>{resolve(c.heading, p.variables)}</summary>
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {resolve(c.body, p.variables)}
                </p>
              </details>
            ))}
          </section>
        ) : block.type === "signature_block" ? (
          <ClientSignatureBlock
            key={index}
            proposal={p}
            role={block.role ?? "client"}
          />
        ) : (
          <div
            id={`section-${index}`}
            key={index}
            dangerouslySetInnerHTML={{
              __html: renderBlocks(
                [block],
                p.quote as QuoteItem[],
                p.variables,
                p.currency,
              ),
            }}
          />
        ),
      )}
      <p className="muted document-end">
        {p.valid_until && (
          <>Valid until {readableDate(p.valid_until, p.timezone)} · </>
        )}
        From {p.company.name}
      </p>
    </article>
  );
}

function ClientItems({
  proposal: p,
  frozen,
  busy,
  onToggle,
}: {
  proposal: PublicProposal;
  frozen: boolean;
  busy: boolean;
  onToggle?: (id: string, value: boolean) => void;
}) {
  const items = orderedItems(p.quote as QuoteItem[]),
    units = Array.from(new Set(items.map((i) => i.choice_group_id ?? i.id)));
  function option(i: QuoteItem) {
    const active = !i.optional || !!i.selected;
    const body = (
      <div>
        <div className="flow-line-title">
          <strong>{i.name}</strong>
        </div>
        {i.description && <p>{i.description}</p>}
        {i.sublines.map((s) => (
          <div className="flow-subline" key={s.id}>
            <span>
              {s.label ||
                (s.interval === "one_time"
                  ? "One-time"
                  : s.interval === "month"
                    ? "Monthly"
                    : "Yearly")}
              {s.qty !== 1 && ` × ${s.qty}`}
            </span>
            <strong>
              {formatMoney(s.amount * s.qty, p.currency, p.money_cents)}
              {intervalSuffix(s.interval)}
            </strong>
          </div>
        ))}
        {i.schedule && (
          <p className="flow-terms">
            {formatMoney(
              i.sublines.find((s) => s.interval !== "one_time")?.amount ?? 0,
              p.currency,
              p.money_cents,
            )}
            /{i.sublines.some((s) => s.interval === "year") ? "year" : "month"}{" "}
            for {i.schedule.after_paid_invoices} paid invoices, then{" "}
            {formatMoney(i.schedule.then.amount, p.currency, p.money_cents)}/
            {i.sublines.some((s) => s.interval === "year") ? "year" : "month"}.
          </p>
        )}
        {typeof i.plan_terms?.client_copy === "string" &&
          i.plan_terms.client_copy && (
            <p className="flow-terms">{i.plan_terms.client_copy}</p>
          )}
        {i.min_term_months && (
          <p className="flow-terms">
            {i.min_term_months}-month minimum commitment.
          </p>
        )}
        <small>
          {i.optional ? (active ? "Included" : "Not included") : "Required"}
        </small>
      </div>
    );
    return i.optional && !frozen ? (
      <label
        className={`flow-quote-line ${active ? "selected" : ""}`}
        key={i.id}
      >
        <input
          type={i.choice_group_id ? "radio" : "checkbox"}
          name={i.choice_group_id ?? i.id}
          checked={active}
          disabled={busy}
          onChange={(e) => onToggle?.(i.id, e.target.checked)}
        />
        {body}
      </label>
    ) : (
      <div className="flow-quote-line" key={i.id}>
        <Icon name="lock" />
        {body}
      </div>
    );
  }
  return (
    <>
      {units.map((id) => {
        const group = items.filter((i) => (i.choice_group_id ?? i.id) === id);
        return group[0].choice_group_id ? (
          <div
            role="radiogroup"
            aria-label="Choose one"
            className="flow-choice-group"
            key={id}
          >
            <h3>Choose one</h3>
            {group.map(option)}
          </div>
        ) : (
          option(group[0])
        );
      })}
    </>
  );
}

/** Staff-only preview bar. Publishes its height so sticky client panels sit below it. */
function PreviewControls({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty("--preview-controls-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--preview-controls-h");
    };
  }, []);
  return (
    <aside ref={ref} className="preview-controls" aria-label="Preview controls">
      {children}
    </aside>
  );
}
