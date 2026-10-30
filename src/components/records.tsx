"use client";
import { ClientContactFields, clientFormValues } from "./client-contact-fields";
import { formattedPhone, formattedAddress } from "../lib/client-contact";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Data } from "./staff-app";
import type { Proposal, Client, Audit, QuoteItem, Signer } from "../lib/model";
import {
  canCountersign,
  needsCountersign,
  billingIssues,
  billingOpen,
  nextAction,
  inView,
  listViews,
  viewKey,
  expiringWithinSevenDays,
  unfinishedJobs,
} from "../lib/proposal-state";
import type { ProposalAction } from "../lib/proposal-actions";
import type { ClientBilling } from "../lib/client-billing";
import { selected, orderedItems, draftItems } from "../lib/quote-model";
import { totals, renderBlocks, variables } from "../lib/presentation";
import { fontCss } from "../lib/proposal-fonts";
import { eventLabel } from "../lib/event-label";
import { readableDate } from "../lib/validity";
import { onBehalfText } from "../lib/workspace";
import {
  api,
  post,
  ApiError,
  Banner,
  Button,
  Icon,
  Status,
  Totals,
  JobState,
  Field,
} from "./ui";
import { Sheet, Skeleton } from "./foundation";
import { useMoney } from "./money-context";
import { ReferenceStatus } from "./reference-documents";
import { CreateClientModal } from "./client-picker";
function timestamp(value: string, data: Data) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: data.settings?.timezone ?? "UTC",
  }).format(new Date(value));
}
function person(actor: string, data: Data) {
  return (
    data.staff.find((s) => "staff:" + s.user_id === actor)?.display_name ||
    (actor.startsWith("ai:")
      ? "AI assistant"
      : actor === "client"
        ? "Client"
        : actor === "system"
          ? "System"
          : actor)
  );
}
export function ProposalBadges({ p }: { p: Proposal }) {
  return p.source === "proposify_import" ? (
    <span className="pill neutral">Proposify import</span>
  ) : (
    <>
      <Status
        status={p.status}
        ai={p.ai_unreviewed}
        billingPending={!!p.client_signed_at && billingOpen(p)}
      />
      {p.archived_at && <span className="pill neutral">Archived</span>}
    </>
  );
}
function rememberList() {
  sessionStorage.setItem(
    "proposal-list-return",
    JSON.stringify({
      url: location.pathname + location.search,
      scroll: window.scrollY,
    }),
  );
}
export function SignLink({ p, data }: { p: Proposal; data: Data }) {
  return canCountersign(p, data.user, data.settings) ? (
    <a
      className="btn primary sign-link"
      href={`/proposals/${p.id}?action=countersign`}
      onClick={(e) => {
        e.stopPropagation();
        if (location.pathname === "/proposals") rememberList();
      }}
    >
      Sign
      <span className="sr-only">
        {" "}
        {p.client.company}: {p.title}
      </span>
    </a>
  ) : null;
}
export function ProposalMenu({
  p,
  data,
  onChanged,
  showUndo = true,
}: {
  p: Proposal;
  data: Data;
  onChanged?: (p: Proposal) => void;
  showUndo?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState<ProposalAction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [undo, setUndo] = useState<Proposal | null>(null);
  async function act(action: ProposalAction, note = "", target = p) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await post<Proposal>(`/api/proposals/${target.id}/actions`, {
        revision: target.revision,
        action,
        note,
      });
      if (action === "duplicate" || action === "edit_version") {
        location.href = `/proposals/${next.id}`;
        return;
      }
      onChanged?.(next);
      if (action === "archive" && showUndo) setUndo(next);
      else setUndo(null);
      setOpen(false);
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update proposal");
    } finally {
      setBusy(false);
    }
  }
  const imported = p.source === "proposify_import",
    editable =
      !imported &&
      !p.archived_at &&
      ["draft", "sent", "viewed"].includes(p.status),
    outcome =
      !imported &&
      !p.archived_at &&
      !p.signers.length &&
      ["draft", "sent", "viewed", "expired"].includes(p.status);
  return (
    <>
      <button
        type="button"
        ref={anchor}
        className="btn ghost more-control"
        aria-label={`More actions for ${p.client.company}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        ⋯
      </button>
      {undo && (
        <div className="phase4-toast" role="status">
          Proposal archived.{" "}
          <button
            type="button"
            className="text-action"
            onClick={() => void act("unarchive", "", undo)}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn ghost"
            aria-label="Dismiss notification"
            onClick={() => setUndo(null)}
          >
            ×
          </button>
        </div>
      )}
      {open && (
        <Sheet
          title={`Actions · ${p.client.company}`}
          menu={!confirm}
          anchor={anchor.current}
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setConfirm(null);
              setError("");
            }
          }}
        >
          {error && (
            <Banner tone="danger" title="Action could not be completed">
              {error}
            </Banner>
          )}
          {confirm ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  confirm,
                  String(new FormData(e.currentTarget).get("note") ?? ""),
                );
              }}
            >
              <h3>
                {confirm === "mark_won"
                  ? "Mark as won"
                  : confirm === "mark_lost"
                    ? "Mark as lost"
                    : "Mark as invoiced"}
                ?
              </h3>
              <p>
                {confirm === "mark_won"
                  ? "This records a manual win, without a client signature or automatic billing."
                  : confirm === "mark_lost"
                    ? "This closes the client link. The proposal and its history remain available."
                    : "Record the invoice you created outside this app. This does not create or send an invoice."}
              </p>
              <Field
                label={
                  confirm === "invoice_manually"
                    ? "Invoice reference (optional)"
                    : "Reason (optional)"
                }
              >
                <textarea name="note" maxLength={4000} />
              </Field>
              <div className="actions">
                <Button onClick={() => setConfirm(null)}>Cancel</Button>
                <Button busy={busy} type="submit" variant="primary">
                  Confirm
                </Button>
              </div>
            </form>
          ) : (
            <nav className="action-menu">
              {canCountersign(p, data.user, data.settings) && (
                <a href={`/proposals/${p.id}?action=countersign`}>
                  Sign — review client-signed document
                </a>
              )}
              {editable ? (
                p.status === "draft" ? (
                  <a href={`/proposals/${p.id}`}>Edit draft</a>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => void act("edit_version")}
                  >
                    Edit as new version{" "}
                    <small>Closes the old client link.</small>
                  </button>
                )
              ) : (
                <button disabled>
                  Edit{" "}
                  <small>
                    {imported
                      ? "Imported proposals are read-only."
                      : p.archived_at
                        ? "Unarchive to edit."
                        : "Won and Lost proposals cannot be edited."}
                  </small>
                </button>
              )}
              <button
                disabled={busy || imported}
                onClick={() => void act("duplicate")}
              >
                Duplicate
              </button>
              <a href={`/api/proposals/${p.id}/download`}>Download PDF</a>
              <button
                disabled={
                  busy ||
                  !(
                    outcome ||
                    (!imported &&
                      !p.archived_at &&
                      p.status === "declined" &&
                      !p.signers.length)
                  )
                }
                onClick={() => setConfirm("mark_won")}
              >
                Mark as won
              </button>
              <button
                disabled={busy || !outcome}
                onClick={() => setConfirm("mark_lost")}
              >
                Mark as lost
              </button>
              <button
                disabled={
                  busy ||
                  imported ||
                  !!p.archived_at ||
                  p.status !== "declined" ||
                  !!p.signers.length ||
                  !(p.version_count ?? p.versions.length)
                }
                onClick={() => void act("mark_sent")}
              >
                Mark as sent again{" "}
                <small>
                  {(p.version_count ?? p.versions.length)
                    ? "Reopen with a new link and send from your staff account."
                    : "No sent version. Duplicate to prepare a new proposal."}
                </small>
              </button>
              {p.client_signed_at &&
                p.billing_links.some(
                  (l) => l.provider === "qbo" && l.status === "needs_review",
                ) && (
                  <button onClick={() => setConfirm("invoice_manually")}>
                    Mark as invoiced
                  </button>
                )}
              <button
                disabled={busy}
                onClick={() =>
                  void act(p.archived_at ? "unarchive" : "archive")
                }
              >
                {p.archived_at ? "Unarchive" : "Archive"}
              </button>
            </nav>
          )}
        </Sheet>
      )}
    </>
  );
}
export function ProposalRows({
  proposals,
  data,
  onChanged,
}: {
  proposals: Proposal[];
  data: Data;
  onChanged?: (p: Proposal) => void;
}) {
  const [undo, setUndo] = useState<Proposal | null>(null),
    [undoError, setUndoError] = useState("");
  const money = useMoney(),
    yearly = proposals.some((p) =>
      p.quote.some((i) => i.sublines.some((s) => s.interval === "year")),
    );
  return (
    <>
      <div className={`proposal-rows ${yearly ? "has-yearly" : ""}`}>
        <div className="proposal-row-head">
          <span>Proposal</span>
          <span>Status</span>
          <span className="next-cell">Next</span>
          <span>One-time</span>
          <span>Monthly</span>
          {yearly && <span>Yearly</span>}
          <span className="updated-cell">Updated</span>
          <span />
        </div>
        {!proposals.length ? (
          <p className="empty-copy">No proposals in this view.</p>
        ) : (
          proposals.map((p) => {
            const t = totals(p.quote);
            return (
              <article className="proposal-row clickable-row" key={p.id}>
                <a
                  className="proposal-row-link"
                  href={`/proposals/${p.id}`}
                  aria-label={`Open ${p.client.company}: ${p.title}`}
                  onClick={rememberList}
                />
                <div className="proposal-name">
                  <strong>{p.client.company}</strong>
                  <span>{p.title}</span>
                </div>
                <div className="proposal-status">
                  <ProposalBadges p={p} />
                  <SignLink p={p} data={data} />
                </div>
                <span className="next-cell">{nextAction(p)}</span>
                <span className="row-amount one-time" data-label="One-time">
                  {money(t.one_time_total, p.currency)}
                </span>
                <span className="row-amount" data-label="Monthly">
                  {money(t.monthly_total, p.currency)}/mo
                </span>
                {yearly && (
                  <span className="row-amount yearly" data-label="Yearly">
                    {p.quote.some((i) =>
                      i.sublines.some((s) => s.interval === "year"),
                    )
                      ? money(t.yearly_total, p.currency) + "/yr"
                      : "—"}
                  </span>
                )}
                <small className="updated-cell">
                  {readableDate(p.updated_at ?? p.created_at)}
                </small>
                <ProposalMenu
                  p={p}
                  data={data}
                  showUndo={false}
                  onChanged={(next) => {
                    if (next.archived_at && !p.archived_at) setUndo(next);
                    onChanged?.(next);
                  }}
                />
              </article>
            );
          })
        )}
      </div>
      {undo && (
        <div className="phase4-toast" role="status">
          {undoError || "Proposal archived."}
          <button
            className="text-action"
            onClick={async () => {
              try {
                const next = await post<Proposal>(
                  `/api/proposals/${undo.id}/actions`,
                  { revision: undo.revision, action: "unarchive" },
                );
                onChanged?.(next);
                setUndo(null);
              } catch (e) {
                setUndoError((e as Error).message);
              }
            }}
          >
            Undo
          </button>
          <button
            className="btn ghost"
            aria-label="Dismiss notification"
            onClick={() => setUndo(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
export function ProposalListV4({
  data,
  initialView = "all",
}: {
  data: Data;
  initialView?: string;
}) {
  const router = useRouter(),
    [rows, setRows] = useState(data.proposals),
    [view, setView] = useState(initialView || "all"),
    [search, setSearch] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem("proposal-list-return");
    if (saved) {
      try {
        const value = JSON.parse(saved);
        if (value.url === location.pathname + location.search)
          requestAnimationFrame(() => window.scrollTo(0, value.scroll));
      } catch {}
    }
  }, []);
  const shown = rows
    .filter(
      (p) =>
        inView(p, view) &&
        `${p.title} ${p.client.company} ${p.client.email} ${p.search_text ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        Date.parse(b.updated_at ?? b.created_at) -
        Date.parse(a.updated_at ?? a.created_at),
    );
  function change(v: string) {
    setView(v);
    router.replace(
      "/proposals" + (v === "all" ? "" : "?view=" + encodeURIComponent(v)),
      { scroll: false },
    );
  }
  return (
    <div className="phase4-list stack">
      <div className="list-tools">
        <label className="search-field">
          <Icon name="search" />
          <span className="sr-only">Search proposals</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or title"
          />
        </label>
        <label className="compact-views">
          View
          <select
            aria-label="Filter proposals"
            value={view}
            onChange={(e) => change(e.target.value)}
          >
            {listViews.map((v) => (
              <option key={v} value={viewKey(v)}>
                {v} ({rows.filter((p) => inView(p, viewKey(v))).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="proposal-views" aria-label="Proposal views">
        {listViews.map((v) => (
          <button
            key={v}
            className={view === viewKey(v) ? "active" : ""}
            aria-pressed={view === viewKey(v)}
            onClick={() => change(viewKey(v))}
          >
            {v}{" "}
            <small>{rows.filter((p) => inView(p, viewKey(v))).length}</small>
          </button>
        ))}
      </nav>
      <ProposalRows
        proposals={shown}
        data={data}
        onChanged={(next) =>
          setRows((r) => r.map((p) => (p.id === next.id ? next : p)))
        }
      />
    </div>
  );
}
export function HomeV4({ data }: { data: Data }) {
  const money = useMoney(),
    [rows, setRows] = useState(data.proposals),
    [actionError, setActionError] = useState(""),
    [actionBusy, setActionBusy] = useState(false),
    active = rows.filter((p) => !p.archived_at && p.source === "native"),
    groups = [
      {
        label: "Countersign",
        note: "The client has signed. Your signature is next.",
        rows: active.filter(needsCountersign),
      },
      {
        label: "Review AI drafts",
        note: "Check the scope and entered prices before sending.",
        rows: active.filter((p) => p.status === "draft" && p.ai_unreviewed),
      },
      {
        label: "Viewed, not signed",
        note: "The client is deciding.",
        rows: active.filter((p) => p.status === "viewed"),
      },
      {
        label: "Billing to resolve",
        note: "Signatures are safe. Review the billing handoff.",
        rows: active.filter(billingIssues),
      },
      {
        label: "Expiring within 7 days",
        note: "Follow up before the link expires.",
        rows: active.filter((p) => expiringWithinSevenDays(p)),
      },
    ],
    count = groups.reduce((count, group) => count + group.rows.length, 0);
  const open = active.filter((p) => ["sent", "viewed"].includes(p.status)),
    month = new Intl.DateTimeFormat("en-CA", {
      timeZone: data.settings?.timezone ?? "UTC",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()),
    signed = active.filter(
      (p) =>
        p.client_signed_at &&
        new Intl.DateTimeFormat("en-CA", {
          timeZone: data.settings?.timezone ?? "UTC",
          year: "numeric",
          month: "2-digit",
        }).format(new Date(p.client_signed_at)) === month,
    );
  function pipeline(list: Proposal[]) {
    const currencies = [...new Set(list.map((p) => p.currency))];
    return currencies.map((currency) => {
      const t = list
        .filter((p) => p.currency === currency)
        .reduce(
          (a, p) => {
            const t = totals(
              p.client_signed_at
                ? (p.versions?.at(-1)?.quote ?? p.quote)
                : draftItems(p.quote),
            );
            return {
              once: a.once + t.one_time_total,
              month: a.month + t.monthly_total,
              year: a.year + t.yearly_total,
            };
          },
          { once: 0, month: 0, year: 0 },
        );
      return (
        <p key={currency}>
          <strong>{money(t.once, currency)}</strong> one-time <span>·</span>{" "}
          <strong>{money(t.month, currency)}/mo</strong>
          {list.some(
            (p) =>
              p.currency === currency &&
              p.quote.some((i) =>
                i.sublines.some((s) => s.interval === "year"),
              ),
          ) && <> · {money(t.year, currency)}/yr</>}
        </p>
      );
    });
  }
  if (!data.total)
    return (
      <div className="home-v4 stack">
        <ReferenceStatus documents={data.documents} />
        <section className="first-run card stack">
          <h1>
            Welcome, {(data.user.staff_name || "team").split(" ")[0]}. Let’s
            send your first proposal.
          </h1>
          <p>
            Connect Stripe so the catalog fills in, pick a template, and you’re
            ready. Assistant drafts will appear here after you connect an
            assistant.
          </p>
          <div className="actions">
            <a className="btn primary" href="/proposals?new=1">
              New proposal
            </a>
            <a className="btn" href="/studio/connections">
              Connect Stripe
            </a>
          </div>
        </section>
      </div>
    );
  return (
    <div className="home-v4 stack">
      <ReferenceStatus documents={data.documents} />
      <section className="home-intro">
        <div>
          <span className="home-date">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: data.settings?.timezone ?? "UTC",
            }).format(new Date())}
          </span>
          <h1>
            {count
              ? `${count} thing${count === 1 ? "" : "s"} need you, ${(data.user.staff_name || "").split(" ")[0] || "team"}.`
              : "You’re all caught up."}
          </h1>
        </div>
      </section>
      {actionError && (
        <Banner tone="danger" title="Action could not be completed">
          {actionError}
        </Banner>
      )}
      <div className="home-columns">
        <section className="action-groups">
          {!count && (
            <section className="card stack">
              <h2>Nothing needs you right now.</h2>
              <p>
                Drafts to review, signatures to countersign and billing problems
                will appear here. {open.length} proposals are out with clients.
              </p>
              <a className="btn" href="/proposals">
                See proposals
              </a>
            </section>
          )}
          {(count ? groups : []).map((g) => (
            <section className="action-group" key={g.label}>
              <header>
                <h2>
                  {g.label} <span className="count-badge">{g.rows.length}</span>
                </h2>
              </header>
              {g.rows.length ? (
                g.rows.map((p) => (
                  <div className="home-action-row clickable-row" key={p.id}>
                    <a
                      className="home-primary-link"
                      href={`/proposals/${p.id}`}
                    >
                      <strong>
                        {p.client.company} <ProposalBadges p={p} />
                      </strong>
                      <small>{p.title}</small>
                      <small>{nextAction(p)}</small>
                    </a>
                    <div className="home-row-totals">
                      <span>
                        {money(totals(p.quote).one_time_total, p.currency)}{" "}
                        one-time
                      </span>
                      <span>
                        {money(totals(p.quote).monthly_total, p.currency)}/mo
                      </span>
                    </div>
                    {g.label === "Countersign" ? (
                      <>
                        <SignLink p={p} data={data} />
                        {!canCountersign(p, data.user, data.settings) && (
                          <span className="pill warning">
                            Needs countersign
                          </span>
                        )}
                      </>
                    ) : g.label === "Viewed, not signed" ? (
                      <Button
                        busy={actionBusy}
                        onClick={async () => {
                          if (actionBusy) return;
                          setActionBusy(true);
                          setActionError("");
                          try {
                            const next = await post<Proposal>(
                              `/api/proposals/${p.id}/actions`,
                              { revision: p.revision, action: "remind" },
                            );
                            setRows((rows) =>
                              rows.map((v) => (v.id === next.id ? next : v)),
                            );
                          } catch (e) {
                            setActionError((e as Error).message);
                          } finally {
                            setActionBusy(false);
                          }
                        }}
                      >
                        Send reminder
                      </Button>
                    ) : (
                      <a className="btn" href={`/proposals/${p.id}`}>
                        {g.label === "Review AI drafts"
                          ? "Review"
                          : g.label === "Billing to resolve"
                            ? "Resolve"
                            : "Open"}
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <p className="group-clear">Nothing waiting here.</p>
              )}
            </section>
          ))}
        </section>
        <aside className="pipeline card">
          <span className="eyebrow">Pipeline</span>
          <h2>At a glance</h2>
          <section>
            <h3>
              Out for signature <small>{open.length}</small>
            </h3>
            {pipeline(open)}
            {!open.length && <p>No proposals out for signature.</p>}
            <small>Based on the default selections.</small>
          </section>
          <section>
            <h3>
              Signed this month <small>{signed.length}</small>
            </h3>
            {pipeline(signed)}
            {!signed.length && <p>No client signatures this month.</p>}
            <small>Client signatures only; manual wins are excluded.</small>
          </section>
        </aside>
      </div>
      <section>
        <header className="section-heading">
          <h2>Recent proposals</h2>
          <a href="/proposals">View all →</a>
        </header>
        <ProposalRows
          proposals={rows
            .filter((p) => inView(p, "all"))
            .toSorted(
              (a, b) =>
                Date.parse(b.updated_at ?? b.created_at) -
                Date.parse(a.updated_at ?? a.created_at),
            )
            .slice(0, 6)}
          data={data}
          onChanged={(next) =>
            setRows((r) => r.map((p) => (p.id === next.id ? next : p)))
          }
        />
      </section>
    </div>
  );
}
function QuoteSummary({ p }: { p: Proposal }) {
  const money = useMoney(),
    quote = p.versions.at(-1)?.quote ?? p.quote,
    chosen = orderedItems(quote).filter(selected),
    excluded = orderedItems(quote).filter((i) => !selected(i));
  return (
    <>
      <div className="signed-items">
        {chosen.map((i) => (
          <div key={i.id}>
            <strong>{i.name}</strong>
            {i.sublines.map((s) => (
              <p key={s.id}>
                <span>
                  {s.label ||
                    { one_time: "One-time", month: "Monthly", year: "Yearly" }[
                      s.interval
                    ]}
                  {s.qty !== 1 ? ` × ${s.qty}` : ""}
                </span>
                <span>
                  {money(s.amount * s.qty, p.currency)}
                  {s.interval === "month"
                    ? "/mo"
                    : s.interval === "year"
                      ? "/yr"
                      : ""}
                </span>
              </p>
            ))}
          </div>
        ))}
      </div>
      <Totals lines={quote} currency={p.currency} />
      {excluded.length > 0 && (
        <details className="not-chosen">
          <summary>Items not chosen ({excluded.length})</summary>
          {excluded.map((i) => (
            <p key={i.id}>{i.name}</p>
          ))}
        </details>
      )}
    </>
  );
}
function SignatureEvidence({ signer, data }: { signer: Signer; data: Data }) {
  return (
    <section className="signature-evidence">
      {signer.image ? (
        <img src={signer.image} alt={`${signer.name}'s signature`} />
      ) : (
        <p className="typed-signature">{signer.typed_name}</p>
      )}
      <strong>
        {signer.name}
        {signer.title && ` · ${signer.title}`}
      </strong>
      <p>{signer.email}</p>
      <small>{timestamp(signer.signed_at, data)}</small>
      {signer.application_statement && <p>{signer.application_statement}</p>}
    </section>
  );
}
export function CountersignSheet({
  p,
  data,
  onClose,
  onSigned,
}: {
  p: Proposal;
  data: Data;
  onClose: () => void;
  onSigned: (p: Proposal) => void;
}) {
  const [consent, setConsent] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [sealing, setSealing] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false),
    s = data.settings?.company_signatory,
    version = p.versions.at(-1),
    client = p.signers.find((s) => s.role === "client"),
    delegated = data.user.actor.slice(6) !== s?.user_id,
    authorization = onBehalfText(
      s?.name ?? "",
      data.settings?.company_name ?? "",
    );
  return (
    <Sheet
      title={`Countersign · ${p.client.company}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="countersign-sheet stack">
        {stale && (
          <Banner
            tone="warning"
            title="This proposal changed. Review the current record before signing."
          >
            Close this sheet and reload the record to review the updated
            document. Your signature was not applied.
          </Banner>
        )}
        {error && !stale && (
          <Banner tone="danger" title="Unable to countersign">
            {error}
          </Banner>
        )}
        {sealing ? (
          <Banner title="Sealing the final copy…">
            Your company signature has been recorded.
          </Banner>
        ) : (
          <>
            <section className="frozen-summary">
              <span className="eyebrow">
                <Icon name="lock" /> Client-signed · frozen
              </span>
              <QuoteSummary p={p} />
              <p>Version {version?.version_no}</p>
              <code className="hash">{version?.content_hash}</code>
            </section>
            <section>
              <h3>Client signature</h3>
              {client ? (
                <SignatureEvidence signer={client} data={data} />
              ) : (
                <Banner tone="warning" title="Client signature unavailable" />
              )}
            </section>
            {!s?.image || !s.user_id ? (
              <Banner
                tone="warning"
                title={
                  !s?.image
                    ? "No signature saved — add one in Workspace"
                    : "Company signatory setup required"
                }
              >
                <a href="/studio/workspace#signatory">Open Workspace</a> to save
                the designated signatory and their signature.
              </Banner>
            ) : (
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    submitting.current ||
                    stale ||
                    !consent ||
                    (delegated && !authorized) ||
                    !canCountersign(p, data.user, data.settings)
                  )
                    return;
                  submitting.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    const next = await post<Proposal>(
                      `/api/proposals/${p.id}/countersign`,
                      {
                        revision: p.revision,
                        reviewed_hash: version?.content_hash,
                        consent: true,
                        signatory_version: data.signatory_version,
                        ...(delegated
                          ? {
                              authorization: true,
                              authorization_text: authorization,
                            }
                          : {}),
                      },
                    );
                    setSealing(true);
                    onSigned(next);
                    window.setTimeout(onClose, 900);
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 409)
                      setStale(true);
                    setError(
                      e instanceof Error ? e.message : "Unable to countersign",
                    );
                  } finally {
                    submitting.current = false;
                    setBusy(false);
                  }
                }}
              >
                <section className="company-signature-preview">
                  <h3>Company signature</h3>
                  <img src={s.image} alt={`${s.name}'s stored signature`} />
                  <strong>
                    {s.name} · {s.title}
                  </strong>
                  <p>
                    {data.settings?.company_name} ·{" "}
                    {readableDate(new Date().toISOString())}
                  </p>
                </section>
                {delegated && (
                  <section>
                    <h3>Signing on behalf of {s.name}</h3>
                    <p>
                      {data.user.staff_name || data.user.staff_email} will be
                      recorded as the person applying this signature.
                    </p>
                    <label className="check authorization-check">
                      <input
                        type="checkbox"
                        required
                        checked={authorized}
                        disabled={stale || busy}
                        onChange={(e) => setAuthorized(e.target.checked)}
                      />
                      {authorization}
                    </label>
                  </section>
                )}
                <section className="full-consent">
                  <p>{p.workspace_settings?.consent_text}</p>
                  <label className="check">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      disabled={stale || busy}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    I have reviewed the agreement and consent to apply the
                    company signature.
                  </label>
                </section>
                <Button
                  type="submit"
                  variant="primary"
                  busy={busy}
                  disabled={
                    stale ||
                    !consent ||
                    (delegated && !authorized) ||
                    !canCountersign(p, data.user, data.settings)
                  }
                  note={
                    stale
                      ? "Reload and review before signing."
                      : !canCountersign(p, data.user, data.settings)
                        ? "Your staff account is not authorized."
                        : !consent || (delegated && !authorized)
                          ? "Confirm the required authorization and consent above."
                          : undefined
                  }
                >
                  Countersign as {s.name}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
function eventTitle(e: Audit, data: Data) {
  return eventLabel(e, person(e.actor, data));
}
export function RecordV4({
  p,
  data,
  onChanged,
  onRefresh,
  countersign = false,
}: {
  p: Proposal;
  data: Data;
  onChanged: (p: Proposal) => void;
  onRefresh: () => Promise<void>;
  countersign?: boolean;
}) {
  const applying = useRef(false);
  const router = useRouter(),
    [document, setDocument] = useState(false),
    [already, setAlready] = useState(""),
    [returnUrl, setReturnUrl] = useState("/proposals"),
    [invoice, setInvoice] = useState(false),
    [invoiceBusy, setInvoiceBusy] = useState(false),
    [error, setError] = useState("");
  const company = p.signers.find((s) => s.role === "company"),
    actualSigned = !!p.client_signed_at,
    v = p.versions.at(-1),
    signature = needsCountersign(p),
    issues = billingIssues(p),
    native = p.source === "native";
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("proposal-list-return") ?? "null",
      );
      if (saved?.url?.startsWith("/proposals") && !saved.url.startsWith("//"))
        setReturnUrl(saved.url);
    } catch {}
  }, []);
  useEffect(() => {
    if (countersign && company && !applying.current) {
      setAlready(
        `${company.applied_by?.name || company.actor} already countersigned this at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: data.settings?.timezone ?? "UTC" }).format(new Date(company.signed_at))}.`,
      );
      router.replace(`/proposals/${p.id}`, { scroll: false });
    }
  }, [countersign, !!company]);
  function close() {
    applying.current = false;
    router.replace(`/proposals/${p.id}`, { scroll: false });
  }
  const nextTitle = p.archived_at
    ? "Archived proposal"
    : p.marked_won_by
      ? `Marked as won by ${person(p.marked_won_by, data)}, no client signature`
      : signature
        ? `${data.settings?.company_signatory?.name ?? "Your company signatory"} countersigns next`
        : issues
          ? "Billing needs your attention"
          : p.status === "sent"
            ? "Waiting for the client to open the proposal"
            : p.status === "viewed"
              ? "The client is reviewing your proposal"
              : p.status === "declined"
                ? "This proposal is closed"
                : p.status === "expired"
                  ? "The client link expired"
                  : p.source === "proposify_import"
                    ? "Imported from Proposify"
                    : "Everything is complete";
  return (
    <div className="record-v4 stack">
      <div className="record-toolbar">
        <a href={returnUrl}>← Back to proposals</a>
        <div className="actions">
          {native && (
            <a
              className="btn"
              target="_blank"
              rel="noreferrer"
              href={`/p/${p.id}?preview=1`}
            >
              Preview as client
            </a>
          )}
          <ProposalMenu p={p} data={data} onChanged={onChanged} />
        </div>
      </div>
      <ProposalBadges p={p} />
      {already && (
        <div role="status" className="notice-toast">
          {already}
        </div>
      )}
      {error && (
        <Banner tone="danger" title="Unable to complete action">
          {error}
        </Banner>
      )}
      {actualSigned &&
        p.jobs.some((j) => j.kind === "pdf" && j.status === "failed") && (
          <Banner
            tone="warning"
            title={`${p.client.first_name || "The client"}’s signature is saved. Sealing the PDF failed.`}
            action={
              <Button
                onClick={() =>
                  void post(`/api/proposals/${p.id}/retry`)
                    .then(onRefresh)
                    .catch((e) => setError(e.message))
                }
              >
                Retry sealing
              </Button>
            }
          >
            The signed agreement is safe. Its copy will be emailed once sealing
            works.
          </Banner>
        )}
      <section className={`next-card ${signature ? "needs-signature" : ""}`}>
        <div className="next-icon">
          <Icon
            name={
              signature
                ? "signature"
                : issues
                  ? "review"
                  : p.status === "sent"
                    ? "send"
                    : "verified"
            }
          />
        </div>
        <div>
          <span className="eyebrow">Next</span>
          <h2>{nextTitle}</h2>
          <p>
            {signature
              ? "The client’s chosen scope and prices are frozen. Review their signature before applying the company signature."
              : issues
                ? "Billing can be retried without changing the signed agreement."
                : p.marked_won_by
                  ? "No electronic signature or automatic billing was created."
                  : p.status === "viewed"
                    ? "You can follow up with the current client link."
                    : "The timeline below keeps the record of what happened."}
          </p>
        </div>
        <div className="actions">
          {signature && <SignLink p={p} data={data} />}
          <Button onClick={() => setDocument(true)}>View document</Button>
          {["sent", "viewed"].includes(p.status) && (
            <Button
              onClick={async () => {
                try {
                  const next = await post<Proposal>(
                    `/api/proposals/${p.id}/actions`,
                    { revision: p.revision, action: "remind" },
                  );
                  onChanged(next);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Send reminder
            </Button>
          )}
        </div>
      </section>
      <ol className="lifecycle" aria-label="Proposal lifecycle">
        {[
          ["Draft", p.created_at],
          ["Sent", p.sent_at],
          ["Viewed", p.first_viewed_at],
          ["Client signed", p.client_signed_at],
          ["Countersigned", company?.signed_at],
          [
            "Billing set up",
            actualSigned && p.billing_links.length && !billingOpen(p)
              ? p.updated_at
              : null,
          ],
          ["Done", company && !billingOpen(p) ? company.signed_at : null],
        ].map(([label, when]) => (
          <li key={label} className={when ? "done" : ""}>
            <Icon name={when ? "verified" : "clock"} />
            <strong>{label}</strong>
            <small>{when ? timestamp(when, data) : "Waiting"}</small>
          </li>
        ))}
      </ol>
      <div className="record-columns">
        <section className="card timeline">
          <header className="section-heading">
            <h2>Timeline</h2>
            <a href={`/proposals/${p.id}?view=evidence`}>Audit & evidence →</a>
          </header>
          {p.events.toReversed().map((e) => (
            <article key={e.id} className="timeline-entry">
              <span className="timeline-dot">
                <Icon
                  name={
                    e.type.includes("signed")
                      ? "signature"
                      : e.type === "viewed"
                        ? "viewed"
                        : e.type.includes("failed")
                          ? "review"
                          : "document"
                  }
                />
              </span>
              <div>
                <strong>{eventTitle(e, data)}</strong>
                <p>
                  {String(
                    e.metadata.application_statement ?? person(e.actor, data),
                  )}
                </p>
                {typeof e.metadata.note === "string" && (
                  <blockquote>{e.metadata.note}</blockquote>
                )}
                {typeof e.metadata.reason === "string" && e.metadata.reason && (
                  <blockquote>{e.metadata.reason}</blockquote>
                )}
                <small>{timestamp(e.created_at, data)}</small>
                <a href={`/proposals/${p.id}?view=evidence#event-${e.id}`}>
                  View evidence
                </a>
              </div>
            </article>
          ))}
        </section>
        <aside className="record-aside stack">
          <section className="card">
            <header className="section-heading">
              <h2>{actualSigned ? "As signed" : "Quote"}</h2>
              {actualSigned && <Icon name="lock" />}
            </header>
            {p.marked_won_by ? (
              <p>No client-signed version. Outcome recorded manually.</p>
            ) : (
              <QuoteSummary p={p} />
            )}
            <small>
              {actualSigned
                ? "Selections are locked to the signed version."
                : "Amounts reflect the current selected items."}
            </small>
          </section>
          <section className="card stack">
            <h2>Billing</h2>
            {!actualSigned ? (
              <p>
                {p.marked_won_by
                  ? "No billing was started by this manual win."
                  : "Billing starts after the client signs."}
              </p>
            ) : (
              <>
                {!p.billing_links.length && <p>Billing is being prepared.</p>}
                {p.billing_links.map((link, index) => (
                  <section className="billing-state" key={index}>
                    <strong>
                      {link.provider === "stripe"
                        ? "Stripe"
                        : "One-time invoice"}
                    </strong>
                    <span
                      className={`pill ${link.status === "succeeded" ? "success" : link.status === "failed" ? "danger" : "warning"}`}
                    >
                      {link.metadata?.manual_invoice &&
                      link.status === "succeeded"
                        ? "Invoiced manually"
                        : link.provider === "qbo" &&
                            link.status === "needs_review"
                          ? "Invoice manually"
                          : link.status === "succeeded"
                            ? "Ready"
                            : link.status === "failed"
                              ? "Needs attention"
                              : "In progress"}
                    </span>
                    {link.last_error && <p>{link.last_error}</p>}
                    {link.provider === "stripe" &&
                      link.metadata?.requires_checkout === true && (
                        <div className="stack">
                          <p>
                            The proposal is signed. The client has not finished
                            payment setup.
                          </p>
                          <Button
                            onClick={async () => {
                              try {
                                const next = await post<Proposal>(
                                  `/api/proposals/${p.id}/actions`,
                                  {
                                    revision: p.revision,
                                    action: "resend_billing_link",
                                  },
                                );
                                onChanged(next);
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "Unable to resend the billing link",
                                );
                              }
                            }}
                          >
                            Resend billing link
                          </Button>
                        </div>
                      )}
                    {link.provider === "stripe" &&
                      link.status === "succeeded" && (
                        <p>
                          {link.metadata?.requires_checkout
                            ? "Client completes Checkout to start billing."
                            : "Monthly items were added to the existing subscription."}
                        </p>
                      )}
                    {link.provider === "qbo" &&
                      link.status === "needs_review" && (
                        <Button
                          onClick={() => {
                            setError("");
                            setInvoice(true);
                          }}
                        >
                          Mark as invoiced
                        </Button>
                      )}
                  </section>
                ))}
              </>
            )}
            <div className="record-jobs">
              {unfinishedJobs(p)
                .filter(
                  (j) =>
                    j.kind !== "email" ||
                    j.payload.to === p.client.email ||
                    !!j.last_error,
                )
                .map((j) => (
                  <JobState
                    key={j.id}
                    state={
                      j.status === "running"
                        ? "running"
                        : j.status === "failed" || j.last_error
                          ? "failed"
                          : "queued"
                    }
                    label={
                      j.kind === "pdf"
                        ? "Sealed PDF"
                        : j.kind === "billing"
                          ? "Billing"
                          : j.payload.to === p.client.email
                            ? "Email to client"
                            : "Staff notification"
                    }
                    error={j.last_error}
                    attempts={j.attempts}
                    onRetry={
                      j.status !== "running" &&
                      (j.status === "failed" || j.last_error)
                        ? () => {
                            void post(`/api/proposals/${p.id}/retry`)
                              .then(onRefresh)
                              .catch((e) => setError(e.message));
                          }
                        : undefined
                    }
                  />
                ))}
            </div>
            {issues && (
              <Button
                onClick={async () => {
                  try {
                    await post(`/api/proposals/${p.id}/retry`);
                    await onRefresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Retry billing
              </Button>
            )}
          </section>
          <section className="card stack">
            <h2>Files</h2>
            {p.files
              .filter(
                (f) =>
                  f.kind === "sealed" ||
                  f.kind === "import" ||
                  (f.stage?.startsWith("preview:") && f.version_hash),
              )
              .map((f) => (
                <a
                  key={f.id}
                  className="file-link"
                  href={`/api/proposals/${p.id}/files/${f.id}`}
                >
                  <Icon name="download" />
                  {f.kind === "import"
                    ? "Imported PDF"
                    : f.stage === "company"
                      ? "Final sealed PDF"
                      : f.stage === "client"
                        ? "Client-signed PDF"
                        : "Preview PDF"}
                </a>
              ))}
            {!p.files.some((f) => f.kind === "sealed") && (
              <p>
                {actualSigned
                  ? "The signed copy is being sealed."
                  : "A sealed PDF is available after signature."}
              </p>
            )}
            <a href={`/api/proposals/${p.id}/download`}>
              Download {actualSigned ? "signed copy" : "preview PDF"}
            </a>
            {v && (
              <details>
                <summary>Version {v.version_no} · content hash</summary>
                <code className="hash">{v.content_hash}</code>
              </details>
            )}
          </section>
        </aside>
      </div>
      {document && (
        <Sheet title={p.title} onClose={() => setDocument(false)}>
          <style>{fontCss(p.workspace_settings ?? data.settings)}</style>
          <article
            className="paper record-document proposal-typography"
            dangerouslySetInnerHTML={{
              __html: v
                ? renderBlocks(
                    v.content,
                    v.quote,
                    v.variables_resolved,
                    p.currency,
                  )
                : native
                  ? renderBlocks(
                      p.content,
                      p.quote,
                      variables({
                        ...p,
                        workspace_settings: data.settings ?? undefined,
                      }),
                      p.currency,
                    )
                  : "<p>No rendered document is available for this import. Download its PDF.</p>",
            }}
          />
          {p.signers.map((s) => (
            <SignatureEvidence key={s.role} signer={s} data={data} />
          ))}
        </Sheet>
      )}
      {invoice && (
        <Sheet
          title="Mark as invoiced"
          onClose={() => {
            if (!invoiceBusy) setInvoice(false);
          }}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (invoiceBusy) return;
              setInvoiceBusy(true);
              setError("");
              try {
                onChanged(
                  await post<Proposal>(`/api/proposals/${p.id}/actions`, {
                    revision: p.revision,
                    action: "invoice_manually",
                    note: new FormData(e.currentTarget).get("reference"),
                  }),
                );
                setInvoice(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setInvoiceBusy(false);
              }
            }}
          >
            {error && (
              <Banner tone="danger" title="Invoice could not be recorded">
                {error}
              </Banner>
            )}
            <p>
              Record a one-time invoice you created manually. No invoice will be
              created or emailed by this action.
            </p>
            <Field label="Invoice reference (optional)">
              <input name="reference" maxLength={4000} />
            </Field>
            <Button type="submit" variant="primary" busy={invoiceBusy}>
              Mark as invoiced
            </Button>
          </form>
        </Sheet>
      )}
      {countersign && (!company || applying.current) && native && (
        <CountersignSheet
          p={p}
          data={data}
          onClose={close}
          onSigned={(next) => {
            applying.current = true;
            onChanged(next);
          }}
        />
      )}
    </div>
  );
}
export function ClientsV4({
  data,
  selected,
  onRefresh,
}: {
  data: Data;
  selected?: string;
  onRefresh: () => Promise<void>;
}) {
  const client = data.clients.find((c) => c.id === selected),
    [linkChoice, setLinkChoice] = useState<string | null | undefined>(
      undefined,
    ),
    [confirm, setConfirm] = useState(false),
    [edit, setEdit] = useState(false),
    [editClient, setEditClient] = useState(false),
    [newClient, setNewClient] = useState(selected === "new"),
    [error, setError] = useState(""),
    [billing, setBilling] = useState<ClientBilling | null>(null),
    [billingError, setBillingError] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    money = useMoney();
  useEffect(() => {
    if (!client) return;
    let active = true;
    setBilling(null);
    setBillingError("");
    api<ClientBilling>(`/api/clients/${client.id}/billing`)
      .then((value) => {
        if (!Array.isArray(value.items))
          throw new Error("Billing details could not be loaded.");
        if (active) setBilling(value);
      })
      .catch((e) => {
        if (active) setBillingError(e.message);
      });
    return () => {
      active = false;
    };
  }, [client?.id, client?.email, client?.stripe_customer_id]);
  if (!client)
    return (
      <section className="clients-v4 stack">
        <div className="list-tools">
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search clients"
              placeholder="Search company, name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button onClick={() => setNewClient(true)}>New client</Button>
        </div>
        <div className="client-directory client-table">
          <div className="client-table-head">
            {[
              "Company",
              "Contact",
              "Title",
              "Email",
              "Phone",
              "Billing",
              "Proposals",
            ].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          {data.clients
            .filter((c) =>
              `${c.company} ${c.email} ${c.first_name} ${c.last_name}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((c) => (
              <article key={c.id} className="client-table-row clickable-row">
                <a
                  className="whole-row-link"
                  href={`/clients/${c.id}`}
                  aria-label={`Open ${c.company}`}
                />
                <strong data-label="Company">{c.company}</strong>
                <span data-label="Contact">
                  {c.first_name} {c.last_name}
                </span>
                <span data-label="Title">{c.title || "—"}</span>
                <a
                  className="inner-action"
                  data-label="Email"
                  href={`mailto:${c.email}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.email}
                </a>
                <span data-label="Phone">
                  {c.phone ? (
                    <a
                      className="inner-action"
                      href={`tel:${c.phone}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formattedPhone(c.phone)}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
                <span data-label="Billing">
                  {c.stripe_customer_id ? "Stripe linked" : "Not linked"}
                </span>
                <span data-label="Proposals">
                  {data.proposals.filter((p) => p.client.id === c.id).length}
                </span>
              </article>
            ))}
          {!data.clients.length && (
            <p className="empty-copy">
              No clients yet. Create your first client to get started.
            </p>
          )}
        </div>
        {newClient && (
          <CreateClientModal
            onClose={() => setNewClient(false)}
            onSaved={(c) => {
              location.href = `/clients/${c.id}`;
            }}
          />
        )}
      </section>
    );
  const proposals = data.proposals.filter((p) => p.client.id === client.id),
    count = proposals.length;
  const currencyGroups = [
    ...new Set(billing?.items.map((i) => i.currency) ?? []),
  ];
  return (
    <div className="client-detail-v4 stack">
      <header>
        <div>
          <a href="/clients">← Clients</a>
          <h2>{client.company}</h2>
          <p>
            {client.first_name} {client.last_name}
            {client.title && ` · ${client.title}`} · {client.email}
            {client.phone && ` · ${formattedPhone(client.phone)}`}
          </p>
        </div>
        <div className="actions">
          <a
            className="btn primary"
            href={`/proposals?new=1&client=${client.id}`}
          >
            New proposal
          </a>
          <a className="btn" href={`mailto:${client.email}`}>
            Email {client.first_name || "client"}
          </a>
          <Button onClick={() => setEditClient(true)}>Edit client</Button>
          <Button
            variant="danger"
            disabled={count > 0}
            aria-describedby={count ? "client-delete-reason" : undefined}
            onClick={() => setConfirm(true)}
          >
            Delete client
          </Button>
          {count > 0 && (
            <small id="client-delete-reason">
              Has {count} proposals — archive them or keep the client
            </small>
          )}
        </div>
      </header>
      {error && (
        <Banner tone="danger" title="Client action failed">
          {error}
        </Banner>
      )}
      <section className="card client-contact-card">
        <h2>Contact details</h2>
        <dl>
          {[
            ["Name", `${client.first_name} ${client.last_name}`.trim()],
            ["Title", client.title],
            [
              "Email",
              <a key="email" href={`mailto:${client.email}`}>
                {client.email}
              </a>,
            ],
            [
              "Phone",
              client.phone ? (
                <a key="phone" href={`tel:${client.phone}`}>
                  {formattedPhone(client.phone)}
                </a>
              ) : (
                ""
              ),
            ],
            ["Address", formattedAddress(client.address)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="card client-billing">
        <header>
          <h2>How they’re billed</h2>
          {billing && (
            <span
              className={`pill ${billing.subscriber ? "success" : "neutral"}`}
            >
              {billing.subscriber
                ? "Stripe subscriber"
                : billing.available
                  ? billing.linked_id
                    ? "No active subscription"
                    : "Stripe customer not linked"
                  : "Stripe not connected"}
            </span>
          )}
        </header>
        {billingError && client.stripe_customer_id && (
          <p>
            <code>{client.stripe_customer_id}</code>{" "}
            <Button onClick={() => setLinkChoice(null)}>Unlink customer</Button>
          </p>
        )}
        {billingError ? (
          <Banner tone="warning" title="Current billing details unavailable">
            {billingError}
            <Button
              onClick={() => {
                setBillingError("");
                api<ClientBilling>(`/api/clients/${client.id}/billing`)
                  .then((value) => {
                    if (!Array.isArray(value.items))
                      throw new Error("Billing details could not be loaded.");
                    setBilling(value);
                  })
                  .catch((e) => setBillingError(e.message));
              }}
            >
              Retry
            </Button>
          </Banner>
        ) : !billing ? (
          <Skeleton kind="cards" label="Loading billing details…" />
        ) : (
          <>
            <p>
              {billing.subscriber
                ? "New monthly items on a signed proposal are added to this customer’s existing subscription when a working card is available. Otherwise billing needs review."
                : billing.notice ||
                  "A new monthly plan starts through Checkout after signature."}
            </p>
            <section
              id="stripe-customers"
              className="stripe-customer-chooser stack"
              aria-label="Stripe customers"
            >
              <h3>
                {billing.linked_id
                  ? "Linked Stripe customer"
                  : "Choose a Stripe customer"}
              </h3>
              {billing.linked_id && (
                <p>
                  <code>{billing.linked_id}</code>{" "}
                  <Button onClick={() => setLinkChoice(null)}>
                    Unlink customer
                  </Button>
                </p>
              )}
              <div className="customer-candidates">
                {(billing.candidates ?? []).map((candidate) => (
                  <article className="stripe-candidate" key={candidate.id}>
                    <strong>{candidate.name}</strong>
                    <code>{candidate.id}</code>
                    <dl>
                      <div>
                        <dt>Created</dt>
                        <dd>
                          {candidate.created
                            ? readableDate(candidate.created)
                            : "Unavailable"}
                        </dd>
                      </div>
                      <div>
                        <dt>Card on file</dt>
                        <dd>{candidate.card || "No default card recorded"}</dd>
                      </div>
                      <div>
                        <dt>Active subscriptions</dt>
                        <dd>{candidate.subscriptions}</dd>
                      </div>
                      <div>
                        <dt>Monthly total</dt>
                        <dd>
                          {candidate.monthly_totals.length
                            ? candidate.monthly_totals
                                .map((t) => `${money(t.amount, t.currency)}/mo`)
                                .join(" · ")
                            : money(0) + "/mo"}
                        </dd>
                      </div>
                    </dl>
                    {candidate.id === billing.linked_id ? (
                      <span className="pill success">Linked</span>
                    ) : (
                      <Button onClick={() => setLinkChoice(candidate.id)}>
                        {billing.linked_id
                          ? "Use this customer"
                          : "Link this customer"}
                      </Button>
                    )}
                  </article>
                ))}
              </div>
            </section>
            <div className="linked-billing-summary" hidden={!billing.linked_id}>
              <div className="current-subscription">
                {billing.items.map((i) => (
                  <p key={i.id}>
                    <strong>
                      {i.name}
                      {i.qty !== 1 ? ` × ${i.qty}` : ""}
                    </strong>
                    <span>
                      {money(i.amount * i.qty, i.currency)}/
                      {i.interval_count > 1 ? i.interval_count : ""}
                      {i.interval === "month"
                        ? "mo"
                        : i.interval === "year"
                          ? "yr"
                          : i.interval}
                    </span>
                  </p>
                ))}
              </div>
              {currencyGroups.map((currency) => (
                <p key={currency}>
                  <strong>
                    Current monthly{" "}
                    {money(
                      billing.items
                        .filter(
                          (i) =>
                            i.currency === currency &&
                            i.interval === "month" &&
                            i.interval_count === 1,
                        )
                        .reduce((v, i) => v + i.amount * i.qty, 0),
                      currency,
                    )}
                    /mo
                  </strong>
                </p>
              ))}
              <small>
                Card on file:{" "}
                {billing.card ??
                  (billing.available
                    ? "No default card recorded"
                    : "Unavailable")}
                {billing.next_invoice &&
                  ` · Next period ends ${readableDate(billing.next_invoice)}`}
              </small>
            </div>
            <div className="actions">
              {billing.stripe_url && (
                <a target="_blank" rel="noreferrer" href={billing.stripe_url}>
                  Open Stripe ↗
                </a>
              )}
              {billing.qbo_url ? (
                <a href={billing.qbo_url} target="_blank" rel="noreferrer">
                  QuickBooks: linked ↗
                </a>
              ) : (
                <span>QuickBooks: not linked</span>
              )}
            </div>
          </>
        )}
      </section>
      <section>
        <header className="section-heading">
          <h2>
            Proposals <span className="count-badge">{count}</span>
          </h2>
        </header>
        <ProposalRows proposals={proposals} data={data} />
      </section>
      <section className="card">
        <header className="section-heading">
          <h2>Notes</h2>
          <Button onClick={() => setEdit(!edit)}>
            {edit ? "Cancel" : "Edit"}
          </Button>
        </header>
        {edit ? (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/api/clients", {
                  ...client,
                  notes: new FormData(e.currentTarget).get("notes"),
                });
                setEdit(false);
                await onRefresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Client notes">
              <textarea
                name="notes"
                defaultValue={client.notes}
                maxLength={10000}
              />
            </Field>
            <Button type="submit" variant="primary">
              Save notes
            </Button>
          </form>
        ) : (
          <p style={{ whiteSpace: "pre-wrap" }}>
            {client.notes || "No notes yet."}
          </p>
        )}
        <small>AI assistants can read these notes when drafting.</small>
      </section>
      {linkChoice !== undefined && (
        <Sheet
          title={
            linkChoice ? "Link Stripe customer?" : "Unlink Stripe customer?"
          }
          onClose={() => {
            if (!busy) setLinkChoice(undefined);
          }}
        >
          <div className="stack">
            <p>
              {linkChoice
                ? `Link ${client.company} to ${linkChoice}? Future billing will use this customer only.`
                : `Unlink ${client.company} from Stripe? Future billing will check for matching customers again.`}
            </p>
            {error && (
              <Banner tone="danger" title="Link could not be changed">
                {error}
              </Banner>
            )}
            <div className="actions">
              <Button disabled={busy} onClick={() => setLinkChoice(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await post(`/api/clients/${client.id}/stripe-customer`, {
                      customer_id: linkChoice,
                      expected_customer_id: client.stripe_customer_id,
                    });
                    setLinkChoice(undefined);
                    await onRefresh();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {linkChoice ? "Confirm link" : "Confirm unlink"}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {editClient && (
        <Sheet
          title={`Edit ${client.company}`}
          onClose={() => {
            if (!busy) setEditClient(false);
          }}
        >
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              const values = clientFormValues(e.currentTarget);
              try {
                await post("/api/clients", {
                  ...client,
                  ...values,
                  qbo_customer_id: values.qbo_customer_id || null,
                  stripe_customer_id: client.stripe_customer_id,
                });
                setEditClient(false);
                await onRefresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <Banner tone="danger" title="Client could not be saved">
                {error}
              </Banner>
            )}
            <ClientContactFields client={client} />
            <Field label="Verified QuickBooks customer ID">
              <input
                name="qbo_customer_id"
                defaultValue={client.qbo_customer_id ?? ""}
              />
            </Field>
            <p>
              Only enter a QuickBooks ID after checking this client’s identity.
              Choose a Stripe customer in How they’re billed.
            </p>
            <Button type="submit" variant="primary" busy={busy}>
              Save client
            </Button>
          </form>
        </Sheet>
      )}
      {confirm && (
        <Sheet
          title={`Delete ${client.company}?`}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="stack">
            <p>
              Delete {client.company} ({client.email})? This client has no
              proposals. This cannot be undone.
            </p>
            {error && (
              <Banner tone="danger" title="Client could not be deleted">
                {error}
              </Banner>
            )}
            <div className="actions">
              <Button disabled={busy} onClick={() => setConfirm(false)}>
                Keep client
              </Button>
              <Button
                variant="danger"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/clients/${client.id}`, {
                      method: "DELETE",
                    });
                    location.href = "/clients";
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                Delete {client.company}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
