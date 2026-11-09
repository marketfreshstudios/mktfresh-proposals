"use client";
import { ChevronDown } from "lucide-react";
import { chromeIcons } from "./staff-icons";
import { Archive, ArchiveRestore, Copy, Pencil } from "lucide-react";
import {
  finalOiotClause,
  oiotPlan,
  oiotKickoffField,
  oiotPurchasePriceField,
} from "../lib/oiot";
import { ProposalQuestions } from "./proposal-questions";
import type { QuestionSummary } from "../lib/proposal-questions";
import { Select, Switch } from "./form-controls";
import {
  ProposalEngagement,
  EngagementListLine,
  useEngagementSummaries,
} from "./proposal-engagement";
import { DialogActions } from "./dialog-actions";
import { CopyClientLink, ManualDeliveryConfirmation } from "./client-link";
import { automaticRemindersEnabled } from "../lib/delivery";
import { ReassignDialog } from "./reassign-proposal";
import { ReplaceSavedBlockDialog } from "./replace-saved-block";
import { canReassign, proposalOwnerId } from "../lib/proposal-owner";
import {
  jobName,
  jobRecordAnchor,
  friendlyJobError,
} from "../lib/job-presentation";
import { Disclosure } from "./ui";
import {
  publicBankState,
  stripeBillingStatus,
} from "../lib/billing-confirmation";
import { StripeBillingDetails } from "./billing-breakdown";
import { QuickBooksBilling } from "./quickbooks-billing";
import { ProposalEmailLog } from "./email-studio";
import { workspaceSetup } from "../lib/workspace-setup";
import { ContactValue } from "./contact-value";
import { EditClientModal } from "./edit-client-modal";
import { formattedAddress } from "../lib/client-contact";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  reportMetricLabel,
  reportParams,
  type ReportDrill,
  type ReportFilters,
} from "../lib/report-filters";
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
import { statusDisplay } from "../lib/status-display";
import { readableDate } from "../lib/validity";
import { onBehalfText } from "../lib/workspace";
import {
  api,
  post,
  ApiError,
  Banner,
  Button,
  Icon,
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
  if (p.source === "proposify_import")
    return <span className="pill neutral">Proposify import</span>;
  const status = statusDisplay(p.status);
  const second = p.archived_at
    ? ["Archived", "neutral"]
    : p.status === "draft" && p.ai_unreviewed
      ? ["AI draft", "ai"]
      : needsCountersign(p)
        ? ["Needs countersign", "warning"]
        : p.client_signed_at && billingIssues(p)
          ? ["Billing issue", "danger"]
          : p.client_signed_at && billingOpen(p)
            ? ["Billing to finish", "info"]
            : null;
  return (
    <span className="pills">
      <span className={`pill ${status.tone}`} data-proposal-status={p.status}>
        {status.name}
      </span>
      {second && <span className={`pill ${second[1]}`}>{second[0]}</span>}
    </span>
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
export function SignLink({
  p,
  data,
  hint,
}: {
  p: Proposal;
  data: Data;
  hint?: string;
}) {
  return canCountersign(p, data.user, data.settings) ? (
    <a
      className="btn primary sign-link"
      aria-describedby={hint}
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
function RowAction({
  label,
  children,
}: {
  label: string;
  children: (hintId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <span className="proposal-row-slot">
      {children(id)}
      <span id={id} className="proposal-row-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  );
}

function canEditRecord(p: Proposal) {
  return (
    p.source === "native" &&
    !p.signers.length &&
    !p.versions.some((version) => version.frozen) &&
    ["draft", "sent", "viewed", "declined", "expired"].includes(p.status)
  );
}
export function ProposalMenu({
  p,
  data,
  onChanged,
  showUndo = true,
  showEdit = true,
  listRow = false,
}: {
  p: Proposal;
  data: Data;
  onChanged?: (p: Proposal) => void;
  showUndo?: boolean;
  showEdit?: boolean;
  listRow?: boolean;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [reassign, setReassign] = useState(false);
  const [replaceBlock, setReplaceBlock] = useState(false);
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState<ProposalAction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [undo, setUndo] = useState<Proposal | null>(null);
  async function act(
    action: ProposalAction,
    note = "",
    target = p,
    editAfter = false,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await post<Proposal>(`/api/proposals/${target.id}/actions`, {
        revision: target.revision,
        action,
        note,
      });
      if (action === "duplicate" || editAfter) {
        location.href = `/proposals/${next.id}${editAfter ? "?action=edit" : ""}`;
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
    editable = !p.archived_at && canEditRecord(p),
    outcome =
      !imported &&
      !p.archived_at &&
      !p.signers.length &&
      ["draft", "sent", "viewed", "expired"].includes(p.status);
  const more = (hintId?: string) => (
    <button
      type="button"
      ref={anchor}
      className="btn ghost more-control round-icon"
      aria-label={`More actions for ${p.client.company}`}
      aria-describedby={hintId}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
    >
      <chromeIcons.more size={18} aria-hidden="true" />
    </button>
  );
  const archived = !!p.archived_at;
  const archiveLabel = archived ? "Unarchive" : "Archive";
  const ArchiveIcon = archived ? ArchiveRestore : Archive;
  const sign = canCountersign(p, data.user, data.settings);
  return (
    <>
      {listRow ? (
        <div
          className="proposal-row-actions"
          role="group"
          aria-label="Proposal actions"
          onClick={(event) => event.stopPropagation()}
        >
          {sign ? (
            <RowAction label="Review and countersign">
              {(hint) => <SignLink p={p} data={data} hint={hint} />}
            </RowAction>
          ) : canEditRecord(p) ? (
            <RowAction label={archived ? "Unarchive and edit" : "Edit"}>
              {(hint) =>
                archived ? (
                  <button
                    className="btn icon-only"
                    type="button"
                    disabled={busy}
                    aria-label="Unarchive and edit"
                    aria-describedby={hint}
                    onClick={() => void act("unarchive", "", p, true)}
                  >
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                ) : (
                  <a
                    className="btn icon-only"
                    href={`/proposals/${p.id}?action=edit`}
                    aria-label="Edit"
                    aria-describedby={hint}
                    onClick={rememberList}
                  >
                    <Pencil size={18} aria-hidden="true" />
                  </a>
                )
              }
            </RowAction>
          ) : (
            <span />
          )}
          {imported ? (
            <span />
          ) : (
            <RowAction label="Duplicate">
              {(hint) => (
                <button
                  className="btn icon-only"
                  type="button"
                  disabled={busy}
                  aria-label="Duplicate"
                  aria-describedby={hint}
                  onClick={() => void act("duplicate")}
                >
                  <Copy size={18} aria-hidden="true" />
                </button>
              )}
            </RowAction>
          )}
          <RowAction label={archiveLabel}>
            {(hint) => (
              <button
                className="btn icon-only"
                type="button"
                disabled={busy}
                aria-label={archiveLabel}
                aria-describedby={hint}
                onClick={() => void act(archived ? "unarchive" : "archive")}
              >
                <ArchiveIcon size={18} aria-hidden="true" />
              </button>
            )}
          </RowAction>
          {imported ? (
            <span />
          ) : (
            <RowAction label="More actions">{more}</RowAction>
          )}
        </div>
      ) : (
        more()
      )}
      {listRow && error && !open && (
        <div className="phase4-toast" role="alert">
          {error}
          <button
            type="button"
            className="btn icon-only"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <chromeIcons.close size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {reassign && (
        <ReassignDialog
          proposal={p}
          onClose={() => setReassign(false)}
          onChanged={(rows) => {
            if (rows[0]) onChanged?.(rows[0]);
          }}
        />
      )}
      {replaceBlock && (
        <ReplaceSavedBlockDialog
          proposal={p}
          onClose={() => setReplaceBlock(false)}
          onChanged={(next) => onChanged?.(next)}
        />
      )}
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
              <DialogActions>
                <Button onClick={() => setConfirm(null)}>Cancel</Button>
                <Button busy={busy} type="submit" variant="primary">
                  Confirm
                </Button>
              </DialogActions>
            </form>
          ) : (
            <nav className="action-menu" aria-label="Proposal actions">
              {listRow && (
                <a
                  href={`/proposals/${p.id}?view=record`}
                  onClick={rememberList}
                >
                  Open record
                </a>
              )}
              {listRow && (
                <a
                  href={`/p/${p.id}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Preview as client
                </a>
              )}
              {!listRow &&
                editable &&
                ["sent", "viewed"].includes(p.status) &&
                p.content.some((b) => b.saved_block_id) && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      setReplaceBlock(true);
                    }}
                  >
                    Replace with latest block
                  </button>
                )}
              {p.token && (
                <CopyClientLink
                  menu
                  token={p.token}
                  appUrl={data.app_url}
                  label="Copy client link"
                />
              )}
              {!listRow && canReassign(p, data.user) && (
                <button
                  onClick={() => {
                    setOpen(false);
                    setReassign(true);
                  }}
                >
                  Reassign…
                </button>
              )}

              {!listRow && canCountersign(p, data.user, data.settings) && (
                <a href={`/proposals/${p.id}?action=countersign`}>
                  Sign — review client-signed document
                </a>
              )}
              {!listRow &&
                showEdit &&
                (editable ? (
                  <a href={`/proposals/${p.id}?action=edit`}>Edit</a>
                ) : (
                  <button disabled>
                    Edit{" "}
                    <small>
                      {imported
                        ? "Imported proposals are read-only."
                        : p.archived_at
                          ? "Unarchive to edit."
                          : "Signed proposals are locked."}
                    </small>
                  </button>
                ))}
              {!listRow && (
                <button
                  disabled={busy || imported}
                  onClick={() => void act("duplicate")}
                >
                  Duplicate
                </button>
              )}
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
                  !["declined", "expired"].includes(p.status) ||
                  !!p.signers.length ||
                  !(p.version_count ?? p.versions.length)
                }
                onClick={() => void act("mark_sent")}
              >
                {listRow ? "Mark as sent again" : "Reopen"}{" "}
                <small>
                  {(p.version_count ?? p.versions.length)
                    ? "Reopen the same client link. No email is sent."
                    : "No sent version. Duplicate to prepare a new proposal."}
                </small>
              </button>
              {!listRow &&
                p.client_signed_at &&
                p.billing_links.some(
                  (l) => l.provider === "qbo" && l.status === "needs_review",
                ) && (
                  <button onClick={() => setConfirm("invoice_manually")}>
                    Mark as invoiced
                  </button>
                )}
              {!listRow && (
                <button
                  disabled={busy}
                  onClick={() => void act(archived ? "unarchive" : "archive")}
                >
                  {archiveLabel}
                </button>
              )}
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
  showOwner = false,
  reportSender = false,
  listActions = false,
  compact = false,
}: {
  showOwner?: boolean;
  reportSender?: boolean;
  listActions?: boolean;
  compact?: boolean;
  proposals: (Proposal & { question_summary?: QuestionSummary })[];
  data: Data;
  onChanged?: (p: Proposal) => void;
}) {
  const [undo, setUndo] = useState<Proposal | null>(null),
    [undoError, setUndoError] = useState("");
  const engagement = useEngagementSummaries(
    proposals.map((p) => p.id).join(","),
  );
  const money = useMoney(),
    yearly = proposals.some((p) =>
      p.quote.some((i) => i.sublines.some((s) => s.interval === "year")),
    );
  return (
    <>
      <div
        className={`proposal-rows ${yearly ? "has-yearly" : ""} ${showOwner ? "has-owner" : ""} ${listActions ? "with-row-actions" : ""} ${compact ? "compact-proposal-rows" : ""}`}
      >
        <div className="proposal-row-head">
          <span>Proposal</span>
          {showOwner && !listActions && (
            <span>{reportSender ? "Owner (sender)" : "Owner"}</span>
          )}
          <span>Status</span>
          <span className="next-cell">Next</span>
          <span>One-time</span>
          <span>Monthly</span>
          {yearly && <span>Yearly</span>}
          {showOwner && listActions && <span>Owner</span>}
          <span className="updated-cell">Updated</span>
          <span />
        </div>
        {!proposals.length ? (
          <p className="empty-copy">No proposals in this view.</p>
        ) : (
          proposals.map((p) => {
            const t = totals(p.quote);
            const owner = showOwner ? (
              <span className="proposal-owner" data-label="Owner">
                {data.staff.find(
                  (m) =>
                    m.user_id ===
                    (reportSender
                      ? (p.sender?.user_id ?? proposalOwnerId(p))
                      : proposalOwnerId(p)),
                )?.display_name ??
                  (reportSender ? p.sender?.display_name : undefined) ??
                  p.owner?.display_name ??
                  p.sender?.display_name ??
                  "—"}
              </span>
            ) : null;
            return (
              <article className="proposal-row clickable-row" key={p.id}>
                <a
                  className="proposal-row-link"
                  href={`/proposals/${p.id}`}
                  aria-label={`Open ${p.client.company}: ${p.title}`}
                  onClick={rememberList}
                />
                <div className="proposal-name">
                  {compact ? (
                    <strong>{p.title}</strong>
                  ) : (
                    <>
                      <strong>{p.client.company}</strong>
                      <span>{p.title}</span>
                    </>
                  )}
                  <EngagementListLine summary={engagement[p.id]} />
                  {!!p.question_summary?.open && (
                    <small className="question-badge open">
                      {p.question_summary.notified > 0
                        ? "New client question · "
                        : ""}
                      {p.question_summary.open} open{" "}
                      {p.question_summary.open === 1 ? "question" : "questions"}
                    </small>
                  )}
                </div>
                {!listActions && owner}
                <div className="proposal-status">
                  <ProposalBadges p={p} />
                  {!listActions && <SignLink p={p} data={data} />}
                </div>
                <span className="next-cell">{nextAction(p)}</span>
                <span className="row-amount one-time" data-label="One-time">
                  {listActions && !t.one_time_total
                    ? "—"
                    : money(t.one_time_total, p.currency)}
                </span>
                <span className="row-amount" data-label="Monthly">
                  {listActions && !t.monthly_total
                    ? "—"
                    : money(t.monthly_total, p.currency) + "/mo"}
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
                {listActions && owner}
                <small className="updated-cell">
                  {listActions && p.archived_at
                    ? "Archived " +
                      readableDate(p.archived_at, data.settings?.timezone)
                    : listActions && p.client_signed_at
                      ? "Signed " +
                        readableDate(
                          p.client_signed_at,
                          data.settings?.timezone,
                        )
                      : listActions && p.first_viewed_at
                        ? "Opened " +
                          readableDate(
                            p.first_viewed_at,
                            data.settings?.timezone,
                          )
                        : listActions && p.sent_at
                          ? "Sent " +
                            readableDate(p.sent_at, data.settings?.timezone)
                          : readableDate(
                              p.updated_at ?? p.created_at,
                              data.settings?.timezone,
                            )}
                </small>
                <ProposalMenu
                  p={p}
                  data={data}
                  showUndo={false}
                  listRow={listActions}
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
export function ReportProposalList({
  data,
  drill,
  filters,
}: {
  data: Data;
  drill: ReportDrill;
  filters: ReportFilters;
}) {
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<{
    total: number;
    items: Proposal[];
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const pageSize = 50;
  const q = reportParams(filters, drill);
  const queryKey = q.toString();
  useEffect(() => {
    const request = new AbortController();
    setResult(null);
    setError("");
    api<{ total: number; items: Proposal[] }>(
      `/api/proposals?${queryKey}&limit=${pageSize}&offset=${offset}`,
      { signal: request.signal },
    )
      .then((next) => {
        if (!request.signal.aborted) setResult(next);
      })
      .catch((e: Error) => {
        if (!request.signal.aborted) setError(e.message);
      });
    return () => request.abort();
  }, [queryKey, offset, retry]);
  return (
    <div className="stack phase4-list">
      <div className="report-panel-heading">
        <div>
          <h2>{reportMetricLabel(drill)}</h2>
          {result && (
            <p role="status" className="muted">
              {result.total} matching{" "}
              {result.total === 1 ? "proposal" : "proposals"}
            </p>
          )}
        </div>
        <a className="btn" href={"/reports?" + reportParams(filters)}>
          Back to Reports
        </a>
      </div>
      {error ? (
        <Banner
          title="Unable to load proposals"
          tone="danger"
          action={<Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>}
        >
          {error}
        </Banner>
      ) : result ? (
        <>
          <ProposalRows
            proposals={result.items}
            data={data}
            showOwner
            reportSender
            onChanged={() => setRetry((n) => n + 1)}
          />
          {result.total > pageSize && (
            <div className="report-pagination">
              <Button
                disabled={!offset}
                onClick={() => setOffset((n) => Math.max(0, n - pageSize))}
              >
                Previous
              </Button>
              <span>
                {offset + 1}–{offset + result.items.length} of {result.total}
              </span>
              <Button
                disabled={offset + pageSize >= result.total}
                onClick={() => setOffset((n) => n + pageSize)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <p role="status">Loading proposals…</p>
      )}
    </div>
  );
}
const primaryViews = [
  "All",
  "Drafts",
  "Sent",
  "Won",
  "Needs countersign",
] as const;
const otherViews = listViews.filter(
  (v) => !primaryViews.some((primary) => primary === v),
);

export function ProposalListV4({
  data,
  initialView = "all",
}: {
  data: Data;
  initialView?: string;
}) {
  const router = useRouter(),
    [rows, setRows] = useState(data.proposals),
    [view, setView] = useState(
      listViews.some((name) => viewKey(name) === initialView)
        ? initialView
        : "all",
    ),
    [search, setSearch] = useState(""),
    [owner, setOwner] = useState("all"),
    [more, setMore] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const counts = Object.fromEntries(
    listViews.map((name) => [
      name,
      rows.filter((p) => inView(p, viewKey(name))).length,
    ]),
  );
  const activeExtra = otherViews.find((name) => viewKey(name) === view);
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
        (owner === "all" ||
          proposalOwnerId(p) ===
            (owner === "mine" ? data.user.actor.slice(6) : owner)) &&
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
    setMore(false);
    router.replace(
      "/proposals" + (v === "all" ? "" : "?view=" + encodeURIComponent(v)),
      { scroll: false },
    );
  }
  return (
    <div className="phase4-list proposal-directory stack">
      <div className="proposal-directory-controls">
        <div className="directory-views">
          <div
            className="proposal-views"
            role="tablist"
            aria-label="Proposal views"
            onKeyDown={(event) => {
              const tabs = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ),
              ];
              const current = tabs.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              if (current === -1) return;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : event.key === "ArrowLeft"
                      ? (current + tabs.length - 1) % tabs.length
                      : event.key === "ArrowRight"
                        ? (current + 1) % tabs.length
                        : -1;
              if (next === -1) return;
              event.preventDefault();
              tabs[next].focus();
              tabs[next].click();
            }}
          >
            {primaryViews.map((name, index) => {
              const selected = view === viewKey(name);
              return (
                <button
                  key={name}
                  id={`proposal-view-${viewKey(name)}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="proposal-view-results"
                  tabIndex={selected || (activeExtra && index === 0) ? 0 : -1}
                  className={selected ? "active" : ""}
                  onClick={() => change(viewKey(name))}
                >
                  {name} <small>{counts[name]}</small>
                </button>
              );
            })}
          </div>
          <button
            ref={moreTrigger}
            type="button"
            className="more-views-trigger"
            aria-haspopup="dialog"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            {activeExtra ? `${activeExtra} · More views` : "More views"}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {more && (
            <Sheet
              title="More views"
              menu
              anchor={moreTrigger.current}
              onClose={() => setMore(false)}
            >
              <nav className="action-menu" aria-label="Other proposal views">
                {otherViews.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-current={view === viewKey(name) ? "page" : undefined}
                    onClick={() => change(viewKey(name))}
                  >
                    {name} <small>{counts[name]}</small>
                  </button>
                ))}
              </nav>
            </Sheet>
          )}
        </div>
        <div className="list-tools">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Search proposals</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search proposals or clients"
            />
          </label>
          <label className="proposal-owner-filter">
            Owner
            <Select
              aria-label="Filter by owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="all">Anyone</option>
              <option value="mine">Mine</option>
              {data.staff.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </label>
          <label className="compact-views">
            View
            <Select
              aria-label="Filter proposals"
              value={view}
              onChange={(e) => change(e.target.value)}
            >
              {listViews.map((v) => (
                <option key={v} value={viewKey(v)}>
                  {v} ({counts[v]})
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
      <div
        id="proposal-view-results"
        role="tabpanel"
        aria-label={activeExtra ?? undefined}
        aria-labelledby={activeExtra ? undefined : `proposal-view-${view}`}
      >
        <ProposalRows
          showOwner
          listActions
          proposals={shown}
          data={data}
          onChanged={(next) =>
            setRows((r) => r.map((p) => (p.id === next.id ? next : p)))
          }
        />
      </div>
    </div>
  );
}
export function HomeV4({
  data,
  onNew,
  deploymentNotice,
}: {
  data: Data;
  onNew: () => void;
  deploymentNotice: ReactNode;
}) {
  const money = useMoney();
  const [rows, setRows] = useState(data.proposals);
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const active = rows.filter((p) => inView(p, "all"));
  const timezone = data.settings?.timezone ?? "UTC";
  const now = new Date();
  const firstName = (data.user.staff_name || "team").trim().split(/\s+/)[0];
  const attention = [
    {
      kind: "review",
      label: "AI draft",
      rows: active.filter((p) => p.status === "draft" && p.ai_unreviewed),
    },
    {
      kind: "signature",
      label: "Needs countersign",
      rows: active.filter(needsCountersign),
    },
    {
      kind: "viewed",
      label: "Viewed",
      rows: active.filter((p) => p.status === "viewed"),
    },
    {
      kind: "billing",
      label: "Billing issue",
      rows: active.filter(billingIssues),
    },
  ];
  const stages = [
    { view: "not-viewed", label: "Sent" },
    { view: "viewed", label: "Viewed" },
    { view: "won", label: "Won" },
  ].map((stage) => ({
    ...stage,
    rows: active.filter((p) => inView(p, stage.view)),
  }));
  const pipeline = stages.flatMap((stage) => stage.rows);
  const currencies = [...new Set(pipeline.map((p) => p.currency))];
  const expiry = (p: Proposal) =>
    p.published_state ? p.published_state.valid_until : p.valid_until;
  const expiring = active
    .filter((p) => expiringWithinSevenDays(p, now.getTime(), timezone))
    .sort((a, b) => Date.parse(expiry(a)!) - Date.parse(expiry(b)!));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  });
  const shortDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
  async function remind(p: Proposal) {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError("");
    try {
      const next = await post<Proposal>(`/api/proposals/${p.id}/actions`, {
        revision: p.revision,
        action: "remind",
      });
      setRows((old) => old.map((row) => (row.id === p.id ? next : row)));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setActionBusy(false);
    }
  }
  if (!data.total) {
    const setup = workspaceSetup(data);
    return (
      <div className="home-v4 first-run stack">
        <section className="home-intro">
          <div>
            <p className="t-eyebrow">Getting started</p>
            <h1 className="t-page-title">
              {setup.complete
                ? "Send your first proposal"
                : `Welcome, ${firstName}.`}
            </h1>
            <p>
              Set up your workspace before sending your first proposal. You can
              come back to these steps in Studio.
            </p>
          </div>
          <Button className="action" onClick={onNew}>
            New proposal
          </Button>
        </section>
        {deploymentNotice}
        <ReferenceStatus documents={data.documents} />
        <div className="home-overview">
          {!setup.complete && (
            <section className="home-reference home-setup-card">
              <header className="section-heading">
                <h2>
                  Set up {data.settings?.company_name ?? "your workspace"}
                </h2>
                <small>
                  {setup.rows.filter((row) => row.complete).length} of{" "}
                  {setup.rows.length} done
                </small>
              </header>
              <progress
                aria-label="Workspace setup progress"
                max={setup.rows.length}
                value={setup.rows.filter((row) => row.complete).length}
              />
              <ol className="setup-checklist">
                {setup.rows.map((row) => (
                  <li key={row.id} data-complete={row.complete}>
                    <span className="setup-mark" aria-hidden="true">
                      <Icon name={row.complete ? "verified" : "clock"} />
                    </span>
                    <div>
                      <strong>{row.label}</strong>
                      <p>{row.detail}</p>
                    </div>
                    {row.complete ? (
                      <span className="pill success">Done</span>
                    ) : (
                      <a className="btn" href={row.href}>
                        {row.action}
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="home-reference home-import-card">
            <h2>Moving from Proposify?</h2>
            <p>
              Bring your past proposals and clients with you. Imported proposals
              are read-only and keep their PDFs.
            </p>
            <a className="btn" href="/studio/connections?view=imports">
              Import from Proposify
            </a>
          </section>
        </div>
      </div>
    );
  }
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now),
  );
  return (
    <div className="home-v4 stack">
      <section className="home-intro">
        <div>
          <p className="t-eyebrow">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: timezone,
            }).format(now)}
          </p>
          <h1 className="t-page-title">
            Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"},{" "}
            {firstName}
          </h1>
        </div>
        <Button className="action" onClick={onNew}>
          New proposal
        </Button>
      </section>
      {deploymentNotice}
      <ReferenceStatus documents={data.documents} />
      {actionError && (
        <Banner tone="danger" title="Action could not be completed">
          {actionError}
        </Banner>
      )}
      <div className="home-overview">
        <section className="home-pipeline" aria-labelledby="open-pipeline">
          <header className="home-pipeline-heading">
            <h2 id="open-pipeline">
              Open pipeline · {pipeline.length}{" "}
              {pipeline.length === 1 ? "proposal" : "proposals"}
            </h2>
            <p>Sent, viewed and won</p>
          </header>
          {currencies.length ? (
            currencies.map((currency) => {
              const value = pipeline
                .filter((p) => p.currency === currency)
                .reduce(
                  (sum, p) => {
                    const amounts = totals(
                      p.client_signed_at
                        ? (p.versions.at(-1)?.quote ?? p.quote)
                        : draftItems(p.quote),
                    );
                    return {
                      once: sum.once + amounts.one_time_total,
                      month: sum.month + amounts.monthly_total,
                      year: sum.year + amounts.yearly_total,
                    };
                  },
                  { once: 0, month: 0, year: 0 },
                );
              return (
                <div
                  key={currency}
                  className="home-pipeline-amounts"
                  aria-label={currency}
                >
                  <div>
                    <strong className="t-hero-number">
                      {money(value.month, currency)}
                      <small>/mo</small>
                    </strong>
                    <span>Recurring</span>
                  </div>
                  <div>
                    <strong className="t-hero-number">
                      {money(value.once, currency)}
                    </strong>
                    <span>One-time</span>
                  </div>
                  {!!value.year && (
                    <div>
                      <strong className="t-hero-number">
                        {money(value.year, currency)}
                        <small>/yr</small>
                      </strong>
                      <span>Yearly</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p>No proposals in the pipeline yet.</p>
          )}
          <div className="home-pipeline-bar" aria-hidden="true">
            {stages.map(
              ({ view, rows }) =>
                rows.length > 0 && (
                  <span
                    key={view}
                    data-stage={view}
                    style={{ flex: rows.length }}
                  />
                ),
            )}
          </div>
          <ul className="home-pipeline-legend" role="list">
            {stages.map(({ view, label, rows }) => (
              <li key={view} data-stage={view}>
                <a href={`/proposals?view=${view}`}>
                  {label} · {rows.length}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section
          className="home-reference home-expiring"
          aria-labelledby="expiring-title"
        >
          <header className="section-heading">
            <h2 id="expiring-title">Expiring this week</h2>
            <a href="/proposals">All proposals</a>
          </header>
          <p>Links that close in the next 7 days.</p>
          {expiring.length ? (
            <ul role="list">
              {expiring.map((p) => (
                <li key={p.id}>
                  <a href={`/proposals/${p.id}`}>
                    <span>
                      <strong>{p.client.company}</strong>
                      <small>{p.title}</small>
                    </span>
                    <time
                      dateTime={expiry(p)!}
                      title={readableDate(expiry(p)!, timezone)}
                    >
                      Closes {weekday.format(new Date(expiry(p)!))}
                    </time>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No links close in the next 7 days.</p>
          )}
        </section>
      </div>
      <section className="home-attention" aria-labelledby="attention-title">
        <header className="section-heading">
          <h2 id="attention-title">Needs your attention</h2>
          <a href="/proposals">View all proposals</a>
        </header>
        {attention.every((group) => !group.rows.length) && (
          <div className="home-reference">
            <h3>You’re all caught up.</h3>
            <p>
              Drafts to review, signatures to countersign and billing problems
              will appear here.
            </p>
          </div>
        )}
        <div className="home-attention-list">
          {attention.flatMap(({ kind, label, rows }) =>
            rows.map((p) => {
              const client = p.signers.find(
                (signer) => signer.role === "client",
              );
              const context =
                kind === "review"
                  ? `Drafted by ${p.ai_connector || "an AI assistant"}`
                  : kind === "signature" && client
                    ? `Signed by ${client.name} · ${shortDate.format(new Date(client.signed_at))}`
                    : kind === "viewed" && p.first_viewed_at
                      ? `Opened ${shortDate.format(new Date(p.first_viewed_at))}`
                      : kind === "billing"
                        ? "Review the billing handoff"
                        : "The client is deciding";
              const amounts = totals(p.quote);
              const summary = [
                amounts.one_time_total
                  ? money(amounts.one_time_total, p.currency)
                  : "",
                amounts.monthly_total
                  ? money(amounts.monthly_total, p.currency) + "/mo"
                  : "",
                amounts.yearly_total
                  ? money(amounts.yearly_total, p.currency) + "/yr"
                  : "",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <article
                  className="home-attention-row"
                  data-kind={kind}
                  key={kind + p.id}
                >
                  <span className="attention-chip">{label}</span>
                  <div>
                    <a
                      className="home-attention-title"
                      href={`/proposals/${p.id}`}
                    >
                      {p.client.company} — {p.title}
                    </a>
                    <p>{context}</p>
                  </div>
                  <strong className="home-attention-amount">
                    {summary || "—"}
                  </strong>
                  {kind === "signature" &&
                  canCountersign(p, data.user, data.settings) ? (
                    <SignLink p={p} data={data} />
                  ) : kind === "viewed" &&
                    p.token &&
                    (!expiry(p) || Date.parse(expiry(p)!) > now.getTime()) ? (
                    <Button busy={actionBusy} onClick={() => void remind(p)}>
                      Remind
                    </Button>
                  ) : (
                    <a className="btn" href={`/proposals/${p.id}`}>
                      {kind === "review" ? "Review" : "Open"}
                    </a>
                  )}
                </article>
              );
            }),
          )}
        </div>
      </section>
      <section>
        <header className="section-heading">
          <h2>Recent proposals</h2>
          <a href="/proposals">View all</a>
        </header>
        <ProposalRows
          proposals={active
            .toSorted(
              (a, b) =>
                Date.parse(b.updated_at ?? b.created_at) -
                Date.parse(a.updated_at ?? a.created_at),
            )
            .slice(0, 6)}
          data={data}
          onChanged={(next) =>
            setRows((old) => old.map((p) => (p.id === next.id ? next : p)))
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
          <Disclosure>Items not chosen ({excluded.length})</Disclosure>
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
      className="record-countersign-sheet"
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
              <h3>What the client agreed to</h3>
              <QuoteSummary p={p} />
              <p>Version {version?.version_no}</p>
              <code className="hash">{version?.content_hash}</code>
            </section>
            {!s?.image || !s.user_id ? (
              <>
                <section className="client-signature-preview">
                  <h3>Client signature</h3>
                  {client ? (
                    <SignatureEvidence signer={client} data={data} />
                  ) : (
                    <Banner
                      tone="warning"
                      title="Client signature unavailable"
                    />
                  )}
                </section>
                <Banner
                  tone="warning"
                  title={
                    !s?.image
                      ? "No signature saved — add one in Workspace"
                      : "Company signatory setup required"
                  }
                >
                  <a href="/studio/workspace#signatory">Open Workspace</a> to
                  save the designated signatory and their signature.
                </Banner>
              </>
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
                <div className="countersign-previews">
                  <section className="client-signature-preview">
                    <h3>Client signature</h3>
                    {client ? (
                      <SignatureEvidence signer={client} data={data} />
                    ) : (
                      <Banner
                        tone="warning"
                        title="Client signature unavailable"
                      />
                    )}
                  </section>
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
                </div>
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
                <DialogActions>
                  <Button disabled={busy} onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="action"
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
                </DialogActions>
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
  const [reminders, setReminders] = useState(automaticRemindersEnabled(p));
  useEffect(
    () => setReminders(automaticRemindersEnabled(p)),
    [p.id, p.automatic_reminders, p.delivery_method],
  );
  const [share, setShare] = useState(false),
    [reminderBusy, setReminderBusy] = useState(false);
  useEffect(() => {
    setShare(
      new URLSearchParams(window.location.search).get("delivery") ===
        "manual" &&
        p.delivery_method === "manual" &&
        !!p.token &&
        !!p.sent_at,
    );
  }, [p.id, p.delivery_method]);
  function closeShare() {
    setShare(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("delivery");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  const applying = useRef(false);
  const [highlightedJob, setHighlightedJob] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    setHighlightedJob(id);
    if (id)
      requestAnimationFrame(() => {
        const row = window.document.getElementById(jobRecordAnchor(id));
        row?.scrollIntoView({ block: "center" });
        row?.focus({ preventScroll: true });
      });
  }, [p.id]);
  const router = useRouter(),
    [document, setDocument] = useState(false),
    [already, setAlready] = useState(""),
    [returnUrl, setReturnUrl] = useState("/proposals"),
    [invoice, setInvoice] = useState(false),
    [invoiceBusy, setInvoiceBusy] = useState(false),
    [recordBusy, setRecordBusy] = useState(false),
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
  const failedJob = p.jobs.find((job) => job.status === "failed");
  const archive = !!p.archived_at;
  const editable = canEditRecord(p) && !archive;
  const authorized = canCountersign(p, data.user, data.settings);
  const recordUrl = `/proposals/${p.id}`;
  const downloadUrl = `/api/proposals/${p.id}/download`;
  const countersignUrl = recordUrl + "?action=countersign";
  const clientName = p.client.first_name || "Client";
  const timezone = data.settings?.timezone ?? "UTC";
  const expires = p.published_state
    ? p.published_state.valid_until
    : p.valid_until;
  const open =
    !archive &&
    native &&
    !!p.token &&
    ["sent", "viewed"].includes(p.status) &&
    (!expires || Date.parse(expires) > Date.now());
  const stripe = p.billing_links.find((link) => link.provider === "stripe");
  const resend =
    !archive &&
    actualSigned &&
    !!p.token &&
    stripe?.metadata?.requires_checkout === true;
  const manual =
    !archive &&
    actualSigned &&
    p.billing_links.some(
      (link) => link.provider === "qbo" && link.status === "needs_review",
    );
  const signedVersion = p.versions.at(-1);
  const signedOiot =
    signedVersion?.frozen &&
    signedVersion.content.some((block) => block.clauses?.some(finalOiotClause))
      ? signedVersion.variables_resolved
      : undefined;
  const attention = !archive && native && actualSigned && issues;
  const complete =
    !archive && native && actualSigned && !!company && !billingOpen(p);
  const retryBilling = async () => {
    try {
      await post(`/api/proposals/${p.id}/retry`);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function runAction(action: ProposalAction) {
    if (recordBusy) return;
    setRecordBusy(true);
    setError("");
    try {
      onChanged(
        await post<Proposal>(`/api/proposals/${p.id}/actions`, {
          revision: p.revision,
          action,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }
  const billingSubject = p.client.first_name
    ? `${p.client.first_name} ${p.client.last_name}`.trim()
    : p.client.company;
  const nextOwner =
    archive || !native || complete || p.marked_won_by
      ? "nothing to do"
      : attention
        ? billingSubject
        : signature
          ? data.settings?.company_signatory?.name || "company signatory"
          : open || resend
            ? billingSubject
            : "you";
  const nextTitle = archive
    ? "This proposal is archived."
    : !native
      ? "Imported from Proposify."
      : p.marked_won_by
        ? `Marked as won by ${person(p.marked_won_by, data)}, no client signature.`
        : attention
          ? resend
            ? "Stripe Checkout wasn’t finished."
            : "Review the billing handoff."
          : signature
            ? `${clientName} signed. Countersign to finish.`
            : failedJob
              ? `${jobName(
                  failedJob,
                  p.billing_links
                    .filter((link) => link.status !== "succeeded")
                    .map((link) => link.provider),
                )} needs attention.`
              : complete
                ? "Signed, countersigned and billed."
                : p.status === "viewed"
                  ? "The client is reviewing your proposal."
                  : p.status === "sent"
                    ? "Waiting for the client to open the proposal."
                    : p.status === "declined"
                      ? "This proposal is closed."
                      : p.status === "expired"
                        ? "The client link expired."
                        : p.status === "draft"
                          ? "Review and send your proposal."
                          : resend
                            ? "The client still needs to finish billing setup."
                            : "Billing is being prepared.";
  const nextDetail = attention
    ? "Signatures are safe. Use the available billing actions below."
    : signature
      ? "The client’s chosen scope and prices are frozen. Review the signed proposal before applying the company signature."
      : p.marked_won_by
        ? "No electronic signature or automatic billing was created."
        : open && p.first_viewed_at
          ? `First opened ${timestamp(p.first_viewed_at, data)}.`
          : complete &&
              p.files.some(
                (file) => file.kind === "sealed" && file.stage === "company",
              )
            ? "The sealed agreement is available to download."
            : "";
  const primary = archive ? (
    <Button
      className="record-primary"
      busy={recordBusy}
      onClick={() => void runAction("unarchive")}
    >
      Unarchive
    </Button>
  ) : signature ? (
    authorized ? (
      <a className="btn record-primary action" href={countersignUrl}>
        Review &amp; countersign
      </a>
    ) : (
      <Button
        className="record-primary action"
        disabled
        title="Your staff account is not authorized to countersign."
      >
        Review &amp; countersign
      </Button>
    )
  ) : editable ? (
    <a
      className="btn record-primary record-edit"
      href={recordUrl + "?action=edit"}
    >
      Edit
    </a>
  ) : (
    <a className="btn record-primary" href={downloadUrl}>
      Download PDF
    </a>
  );
  return (
    <div className="record-v4 stack">
      {share && p.token && (
        <ManualDeliveryConfirmation
          p={p}
          appUrl={data.app_url}
          onClose={closeShare}
        />
      )}
      <div className="record-toolbar">
        <a href={returnUrl} className="staff-back">
          <chromeIcons.back size={16} aria-hidden="true" /> Back to proposals
        </a>
        <div className="record-primary-actions">
          {native && !archive && (
            <a
              className="btn record-preview"
              target="_blank"
              rel="noreferrer"
              href={`/p/${p.id}?preview=1`}
            >
              <span>Preview as client</span>
            </a>
          )}
          {primary}
        </div>
        <ProposalMenu
          p={p}
          data={data}
          onChanged={onChanged}
          showEdit={native && (archive || signature || !!p.signers.length)}
        />
      </div>
      <header className="record-identity">
        <div>
          <span>{p.client.company}</span>
          <ProposalBadges p={p} />
        </div>
        <h1 className="t-page-title">{p.title}</h1>
      </header>
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
          ["Completed", company && !billingOpen(p) ? company.signed_at : null],
        ].map(([label, when]) => (
          <li key={label} className={when ? "done" : ""}>
            <strong>{label}</strong>
            <span className="sr-only">
              {when ? timestamp(when, data) : "Waiting"}
            </span>
          </li>
        ))}
      </ol>
      <section className={`next-card ${attention ? "billing-attention" : ""}`}>
        <div className="next-copy">
          <span className="t-eyebrow">
            {attention
              ? "Billing needs attention"
              : complete
                ? "Completed"
                : "Next step"}{" "}
            · {nextOwner}
          </span>
          <h2>{nextTitle}</h2>
          {nextDetail && <p>{nextDetail}</p>}
        </div>
        <div className="actions record-next-actions">
          {attention ? (
            <>
              {resend && (
                <Button
                  busy={recordBusy}
                  onClick={() => void runAction("resend_billing_link")}
                >
                  Resend payment link
                </Button>
              )}
              {manual && (
                <Button
                  onClick={() => {
                    setError("");
                    setInvoice(true);
                  }}
                >
                  Invoice manually
                </Button>
              )}
              {(!resend || !manual) && (
                <Button onClick={() => void retryBilling()}>
                  Retry billing
                </Button>
              )}
            </>
          ) : signature && authorized ? (
            <a className="btn" href={countersignUrl}>
              Review &amp; countersign
            </a>
          ) : open ? (
            <>
              <Button
                busy={recordBusy}
                onClick={() => void runAction("remind")}
              >
                Send reminder now
              </Button>
              <CopyClientLink
                token={p.token!}
                appUrl={data.app_url}
                label="Copy client link"
                buttonOnly
              />
            </>
          ) : complete ? (
            <>
              <a className="btn" href={downloadUrl}>
                Download sealed PDF
              </a>
              {typeof stripe?.metadata?.stripe_url === "string" && (
                <a
                  className="btn"
                  href={stripe.metadata.stripe_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Stripe
                </a>
              )}
            </>
          ) : resend ? (
            <Button
              busy={recordBusy}
              onClick={() => void runAction("resend_billing_link")}
            >
              Resend payment link
            </Button>
          ) : null}
        </div>
      </section>
      <div className="record-columns record-sheet">
        <div className="record-aside">
          <section className="record-quote">
            <header className="section-heading">
              <h2>
                {actualSigned
                  ? "As signed"
                  : p.sent_at
                    ? "Quote, as sent"
                    : "Quote"}
              </h2>
              <Button onClick={() => setDocument(true)}>Open document</Button>
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
          {actualSigned && (
            <section className="record-signatures">
              <h2>Signatures</h2>
              <p>Signed proposals are locked.</p>
              {p.signers.map((signer) => (
                <SignatureEvidence
                  key={signer.role}
                  signer={signer}
                  data={data}
                />
              ))}
              {!company && (
                <p>
                  {data.settings?.company_signatory?.name ?? "Company"} ·
                  Awaiting signature
                </p>
              )}
            </section>
          )}
          <section className="record-billing stack">
            <h2>Billing</h2>
            {signedOiot && (
              <div className="stack">
                <h3>{oiotPlan.name}</h3>
                <p>
                  Website purchase price {signedOiot[oiotPurchasePriceField]} ·
                  Kickoff {signedOiot[oiotKickoffField]}
                </p>
                <p>{oiotPlan.billingNote}</p>
              </div>
            )}
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
                      className={`pill ${publicBankState(link) === "failed" ? "danger" : publicBankState(link) === "processing" ? "warning" : link.status === "succeeded" && !(link.provider === "stripe" && link.metadata?.requires_checkout) ? "success" : link.status === "failed" ? "danger" : "warning"}`}
                    >
                      {link.provider === "stripe" &&
                      link.status === "succeeded" &&
                      stripeBillingStatus(link).labels.length
                        ? stripeBillingStatus(link).labels[0]
                        : link.metadata?.manual_invoice &&
                            link.status === "succeeded"
                          ? "Invoiced manually"
                          : link.provider === "qbo" &&
                              link.status !== "succeeded"
                            ? link.metadata?.action === "Invoice manually"
                              ? "Invoice manually"
                              : "Billing to finish"
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
                            The proposal is signed. We’re waiting for Checkout
                            confirmation.
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
                    {link.provider === "stripe" && (
                      <StripeBillingDetails link={link} />
                    )}
                    {link.provider === "qbo" &&
                      !link.metadata?.skipped &&
                      !link.metadata?.manual_invoice && (
                        <QuickBooksBilling
                          proposal={p}
                          link={link}
                          onRefresh={onRefresh}
                        />
                      )}
                    {link.provider === "qbo" &&
                      link.status === "needs_review" &&
                      !link.external_object_id &&
                      !link.metadata?.customer_candidates && (
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
                  <div
                    key={j.id}
                    id={jobRecordAnchor(j.id)}
                    tabIndex={-1}
                    className={
                      highlightedJob === j.id
                        ? "record-job-highlight"
                        : undefined
                    }
                    data-job-id={j.id}
                  >
                    <JobState
                      state={
                        j.status === "running"
                          ? "running"
                          : j.status === "failed" || j.last_error
                            ? "failed"
                            : "queued"
                      }
                      label={jobName(
                        j,
                        p.billing_links
                          .filter((l) => l.status !== "succeeded")
                          .map((l) => l.provider),
                      )}
                      error={
                        j.last_error
                          ? friendlyJobError(j.last_error).message
                          : undefined
                      }
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
                  </div>
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
          <ProposalEmailLog id={p.id} revision={p.revision} />
          <section className="record-files stack">
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
                <Disclosure>Version {v.version_no} · content hash</Disclosure>
                <code className="hash">{v.content_hash}</code>
              </details>
            )}
          </section>
        </div>
        <div className="record-support">
          <section className="record-details">
            <h2>Details</h2>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>
                  {data.staff.find(
                    (member) => member.user_id === proposalOwnerId(p),
                  )?.display_name ||
                    p.owner?.display_name ||
                    p.sender?.display_name ||
                    person(p.created_by, data)}
                </dd>
              </div>
              <div>
                <dt>Client</dt>
                <dd>
                  {[p.client.first_name, p.client.last_name]
                    .filter(Boolean)
                    .join(" ")}
                  {p.client.email && (
                    <>
                      {" "}
                      ·{" "}
                      <a href={`mailto:${p.client.email}`}>{p.client.email}</a>
                    </>
                  )}
                </dd>
              </div>
              {p.sent_at && (
                <div>
                  <dt>Sent</dt>
                  <dd>
                    {timestamp(p.sent_at, data)}
                    {p.sender && ` by ${p.sender.display_name}`}
                  </dd>
                </div>
              )}
              <div>
                <dt>Expires</dt>
                <dd>
                  {expires
                    ? readableDate(expires, data.settings?.timezone)
                    : "No expiry"}
                </dd>
              </div>
            </dl>
            {p.token && (
              <div className="record-link-header">
                <CopyClientLink token={p.token} appUrl={data.app_url} />
              </div>
            )}
            {native && p.token && (
              <section className="record-reminders">
                <label className="check">
                  <Switch
                    checked={reminders}
                    disabled={
                      reminderBusy ||
                      !!p.archived_at ||
                      !!p.signers.length ||
                      !["sent", "viewed"].includes(p.status)
                    }
                    onChange={async (e) => {
                      const enabled = e.target.checked;
                      setReminders(enabled);
                      setReminderBusy(true);
                      setError("");
                      try {
                        onChanged(
                          await post<Proposal>(
                            `/api/proposals/${p.id}/reminders`,
                            {
                              revision: p.revision,
                              enabled,
                            },
                          ),
                        );
                      } catch (e) {
                        setReminders(automaticRemindersEnabled(p));
                        setError((e as Error).message);
                      } finally {
                        setReminderBusy(false);
                      }
                    }}
                  />
                  Automatic reminders from the app
                </label>
                <small className="muted">
                  {["sent", "viewed"].includes(p.status) &&
                  !p.signers.length &&
                  !p.archived_at
                    ? automaticRemindersEnabled(p)
                      ? "The app can email scheduled reminders. You can still send a reminder yourself at any time."
                      : "Scheduled reminders are off. Send reminder still works when you need it."
                    : "Reminders stop after signing or closing."}
                </small>
              </section>
            )}
          </section>
          <section className="timeline">
            <header className="section-heading">
              <h2>Timeline</h2>
              <a href={`/proposals/${p.id}?view=evidence`}>Evidence</a>
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
                  {typeof e.metadata.reason === "string" &&
                    e.metadata.reason && (
                      <blockquote>{e.metadata.reason}</blockquote>
                    )}
                  <div className="timeline-entry-meta">
                    <small>{timestamp(e.created_at, data)}</small>{" "}
                    <a href={`/proposals/${p.id}?view=evidence#event-${e.id}`}>
                      View evidence
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
      {native && p.token && (
        <ProposalQuestions
          key={p.id}
          id={p.id}
          timezone={data.settings?.timezone ?? "UTC"}
        />
      )}
      {native && (
        <ProposalEngagement
          knownRecipient={!!p.token && !!p.client.email}
          id={p.id}
          timezone={data.settings?.timezone ?? "UTC"}
          notify={data.settings?.engagement_notifications?.in_app !== false}
        />
      )}
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
            <DialogActions>
              <Button disabled={invoiceBusy} onClick={() => setInvoice(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" busy={invoiceBusy}>
                Mark as invoiced
              </Button>
            </DialogActions>
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
function ClientInitials({ company }: { company: string }) {
  return (
    <span className="client-initials" aria-hidden="true">
      {company
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()}
    </span>
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
    [clientView, setClientView] = useState("all"),
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
      <section className="clients-v4 clients-directory-v4 stack">
        <header className="directory-heading">
          <h1 className="t-page-title">Clients</h1>
          <Button onClick={() => setNewClient(true)}>New client</Button>
        </header>
        <div className="list-tools">
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search clients"
              placeholder="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <fieldset className="client-views">
            <legend className="sr-only">Client views</legend>
            {[
              ["all", "All"],
              ["stripe", "Billing in Stripe"],
              ["open", "Open proposals"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={clientView === value}
                onClick={() => setClientView(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="client-directory client-table">
          <div className="client-table-head">
            {["Client", "Contact", "Proposals", "Monthly now", "Billing"].map(
              (label) => (
                <span key={label}>{label}</span>
              ),
            )}
          </div>
          {data.clients.map((c) => {
            const proposals = data.proposals.filter(
              (p) => p.client.id === c.id && inView(p, "all"),
            );
            const open = proposals.filter((p) => inView(p, "sent")).length;
            const awaiting = proposals.filter(needsCountersign).length;
            const drafts = proposals.filter((p) => p.status === "draft").length;
            const proposalStatus = awaiting
              ? `${awaiting} to countersign`
              : proposals.some(billingIssues)
                ? "Billing issue"
                : open
                  ? `${open} open`
                  : drafts
                    ? `${drafts} ${drafts === 1 ? "draft" : "drafts"}`
                    : "—";
            if (
              (clientView === "stripe" && !c.stripe_customer_id) ||
              (clientView === "open" && !open && !awaiting) ||
              !`${c.company} ${c.email} ${c.first_name} ${c.last_name}`
                .toLowerCase()
                .includes(search.toLowerCase())
            )
              return null;
            return (
              <article key={c.id} className="client-table-row clickable-row">
                <a
                  className="whole-row-link"
                  href={`/clients/${c.id}`}
                  aria-label={`Open ${c.company}`}
                />
                <strong data-label="Company">
                  <ClientInitials company={c.company} />
                  {c.company}
                </strong>
                <span data-label="Contact">
                  {c.first_name} {c.last_name}
                </span>
                <span data-label="Proposals">{proposalStatus}</span>
                <span data-label="Monthly now">
                  {c.stripe_customer_id ? (
                    <a
                      className="inner-action"
                      href={`/clients/${c.id}`}
                      title="Open the client to see live billing"
                      aria-label="Open the client to see live billing"
                    >
                      —
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
                <span data-label="Billing">
                  <span
                    className={`pill ${c.stripe_customer_id ? "info" : "neutral"}`}
                  >
                    {c.stripe_customer_id
                      ? "Stripe linked"
                      : "Not billed through Stripe"}
                  </span>
                </span>
              </article>
            );
          })}
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
  const activity = proposals
    .flatMap((proposal) =>
      proposal.events.map((entry) => ({ proposal, entry })),
    )
    .sort(
      (a, b) => Date.parse(b.entry.created_at) - Date.parse(a.entry.created_at),
    )
    .slice(0, 5);
  const currencyGroups = [
    ...new Set(billing?.items.map((i) => i.currency) ?? []),
  ];
  return (
    <div className="client-detail-v4 stack">
      <header className="client-detail-header">
        <div className="client-detail-toolbar">
          <a href="/clients" className="staff-back">
            <chromeIcons.back size={16} aria-hidden="true" /> Clients
          </a>
          <DialogActions>
            <Button onClick={() => setEditClient(true)}>Edit client</Button>
            <a
              className="btn action"
              href={`/proposals?new=1&client=${client.id}`}
            >
              New proposal
            </a>
          </DialogActions>
        </div>
        <div className="client-identity">
          <ClientInitials company={client.company} />
          <div>
            <h1 className="t-page-title">{client.company}</h1>
            <div className="client-identity-contact">
              <span>
                {client.first_name} {client.last_name}
              </span>
              <ContactValue kind="email" value={client.email} />
              {client.phone && (
                <ContactValue kind="phone" value={client.phone} />
              )}
            </div>
          </div>
        </div>
      </header>
      {error && (
        <Banner tone="danger" title="Client action failed">
          {error}
        </Banner>
      )}
      <section className="client-billing">
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
              <div className="customer-candidates">
                {(billing.candidates ?? [])
                  .filter(
                    (candidate) =>
                      !billing.linked_id || candidate.id === billing.linked_id,
                  )
                  .map((candidate) => (
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
                          <dd>
                            {candidate.card || "No default card recorded"}
                          </dd>
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
                                  .map(
                                    (t) => `${money(t.amount, t.currency)}/mo`,
                                  )
                                  .join(" · ")
                              : money(0) + "/mo"}
                          </dd>
                        </div>
                      </dl>
                      {candidate.id === billing.linked_id ? (
                        <DialogActions>
                          <span className="pill success">Linked</span>
                          <Button onClick={() => setLinkChoice(null)}>
                            Unlink customer
                          </Button>
                        </DialogActions>
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
            <DialogActions>
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
            </DialogActions>
          </>
        )}
      </section>
      <section className="client-proposals">
        <header className="section-heading">
          <h2>
            Proposals <span className="count-badge">{count}</span>
          </h2>
        </header>
        <ProposalRows proposals={proposals} data={data} compact />
      </section>
      <section className="client-notes">
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
      <section className="client-activity">
        <h2>Activity</h2>
        {activity.length ? (
          <ol role="list">
            {activity.map(({ proposal, entry }) => (
              <li key={entry.id}>
                <a
                  href={`/proposals/${proposal.id}?view=evidence#event-${entry.id}`}
                >
                  <span>
                    <strong>{eventTitle(entry, data)}</strong>
                    <br />
                    {proposal.title}
                  </span>
                  <time dateTime={entry.created_at}>
                    {timestamp(entry.created_at, data)}
                  </time>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p>No recent proposal activity.</p>
        )}
      </section>
      <section className="client-contact-card">
        <h2>Contact details</h2>
        <dl>
          {[
            ["Title", client.title],
            ["Address", formattedAddress(client.address)],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{label}</dt>
              <dd>{value || "—"}</dd>
            </div>
          ))}
        </dl>
        <DialogActions>
          <a className="btn" href={`mailto:${client.email}`}>
            Email {client.first_name || "client"}
          </a>
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
        </DialogActions>
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
                : `Unlink ${client.company} from Stripe customer ${client.stripe_customer_id}? Future billing will check for matching customers again.`}
            </p>
            {error && (
              <Banner tone="danger" title="Link could not be changed">
                {error}
              </Banner>
            )}
            <DialogActions>
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
            </DialogActions>
          </div>
        </Sheet>
      )}
      {editClient && (
        <EditClientModal
          client={client}
          onClose={() => setEditClient(false)}
          onSaved={async () => {
            await onRefresh();
          }}
        />
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
            <DialogActions>
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
            </DialogActions>
          </div>
        </Sheet>
      )}
    </div>
  );
}
