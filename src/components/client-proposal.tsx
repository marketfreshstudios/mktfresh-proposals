"use client";
import { accentText } from "../lib/branding";
import { useEffect, useState } from "react";
import {
  api,
  post,
  ApiError,
  Banner,
  Button,
  Totals,
  ThemeToggle,
  Icon,
  date,
} from "./ui";
import { SignatureForm } from "./signature";
import { money, totals, renderBlocks } from "../lib/presentation";
import type { Line, SignatureInput } from "../lib/model";
import type { publicResult } from "../lib/service";
type PublicProposal = ReturnType<typeof publicResult>;
export function ClientProposal({ token }: { token: string }) {
  const [p, setP] = useState<PublicProposal | null>(null),
    [password, setPassword] = useState(""),
    [locked, setLocked] = useState(false),
    [ended, setEnded] = useState(false),
    [step, setStep] = useState("read"),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [busy, setBusy] = useState(false),
    [declining, setDeclining] = useState(false),
    [verify, setVerify] = useState("");
  const [brand, setBrand] = useState<{
    name: string;
    email: string;
    logo?: string | null;
    accent_colour?: string;
  }>({ name: "Proposal", email: "" });
  const headers = { "x-proposal-password": password };
  async function load() {
    setBusy(true);
    setError("");
    try {
      const value = await api<PublicProposal>(`/api/public/${token}`, {
        headers,
      });
      setP(value);
      setBrand(value.company);
      setLocked(false);
      setStale(false);
      setStep("read");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLocked(true);
      else if (e instanceof ApiError && [404, 410].includes(e.status))
        setEnded(true);
      else setError(e instanceof Error ? e.message : "Unable to open proposal");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    void api(`/api/public/${token}/brand`)
      .then(setBrand)
      .catch(() => {});
  }, [token]);
  useEffect(() => {
    if (!p || !["signed_by_client", "completed"].includes(p.status)) return;
    let remaining = 20;
    const timer = setInterval(() => {
      if (--remaining < 0) {
        clearInterval(timer);
        return;
      }
      void api<PublicProposal>(`/api/public/${token}`, { headers })
        .then(setP)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [p?.status, token, password]);
  // Password travels in a header, never in the URL or local storage.
  async function submit(path: string, data: unknown) {
    return api<PublicProposal>(`/api/public/${token}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });
  }
  const signed = p && ["signed_by_client", "completed"].includes(p.status),
    billing = p?.billing[0];
  async function toggle(id: string, selected: boolean) {
    if (!p || busy || stale) return;
    const previous = p;
    const quote = p.quote.map((l) => (l.id === id ? { ...l, selected } : l)),
      t = totals(quote as Line[]);
    const map = {
      ...p.variables,
      "quote.one_time_total": money(t.one_time_total, p.currency),
      "quote.monthly_total": money(t.monthly_total, p.currency),
      "quote.yearly_total": money(t.yearly_total, p.currency),
      "quote.selected_items": quote
        .filter((l) => !l.optional || l.selected)
        .map((l) => l.name)
        .join(", "),
    };
    setP({
      ...p,
      quote,
      totals: t,
      variables: map,
      html: renderBlocks(p.content, quote as Line[], map, p.currency),
    });
    setBusy(true);
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
      else
        setError(e instanceof Error ? e.message : "Unable to save selection");
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    try {
      const response = await fetch(`/api/public/${token}/files/${id}`, {
        headers,
      });
      if (!response.ok) throw new Error("Copy is not available yet");
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "signed-proposal.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  const files = p?.files ?? [],
    latest = files.find((f) => f.stage === "company") ?? files[0];
  return (
    <div
      className="client-app"
      style={
        {
          "--workspace-accent": brand.accent_colour ?? "#245547",
          "--workspace-on-accent": accentText(brand.accent_colour ?? "#245547"),
        } as React.CSSProperties
      }
    >
      <header className="client-header">
        <div>
          {brand.logo && <img src={`/api/public/${token}/brand/logo`} alt="" />}
          <strong>{brand.name}</strong>
          {p && !locked && (
            <small style={{ display: "block" }}>{p.recipient.company}</small>
          )}
        </div>
        <ThemeToggle />
      </header>
      <main className="client-body stack">
        {error && (
          <Banner tone="danger" title="Please try again">
            {error}
          </Banner>
        )}
        {ended ? (
          <div className="card">
            <h1>This link is no longer active</h1>
            <p>
              Please use the most recent email, or get in touch for a fresh
              link.
            </p>
            {brand.email && <a href={`mailto:${brand.email}`}>{brand.email}</a>}
          </div>
        ) : locked ? (
          <div className="card">
            <Icon name="lock" />
            <h1>This proposal is password protected</h1>
            <p>Enter the password we sent you to open it.</p>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void load();
              }}
            >
              <label className="field">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <Button type="submit" variant="primary" busy={busy}>
                Open proposal
              </Button>
            </form>
          </div>
        ) : !p ? (
          <p role="status">Opening your proposal…</p>
        ) : (
          <>
            {stale && (
              <Banner
                tone="warning"
                title="This proposal changed while you were reading it"
                action={<Button onClick={load}>Reload and review</Button>}
              >
                The pricing or wording is different from what is on your screen.
                Reload to see the current version before you sign.
              </Banner>
            )}
            {signed ? (
              <>
                <Banner
                  tone="success"
                  title={
                    p.status === "completed"
                      ? "Both signatures are complete"
                      : "Your proposal is signed"
                  }
                >
                  {p.status === "completed"
                    ? "Your final copy is sealed and available below."
                    : `${brand.name} will counter-sign and send your final copy.`}
                </Banner>
                {billing?.requires_checkout ? (
                  <section className="card stack">
                    <h2>One more step: set up your recurring billing</h2>
                    <p>
                      Your proposal is already accepted. One-time items are
                      invoiced separately.
                    </p>
                    <Totals value={p.totals} currency={p.currency} />
                    {billing.checkout.map((s, i) => (
                      <a className="btn primary" key={s.url} href={s.url}>
                        Set up billing{" "}
                        {billing.checkout.length > 1 ? i + 1 : ""}
                      </a>
                    ))}
                    <small>
                      The same link is in your email, so you can finish later.
                    </small>
                  </section>
                ) : Array.isArray(billing?.added_existing) &&
                  billing.added_existing.length > 0 ? (
                  <Banner tone="success" title="Added to your existing billing">
                    New monthly total:{" "}
                    {money(
                      billing.added_existing.reduce(
                        (s: number, v: any) => s + v.monthly_total,
                        0,
                      ),
                      p.currency,
                    )}
                    . New yearly total:{" "}
                    {money(
                      billing.added_existing.reduce(
                        (sum, entry) => sum + entry.yearly_total,
                        0,
                      ),
                      p.currency,
                    )}
                    . No additional billing setup is needed.
                  </Banner>
                ) : (
                  <p className="muted">
                    {billing?.status === "needs_review"
                      ? "We will review billing separately. Your signature is safe."
                      : billing?.status === "succeeded"
                        ? "Billing is arranged. One-time items are invoiced separately."
                        : "Your signed copy and billing details are being prepared."}
                  </p>
                )}
                <div className="card stack">
                  <h2>Your signed copies</h2>
                  {files.length ? (
                    files.map((f) => (
                      <Button
                        key={f.id}
                        icon="download"
                        onClick={() => download(f.id)}
                      >
                        {f.stage === "company"
                          ? "Download the final copy"
                          : "Download your signed copy"}
                      </Button>
                    ))
                  ) : (
                    <p role="status">
                      Your signed copy is being sealed. It will also arrive by
                      email.
                    </p>
                  )}
                  {latest && (
                    <Button
                      onClick={async () => {
                        try {
                          const result = await api<{ valid: boolean }>(
                            `/api/public/${token}/files/${latest.id}/verify`,
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
                <div
                  className="paper"
                  dangerouslySetInnerHTML={{ __html: p.html }}
                />
              </>
            ) : step === "sign" ? (
              <>
                <div className="paper">
                  <span className="eyebrow">What you are accepting</span>
                  <h1>{p.title}</h1>
                  <Quote
                    lines={p.quote as Line[]}
                    currency={p.currency}
                    frozen
                  />
                  <Totals value={p.totals} currency={p.currency} />
                </div>
                {!stale && (
                  <SignatureForm
                    consentText={p.consent_text}
                    name={p.recipient.name}
                    email={p.recipient.email}
                    revision={p.revision}
                    reviewedHash={p.reviewed_hash}
                    onSign={async (value) => {
                      try {
                        setP(await submit("sign", value));
                      } catch (e) {
                        if (e instanceof ApiError && e.status === 409)
                          setStale(true);
                        throw e;
                      }
                    }}
                  />
                )}
                <Button onClick={() => setStep("read")}>
                  Back to proposal
                </Button>
              </>
            ) : (
              <>
                <article className="paper">
                  {p.content.map((block, index) =>
                    block.type === "pricing_table" ? (
                      <section key={index}>
                        <h2>Your investment</h2>
                        <p className="muted">
                          Optional items are your choice. Totals update as you
                          go.
                        </p>
                        <Quote
                          lines={p.quote as Line[]}
                          currency={p.currency}
                          frozen={stale}
                          busy={busy}
                          onToggle={toggle}
                        />
                        <Totals value={p.totals} currency={p.currency} />
                      </section>
                    ) : (
                      <div
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
                  <p className="muted">
                    Valid until {date(p.valid_until)} · From {brand.name}
                  </p>
                </article>
                {declining && (
                  <section className="card">
                    <h2>Decline this proposal?</h2>
                    <p>
                      This closes the proposal. Contact us if you need a revised
                      scope instead.
                    </p>
                    <div className="actions">
                      <Button
                        variant="danger"
                        onClick={async () => {
                          try {
                            await submit("decline", {});
                            setEnded(true);
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      >
                        Decline proposal
                      </Button>
                      <Button onClick={() => setDeclining(false)}>
                        Keep reviewing
                      </Button>
                    </div>
                  </section>
                )}
                {!stale && (
                  <div className="client-bar">
                    <Totals value={p.totals} currency={p.currency} />
                    <div className="actions">
                      <Button
                        variant="primary"
                        disabled={busy}
                        note={busy ? "Saving your selection…" : undefined}
                        onClick={() => setStep("sign")}
                      >
                        Accept &amp; sign
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setDeclining(true)}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
export function Quote({
  lines,
  currency = "USD",
  frozen = false,
  busy = false,
  onToggle,
}: {
  lines: Line[];
  currency?: string;
  frozen?: boolean;
  busy?: boolean;
  onToggle?: (id: string, value: boolean) => void;
}) {
  return (
    <div className="quote-display">
      {(["one_time", "month", "year"] as const).map((interval) => (
        <section key={interval}>
          <h3>
            {interval === "one_time"
              ? "One-time"
              : interval === "month"
                ? "Monthly"
                : "Yearly"}
          </h3>
          {lines
            .filter((l) => l.interval === interval)
            .map((l) => (
              <div className="row" key={l.id}>
                <div>
                  {l.optional && !frozen ? (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={l.selected}
                        disabled={busy}
                        onChange={(e) => onToggle?.(l.id, e.target.checked)}
                      />
                      <strong>{l.name}</strong>
                    </label>
                  ) : (
                    <strong>
                      <Icon name="lock" /> {l.name}
                      {l.optional && !l.selected ? " — not selected" : ""}
                    </strong>
                  )}
                  <p>{l.description}</p>
                  {l.group && <small>Group: {l.group}</small>}
                  {l.min_term_months && (
                    <p>{l.min_term_months}-month minimum</p>
                  )}
                  {l.schedule && (
                    <p>
                      {money(l.amount, currency)}/{interval} for{" "}
                      {l.schedule.after_paid_invoices} paid invoices, then{" "}
                      {money(l.schedule.then.amount, currency)}/{interval}.
                    </p>
                  )}
                  <small>Quantity {l.qty}</small>
                </div>
                <span className="amount">
                  {money(l.amount * l.qty, currency)}
                  {interval === "month"
                    ? "/month"
                    : interval === "year"
                      ? "/year"
                      : ""}
                </span>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
