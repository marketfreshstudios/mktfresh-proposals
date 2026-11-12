"use client";
import type { ReactNode } from "react";
import {
  Check,
  CircleAlert,
  Clock,
  Download,
  Info,
  Lock,
  Mail,
} from "lucide-react";
import type { BillingLine } from "../lib/model";
import type { BillingGroup } from "../lib/billing-display";
import { cardLabel } from "../lib/billing-confirmation";
import { formatMoney } from "../lib/money";
import { Button } from "./ui";

/** One Checkout page the client still has to finish. */
export type AfterSession = BillingGroup & { lines: BillingLine[] };
/** A charge to an existing subscription the client must approve first. */
export type AfterApproval = {
  id: string;
  kind: "add" | "own";
  card: { brand: string; last4: string } | null;
  interval: "month" | "year";
  first_charge: number | null;
  lines: BillingLine[];
};
export type AfterConfirmation = {
  checkout_session_id: string;
  mode: "setup" | "subscription";
  collection_method: "send_invoice" | "charge_automatically";
  completed_at: string;
  currency: string;
  items: {
    id: string;
    name: string;
    amount: number;
    qty: number;
    interval: "month" | "year";
  }[];
  payment_method_type?: "us_bank_account";
  card: { brand: string; last4: string } | null;
  next_billing_at: string | null;
};

/** Which screen the client sees after signing (Redesign 26 frame names). */
export type AfterSigningView =
  | "billing" // 1a–1g, 2d
  | "billing_review" // 1h
  | "confirming" // 2a
  | "still_confirming" // 2c
  | "bank_processing" // 2e
  | "bank_failed" // 2f
  | "one_step_left" // 3a
  | "all_set" // 2b, 2g, 3b, 3d
  | "completed"; // 3c

export function afterSigningView(s: {
  completed: boolean;
  step: "billing" | "done";
  requiresCheckout: boolean;
  billingProblem: boolean;
  bankState?: "processing" | "failed";
  returned: boolean;
  returnConfirmed: boolean;
  returnTimedOut: boolean;
}): AfterSigningView {
  if (s.bankState === "failed") return "bank_failed";
  if (s.bankState === "processing") return "bank_processing";
  if (s.returned && !s.returnConfirmed)
    return s.returnTimedOut ? "still_confirming" : "confirming";
  if (s.billingProblem && !s.completed) return "billing_review";
  if (s.requiresCheckout)
    return s.step === "done" ? "one_step_left" : "billing";
  return s.completed ? "completed" : "all_set";
}

export type AfterSigningProps = {
  view: AfterSigningView;
  preview: boolean;
  firstName: string;
  email: string;
  timezone: string;
  currency: string;
  cents?: "auto" | "always";
  /** The studio that countersigns (workspace name). */
  studio: string;
  contact: { name: string; email?: string; phone?: string };
  signedAt?: string;
  countersignedAt?: string;
  collection: "send_invoice" | "charge_automatically";
  invoiceMethod: "quickbooks" | "manual";
  recurring: BillingLine[];
  oneTime: BillingLine[];
  sessions: AfterSession[];
  approvals: AfterApproval[];
  confirmations: AfterConfirmation[];
  added: BillingLine[];
  /** Came back from Checkout without finishing (?billing=pending). */
  leftCheckout: boolean;
  checkoutError: string;
  opening: string;
  approving: string;
  files: { id: string; stage?: string }[];
  showCopy: boolean;
  onOpen: (session: AfterSession) => void;
  onApprove: (approval: AfterApproval) => void;
  onLater: () => void;
  onFinishBilling: () => void;
  onCheckAgain: () => void;
  onDownload: (fileId: string) => void;
  onToggleCopy: () => void;
};

const per = (interval: string) => (interval === "year" ? "yr" : "mo");
const sum = (lines: { amount: number; qty: number }[]) =>
  lines.reduce((total, l) => total + l.amount * l.qty, 0);
const ordinal = (n: number) =>
  n +
  (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] ||
    ["th", "st", "nd", "rd"][n % 100] ||
    "th");

