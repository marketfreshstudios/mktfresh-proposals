"use client";
import {
  chooseItem,
  flatQuote,
  orderedItems,
  selectedContent,
} from "../lib/quote-model";
import type { QuoteItem } from "../lib/model";
import { useEffect, useRef, useState } from "react";
import { accentText } from "../lib/branding";
import { formatMoney, intervalSuffix } from "../lib/money";
import { money, totals, renderBlocks, resolve } from "../lib/presentation";
import type { Line } from "../lib/model";
import type { publicResult } from "../lib/service";
import {
  LegacyClientProposal,
  ClientSignatureBlock,
} from "./legacy-client-proposal";
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
  client_flow_version?: number;
};
const emptyBrand: Brand = { name: "Proposal", email: "" };
// Rendering is selected by the saved send version, never by the current workspace.
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
    legacy: boolean;
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
            legacy: (value.client_flow_version ?? 1) !== 2,
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
  if (route.legacy)
    return <LegacyClientProposal token={token} preview={preview} />;
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
    [showCopy, setShowCopy] = useState(false),
    [verify, setVerify] = useState("");
  const bar = useRef<HTMLDivElement>(null),
    main = useRef<HTMLElement>(null),
    pending = useRef(false);
  const [barHeight, setBarHeight] = useState(0);
  const [readSection, setReadSection] = useState<number | null>(null);
  const headers = { "x-proposal-password": password };
  const signed = !!p && ["signed_by_client", "completed"].includes(p.status);
  const recurring = !!p?.quote.some(
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
  const checkout = billing.flatMap((b) =>
    b.requires_checkout ? b.checkout : [],
  );
  const requiresCheckout = billing.some((b) => b.requires_checkout);
  const existing = billing.flatMap((b) => b.added_existing);
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
            value.quote.some(
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
    if (preview || !signed) return;
    let ticks = 0,
      active = true;
    const timer = setInterval(() => {
      if (++ticks > 60) {
        clearInterval(timer);
        return;
      }
      void api<PublicProposal>(`/api/public/${token}`, { headers })
        .then((value) => {
          if (active) setP(value);
        })
        .catch(() => {});
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [signed, token, password, preview]);
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
      items =
        p.quote_model_version === 3
          ? chooseItem(p.items as QuoteItem[], id, selected)
          : p.items,
      quote =
        p.quote_model_version === 3
          ? flatQuote(items as QuoteItem[])
          : p.quote.map((l) => (l.id === id ? { ...l, selected } : l)),
      t = totals(quote as Line[]);
    const fmt = (n: number) =>
      p.money_format_version === 2
        ? formatMoney(n, p.currency, p.money_cents)
        : money(n, p.currency);
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
      items,
      totals: t,
      variables,
      html: renderBlocks(p.content, quote as Line[], variables, p.currency),
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
    p.quote_model_version === 3 &&
    p.items.some(
      (i) =>
        i.choice_group_id &&
        !p.items.some(
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
      {preview && (
        <aside className="preview-controls" aria-label="Preview controls">
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
        </aside>
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
            <Contact
              name={contact.name}
              email={contact.email}
              company={brand.name}
            />
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
                {step !== "done" && requiresCheckout ? (
                  <>
                    <h1>One more step: set up your billing</h1>
                    <p>
                      You’ll add a card on Stripe’s secure page, then come
                      straight back here. One-time items are invoiced
                      separately.
                    </p>
                    <FlowTotals proposal={p} />
                    {p.quote
                      .filter((l) => !l.optional || l.selected)
                      .map((l) => (
                        <Terms
                          key={l.id}
                          line={l as Line}
                          currency={p.currency}
                        />
                      ))}
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
                    {preview ? (
                      <Button variant="primary" disabled>
                        Continue to secure checkout (preview)
                      </Button>
                    ) : checkout.length ? (
                      checkout.map((s, i) => (
                        <a key={s.url} className="btn primary" href={s.url}>
                          Continue to secure checkout
                          {checkout.length > 1 ? ` ${i + 1}` : ""}
                        </a>
                      ))
                    ) : (
                      <p role="status">
                        Your secure checkout link is being prepared. Your
                        signature is saved.
                      </p>
                    )}
                    <Button variant="ghost" onClick={() => go("done")}>
                      I’ll do this later
                    </Button>
                    <small>
                      We’ll email the same billing link so you can finish later.
                    </small>
                  </>
                ) : step !== "done" &&
                  existing.length > 0 &&
                  !requiresCheckout ? (
                  <>
                    <h1>Billing is already taken care of</h1>
                    <p>
                      These items have been added to your existing billing. No
                      payment setup is needed here. They will appear on your
                      next invoice.
                    </p>
                    <FlowTotals proposal={p} />
                    <p>
                      New monthly total:{" "}
                      {formatMoney(
                        existing.reduce((sum, b) => sum + b.monthly_total, 0),
                        p.currency,
                        p.money_cents,
                      )}
                      /mo
                      {p.quote.some((l) => l.interval === "year") &&
                        ` · New yearly total: ${formatMoney(
                          existing.reduce(
                            (sum, b) => sum + (b.yearly_total ?? 0),
                            0,
                          ),
                          p.currency,
                          p.money_cents,
                        )}/yr`}
                      . One-time items are invoiced separately.
                    </p>
                    <Button variant="primary" onClick={() => go("done")}>
                      Done
                    </Button>
                  </>
                ) : (
                  <>
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
                        <Icon name={requiresCheckout ? "clock" : "verified"} />
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
                          <small>One-time items are invoiced separately.</small>
                        </div>
                      </li>
                      <li>
                        <Icon
                          name={
                            p.status === "completed" ? "verified" : "signature"
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
                      Your signature is saved. Your signed copy is being sealed
                      and will arrive by email.
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
                  {p.files.length > 0 && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const f = p.files.at(-1)!;
                          const result = await api<{ valid: boolean }>(
                            `/api/public/${token}/files/${f.id}/verify`,
                            { headers },
                          );
                          setVerify(
                            result.valid
                              ? "Matches — this file is unchanged since sealing."
                              : "Verification failed — please contact us.",
                          );
                        } catch {
                          setVerify(
                            "Unable to verify right now. Please try again.",
                          );
                        }
                      }}
                    >
                      Verify this document
                    </Button>
                  )}
                  {verify && <p role="status">{verify}</p>}
                </div>
                {showCopy && <FlowDocument proposal={p} frozen />}
                <Contact
                  name={contact.name}
                  email={contact.email}
                  company={brand.name}
                />
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
                        valueP.quote.some(
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
                      <small className="flow-desktop-choices">
                        Valid until {date(p.valid_until)}
                      </small>
                    </>
                  )}
                </aside>
                <div className="flow-document-footer">
                  <p>
                    Questions?{" "}
                    <Contact
                      name={contact.name}
                      email={contact.email}
                      company={brand.name}
                      compact
                    />
                  </p>
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
      {p.quote.some((l) => l.interval === "year") && (
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
function Terms({ line: l, currency }: { line: Line; currency: string }) {
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
  if (p.quote_model_version === 3)
    return (
      <ul className="flow-chosen">
        {orderedItems(p.items as QuoteItem[])
          .filter((i) => !i.optional || i.selected)
          .map((i) => (
            <li key={i.id}>
              <span>
                {i.name}
                {terms && (
                  <Terms
                    line={
                      flatQuote([i]).find((l) => l.interval !== "one_time") ??
                      flatQuote([i])[0]
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
  return (
    <ul className="flow-chosen">
      {p.quote
        .filter((l) => !l.optional || l.selected)
        .map((l) => (
          <li key={l.id}>
            <span>
              {l.name}
              {terms && <Terms line={l as Line} currency={p.currency} />}
            </span>
            <span>
              {formatMoney(l.amount * l.qty, p.currency, p.money_cents)}
              {intervalSuffix(l.interval)}
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
  compact = false,
}: {
  name: string;
  email: string;
  company: string;
  compact?: boolean;
}) {
  return compact ? (
    <>
      {email ? (
        <a href={`mailto:${email}`}>Email {name || company}</a>
      ) : (
        "Reply to the person who sent you this link."
      )}
    </>
  ) : (
    <div className="flow-contact">
      <strong>{name || company}</strong>
      <p>
        {company}
        {email && ` · ${email}`}
      </p>
      {email ? (
        <a className="btn" href={`mailto:${email}`}>
          Email {name || company}
        </a>
      ) : (
        <p>Reply to the person who sent you this link.</p>
      )}
    </div>
  );
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
  const content =
    p.quote_model_version === 3
      ? selectedContent(p.content, p.items as QuoteItem[])
      : p.content;
  const sections = content
    .map((block, index) => ({ block, index }))
    .filter(
      ({ block, index }) =>
        block.type === "heading" &&
        !(index === 0 && resolve(block.text ?? "", p.variables) === p.title),
    );
  return (
    <article className="paper flow-document" id="proposal-document">
      <p className="flow-eyebrow">Proposal for {p.recipient.company}</p>
      <h1>{p.title}</h1>
      <p className="flow-byline">
        From {p.contact.name || p.company.name} · Valid until{" "}
        {date(p.valid_until)}
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
              {p.quote_model_version === 3 ? (
                <ClientItems
                  proposal={p}
                  frozen={frozen}
                  busy={busy}
                  onToggle={onToggle}
                />
              ) : (
                p.quote.map((l) => {
                  const line = (
                    <>
                      <div className="flow-line-title">
                        <strong>{l.name}</strong>
                        <span className="amount">
                          {formatMoney(
                            l.amount * l.qty,
                            p.currency,
                            p.money_cents,
                          )}
                          {intervalSuffix(l.interval)}
                        </span>
                      </div>
                      {l.description && <p>{l.description}</p>}
                      <Terms line={l as Line} currency={p.currency} />
                      {l.qty !== 1 && <small>Quantity {l.qty}</small>}
                      <small>
                        {l.optional
                          ? l.selected
                            ? "Optional · included"
                            : "Optional · not included"
                          : "Required"}
                      </small>
                    </>
                  );
                  return l.optional && !frozen ? (
                    <label
                      className={`flow-quote-line ${l.selected ? "selected" : ""}`}
                      key={l.id}
                    >
                      <input
                        type="checkbox"
                        checked={l.selected}
                        disabled={busy}
                        onChange={(e) => onToggle?.(l.id, e.target.checked)}
                      />
                      <div>{line}</div>
                    </label>
                  ) : (
                    <div className="flow-quote-line" key={l.id}>
                      <Icon name="lock" />
                      <div>{line}</div>
                    </div>
                  );
                })
              )}
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
                p.quote as Line[],
                p.variables,
                p.currency,
              ),
            }}
          />
        ),
      )}
      <p className="muted document-end">
        Valid until {date(p.valid_until)} · From {p.company.name}
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
  const items = orderedItems(p.items as QuoteItem[]),
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
