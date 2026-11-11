"use client";
import { ToastSurface } from "./toast-surface";
import { StaffSectionHeading } from "./staff-section-heading";
import { StaffPerson } from "./staff-person";
import { withCount } from "../lib/count-label";
import { Empty } from "./ui";
import { StaffTable, StaffTableHead, StaffTableEmpty } from "./staff-table";
import {
  Check,
  ChevronDown,
  CircleX,
  CreditCard,
  EyeOff,
  FileInput,
  Hourglass,
  type LucideIcon,
} from "lucide-react";
import { chromeIcons, SigningIcon } from "./staff-icons";
import { Archive, ArchiveRestore, Copy, SquarePen } from "lucide-react";
import {
  finalOiotClause,
  oiotPlan,
  oiotKickoffField,
  oiotPurchasePriceField,
} from "../lib/oiot";
import { ProposalQuestions, useProposalQuestions } from "./proposal-questions";
import type { QuestionSummary } from "../lib/proposal-questions";
import { Select, Switch } from "./form-controls";
import {
  ProposalEngagement,
  EngagementListLine,
  useEngagementSummaries,
} from "./proposal-engagement";
import { DialogActions } from "./dialog-actions";
import { CopyClientLink, ManualDeliveryConfirmation } from "./client-link";
import {
  automaticRemindersEnabled,
  isAutomaticReminder,
} from "../lib/delivery";
import { clientReminderAllowed, dueClientReminders } from "../lib/reminders";
import { afterLocalDays } from "../lib/reminder-time";
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
  completedCheckouts,
  publicBankState,
  stripeBillingStatus,
} from "../lib/billing-confirmation";
import { RecordBillingRow, StripeBillingDetails } from "./billing-breakdown";
import { QuickBooksBilling } from "./quickbooks-billing";
import { quickBooksCustomerReview } from "../lib/qbo-mapping";
import { ProposalEmailLog } from "./email-studio";
import { HomeSetup } from "./home-setup";
import { HomePipeline } from "./home-pipeline";
import { ContactValue } from "./contact-value";
import { EditClientModal } from "./edit-client-modal";
import { formattedAddress, formattedPhone } from "../lib/client-contact";
import {
  clientDeleteBlocker,
  keepClientHistory,
} from "../lib/client-retention";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  reportMetricLabel,
  reportParams,
  type ReportDrill,
  type ReportFilters,
} from "../lib/report-filters";
import type { Data } from "./staff-app";
import type {
  Proposal,
  Client,
  Audit,
  Quote,
  QuoteItem,
  Signer,
} from "../lib/model";
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
  waitingForInvoiceCountersignature,
  quickBooksInvoiceTiming,
} from "../lib/proposal-state";
import type { ProposalAction } from "../lib/proposal-actions";
import type { ClientBilling } from "../lib/client-billing";
import { selected, orderedItems } from "../lib/quote-model";
import { totals, renderBlocks, variables } from "../lib/presentation";
import { fontCss } from "../lib/proposal-fonts";
import { eventLabel } from "../lib/event-label";
import { statusDisplay } from "../lib/status-display";
import { readableDate } from "../lib/validity";
import { formatStaffDate, staffInitials } from "../lib/staff-account-model";
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
import { CreateClientModal } from "./client-picker";
import { TableRowAction } from "./table-row-action";
function timestamp(value: string, data: Data) {
  return formatStaffDate(value, data.account, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: data.settings?.timezone ?? "UTC",
  });
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
  outline = false,
}: {
  p: Proposal;
  data: Data;
  outline?: boolean;
}) {
  return canCountersign(p, data.user, data.settings) ? (
    <a
      className={`btn ${outline ? "secondary" : "primary"} sign-link`}
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
  tableRow = false,
}: {
  p: Proposal;
  data: Data;
  onChanged?: (p: Proposal) => void;
  showUndo?: boolean;
  showEdit?: boolean;
  listRow?: boolean;
  tableRow?: boolean;
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
      className={`btn ghost more-control round-icon${tableRow ? " table-icon-action" : ""}`}
      aria-label={
        listRow ? "More actions" : `More actions for ${p.client.company}`
      }
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
            <TableRowAction label="Countersign">
              {(hint) => (
                <button
                  className="btn icon-only table-icon-action"
                  type="button"
                  aria-label="Countersign"
                  aria-describedby={hint}
                  onClick={() => {
                    if (location.pathname === "/proposals") rememberList();
                    location.href = `/proposals/${p.id}?action=countersign`;
                  }}
                >
                  <SigningIcon size={18} aria-hidden="true" />
                </button>
              )}
            </TableRowAction>
          ) : !needsCountersign(p) && canEditRecord(p) ? (
            <TableRowAction label="Edit">
              {(hint) => (
                <button
                  className="btn icon-only table-icon-action"
                  type="button"
                  disabled={archived && busy}
                  aria-label="Edit"
                  aria-describedby={hint}
                  onClick={() => {
                    if (archived) {
                      void act("unarchive", "", p, true);
                    } else {
                      rememberList();
                      location.href = `/proposals/${p.id}?action=edit`;
                    }
                  }}
                >
                  <SquarePen size={18} aria-hidden="true" />
                </button>
              )}
            </TableRowAction>
          ) : (
            <span className="proposal-action-spacer" aria-hidden="true" />
          )}
          {imported ? (
            <span className="proposal-action-spacer" aria-hidden="true" />
          ) : (
            <TableRowAction label="Duplicate">
              {(hint) => (
                <button
                  className="btn icon-only table-icon-action"
                  type="button"
                  disabled={busy}
                  aria-label="Duplicate"
                  aria-describedby={hint}
                  onClick={() => void act("duplicate")}
                >
                  <Copy size={18} aria-hidden="true" />
                </button>
              )}
            </TableRowAction>
          )}
          <TableRowAction label={archiveLabel}>
            {(hint) => (
              <button
                className="btn icon-only table-icon-action"
                type="button"
                disabled={busy}
                aria-label={archiveLabel}
                aria-describedby={hint}
                onClick={() => void act(archived ? "unarchive" : "archive")}
              >
                <ArchiveIcon size={18} aria-hidden="true" />
              </button>
            )}
          </TableRowAction>
          {imported ? (
            <span className="proposal-action-spacer" aria-hidden="true" />
          ) : (
            <TableRowAction label="More actions">{more}</TableRowAction>
          )}
        </div>
      ) : tableRow ? (
        <TableRowAction label="More actions">{more}</TableRowAction>
      ) : (
        more()
      )}
      {listRow && error && !open && (
        <ToastSurface role="alert" onDismiss={() => setError("")}>
          {error}
        </ToastSurface>
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
        <ToastSurface onDismiss={() => setUndo(null)}>
          Proposal archived.{" "}
          <button
            type="button"
            className="text-action"
            onClick={() => void act("unarchive", "", undo)}
          >
            Undo
          </button>
        </ToastSurface>
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
// An empty amount is a muted dash with a spoken label, so it never reads as
// part of the neighboring Owner column.
const noAmount = (
  <span className="no-amount" aria-label="None" role="img">
    —
  </span>
);
export function ProposalRows({
  proposals,
  data,
  onChanged,
  showOwner = false,
  reportSender = false,
  listActions = false,
  compact = false,
  limit,
  empty = "No proposals in this view.",
}: {
  showOwner?: boolean;
  reportSender?: boolean;
  listActions?: boolean;
  compact?: boolean;
  limit?: number;
  empty?: ReactNode;
  proposals: (Proposal & { question_summary?: QuestionSummary })[];
  data: Data;
  onChanged?: (p: Proposal) => void;
}) {
  const proposalDate = (value: string) =>
    formatStaffDate(value, data.account, {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: data.settings?.timezone ?? "UTC",
    });
  const [undo, setUndo] = useState<Proposal | null>(null),
    [undoError, setUndoError] = useState("");
  const visible = limit === undefined ? proposals : proposals.slice(0, limit);
  const engagement = useEngagementSummaries(visible.map((p) => p.id).join(","));
  const money = useMoney(),
    yearly = proposals.some((p) =>
      p.quote.some((i) => i.sublines.some((s) => s.interval === "year")),
    );
  return (
    <>
      <StaffTable
        inline={compact}
        className={`proposal-rows ${yearly ? "has-yearly" : ""} ${showOwner ? "has-owner" : ""} ${listActions ? "with-row-actions" : ""} ${compact ? "compact-proposal-rows" : ""}`}
      >
        <StaffTableHead className="proposal-row-head">
          <span>Proposal</span>
          {showOwner && !listActions && (
            <span>{reportSender ? "Owner (sender)" : "Owner"}</span>
          )}
          <span>Status</span>
          <span className="next-cell">Next</span>
          <span className="row-amount-head num-col">One-time</span>
          <span className="row-amount-head num-col">Monthly</span>
          {yearly && <span className="row-amount-head num-col">Yearly</span>}
          {showOwner && listActions && <span>Owner</span>}
          <span className="updated-cell">Updated</span>
          <span />
        </StaffTableHead>
        {!visible.length ? (
          <StaffTableEmpty>{empty}</StaffTableEmpty>
        ) : (
          visible.map((p) => {
            const t = totals(p.quote);
            const ownerMember = data.staff.find(
              (m) =>
                m.user_id ===
                (reportSender
                  ? (p.sender?.user_id ?? proposalOwnerId(p))
                  : proposalOwnerId(p)),
            );
            const ownerName =
              ownerMember?.display_name ??
              (reportSender ? p.sender?.display_name : undefined) ??
              p.owner?.display_name ??
              p.sender?.display_name;
            const owner = showOwner ? (
              <span className="proposal-owner" data-label="Owner">
                {ownerName ? (
                  <StaffPerson
                    name={ownerName}
                    photo={ownerMember?.photo_url}
                  />
                ) : (
                  <span className="muted">No owner</span>
                )}
              </span>
            ) : null;
            return (
              <article
                className="staff-table-row proposal-row clickable-row"
                key={p.id}
              >
                <a
                  className="proposal-row-link"
                  href={`/proposals/${p.id}?view=record`}
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
                <span
                  className="num-col row-amount one-time"
                  data-label="One-time"
                >
                  {listActions && !t.one_time_total
                    ? noAmount
                    : money(t.one_time_total, p.currency)}
                </span>
                <span className="num-col row-amount" data-label="Monthly">
                  {listActions && !t.monthly_total
                    ? noAmount
                    : money(t.monthly_total, p.currency) + "/mo"}
                </span>
                {yearly && (
                  <span
                    className="num-col row-amount yearly"
                    data-label="Yearly"
                  >
                    {p.quote.some((i) =>
                      i.sublines.some((s) => s.interval === "year"),
                    )
                      ? money(t.yearly_total, p.currency) + "/yr"
                      : noAmount}
                  </span>
                )}
                {listActions && owner}
                <small className="updated-cell">
                  {listActions && p.archived_at
                    ? "Archived " + proposalDate(p.archived_at)
                    : listActions && p.client_signed_at
                      ? "Signed " + proposalDate(p.client_signed_at)
                      : listActions && p.first_viewed_at
                        ? "Opened " + proposalDate(p.first_viewed_at)
                        : listActions && p.sent_at
                          ? "Sent " + proposalDate(p.sent_at)
                          : proposalDate(p.updated_at ?? p.created_at)}
                </small>
                <ProposalMenu
                  p={p}
                  data={data}
                  showUndo={false}
                  listRow={listActions}
                  tableRow
                  onChanged={(next) => {
                    if (next.archived_at && !p.archived_at) setUndo(next);
                    onChanged?.(next);
                  }}
                />
              </article>
            );
          })
        )}
      </StaffTable>
      {undo && (
        <ToastSurface onDismiss={() => setUndo(null)}>
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
        </ToastSurface>
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
      <StaffSectionHeading
        description={
          result && (
            <p role="status" className="muted">
              {result.total} matching{" "}
              {result.total === 1 ? "proposal" : "proposals"}
            </p>
          )
        }
        action={
          <a className="btn" href={"/reports?" + reportParams(filters)}>
            Back to Reports
          </a>
        }
      >
        {reportMetricLabel(drill)}
      </StaffSectionHeading>
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
  "Viewed",
  "Won",
  "Needs countersign",
] as const;
const otherViews = listViews.filter(
  (v) => !primaryViews.some((primary) => primary === v),
);
// Owner 10 Nov: More views reads as a compact menu: icon, name, count on the
// right, the current view checked; follow-up views first, then storage.
const moreViewGroups: (typeof otherViews)[number][][] = [
  otherViews.filter((v) => v !== "Archived" && v !== "Imported"),
  otherViews.filter((v) => v === "Archived" || v === "Imported"),
];
const moreViewIcons: Record<(typeof otherViews)[number], LucideIcon> = {
  "Not viewed": EyeOff,
  Expiring: Hourglass,
  Lost: CircleX,
  "Billing issues": CreditCard,
  Archived: Archive,
  Imported: FileInput,
} as Record<(typeof otherViews)[number], LucideIcon>;

export function ProposalListV4({
  data,
  initialView = "all",
  onChanged,
}: {
  data: Data | null;
  initialView?: string;
  onChanged: (proposal: Proposal) => void;
}) {
  const rows = data?.proposals ?? [];
  const router = useRouter(),
    [view, setView] = useState(
      listViews.some((name) => viewKey(name) === initialView)
        ? initialView
        : "all",
    ),
    [search, setSearch] = useState(""),
    [owner, setOwner] = useState("all"),
    [more, setMore] = useState(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const viewTabs = useRef<HTMLDivElement>(null);
  const now = Date.now();
  const timezone = data?.settings?.timezone ?? "UTC";
  const matchesView = (proposal: Proposal, key: string) =>
    key === "expiring"
      ? expiringWithinSevenDays(proposal, now, timezone)
      : inView(proposal, key);
  const counts = Object.fromEntries(
    listViews.map((name) => [
      name,
      rows.filter((p) => matchesView(p, viewKey(name))).length,
    ]),
  );
  const activeExtra = otherViews.find((name) => viewKey(name) === view);
  useEffect(() => {
    const list = viewTabs.current;
    const tab = list?.querySelector('[aria-selected="true"]');
    if (!list || !tab) return;
    const outer = list.getBoundingClientRect();
    const inner = tab.getBoundingClientRect();
    if (inner.left < outer.left) list.scrollLeft += inner.left - outer.left;
    else if (inner.right > outer.right)
      list.scrollLeft += inner.right - outer.right;
  }, [view]);
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
        matchesView(p, view) &&
        (owner === "all" ||
          proposalOwnerId(p) ===
            (owner === "mine" ? data?.user.actor.slice(6) : owner)) &&
        `${p.title} ${p.client.company} ${p.client.email} ${p.search_text ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .toSorted(
      (a, b) =>
        Date.parse(b.updated_at ?? b.created_at) -
        Date.parse(a.updated_at ?? a.created_at),
    );
  const firstProposal =
    data?.total === 0 && view === "all" && !search.trim() && owner === "all";
  const emptyView = search.trim()
    ? {
        title: `No results for “${search.trim()}”`,
        detail: "Check the spelling, or search by client name or email.",
      }
    : view === "needs-countersign"
      ? {
          title: "Nothing to countersign",
          detail:
            "Proposals wait here for the company signature after the client signs.",
        }
      : view === "viewed"
        ? {
            title: "No proposals being read right now",
            detail: "Proposals move here when a client opens the link.",
          }
        : {
            title: "No proposals in this view.",
            detail: "Choose another view or clear your filters.",
          };
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
            ref={viewTabs}
            className="proposal-views"
            data-tab-style="underline"
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
                  {name} <small>{data ? counts[name] : "–"}</small>
                </button>
              );
            })}
          </div>
          <button
            ref={moreTrigger}
            type="button"
            className="btn more-views-trigger"
            aria-haspopup="dialog"
            aria-label={
              activeExtra ? `More views, showing ${activeExtra}` : "More views"
            }
            aria-expanded={more}
            data-active={activeExtra ? "true" : undefined}
            onClick={() => setMore(!more)}
          >
            <span>
              {activeExtra ?? (
                <>
                  More<span className="more-views-suffix"> views</span>
                </>
              )}
            </span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {more && (
            <Sheet
              title="More views"
              menu
              anchor={moreTrigger.current}
              onClose={() => setMore(false)}
            >
              <nav
                className="action-menu views-menu"
                aria-label="Other proposal views"
              >
                {moreViewGroups.map((group, index) => (
                  <div className="views-menu-group" key={index}>
                    {group.map((name) => {
                      const ViewIcon = moreViewIcons[name];
                      const current = view === viewKey(name);
                      const count = data ? counts[name] : undefined;
                      return (
                        <button
                          key={name}
                          type="button"
                          className="views-menu-item"
                          aria-current={current ? "page" : undefined}
                          onClick={() => change(viewKey(name))}
                        >
                          <ViewIcon
                            className="views-menu-icon"
                            size={16}
                            aria-hidden="true"
                          />
                          <span className="views-menu-label">{name}</span>
                          <span
                            className="views-menu-count"
                            data-zero={count === 0 ? "true" : undefined}
                          >
                            {count ?? "–"}
                          </span>
                          <Check
                            className="views-menu-check"
                            size={16}
                            aria-hidden="true"
                          />
                        </button>
                      );
                    })}
                  </div>
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
              {data?.staff.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
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
        {!data ? (
          <Skeleton kind="table" label="Loading proposals…" />
        ) : firstProposal ? (
          <Empty
            title="No proposals yet"
            action={
              <div className="first-run-actions">
                <a className="btn action" href="/proposals?new=1">
                  New proposal
                </a>
                {data.user.staff_role === "owner" && (
                  <a className="btn" href="/studio/connections/imports">
                    Import from Proposify
                  </a>
                )}
              </div>
            }
          >
            Proposals you write and drafts Claude creates will appear here.
            Start from a template or a blank page.
          </Empty>
        ) : (
          <ProposalRows
            showOwner
            listActions
            proposals={shown}
            empty={
              <>
                <strong>{emptyView.title}</strong> {emptyView.detail}
              </>
            }
            data={data}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  );
}
function HomeIntro({
  title,
  subtitle,
  onNew,
}: {
  title: string;
  subtitle: string;
  onNew: () => void;
}) {
  return (
    <section className="home-intro">
      <div>
        <p className="home-date">{subtitle}</p>
        <h1 className="t-page-title">{title}</h1>
      </div>
      <Button className="action" onClick={onNew}>
        New proposal
      </Button>
    </section>
  );
}

export function HomeLoading({ onNew }: { onNew: () => void }) {
  return (
    <div className="home-v4 stack">
      <HomeIntro title="Home" subtitle="Workspace overview" onNew={onNew} />
      <div className="home-overview">
        <Skeleton label="Loading pipeline…" />
        <Skeleton label="Loading expiring proposals…" />
      </div>
      <Skeleton kind="table" label="Loading recent proposals…" />
    </div>
  );
}

export function HomeV4({
  data,
  onNew,
  onSetupChanged,
  deploymentNotice,
}: {
  data: Data;
  onNew: () => void;
  onSetupChanged: () => Promise<void>;
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
  const viewerZone = data.account?.timezone ?? timezone;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: viewerZone,
    }).format(now),
  );
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
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
  return (
    <div className={`home-v4 stack${data.total ? "" : " first-run"}`}>
      <HomeIntro
        title={
          data.total
            ? `Good ${greeting}, ${firstName}`
            : `Welcome to Yeswell, ${firstName}`
        }
        subtitle={formatStaffDate(now, data.account, {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: timezone,
        })}
        onNew={onNew}
      />
      {deploymentNotice}
      {actionError && (
        <Banner tone="danger" title="Action could not be completed">
          {actionError}
        </Banner>
      )}
      <div className="home-overview">
        <HomePipeline
          proposals={rows}
          timezone={timezone}
          currency={data.settings?.currency}
          savedRange={data.account?.home_pipeline_range}
        />
        <section className="home-expiring" aria-labelledby="expiring-title">
          <StaffSectionHeading
            id="expiring-title"
            action={
              <a href="/proposals?view=expiring">
                {expiring.length ? `View all ${expiring.length}` : "View all"}
              </a>
            }
          >
            Expiring this week{" "}
            <span className="home-section-count" aria-hidden="true">
              {expiring.length}
            </span>
          </StaffSectionHeading>
          <div className="home-expiring-card">
            {expiring.length ? (
              <ul role="list">
                {expiring.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <a
                      className="home-expiring-proposal"
                      href={`/proposals/${p.id}`}
                    >
                      <strong>{p.client.company}</strong>
                      <small>{p.title}</small>
                    </a>
                    <time
                      dateTime={expiry(p)!}
                      title={readableDate(expiry(p)!, timezone)}
                    >
                      Closes {weekday.format(new Date(expiry(p)!))}
                    </time>
                    {canEditRecord(p) && (
                      <a
                        className="btn secondary"
                        href={`/proposals/${p.id}?view=send`}
                        aria-label={`Extend ${p.title}`}
                      >
                        Extend
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-expiring-empty">
                <chromeIcons.check size={16} aria-hidden="true" />
                Nothing closes in the next 7 days.
              </p>
            )}
          </div>
        </section>
      </div>
      <HomeSetup data={data} onChanged={onSetupChanged} />
      <section className="home-attention" aria-labelledby="attention-title">
        <StaffSectionHeading
          id="attention-title"
          action={<a href="/proposals">View all proposals</a>}
        >
          Needs your attention
        </StaffSectionHeading>
        <div className="home-attention-list">
          {attention.every((group) => !group.rows.length) && (
            <p className="home-attention-empty">
              <strong>You’re all caught up.</strong> Drafts to review,
              signatures to countersign and billing problems will appear here.
            </p>
          )}
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
                    <h3 className="home-attention-title">
                      <a href={`/proposals/${p.id}`}>
                        {p.client.company} — {p.title}
                      </a>
                    </h3>
                    <p>{context}</p>
                  </div>
                  <strong className="home-attention-amount">
                    {summary || "—"}
                  </strong>
                  {kind === "signature" &&
                  canCountersign(p, data.user, data.settings) ? (
                    <SignLink p={p} data={data} outline />
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
      <section aria-labelledby="home-recent-title">
        <StaffSectionHeading
          id="home-recent-title"
          action={<a href="/proposals">View all proposals</a>}
        >
          Recent proposals
        </StaffSectionHeading>
        <ProposalRows
          showOwner
          listActions
          limit={6}
          proposals={active.toSorted(
            (a, b) =>
              Date.parse(b.updated_at ?? b.created_at) -
              Date.parse(a.updated_at ?? a.created_at),
          )}
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
function RecordQuote({
  quote,
  currency,
  signed,
}: {
  quote: Quote;
  currency: string;
  signed: boolean;
}) {
  const money = useMoney();
  const amounts = totals(quote);
  return (
    <>
      <div className="record-quote-lines">
        {orderedItems(quote).map((item) => (
          <div
            key={item.id}
            className="record-quote-line"
            data-chosen={selected(item)}
          >
            <div>
              <strong>{item.name}</strong>
              {(item.optional || item.choice_group_id) && (
                <small>
                  {[
                    item.optional ? "Optional" : "",
                    selected(item) ? (signed ? "Selected" : "Default") : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </small>
              )}
            </div>
            <div className="record-quote-line-amounts">
              {item.sublines.map((line) => (
                <span key={line.id}>
                  {line.label && <small>{line.label} </small>}
                  {line.qty !== 1 && <small>{line.qty} × </small>}
                  {money(line.amount * line.qty, currency)}
                  {line.interval === "month"
                    ? "/mo"
                    : line.interval === "year"
                      ? "/yr"
                      : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="record-quote-totals">
        <h3>{signed ? "Accepted totals" : "Client sees by default"}</h3>
        <dl>
          <div>
            <dt>One-time</dt>
            <dd>{money(amounts.one_time_total, currency)}</dd>
          </div>
          <div>
            <dt>Monthly</dt>
            <dd>{money(amounts.monthly_total, currency)}/mo</dd>
          </div>
          {!!amounts.yearly_total && (
            <div>
              <dt>Yearly</dt>
              <dd>{money(amounts.yearly_total, currency)}/yr</dd>
            </div>
          )}
        </dl>
      </div>
    </>
  );
}

function RecordLifecycle({
  proposal,
  data,
}: {
  proposal: Proposal;
  data: Data;
}) {
  const steps = [
    ["Draft", proposal.created_at],
    ["Sent", proposal.sent_at],
    ["Viewed", proposal.first_viewed_at],
    ["Client signed", proposal.client_signed_at],
    [
      "Countersigned",
      proposal.signers.find((signer) => signer.role === "company")?.signed_at,
    ],
  ] as const;
  const current = steps.findLastIndex(([, at]) => !!at);
  const completed = current === steps.length - 1;
  return (
    <ol className="record-lifecycle" aria-label="Proposal lifecycle">
      {steps.map(([label, at], index) => (
        <li
          key={label}
          data-step={
            completed || index < current
              ? "done"
              : index === current
                ? "current"
                : "future"
          }
          aria-current={index === current ? "step" : undefined}
        >
          <span className="record-step-content">
            <span className="record-step-marker" aria-hidden="true" />
            <span>{label}</span>
            <span className="sr-only">
              {at
                ? timestamp(at, data)
                : index < current
                  ? "Complete"
                  : "Waiting"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function nextRecordReminder(p: Proposal, expires: string | null | undefined) {
  const now = new Date();
  const end = expires ? Date.parse(expires) : Infinity;
  const rules = p.workspace_settings?.reminder_rules;
  const days = rules
    ? Math.max(rules.unopened_days ?? 0, rules.viewed_days ?? 0) *
      rules.stop_after
    : 0;
  const horizon = Math.min(
    end - 1,
    Date.parse(
      afterLocalDays(
        now.toISOString(),
        days,
        p.workspace_settings?.timezone ?? "UTC",
      ),
    ),
  );
  const candidates = [
    ...p.jobs
      .filter(
        (job) =>
          (job.status === "pending" || job.status === "running") &&
          isAutomaticReminder(job) &&
          clientReminderAllowed(p, job, now),
      )
      .map((job) => job.available_at),
    ...dueClientReminders(p, new Date(horizon)).map(({ at }) => at),
  ]
    .map(Date.parse)
    .filter((time) => Number.isFinite(time) && time < end);
  if (!candidates.length) return null;
  return new Date(
    Math.max(now.getTime(), Math.min(...candidates)),
  ).toISOString();
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
        {signer.title && ` | ${signer.title}`}
      </strong>
      <p>{signer.email}</p>
      <small>{timestamp(signer.signed_at, data)}</small>
      {signer.application_statement && <p>{signer.application_statement}</p>}
    </section>
  );
}
function RecordSignature({ signer, data }: { signer: Signer; data: Data }) {
  const timeZone = data.settings?.timezone ?? "UTC";
  return (
    <>
      <div className="record-signature-mark">
        {signer.image ? (
          <img src={signer.image} alt={`${signer.name}’s signature`} />
        ) : (
          <span>{signer.typed_name || signer.name}</span>
        )}
      </div>
      <strong>
        {signer.name}
        {signer.title && ` | ${signer.title}`}
      </strong>
      <small>
        <time dateTime={signer.signed_at}>
          {formatStaffDate(signer.signed_at, data.account, {
            dateStyle: "medium",
            timeZone,
          })}
          {" | "}
          {formatStaffDate(signer.signed_at, data.account, {
            timeStyle: "short",
            timeZone,
          })}
        </time>
        {signer.applied_by &&
          ` | applied by ${signer.applied_by.name === signer.applied_by.email ? "staff" : signer.applied_by.name}`}
      </small>
    </>
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
      title={`Countersign | ${p.client.company}`}
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
                      {s.name} | {s.title}
                    </strong>
                    <p>
                      {data.settings?.company_name} |{" "}
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
  const money = useMoney();
  const company = p.signers.find((s) => s.role === "company"),
    clientSigner = p.signers.find((s) => s.role === "client"),
    actualSigned = !!p.client_signed_at,
    v = p.versions.at(-1),
    signature = needsCountersign(p),
    issues = billingIssues(p),
    native = p.source === "native";
  const questions = useProposalQuestions(native && p.token ? p.id : null);
  const [engagement, setEngagement] = useState<{
    views: number;
    last_viewed_at: string | null;
  } | null>(null);
  const firstOpenQuestion = questions.data?.threads.find(
    (thread) => thread.status === "open",
  );
  const invoiceWaiting = waitingForInvoiceCountersignature(p);
  const billingLinks = p.billing_links.filter(
    (link) => !invoiceWaiting || link.provider !== "qbo",
  );
  const qboIssue = billingLinks.find(
    (link) => link.provider === "qbo" && link.status !== "succeeded",
  );
  const qboCustomerReview = !!qboIssue && quickBooksCustomerReview(qboIssue);
  const retryInBilling =
    issues &&
    (!qboCustomerReview ||
      p.billing_links.some(
        (link) =>
          link.provider !== "qbo" &&
          (link.status === "failed" ||
            link.status === "needs_review" ||
            publicBankState(link) === "failed"),
      ));
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
      const next = await post<Proposal>(`/api/proposals/${p.id}/actions`, {
        revision: p.revision,
        action,
      });
      if (action === "duplicate") {
        router.push(`/proposals/${next.id}`);
        return;
      }
      onChanged(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }
  const clientFullName =
    [p.client.first_name, p.client.last_name].filter(Boolean).join(" ") ||
    p.client.company;
  const dateOnly = (value: string) =>
    formatStaffDate(value, data.account, {
      dateStyle: "medium",
      timeZone: timezone,
    });
  const ownerId = proposalOwnerId(p);
  const owner = data.staff.find((member) => member.user_id === ownerId);
  const ownerName =
    owner?.display_name ||
    p.owner?.display_name ||
    p.sender?.display_name ||
    person(p.created_by, data);
  const reasons = editable && open && v ? (p.live_blockers ?? []) : [];
  const editsNotLive = reasons.length > 0;
  const publishedDate = editsNotLive ? dateOnly(v!.created_at) : "";
  const previewLiveUrl = `/p/${p.id}?preview=published`;
  const fixUrl = `${recordUrl}?view=send&focus=readiness`;
  const unpublishedEdit = editsNotLive
    ? p.events.findLast((event) => event.type === "edited")
    : undefined;
  const displayQuote = editsNotLive ? p.quote : (v?.quote ?? p.quote);
  const displayedTotals = totals(displayQuote);
  const billable = totals(v?.quote ?? p.quote);
  const qbo = p.billing_links.find((link) => link.provider === "qbo");
  const recurringAmount = [
    billable.monthly_total
      ? `${money(billable.monthly_total, p.currency)}/mo`
      : null,
    billable.yearly_total
      ? `${money(billable.yearly_total, p.currency)}/yr`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const oneTimeAmount = money(billable.one_time_total, p.currency);
  const stripeStatus = stripe ? stripeBillingStatus(stripe) : null;
  const bankState = stripe ? publicBankState(stripe) : undefined;
  const stripeActive =
    stripeStatus?.labels.includes("Subscription active") ||
    (stripe?.status === "succeeded" &&
      !stripe.metadata?.requires_checkout &&
      !bankState &&
      /^sub_/.test(stripe.external_object_id ?? ""));
  const nextCharge =
    stripe && stripeActive
      ? completedCheckouts(stripe)
          .flatMap((completion) => completion.subscriptions)
          .map((subscription) => subscription.next_billing_at)
          .filter(
            (date): date is string => !!date && Date.parse(date) >= Date.now(),
          )
          .sort()[0]
      : undefined;
  const recurringDescription = [
    recurringAmount,
    stripeActive ? "Stripe subscription" : "Stripe Checkout",
    nextCharge &&
      `next charge ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: timezone }).format(new Date(nextCharge))}`,
  ]
    .filter(Boolean)
    .join(" | ");
  const stripeChip =
    bankState === "failed" || stripe?.status === "failed"
      ? { text: "Needs attention", tone: "danger" }
      : bankState === "processing"
        ? { text: "Bank payment processing", tone: "warning" }
        : stripe?.metadata?.requires_checkout
          ? { text: "Waiting for checkout", tone: "warning" }
          : stripeActive
            ? { text: "Active", tone: "success" }
            : stripe?.status === "succeeded"
              ? { text: stripeStatus?.labels[0] ?? "Ready", tone: "success" }
              : {
                  text: stripe || actualSigned ? "In progress" : "Not started",
                  tone: "neutral",
                };
  const markAsInvoiced =
    qbo?.status === "needs_review" &&
    !qbo.external_object_id &&
    !qbo.metadata?.customer_candidates ? (
      <Button
        onClick={() => {
          setError("");
          setInvoice(true);
        }}
      >
        Mark as invoiced
      </Button>
    ) : undefined;

  const stripeIntegrated =
    native &&
    (stripe
      ? !stripe.metadata?.skipped
      : !!data.connections?.stripe &&
        !!(billable.monthly_total || billable.yearly_total));
  const qboIntegrated =
    native &&
    (qbo
      ? !qbo.metadata?.skipped &&
        !qbo.metadata?.manual_invoice &&
        qbo.metadata?.action !== "Invoice manually"
      : !!data.connections?.qbo && billable.one_time_total > 0);
  const billingIntegrated = stripeIntegrated || qboIntegrated;
  const recordJobs = unfinishedJobs(p).filter(
    (job) =>
      job.kind !== "email" ||
      job.payload.to === p.client.email ||
      !!job.last_error,
  );
  const showBilling =
    billingIntegrated ||
    manual ||
    invoiceWaiting ||
    (native &&
      (issues ||
        recordJobs.some((job) => job.status === "failed" || !!job.last_error)));
  const billingStatus =
    issues || resend
      ? "Needs attention"
      : actualSigned &&
          !billingOpen(p) &&
          !invoiceWaiting &&
          billingLinks.some((link) => link.status === "succeeded")
        ? "Set up"
        : invoiceWaiting || (!stripeIntegrated && qboIntegrated)
          ? "Starts after you countersign"
          : "Starts after signing";
  const nextReminder =
    open && reminders ? nextRecordReminder(p, expires) : null;
  const nextReminderDetail = nextReminder
    ? `The next automatic reminder is on ${dateOnly(nextReminder)}.`
    : "";
  const outcome = p.events.findLast((event) =>
    p.marked_lost_by ? event.type === "marked_lost" : event.type === "declined",
  );
  const outcomeNote = outcome?.metadata.note ?? outcome?.metadata.reason;
  const declineReason = typeof outcomeNote === "string" ? outcomeNote : "";
  const duplicate = (label: string) => (
    <Button busy={recordBusy} onClick={() => void runAction("duplicate")}>
      {label}
    </Button>
  );
  const unarchive = (className = "") => (
    <Button
      className={className}
      busy={recordBusy}
      onClick={() => void runAction("unarchive")}
    >
      Unarchive
    </Button>
  );
  const remind = (
    <Button busy={recordBusy} onClick={() => void runAction("remind")}>
      Send reminder now
    </Button>
  );
  const resendLink = (
    <Button
      busy={recordBusy}
      onClick={() => void runAction("resend_billing_link")}
    >
      Resend payment link
    </Button>
  );
  const manualInvoice = (
    <Button
      onClick={() => {
        setError("");
        setInvoice(true);
      }}
    >
      Invoice manually
    </Button>
  );
  const reopen = (label: string) => (
    <Button busy={recordBusy} onClick={() => void runAction("mark_sent")}>
      {label}
    </Button>
  );
  const canReopen =
    editable && !!p.token && !!(p.version_count ?? p.versions.length);
  const completeTitle = billingIntegrated
    ? "Signed by both and billing is set up."
    : "Signed by both.";
  const signedFile = p.files.some(
    (file) => file.kind === "sealed" && file.stage === "company",
  );
  let nextStep: {
    eyebrow: string;
    title: string;
    detail?: ReactNode;
    problem?: boolean;
    actions: ReactNode[];
  };
  if (archive) {
    nextStep = {
      eyebrow: "Archived",
      title: company
        ? billingOpen(p)
          ? "Signed by both."
          : completeTitle
        : "This proposal is archived.",
      detail: "Unarchive it to show it in All proposals again.",
      actions: [unarchive()],
    };
  } else if (!native) {
    nextStep = {
      eyebrow: "Imported | Read-only",
      title: p.client_signed_at
        ? `Signed in Proposify on ${dateOnly(p.client_signed_at)}.`
        : "Imported from Proposify.",
      detail: "The imported PDF and audit trail are available in Documents.",
      actions: [
        <a className="btn" href={downloadUrl}>
          Download PDF
        </a>,
      ],
    };
  } else if (editsNotLive && !firstOpenQuestion) {
    nextStep = {
      eyebrow: "Edits not live",
      title: "Your latest edits aren’t on the client’s link yet",
      detail: (
        <>
          <p>
            The client still sees the version from {publishedDate}. Fix this to
            publish your changes:
          </p>
          <ul className="record-publication-reasons">
            {reasons.slice(0, 3).map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
          {reasons.length > 3 && <p>and {reasons.length - 3} more</p>}
        </>
      ),
      problem: true,
      actions: [
        <a className="btn" href={fixUrl}>
          Fix in editor
        </a>,
        <a
          className="btn"
          href={previewLiveUrl}
          target="_blank"
          rel="noreferrer"
        >
          Preview what the client sees
        </a>,
      ],
    };
  } else if (attention) {
    nextStep = {
      eyebrow: `Billing needs attention | ${clientFullName}`,
      title: resend
        ? "Stripe Checkout wasn’t finished."
        : "Review the billing handoff.",
      detail: resend
        ? "The client can use the payment link to finish setting up billing."
        : "Signatures are safe. Review the billing action below.",
      problem: true,
      actions: [resend && resendLink, manual && manualInvoice].filter(Boolean),
    };
  } else if (signature) {
    nextStep = {
      eyebrow: `Next step | ${data.settings?.company_signatory?.name || "Company signatory"}`,
      title: `${clientName} signed. Countersign to finish.`,
      detail: (
        <>
          Signed {timestamp(p.client_signed_at!, data)}.{" "}
          {invoiceWaiting
            ? quickBooksInvoiceTiming
            : "Review the signed scope and prices before applying the company signature."}
        </>
      ),
      actions: authorized
        ? [
            <a className="btn" href={countersignUrl}>
              Review &amp; countersign
            </a>,
          ]
        : [],
    };
  } else if (complete) {
    nextStep = {
      eyebrow: "Completed | Nothing to do",
      title: completeTitle,
      detail: `Countersigned ${timestamp(company!.signed_at, data)}.${signedFile ? " The sealed agreement is available to download." : ""}`,
      actions: [
        <a className="btn" href={downloadUrl}>
          Download sealed PDF
        </a>,
        typeof stripe?.metadata?.stripe_url === "string" && (
          <a
            className="btn"
            href={stripe.metadata.stripe_url}
            target="_blank"
            rel="noreferrer"
          >
            Open in Stripe
          </a>
        ),
      ].filter(Boolean),
    };
  } else if (p.marked_won_by) {
    nextStep = {
      eyebrow: "Won | Marked by staff",
      title: `Marked as won by ${person(p.marked_won_by, data)}.`,
      detail: "No electronic signature or automatic billing was created.",
      actions: [],
    };
  } else if (p.status === "declined") {
    nextStep = p.marked_lost_by
      ? {
          eyebrow: `Lost | Marked by ${person(p.marked_lost_by, data)}${outcome ? ` on ${dateOnly(outcome.created_at)}` : ""}`,
          title: "This proposal was marked lost.",
          detail: declineReason || "The client link is closed.",
          actions: canReopen
            ? [reopen("Mark as sent again")]
            : [duplicate("Duplicate as new draft")],
        }
      : {
          eyebrow: outcome
            ? `Declined | ${dateOnly(outcome.created_at)}`
            : "Declined",
          title: `${clientName} declined the proposal.`,
          detail: declineReason ? (
            <>Client note: “{declineReason}”</>
          ) : (
            "The client link is closed."
          ),
          actions: [
            duplicate("Duplicate as new draft"),
            p.client.email && (
              <a className="btn" href={`mailto:${p.client.email}`}>
                Email {clientName}
              </a>
            ),
          ].filter(Boolean),
        };
  } else if (p.status === "expired") {
    nextStep = {
      eyebrow: expires ? `Expired | ${dateOnly(expires)}` : "Expired",
      title: `The link expired before ${clientName} signed.`,
      detail:
        "Extend link reopens the same client link for the workspace’s default validity period.",
      actions: [
        canReopen && reopen("Extend link"),
        duplicate("Duplicate"),
      ].filter(Boolean),
    };
  } else if (open) {
    const viewing = p.status === "viewed";
    nextStep = {
      eyebrow: `Next step | ${clientFullName}`,
      title: viewing
        ? `${clientName} is reviewing the proposal.`
        : `Waiting for ${clientName} to open it.`,
      detail: [
        viewing && engagement?.last_viewed_at
          ? `Opened ${withCount(engagement.views, "time")}, last ${timestamp(engagement.last_viewed_at, data)}.`
          : viewing && p.first_viewed_at
            ? `First opened ${timestamp(p.first_viewed_at, data)}.`
            : p.sent_at
              ? `${p.delivery_method === "manual" ? "Shared" : "Emailed"} ${timestamp(p.sent_at, data)}${p.client.email ? ` to ${p.client.email}` : ""}. Not opened yet.`
              : "",
        firstOpenQuestion ? "The client asked a question." : "",
        nextReminderDetail,
      ]
        .filter(Boolean)
        .join(" "),
      actions:
        firstOpenQuestion && questions.data?.can_reply
          ? [
              <Button
                busy={questions.busy}
                onClick={() => questions.setReplying(firstOpenQuestion.id)}
              >
                Reply to question
              </Button>,
              remind,
            ]
          : [
              remind,
              <CopyClientLink
                token={p.token!}
                appUrl={data.app_url}
                label="Copy client link"
                buttonOnly
              />,
            ],
    };
  } else {
    nextStep = {
      eyebrow: "Next step | You",
      title: failedJob
        ? `${jobName(
            failedJob,
            p.billing_links
              .filter((link) => link.status !== "succeeded")
              .map((link) => link.provider),
          )} needs attention.`
        : p.status === "draft"
          ? "Review and send your proposal."
          : resend
            ? "The client still needs to finish billing setup."
            : "Billing is being prepared.",
      actions: resend ? [resendLink] : [],
    };
  }
  const toolbarClass = nextStep.actions.length ? "" : "record-primary";
  const primary = archive ? (
    unarchive(toolbarClass)
  ) : signature ? (
    authorized ? (
      <a className={`btn ${toolbarClass}`} href={countersignUrl}>
        Review &amp; countersign
      </a>
    ) : (
      <Button
        disabled
        title="Your staff account is not authorized to countersign."
      >
        Review &amp; countersign
      </Button>
    )
  ) : native && p.status === "declined" && !p.signers.length ? (
    duplicate("Duplicate")
  ) : editable ? (
    <a
      className={`btn record-edit ${toolbarClass}`}
      href={recordUrl + "?action=edit"}
    >
      Edit
    </a>
  ) : native ? (
    <a className={`btn ${toolbarClass}`} href={downloadUrl}>
      Download PDF
    </a>
  ) : null;
  const linkClosed =
    archive ||
    ["declined", "expired", "archived", "draft"].includes(p.status) ||
    (["sent", "viewed"].includes(p.status) &&
      !!expires &&
      Date.parse(expires) <= Date.now());
  const closedLinkNote =
    archive || p.status === "archived"
      ? "The client sees that the proposal is unavailable."
      : p.status === "declined"
        ? "The client sees that the proposal was declined."
        : "The client sees that the link has expired.";
  const documents = p.files
    .filter((file) =>
      native ? file.kind === "sealed" : file.kind === "import",
    )
    .sort(
      (a, b) => Number(b.stage === "company") - Number(a.stage === "company"),
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
          <chromeIcons.back size={16} aria-hidden="true" /> Proposals
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
      {already && (
        <ToastSurface inline onDismiss={() => setAlready("")}>
          {already}
        </ToastSurface>
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
      {archive && (
        <div className="record-archive-note">
          Archived{p.archived_by ? ` by ${person(p.archived_by, data)}` : ""} on{" "}
          {dateOnly(p.archived_at!)}. It’s hidden from All proposals.
        </div>
      )}
      <header className="record-hero">
        <div className="record-hero-intro">
          <div className="record-hero-client">
            <span>{p.client.company}</span>
            {p.status === "declined" && !p.marked_lost_by ? (
              <span className="pill danger" data-proposal-status={p.status}>
                Declined
              </span>
            ) : (
              <ProposalBadges p={p} />
            )}
          </div>
          <h1 className="t-page-title">{p.title}</h1>
          <div className="record-prepared-by">
            <span
              className="avatar record-owner-avatar"
              data-initials={staffInitials(ownerName)}
              aria-hidden="true"
            />
            Prepared by {ownerName}
          </div>
          {(native || displayQuote.length > 0) && (
            <dl className="record-hero-amounts">
              <div>
                <dt>One-time</dt>
                <dd>{money(displayedTotals.one_time_total, p.currency)}</dd>
              </div>
              <div>
                <dt>Monthly</dt>
                <dd>{money(displayedTotals.monthly_total, p.currency)}/mo</dd>
              </div>
            </dl>
          )}
        </div>
        {native && (
          <div className="record-hero-progress">
            <RecordLifecycle proposal={p} data={data} />
            {billingIntegrated && (
              <div
                className="record-hero-billing"
                data-needs-attention={billingStatus === "Needs attention"}
              >
                <span>Billing</span>
                <strong>{billingStatus}</strong>
              </div>
            )}
          </div>
        )}
        <section
          className="next-card record-next-step"
          data-problem={nextStep.problem || undefined}
        >
          <div className="next-copy">
            <span className="t-eyebrow">{nextStep.eyebrow}</span>
            <h2>{nextStep.title}</h2>
            {typeof nextStep.detail === "string"
              ? nextStep.detail && <p>{nextStep.detail}</p>
              : nextStep.detail}
          </div>
          {nextStep.actions.length > 0 && (
            <div className="actions record-next-actions">
              {nextStep.actions.map((action, index) => (
                <div key={index}>{action}</div>
              ))}
            </div>
          )}
        </section>
      </header>
      {editsNotLive && firstOpenQuestion && (
        <div className="record-publication-banner" role="status">
          <p>
            <strong>Edits not live.</strong> The client still sees the version
            from {publishedDate}. {reasons[0]}
            {reasons.length > 1 && `, and ${reasons.length - 1} more`}.
          </p>
          <a href={fixUrl}>Fix in editor</a>
        </div>
      )}
      <section className="record-details record-section">
        <StaffSectionHeading>Details</StaffSectionHeading>
        <dl className="card record-details-values">
          <div>
            <dt>Client</dt>
            <dd>
              {clientFullName}
              {p.client.email && (
                <a href={`mailto:${p.client.email}`}>{p.client.email}</a>
              )}
            </dd>
          </div>
          {p.sent_at && (
            <div>
              <dt>Sent</dt>
              <dd>{dateOnly(p.sent_at)}</dd>
            </div>
          )}
          {native && !(actualSigned && company) && (
            <div>
              <dt>Expires</dt>
              <dd>{expires ? readableDate(expires, timezone) : "No expiry"}</dd>
            </div>
          )}
          {native && p.token && (
            <div className="record-reminders">
              <dt>Reminders</dt>
              <dd>
                {open ? (
                  <>
                    <Switch
                      aria-label="Automatic reminders from the app"
                      checked={reminders}
                      disabled={reminderBusy || !!p.signers.length}
                      onChange={async (e) => {
                        const enabled = e.target.checked;
                        setReminders(enabled);
                        setReminderBusy(true);
                        setError("");
                        try {
                          onChanged(
                            await post<Proposal>(
                              `/api/proposals/${p.id}/reminders`,
                              { revision: p.revision, enabled },
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
                    <span>
                      {nextReminder
                        ? `Next on ${dateOnly(nextReminder)}`
                        : reminders
                          ? "No reminders scheduled"
                          : "Off"}
                    </span>
                  </>
                ) : (
                  <span>
                    {p.signers.length
                      ? "Stopped after signing"
                      : "Stopped when the link closed"}
                  </span>
                )}
              </dd>
            </div>
          )}
          {p.token && (
            <div className="record-details-link">
              <dt>Client link</dt>
              <dd>
                {linkClosed ? (
                  <>
                    <s
                      className="record-link-url"
                      title={new URL(`/p/${p.token}`, data.app_url).href}
                    >
                      {new URL(`/p/${p.token}`, data.app_url).href}
                    </s>
                    <small>{closedLinkNote}</small>
                  </>
                ) : (
                  <CopyClientLink
                    token={p.token}
                    appUrl={data.app_url}
                    label="Copy client link"
                    iconOnly
                  />
                )}
                {editsNotLive && (
                  <small>Shows the version from {publishedDate}</small>
                )}
              </dd>
            </div>
          )}
          {(!native || (actualSigned && company)) && (
            <div className="record-details-documents">
              <dt>Documents</dt>
              <dd>
                {documents.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/proposals/${p.id}/files/${file.id}`}
                  >
                    {file.kind === "import"
                      ? "Imported PDF"
                      : file.stage === "company"
                        ? "Final sealed PDF"
                        : "Client-signed PDF"}
                  </a>
                ))}
                {!native && (
                  <a href={`${recordUrl}?view=evidence`}>Audit trail</a>
                )}
                {native && !signedFile && (
                  <small>The signed copy is being sealed.</small>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <div className="record-columns">
        <div className="record-aside">
          {native && p.token && (
            <ProposalQuestions questions={questions} timezone={timezone} />
          )}
          <section className="record-quote record-section">
            <StaffSectionHeading
              action={
                <div className="record-section-actions">
                  {editable && (
                    <a className="btn" href={recordUrl + "?action=edit"}>
                      Edit
                    </a>
                  )}
                  <Button onClick={() => setDocument(true)}>
                    Open document
                  </Button>
                </div>
              }
            >
              Quote
            </StaffSectionHeading>
            <div className="card record-quote-card">
              {editsNotLive && (
                <div className="record-quote-notice">
                  <p>
                    Showing your latest edits. The client sees the version from{" "}
                    {publishedDate}.
                  </p>
                  <a href={previewLiveUrl} target="_blank" rel="noreferrer">
                    View live version
                  </a>
                </div>
              )}
              {p.marked_won_by ? (
                <p className="record-card-message">
                  No client-signed version. Outcome recorded manually.
                </p>
              ) : !native && !displayQuote.length ? (
                <p className="record-card-message">
                  Pricing is in the imported PDF.
                </p>
              ) : (
                <RecordQuote
                  quote={displayQuote}
                  currency={p.currency}
                  signed={actualSigned}
                />
              )}
            </div>
          </section>
          {!p.marked_won_by && (
            <section className="record-signatures record-section">
              <StaffSectionHeading>Signatures</StaffSectionHeading>
              <div className="card record-signature-card">
                <div className="record-signature-box">
                  <h3>Client</h3>
                  {clientSigner ? (
                    <RecordSignature signer={clientSigner} data={data} />
                  ) : (
                    <>
                      <p className="record-signature-mark">
                        {native ? "Not signed yet" : "See imported PDF"}
                      </p>
                      <strong>
                        {clientFullName}
                        {p.client.title && ` | ${p.client.title}`}
                      </strong>
                      {open && <small>Waiting on {clientName}</small>}
                    </>
                  )}
                </div>
                <div className="record-signature-box" data-next={signature}>
                  <h3>{data.settings?.company_name ?? "Company"}</h3>
                  {company ? (
                    <RecordSignature signer={company} data={data} />
                  ) : (
                    <>
                      <p className="record-signature-mark">
                        {native ? "Not signed yet" : "See imported PDF"}
                      </p>
                      <strong>
                        {data.settings?.company_signatory?.name ??
                          "Company signatory"}
                      </strong>
                      {native && (
                        <small>
                          {actualSigned
                            ? "Awaiting signature"
                            : "After the client signs"}
                        </small>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
          {showBilling && (
            <section className="record-billing record-section">
              <StaffSectionHeading
                action={
                  retryInBilling && (
                    <Button onClick={() => void retryBilling()}>
                      Retry billing
                    </Button>
                  )
                }
              >
                Billing
              </StaffSectionHeading>
              {(stripeIntegrated ||
                invoiceWaiting ||
                qboIntegrated ||
                qbo?.metadata?.manual_invoice ||
                markAsInvoiced) && (
                <dl className="card record-billing-card">
                  {stripeIntegrated && (
                    <RecordBillingRow
                      label={
                        billable.yearly_total && !billable.monthly_total
                          ? "Yearly"
                          : "Monthly"
                      }
                      end={
                        resend ? (
                          <Button
                            busy={recordBusy}
                            onClick={() =>
                              void runAction("resend_billing_link")
                            }
                          >
                            Resend billing link
                          </Button>
                        ) : (
                          <span className={`pill ${stripeChip.tone}`}>
                            {stripeChip.text}
                          </span>
                        )
                      }
                    >
                      {stripe &&
                      (stripeStatus?.labels.length ||
                        stripeStatus?.subscriptions.length) ? (
                        <details className="record-provider-details">
                          <Disclosure>{recurringDescription}</Disclosure>
                          <StripeBillingDetails
                            link={stripe}
                            dashboardUrl={
                              data.connections?.stripe_connect?.dashboardUrl
                            }
                          />
                        </details>
                      ) : (
                        recurringDescription
                      )}
                      {stripe?.last_error && (
                        <p className="record-billing-problem">
                          {stripe.last_error}
                        </p>
                      )}
                    </RecordBillingRow>
                  )}
                  {invoiceWaiting ? (
                    <RecordBillingRow
                      label="One-time"
                      end={
                        <span className="pill info">
                          Waiting for countersignature
                        </span>
                      }
                    >
                      {oneTimeAmount} | QuickBooks invoice
                      <p>{quickBooksInvoiceTiming}</p>
                    </RecordBillingRow>
                  ) : qbo &&
                    !qbo.metadata?.skipped &&
                    !qbo.metadata?.manual_invoice ? (
                    <QuickBooksBilling
                      proposal={p}
                      link={qbo}
                      onRefresh={onRefresh}
                      amount={oneTimeAmount}
                      manualAction={markAsInvoiced}
                    />
                  ) : qboIntegrated || qbo?.metadata?.manual_invoice ? (
                    <RecordBillingRow
                      label="One-time"
                      end={
                        <span
                          className={`pill ${qbo?.metadata?.manual_invoice ? "success" : "neutral"}`}
                        >
                          {qbo?.metadata?.manual_invoice
                            ? "Invoiced manually"
                            : actualSigned
                              ? "In progress"
                              : "Not started"}
                        </span>
                      }
                    >
                      {oneTimeAmount} |{" "}
                      {qbo?.metadata?.manual_invoice
                        ? "Manual invoice"
                        : "QuickBooks invoice"}
                    </RecordBillingRow>
                  ) : null}
                </dl>
              )}
              {signedOiot && (
                <section className="card record-billing-note">
                  <h3>{oiotPlan.name}</h3>
                  <p>
                    Website purchase price {signedOiot[oiotPurchasePriceField]}{" "}
                    | Kickoff {signedOiot[oiotKickoffField]}
                  </p>
                  <p>{oiotPlan.billingNote}</p>
                </section>
              )}
              {recordJobs.length > 0 && (
                <details
                  className="card record-billing-note"
                  open={
                    !!highlightedJob ||
                    recordJobs.some(
                      (job) => job.status === "failed" || !!job.last_error,
                    ) ||
                    undefined
                  }
                >
                  <Disclosure>Background jobs</Disclosure>
                  <div className="record-jobs">
                    {recordJobs.map((j) => (
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
                            !(qboIssue && j.kind === "billing") &&
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
                </details>
              )}
            </section>
          )}
          <ProposalEmailLog id={p.id} revision={p.revision} />
        </div>
        <div className="record-support">
          {native && (
            <ProposalEngagement
              knownRecipient={!!p.token && !!p.client.email}
              id={p.id}
              timezone={timezone}
              notify={data.settings?.engagement_notifications?.in_app !== false}
              onLoaded={setEngagement}
            />
          )}
          <section className="timeline record-section">
            <StaffSectionHeading
              action={<a href={`${recordUrl}?view=evidence`}>Evidence</a>}
            >
              Timeline
            </StaffSectionHeading>
            <div
              className="card record-timeline-list"
              role="region"
              aria-label="Timeline events"
              tabIndex={0}
            >
              {p.events.toReversed().map((e) => {
                const blockedEdit = unpublishedEdit?.id === e.id;
                return (
                  <article
                    key={e.id}
                    className="timeline-entry"
                    data-unpublished={blockedEdit || undefined}
                  >
                    <span className="timeline-dot" aria-hidden="true" />
                    <div>
                      <strong>
                        {blockedEdit
                          ? "Edited, not live yet"
                          : eventTitle(e, data)}
                      </strong>
                      <small className="timeline-entry-meta">
                        {timestamp(e.created_at, data)} |{" "}
                        {person(e.actor, data)}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
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
function ClientDetailHeader({
  selected,
  client,
  onEdit,
  actions,
}: {
  selected: string;
  client?: Client;
  onEdit?: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="client-detail-header">
      <div className="client-detail-toolbar">
        <a href="/clients" className="staff-back">
          <chromeIcons.back size={16} aria-hidden="true" /> Clients
        </a>
        <div className="actions client-record-actions">
          <Button onClick={onEdit} disabled={!client}>
            Edit client
          </Button>
          {!client?.archived_at && (
            <a
              className="btn action"
              href={`/proposals?new=1&client=${selected}`}
            >
              New proposal
            </a>
          )}
          {actions}
        </div>
      </div>
      <div className="client-identity">
        {client ? (
          <ClientInitials company={client.company} />
        ) : (
          <span className="client-initials" aria-hidden="true" />
        )}
        <div className="client-identity-copy">
          <div className="client-detail-name">
            <h1 className="t-page-title">
              {client?.company ?? "Client record"}
            </h1>
            {client?.archived_at && (
              <span className="pill neutral">Archived</span>
            )}
          </div>
          <div className="client-identity-contact">
            {client ? (
              <>
                <span>
                  {client.first_name} {client.last_name}
                </span>
                <ContactValue kind="email" value={client.email} />
                {client.phone && (
                  <ContactValue kind="phone" value={client.phone} />
                )}
              </>
            ) : (
              "Loading contact details…"
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export function ClientsV4({
  data,
  selected,
  initialView,
  onRefresh,
}: {
  data: Data | null;
  selected?: string;
  initialView?: string;
  onRefresh: () => Promise<void>;
}) {
  const client = data?.clients.find((c) => c.id === selected),
    [linkChoice, setLinkChoice] = useState<string | null | undefined>(
      undefined,
    ),
    [confirm, setConfirm] = useState<"archive" | "delete" | null>(null),
    [menu, setMenu] = useState(false),
    [edit, setEdit] = useState(false),
    [editClient, setEditClient] = useState(false),
    [newClient, setNewClient] = useState(selected === "new"),
    [error, setError] = useState(""),
    [billing, setBilling] = useState<ClientBilling | null>(null),
    [billingError, setBillingError] = useState(""),
    [search, setSearch] = useState(""),
    [clientView, setClientView] = useState(
      initialView === "archived" ? "archived" : "all",
    ),
    [busy, setBusy] = useState(false),
    money = useMoney();
  const clientActions = useRef<HTMLButtonElement>(null);
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
  const visibleClients = (data?.clients ?? []).filter(
    (c) =>
      !!c.archived_at === (clientView === "archived") &&
      (clientView !== "stripe" || Boolean(c.stripe_customer_id)) &&
      (clientView !== "open" ||
        data?.proposals.some(
          (p) =>
            p.client.id === c.id &&
            inView(p, "all") &&
            (inView(p, "sent") || needsCountersign(p)),
        )) &&
      `${c.company} ${c.email} ${c.first_name} ${c.last_name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  if (!data && selected && selected !== "new")
    return (
      <div className="client-detail-v4 stack">
        <ClientDetailHeader selected={selected} />
        <Skeleton kind="table" label="Loading client record…" />
      </div>
    );
  if (!client || !data)
    return (
      <section className="clients-v4 clients-directory-v4 stack">
        <header className="directory-heading">
          <h1 className="t-page-title">Clients</h1>
          <Button className="action" onClick={() => setNewClient(true)}>
            New client
          </Button>
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
          <fieldset className="client-views" data-tab-style="underline">
            <legend className="sr-only">Client views</legend>
            {[
              ["all", "All"],
              ["stripe", "Billing in Stripe"],
              ["open", "Open proposals"],
              ["archived", "Archived"],
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
        {data &&
        !data.clients.some((client) => !client.archived_at) &&
        !search.trim() &&
        clientView === "all" ? (
          <Empty
            title={data.clients.length ? "No active clients" : "No clients yet"}
            action={
              data.user.staff_role === "owner" ? (
                <a className="btn" href="/studio/connections/imports">
                  Import from Proposify
                </a>
              ) : undefined
            }
          >
            Clients appear here when you create a proposal for someone new or
            add a client yourself.
          </Empty>
        ) : (
          <StaffTable className="client-directory client-table">
            <StaffTableHead className="client-table-head">
              {["Client", "Contact", "Proposals", "Monthly now", "Billing"].map(
                (label) => (
                  <span
                    key={label}
                    className={label === "Monthly now" ? "num-col" : undefined}
                  >
                    {label}
                  </span>
                ),
              )}
            </StaffTableHead>
            {!data && <Skeleton kind="table" label="Loading clients…" />}
            {visibleClients.map((c) => {
              const proposals = (data?.proposals ?? []).filter(
                (p) => p.client.id === c.id && inView(p, "all"),
              );
              const open = proposals.filter((p) => inView(p, "sent")).length;
              const awaiting = proposals.filter(needsCountersign).length;
              const drafts = proposals.filter(
                (p) => p.status === "draft",
              ).length;
              const proposalStatus = awaiting
                ? `${awaiting} to countersign`
                : proposals.some(billingIssues)
                  ? "Billing issue"
                  : open
                    ? `${open} open`
                    : drafts
                      ? `${drafts} ${drafts === 1 ? "draft" : "drafts"}`
                      : "—";
              return (
                <article
                  key={c.id}
                  className="staff-table-row client-table-row clickable-row"
                >
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
                  <span className="num-col" data-label="Monthly now">
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
            {data && visibleClients.length === 0 && (
              <StaffTableEmpty>No clients match this view.</StaffTableEmpty>
            )}
          </StaffTable>
        )}
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
  const blocker = clientDeleteBlocker(proposals);
  const mayDelete = data.user.staff_role === "owner" && !blocker;
  async function updateArchive(archived: boolean) {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      await post(`/api/clients/${client.id}/archive`, { archived });
      setConfirm(null);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const billingCard = (
    <section className="client-billing card">
      <header>
        <h2 className="t-card-title">How they’re billed</h2>
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
          {(billing.linked_id || !!billing.candidates?.length) && (
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
          )}
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
  );
  const proposalsSection = (
    <section
      className="client-proposals"
      aria-labelledby="client-proposals-title"
    >
      <StaffSectionHeading id="client-proposals-title">
        Proposals <span className="count-badge">{count}</span>
      </StaffSectionHeading>
      <ProposalRows
        proposals={proposals}
        data={data}
        listActions
        onChanged={() => void onRefresh()}
        empty={
          <span className="client-proposals-empty">
            No proposals yet.
            {!client.archived_at && (
              <a href={`/proposals?new=1&client=${client.id}`}>New proposal</a>
            )}
          </span>
        }
      />
    </section>
  );
  const notesCard = (
    <section className="client-notes card">
      <header className="section-heading">
        <h2 className="t-card-title">Notes</h2>
        <Button onClick={() => setEdit(!edit)}>
          {edit ? "Cancel" : client.notes ? "Edit note" : "Add note"}
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
          <Button type="submit">Save notes</Button>
        </form>
      ) : (
        <p style={{ whiteSpace: "pre-wrap" }}>
          {client.notes || "No notes yet."}
        </p>
      )}
      {(edit || client.notes) && (
        <small>AI assistants can read these notes when drafting.</small>
      )}
    </section>
  );
  const activitySection = (
    <section
      className="client-activity"
      aria-labelledby="client-activity-title"
    >
      <StaffSectionHeading id="client-activity-title">
        Activity
      </StaffSectionHeading>
      <StaffTable density="compact" className="client-activity-table">
        <StaffTableHead>
          <span>Event</span>
          <span>Date</span>
        </StaffTableHead>
        {activity.length ? (
          activity.map(({ proposal, entry }) => (
            <a
              className="staff-table-row"
              key={entry.id}
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
          ))
        ) : (
          <StaffTableEmpty>No recent proposal activity.</StaffTableEmpty>
        )}
      </StaffTable>
    </section>
  );
  const contactCard = (
    <section className="client-contact-card card">
      <h2 className="t-card-title">Contact details</h2>
      <dl>
        {[
          [
            "Name",
            [client.first_name, client.last_name].filter(Boolean).join(" "),
          ],
          ["Email", client.email],
          ["Phone", formattedPhone(client.phone)],
          ["Title", client.title],
          ["Address", formattedAddress(client.address)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <div className="client-detail-v4 stack">
      <ClientDetailHeader
        selected={client.id}
        client={client}
        onEdit={() => setEditClient(true)}
        actions={
          <button
            ref={clientActions}
            type="button"
            className="btn ghost more-control round-icon"
            aria-label="Client actions"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu(true)}
          >
            <chromeIcons.more size={18} aria-hidden="true" />
          </button>
        }
      />
      {error && !confirm && (
        <Banner tone="danger" title="Client action failed">
          {error}
        </Banner>
      )}
      <div className="client-record-columns">
        <div className="client-record-main">
          {proposalsSection}
          {activitySection}
        </div>
        <div className="client-record-side">
          {contactCard}
          {billingCard}
          {notesCard}
        </div>
      </div>
      {menu && (
        <Sheet
          title={`Actions · ${client.company}`}
          menu
          anchor={clientActions.current}
          onClose={() => setMenu(false)}
        >
          <nav aria-label="Client actions" className="action-menu">
            {client.archived_at ? (
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  void updateArchive(false);
                }}
              >
                Restore client
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  setError("");
                  setConfirm("archive");
                }}
              >
                Archive client
              </button>
            )}
            {mayDelete && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setMenu(false);
                  setError("");
                  setConfirm("delete");
                }}
              >
                Delete client
              </button>
            )}
            {data.user.staff_role === "owner" &&
              blocker &&
              blocker !== keepClientHistory && (
                <small className="client-action-hint">{blocker}</small>
              )}
          </nav>
        </Sheet>
      )}
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
          title={`${confirm === "delete" ? "Delete" : "Archive"} ${client.company}?`}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <div className="stack">
            <p>
              {confirm === "delete" ? (
                <>
                  Delete {client.company}?
                  {count > 0 &&
                    ` This also deletes ${withCount(count, "archived draft")} that never went to the client.`}{" "}
                  This cannot be undone. Audit history and Stripe and QuickBooks
                  records are kept.
                </>
              ) : (
                <>
                  {blocker === keepClientHistory
                    ? "This client has proposal history that must be kept. "
                    : ""}
                  Archiving hides {client.company} from client lists and search.
                  You can restore this client from Archived. Proposals and
                  billing records stay available.
                </>
              )}
            </p>
            {error && (
              <Banner tone="danger" title="Client action failed">
                {error}
              </Banner>
            )}
            <DialogActions>
              <Button disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              {confirm === "archive" ? (
                <Button busy={busy} onClick={() => void updateArchive(true)}>
                  Archive client
                </Button>
              ) : (
                <Button
                  variant="danger"
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
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
              )}
            </DialogActions>
          </div>
        </Sheet>
      )}
    </div>
  );
}