export function AfterSigning(props: AfterSigningProps) {
  const { view, firstName, currency, cents, studio, contact, timezone } = props;
  const money = (amount: number) => formatMoney(amount, currency, cents);
  const day = (value?: string | number | null) =>
    value === undefined || value === null
      ? ""
      : new Intl.DateTimeFormat("en-US", {
          dateStyle: "long",
          timeZone: timezone,
        }).format(new Date(value));
  const stamp = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        }).format(new Date(value))
      : "";
  const today = new Date();
  const dayOfMonth = Number(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: timezone,
    }).format(today),
  );
  const contactFirst = contact.name.trim().split(/\s+/)[0] || studio;
  const thanks = `Signed. Thank you${firstName ? `, ${firstName}` : ""}.`;
  const allSet = `You’re all set${firstName ? `, ${firstName}` : ""}.`;
  const intervalWord = (lines: { interval: string }[]) =>
    lines.length && lines.every((l) => l.interval === "year")
      ? "yearly"
      : "monthly";
  const word = intervalWord(props.recurring);
  const finalCopy = props.files.find((f) => f.stage === "company");
  const signedCopy = props.files.find((f) => f.stage !== "company");

  // What-happens-next rows, in order, as they apply.
  type Row = {
    state: "done" | "current" | "waiting" | "todo";
    title: string;
    note?: string;
    action?: ReactNode;
  };
  const signedRow: Row = {
    state: "done",
    title: "You signed",
    note: stamp(props.signedAt),
  };
  const countersignRow: Row = props.countersignedAt
    ? {
        state: "done",
        title: `Countersigned by ${studio}`,
        note: stamp(props.countersignedAt),
      }
    : {
        state: "todo",
        title: `Countersigned by ${studio}`,
        note: "Usually within one business day",
      };
  const invoiceRow: Row | null = props.oneTime.length
    ? {
        state: "todo",
        title: `Invoice for ${money(sum(props.oneTime))}`,
        note:
          props.invoiceMethod === "quickbooks"
            ? "Emailed from QuickBooks after both sides sign"
            : "Emailed after both sides sign",
      }
    : null;
  const billedRow = (state: Row["state"], title: string, note?: string) =>
    props.recurring.length ? { state, title, note } : null;
  const rows = (...list: (Row | null)[]) => list.filter(Boolean) as Row[];

  const checklist = (label: string, list: Row[]) => (
    <section className="after-card after-checklist" aria-label={label}>
      <h2 className="after-eyebrow">{label}</h2>
      <ol>
        {list.map((r) => (
          <li key={r.title} data-state={r.state}>
            <span className="after-check-mark" aria-hidden="true">
              {r.state === "done" ? (
                <Check size={14} strokeWidth={3} />
              ) : r.state === "waiting" ? (
                <Clock size={16} />
              ) : null}
            </span>
            <div>
              <strong>{r.title}</strong>
              {r.note && <small>{r.note}</small>}
              {r.action}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
  const note = (tone: "info" | "danger", title: string, body?: ReactNode) => (
    <div
      className="after-note"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      {tone === "danger" ? <CircleAlert size={16} /> : <Info size={16} />}
      <div>
        <strong>{title}</strong>
        {body && <p>{body}</p>}
      </div>
    </div>
  );
  const items = (lines: BillingLine[], prefix = "") => (
    <ul className="after-lines">
      {lines.map((l) => (
        <li key={l.id}>
          <span>{l.name}</span>
          <span>
            {prefix}
            {money(l.amount * l.qty)}/{per(l.interval)}
          </span>
        </li>
      ))}
    </ul>
  );
  const scheduleTerms = (lines: BillingLine[]) =>
    lines
      .filter((l) => l.schedule || l.min_term_months)
      .map((l) => (
        <p className="after-small" key={l.id}>
          {l.schedule
            ? `${money(l.amount)}/${per(l.interval)} for ${l.schedule.after_paid_invoices} paid invoices, then ${money(l.schedule.then.amount)}/${per(l.interval)}.`
            : ""}
          {l.min_term_months
            ? ` ${l.min_term_months}-month minimum commitment.`
            : ""}
        </p>
      ));
  const nextLine = (lines: BillingLine[]) => {
    const total = money(sum(lines));
    return lines.every((l) => l.interval === "year")
      ? `Then ${total} each year on ${day(today.getTime()).replace(/, \d{4}$/, "")}.`
      : `Then ${total} on the ${ordinal(dayOfMonth)} of each month.`;
  };
  const recurringCard = (
    lines: BillingLine[],
    session?: AfterSession,
    heading?: string,
    action?: ReactNode,
  ) => {
    const setup = session?.mode === "setup";
    const invoiced =
      setup &&
      (session?.collection_method ?? props.collection) === "send_invoice";
    const today = session?.amount_due_today ?? sum(lines);
    return (
      <section
        className="after-card"
        aria-label={heading ?? "Recurring"}
        key={session?.id ?? session?.url ?? heading ?? "recurring"}
      >
        <header className="after-card-head">
          <h2 className="after-eyebrow">
            {heading ??
              (intervalWord(lines) === "yearly" ? "Yearly" : "Monthly")}
          </h2>
          <span className="after-tag">Stripe</span>
        </header>
        {items(lines)}
        {scheduleTerms(lines)}
        <p className="after-total">
          <strong>{invoiced ? "Due today" : "First payment today"}</strong>
          <strong>{invoiced ? money(0) : money(today)}</strong>
        </p>
        <p className="after-small">
          {invoiced
            ? `Your first invoice for ${money(sum(lines))} is emailed once your subscription starts, then each ${intervalWord(lines) === "yearly" ? "year" : "month"}.`
            : nextLine(lines)}
        </p>
        {action}
      </section>
    );
  };
  const oneTimeCard = props.oneTime.length ? (
    <section
      className="after-card after-card-quiet"
      aria-label="Invoiced separately"
    >
      <h2 className="after-eyebrow">Invoiced separately</h2>
      <ul className="after-lines">
        {props.oneTime.map((l) => (
          <li key={l.id}>
            <span>{l.name}</span>
            <span>{money(l.amount * l.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="after-small">
        We’ll email an invoice for this after both sides sign. Nothing to pay
        here.
      </p>
    </section>
  ) : null;
  const confirmedCard = (c: AfterConfirmation) => {
    const paid =
      c.collection_method === "charge_automatically" &&
      c.mode === "subscription";
    const card = c.card ? cardLabel(c.card) : "";
    return (
      <section
        className="after-card"
        key={c.checkout_session_id}
        aria-label="Billing set up"
      >
        <h2 className="after-confirmed">
          <Check size={16} strokeWidth={3} aria-hidden="true" />
          {c.items.every((i) => i.interval === "year")
            ? "Yearly"
            : "Monthly"}{" "}
          billing is set up
        </h2>
        <ul className="after-lines">
          {c.items.map((i) => (
            <li key={i.id}>
              <span>{i.name}</span>
              <span>
                {money(i.amount * i.qty)}/{per(i.interval)}
              </span>
            </li>
          ))}
        </ul>
        <p className="after-small">
          {c.payment_method_type === "us_bank_account"
            ? "Paid from your bank account."
            : paid && card
              ? `${money(sum(c.items))} paid today with ${card}.`
              : card
                ? `Card saved: ${card}.`
                : ""}
          {c.next_billing_at
            ? ` Next payment ${money(sum(c.items))} on ${day(c.next_billing_at)}.`
            : ""}
        </p>
      </section>
    );
  };
  const addedCard = props.added.length ? (
    <section className="after-card" aria-label="Added to your plan">
      <h2 className="after-confirmed">
        <Check size={16} strokeWidth={3} aria-hidden="true" />
        Added to your plan
      </h2>
      {items(props.added, "+ ")}
      <p className="after-small">
        Nothing is charged today. It appears on your next invoice.
      </p>
    </section>
  ) : null;
  const copies = (
    <div className="after-copies">
      {finalCopy ? (
        <Button
          variant={props.view === "completed" ? "primary" : "secondary"}
          onClick={() => props.onDownload(finalCopy.id)}
        >
          <Download size={16} aria-hidden="true" />
          Download the final copy
        </Button>
      ) : (
        signedCopy && (
          <Button onClick={() => props.onDownload(signedCopy.id)}>
            <Download size={16} aria-hidden="true" />
            Download your signed copy
          </Button>
        )
      )}
      <Button variant="ghost" onClick={props.onToggleCopy}>
        {props.showCopy ? "Hide the proposal" : "View the proposal"}
      </Button>
    </div>
  );
  const sealing =
    !props.files.length && !props.preview
      ? note(
          "info",
          "Your signed copy is being prepared.",
          "It will be emailed to you in a few minutes. Your signature is saved.",
        )
      : null;
  const contactLine = (
    <p className="after-contact">
      Questions? Email{" "}
      {contact.email ? (
        <a href={`mailto:${contact.email}`}>{contact.name || studio}</a>
      ) : (
        contact.name || studio
      )}
      {contact.phone ? ` or call ${contact.phone}` : ""}.
    </p>
  );
  const emailContact = contact.email ? (
    <a className="btn ghost after-email" href={`mailto:${contact.email}`}>
      <Mail size={16} aria-hidden="true" />
      Email {contactFirst}
    </a>
  ) : null;
  // Phone: a sticky bar at the bottom. Desktop: the same actions under the
  // cards (CSS decides).
  const actions = (primary: ReactNode, later = true, hint?: string) => (
    <div className="after-actions">
      {primary}
      {later && (
        <Button variant="ghost" onClick={props.onLater}>
          I’ll do this later
        </Button>
      )}
      {hint && <p className="after-small after-hint">{hint}</p>}
    </div>
  );
  const openButton = (session: AfterSession, label: string) =>
    props.preview ? (
      <Button variant="primary" disabled>
        <Lock size={16} aria-hidden="true" />
        {label}
      </Button>
    ) : (
      <a
        className="btn primary"
        href={session.url}
        aria-busy={props.opening === session.id}
        onClick={(event) => {
          if (!session.id) return;
          event.preventDefault();
          if (!props.opening) props.onOpen(session);
        }}
      >
        <Lock size={16} aria-hidden="true" />
        {label}
      </a>
    );

  const success = (
    <p className="after-success">
      <Check size={16} strokeWidth={3} aria-hidden="true" />
      {thanks}
    </p>
  );

  if (view === "billing") {
    const done = new Set(props.confirmations.map((c) => c.checkout_session_id));
    const sessions = props.sessions;
    const scheduled = props.recurring.find((l) => l.schedule);
    const approval = !sessions.length ? props.approvals[0] : undefined;
    const allSetup =
      sessions.length > 0 &&
      sessions.every(
        (s) =>
          s.mode === "setup" &&
          (s.collection_method ?? props.collection) === "send_invoice",
      );
    const heading = approval
      ? `Approve your new ${intervalWord(approval.lines)} service`
      : sessions.length > 1
        ? `Set up your billing in ${["", "", "two", "three", "four"][sessions.length] ?? sessions.length} steps`
        : scheduled && sessions.length === 1 && !allSetup
          ? `Start your ${scheduled.name} plan`
          : allSetup
            ? `Save a card for your ${word} billing`
            : `Set up your ${word} billing`;
    const primaryLabel = allSetup
      ? "Save a card"
      : "Continue to secure payment";
    const single = sessions.length === 1 ? sessions[0] : undefined;
    return (
      <div className="after-signing" data-view="billing">
        {success}
        {props.checkoutError &&
          note(
            "danger",
            "The secure payment page didn’t open.",
            `Nothing was charged. Try again, or email ${contactFirst} for a new link.`,
          )}
        {props.leftCheckout &&
          !props.checkoutError &&
          note(
            "info",
            "You left the payment page.",
            "Nothing was charged. Pick up where you left off whenever you’re ready.",
          )}
        <h1>{heading}</h1>
        <div className="after-cards">
          {approval ? (
            <section
              className="after-card"
              aria-label="Added to your current plan"
            >
              <header className="after-card-head">
                <h2 className="after-eyebrow">
                  {approval.kind === "add"
                    ? "Added to your current plan"
                    : "On your card on file"}
                </h2>
                <span className="after-tag">Stripe</span>
              </header>
              {items(approval.lines, approval.kind === "add" ? "+ " : "")}
              {scheduleTerms(approval.lines)}
              <p className="after-total">
                <strong>
                  {approval.kind === "add" && approval.first_charge
                    ? `From your next invoice, ${day(approval.first_charge * 1000).replace(/, \d{4}$/, "")}`
                    : "First payment when you approve"}
                </strong>
                <strong>
                  {money(sum(approval.lines))}/{per(approval.interval)}
                </strong>
              </p>
              <p className="after-small">
                {approval.card
                  ? `Charged to your ${cardLabel(approval.card)}.`
                  : "Charged to your card on file."}{" "}
                Nothing is added until you approve.
                {contact.email ? (
                  <>
                    {" "}
                    To use a different card, email{" "}
                    <a href={`mailto:${contact.email}`}>{contactFirst}</a>.
                  </>
                ) : (
                  ` To use a different card, contact ${contactFirst}.`
                )}
              </p>
            </section>
          ) : sessions.length > 1 ? (
            sessions.map((s, i) =>
              recurringCard(
                s.lines,
                s,
                `Step ${i + 1} of ${sessions.length} | ${intervalWord(s.lines) === "yearly" ? "Yearly" : "Monthly"}`,
                s.id && done.has(s.id) ? (
                  <p className="after-confirmed after-step-done">
                    <Check size={16} strokeWidth={3} aria-hidden="true" /> Set
                    up
                  </p>
                ) : (
                  openButton(s, "Continue to secure payment")
                ),
              ),
            )
          ) : single ? (
            recurringCard(
              single.lines.length ? single.lines : props.recurring,
              single,
            )
          ) : (
            <section
              className="after-card"
              aria-label="Preparing"
              aria-busy="true"
            >
              <header className="after-card-head">
                <h2 className="after-eyebrow">
                  {word === "yearly" ? "Yearly" : "Monthly"}
                </h2>
                <span className="after-tag">Stripe</span>
              </header>
              {items(props.recurring)}
              <p className="after-total">
                <strong>First payment today</strong>
                <strong>{money(sum(props.recurring))}</strong>
              </p>
            </section>
          )}
          {addedCard}
          {oneTimeCard}
        </div>
        {approval
          ? actions(
              props.preview ? null : (
                <Button
                  variant="primary"
                  busy={props.approving === approval.id}
                  disabled={!!props.approving}
                  onClick={() => props.onApprove(approval)}
                >
                  <Lock size={16} aria-hidden="true" />
                  {`Approve and add ${money(sum(approval.lines))}/${per(approval.interval)}`}
                </Button>
              ),
            )
          : sessions.length > 1
            ? actions(null)
            : single
              ? actions(
                  openButton(
                    single,
                    props.checkoutError ? "Try again" : primaryLabel,
                  ),
                  true,
                  "You’ll finish on Stripe’s secure page, then come back here.",
                )
              : actions(
                  <Button variant="primary" disabled>
                    Preparing your secure payment page
                  </Button>,
                )}
      </div>
    );
  }

  if (view === "billing_review")
    return (
      <div className="after-signing" data-view="billing_review">
        {success}
        <h1>{contactFirst} will finish your billing setup</h1>
        <p>
          Nothing has been charged. {contactFirst} is checking one billing
          detail, then will email you a link to set up your {word} payments.
        </p>
        {checklist(
          "What happens next",
          rows(
            signedRow,
            {
              state: "waiting",
              title: "Billing review",
              note: `${studio} is checking your billing details`,
            },
            billedRow(
              "todo",
              `Set up ${word} billing`,
              "You’ll get an email when it’s ready",
            ),
            countersignRow,
          ),
        )}
        {contactLine}
        {copies}
      </div>
    );

  if (view === "confirming" || view === "still_confirming") {
    const still = view === "still_confirming";
    return (
      <div className="after-signing" data-view={view}>
        {success}
        <h1>
          {still ? "Still confirming your payment" : "Confirming your payment"}
        </h1>
        {still ? (
          <>
            {note(
              "info",
              "Your signature and payment details are saved.",
              "Stripe hasn’t confirmed yet. We’ll email you as soon as it does. You don’t need to pay again.",
            )}
            <div className="after-copies">
              <Button onClick={props.onCheckAgain}>Check again</Button>
              {emailContact}
            </div>
          </>
        ) : (
          <p role="status">
            Stripe is sending us the confirmation. This usually takes a few
            seconds. You can close this page; we’ll email you when it’s done.
          </p>
        )}
        {checklist(
          "Where things stand",
          rows(
            signedRow,
            { state: "done", title: "Payment details sent to Stripe" },
            still
              ? { state: "waiting", title: "Waiting for Stripe’s confirmation" }
              : {
                  state: "current",
                  title: "Confirming with Stripe",
                  note: "Usually a few seconds",
                },
            countersignRow,
          ),
        )}
        {copies}
      </div>
    );
  }

  if (view === "bank_processing" || view === "bank_failed") {
    const failed = view === "bank_failed";
    return (
      <div className="after-signing" data-view={view}>
        {failed
          ? note(
              "danger",
              "Your bank payment didn’t go through.",
              "Your proposal is still signed. Your bank returned the payment, so nothing was taken.",
            )
          : success}
        <h1>
          {failed
            ? "Try another way to pay"
            : "Your bank payment is processing"}
        </h1>
        {!failed && (
          <p>
            Bank payments take a few business days to clear. We’ll email you
            when Stripe confirms it. There’s nothing else you need to do.
          </p>
        )}
        {failed && (
          <p>
            Email {contactFirst} and they’ll send you a new secure payment link.
          </p>
        )}
        <div className="after-cards">
          <section className="after-card" aria-label="Recurring">
            <header className="after-card-head">
              <h2 className="after-eyebrow">
                {word === "yearly" ? "Yearly" : "Monthly"}
              </h2>
              <span className="after-tag">Stripe</span>
            </header>
            {items(props.recurring)}
            <p className="after-total">
              <span>
                <strong>First payment</strong>
                <small>
                  {failed
                    ? "From your bank account, returned"
                    : "From your bank account, processing"}
                </small>
              </span>
              <strong>{money(sum(props.recurring))}</strong>
            </p>
          </section>
        </div>
        {failed
          ? emailContact && (
              <div className="after-actions">
                <a className="btn primary" href={`mailto:${contact.email}`}>
                  <Mail size={16} aria-hidden="true" />
                  Email {contactFirst}
                </a>
              </div>
            )
          : checklist(
              "What happens next",
              rows(
                signedRow,
                {
                  state: "waiting",
                  title: "Bank payment clearing",
                  note: "A few business days",
                },
                countersignRow,
              ),
            )}
        {!failed && copies}
      </div>
    );
  }

  if (view === "one_step_left")
    return (
      <div className="after-signing" data-view={view}>
        {success}
        <h1>One step left: billing</h1>
        <p>
          Your proposal is signed. Set up your {word} billing whenever you’re
          ready; we also emailed you this link.
        </p>
        {checklist(
          "What happens next",
          rows(
            signedRow,
            {
              state: "current",
              title: `Set up ${word} billing`,
              note: `${money(sum(props.recurring))}/${word === "yearly" ? "yr" : "mo"} through Stripe`,
              action: (
                <Button variant="primary" onClick={props.onFinishBilling}>
                  <Lock size={16} aria-hidden="true" />
                  Finish billing
                </Button>
              ),
            },
            countersignRow,
            invoiceRow,
          ),
        )}
        {copies}
      </div>
    );

  const completed = view === "completed";
  const billedNow = props.confirmations.length > 0 || props.added.length > 0;
  return (
    <div className="after-signing" data-view={view}>
      {completed && <p className="after-eyebrow">Signed by both sides</p>}
      <h1>{completed ? "Your completed agreement" : allSet}</h1>
      <p>
        {completed
          ? `${studio} countersigned${props.countersignedAt ? ` on ${day(props.countersignedAt).replace(/, \d{4}$/, "")}` : ""}. The final copy is emailed to ${props.email}.`
          : `${props.recurring.length && billedNow ? "Your billing is set up. " : ""}${contactFirst} will countersign, then we’ll email the final copy to ${props.email}.`}
      </p>
      <div className="after-cards">
        {!completed && props.confirmations.map(confirmedCard)}
        {!completed && addedCard}
        {checklist(
          completed ? "Done" : "What happens next",
          rows(
            signedRow,
            props.recurring.length
              ? props.confirmations.length || props.added.length
                ? {
                    state: "done",
                    title:
                      props.added.length && !props.confirmations.length
                        ? `${props.added.map((l) => l.name).join(", ")} added to your plan`
                        : `${word === "yearly" ? "Yearly" : "Monthly"} billing set up`,
                    note: props.confirmations[0]?.next_billing_at
                      ? `Next payment ${money(sum(props.confirmations[0].items))} on ${day(props.confirmations[0].next_billing_at)}`
                      : undefined,
                  }
                : {
                    // Signed, but the billing link isn't ready yet.
                    state: "todo",
                    title: `Set up ${word} billing`,
                    note: "We’ll email you a secure link when it’s ready",
                  }
              : null,
            countersignRow,
            invoiceRow,
          ),
        )}
      </div>
      {!completed && sealing}
      {copies}
    </div>
  );
}
