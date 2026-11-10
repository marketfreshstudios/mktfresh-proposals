"use client";

import { withCount } from "../lib/count-label";
import { StaffTable, StaffTableHead } from "./staff-table";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  FileText,
  LockKeyhole,
  Package,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import type { Data } from "./staff-app";
import { stripeTestDashboard } from "../lib/stripe-connect-status";
import type { ConnectionStatus } from "../lib/workspace-setup";
import type { Item, Proposal } from "../lib/model";
import {
  oneTimeInvoiceLines,
  quickBooksInvoiceTiming,
} from "../lib/proposal-state";
import { quickBooksCustomerReview } from "../lib/qbo-mapping";
import { publicBankState } from "../lib/billing-confirmation";
import { chromeIcons } from "./staff-icons";
import { confirmDialog } from "./dialog-actions";
import { Sheet, Skeleton } from "./foundation";
import { api, Banner, Button, post } from "./ui";
import { useMoney } from "./money-context";
import { useQuickBooksItemName } from "./quickbooks-fields";
import { ProviderMark, QuickBooksConnectButton } from "./provider-brand";

const billingDefaults = "/studio/workspace?view=billing";
const quickBooksDashboard = "https://sandbox.qbo.intuit.com/app/homepage";

export function ConnectionDetailLayout({
  name,
  mark,
  status,
  tone,
  subtitle,
  actions,
  children,
}: {
  name: string;
  mark: ReactNode;
  status?: string;
  tone?: "success" | "warning" | "info";
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="studio-connection-detail">
      <div className="connection-hero">
        <a className="connection-back" href="/studio/connections">
          <ChevronLeft size={16} aria-hidden="true" /> Connections
        </a>
        <header className="connection-detail-header">
          {typeof mark === "string" ? (
            <span className="connection-monogram" aria-hidden="true">
              {mark}
            </span>
          ) : (
            mark
          )}
          <div>
            <div className="connection-detail-title">
              <h1 className="t-page-title">{name}</h1>
              {status && <span className={`pill ${tone ?? ""}`}>{status}</span>}
            </div>
            <p>{subtitle}</p>
          </div>
          {actions && (
            <div className="connection-detail-actions">{actions}</div>
          )}
        </header>
      </div>
      {children}
    </article>
  );
}

export const connectionDetails = {
  stripe: {
    name: "Stripe",
    mark: <ProviderMark provider="stripe" />,
    subtitle: "Recurring payments, subscriptions and your product list.",
  },
  quickbooks: {
    name: "QuickBooks",
    mark: <ProviderMark provider="qbo" />,
    subtitle: "One-time invoices for signed proposals.",
  },
  email: {
    name: "Email sending",
    mark: "E",
    subtitle:
      "Proposals send from the selected staff member. Replies follow your workspace rules.",
    actions: (
      <a className="btn" href="/studio/workspace?view=email-sending">
        Open sending domain
      </a>
    ),
  },
  assistants: {
    name: "AI assistants",
    mark: "AI",
    subtitle:
      "Read reference data and draft proposals. A person always reviews and sends.",
  },
  imports: {
    name: "Import from Proposify",
    mark: "P",
    subtitle:
      "Past proposals are kept as read-only PDFs linked to their clients.",
    actions: (
      <a className="btn" href="/proposals?view=imported">
        View imported proposals
      </a>
    ),
  },
};

export function ConnectionDetailLoading({
  page,
}: {
  page: keyof typeof connectionDetails;
}) {
  return (
    <ConnectionDetailLayout {...connectionDetails[page]}>
      <Skeleton kind="table" label="Loading connection…" />
    </ConnectionDetailLayout>
  );
}

export type ConnectionTile = {
  label: string;
  value: ReactNode;
  tone?: "success" | "warning";
  detail?: ReactNode;
  action?: ReactNode;
};
export function ConnectionTiles({ tiles }: { tiles: ConnectionTile[] }) {
  return (
    <dl className="connection-tiles">
      {tiles.map(({ label, value, tone, detail, action }) => (
        <div className="connection-tile" key={label}>
          <dt>{label}</dt>
          <dd>
            <strong className={tone}>
              {tone === "success" ? (
                <CircleCheck size={16} aria-hidden="true" />
              ) : tone === "warning" ? (
                <CircleAlert size={16} aria-hidden="true" />
              ) : null}
              {value}
            </strong>
            {detail && <small>{detail}</small>}
            {action && <span className="connection-tile-action">{action}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ConnectionColumns({
  main,
  aside,
}: {
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="connection-detail-columns">
      <div>{main}</div>
      <div>{aside}</div>
    </div>
  );
}

export function ConnectionPanel({
  title,
  subtitle,
  action,
  children,
  className = "",
  id,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`connection-panel ${className}`} id={id}>
      <header>
        <div>
          <h2 className="t-card-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ConnectionFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="connection-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export type ConnectionStep = {
  title: string;
  detail: ReactNode;
  icon: typeof CreditCard;
};
export function ConnectionSteps({ steps }: { steps: ConnectionStep[] }) {
  return (
    <ul className="connection-steps" role="list">
      {steps.map(({ title, detail, icon: Icon }) => (
        <li key={title}>
          <span className="connection-step-icon">
            <Icon size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{title}</strong>
            <p>{detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Activity = {
  rows: {
    id: string;
    label: string;
    detail: string;
    created_at: string;
    proposal_id?: string;
  }[];
  connected?: { actor: string; name?: string; created_at: string };
  lastSync?: string;
  lastBillingEvent?: string;
};
type Action =
  | "authorize"
  | "disconnect"
  | "refresh"
  | "sync"
  | "stripe-authorize"
  | "stripe-setup"
  | "stripe-disconnect";
type Queue = "waiting" | "drafts" | "customers" | "stripe";
const queueTitles: Record<Queue, string> = {
  waiting: "Waiting on QuickBooks",
  drafts: "Draft invoices to review",
  customers: "QuickBooks customers to choose",
  stripe: "Proposals with Stripe billing to finish",
};
const proposalLink = (p: Proposal) => `/proposals/${p.id}`;
const proposalLabel = (p: Proposal) => `${p.client.company} · ${p.title}`;

export function BillingConnectionDetail({
  provider,
  data,
}: {
  provider: "qbo" | "stripe";
  data: Data;
}) {
  const qbo = provider === "qbo";
  const name = qbo ? "QuickBooks" : "Stripe";
  const [health, setHealth] = useState(data.connections);
  const [activity, setActivity] = useState<Activity>();
  const [activityError, setActivityError] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<Action>();
  const [menu, setMenu] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [openQueue, setOpenQueue] = useState<Queue>();
  const [refreshedCatalog, setRefreshedCatalog] = useState<Item[]>();
  const settings = data.settings;
  const owner = data.user.staff_role === "owner";
  const admin = data.staff.find(
    (member) =>
      member.role === "owner" && (!member.status || member.status === "active"),
  );
  const connection = health?.qbo_connection;
  const stripe = health?.stripe_connect;
  const managedStripe = !qbo && health?.stripe_platform === false;
  const stripeSetup = stripe?.state === "setting_up";
  const stripeDisconnecting = stripe?.state === "disconnecting";
  const providerDashboard = qbo
    ? quickBooksDashboard
    : (stripe?.dashboardUrl ?? stripeTestDashboard);
  const connected = qbo ? connection?.state === "connected" : health?.stripe;
  const reconnect = qbo && connection?.state === "reconnect";
  const mode = health?.mode === "live" ? "live" : "test";
  const canSync = !qbo && connected && mode === "test";
  const status = stripeDisconnecting
    ? "Disconnecting"
    : stripeSetup
      ? "Setting up · test mode"
      : connected
        ? `Connected · ${qbo ? "sandbox" : mode + " mode"}`
        : reconnect
          ? "Reconnect needed"
          : health
            ? "Not connected"
            : "Status unavailable";
  const itemName = useQuickBooksItemName(
    settings?.qbo_custom_item_ref,
    qbo && !!connected,
  );
  const [termName, setTermName] = useState<string>();
  const money = useMoney();
  const timezone = settings?.timezone ?? "UTC";
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(value));
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(value));

  const proposals = data.proposals.filter(
    (p) => p.source === "native" && !p.archived_at,
  );
  const countersigned = proposals.filter((p) =>
    p.signers.some((signer) => signer.role === "company"),
  );
  const drafts = countersigned.filter((p) =>
    p.billing_links.some(
      (link) =>
        link.provider === "qbo" &&
        (link.metadata?.invoice as { status?: string } | undefined)?.status ===
          "Draft",
    ),
  );
  const customers = countersigned.filter((p) =>
    p.billing_links.some(quickBooksCustomerReview),
  );
  const waiting = countersigned.filter(
    (p) =>
      oneTimeInvoiceLines(p).length &&
      !p.billing_links.some(
        (link) =>
          link.provider === "qbo" &&
          (link.external_object_id || link.status === "succeeded"),
      ),
  );
  const invoiceWaiting = reconnect
    ? waiting
    : waiting.filter((p) => !p.billing_links.some(quickBooksCustomerReview));
  const stripeIssues = proposals.filter((p) =>
    p.billing_links.some(
      (link) =>
        link.provider === "stripe" &&
        (link.status === "failed" ||
          link.status === "needs_review" ||
          link.metadata?.requires_checkout === true ||
          publicBankState(link) === "failed"),
    ),
  );
  const catalog = (refreshedCatalog ?? data.catalog).filter(
    (item) => item.active && !item.legacy,
  );
  const recurring = catalog.filter(
    (item) => item.interval !== "one_time",
  ).length;
  const queues: Record<Queue, Proposal[]> = {
    waiting: invoiceWaiting,
    drafts,
    customers,
    stripe: stripeIssues,
  };
  const queueLink = (queue: Queue, label: string) => (
    <a href={`#connection-queue-${queue}`} onClick={() => setOpenQueue(queue)}>
      {label}
    </a>
  );

  async function loadActivity(signal?: AbortSignal) {
    try {
      const result = await api<Activity>(
        `/api/connections/${provider}/activity`,
        { signal },
      );
      if (signal?.aborted) return;
      if (!Array.isArray(result?.rows)) throw new Error("Activity unavailable");
      setActivity(result);
      setActivityError(false);
    } catch {
      if (!signal?.aborted) setActivityError(true);
    }
  }

  useEffect(() => {
    const abort = new AbortController();
    void loadActivity(abort.signal);
    if (qbo && connected && settings?.qbo_term_ref)
      api<{ id: string; name: string }[]>("/api/connections/qbo/terms", {
        signal: abort.signal,
      })
        .then((items) => {
          if (!abort.signal.aborted && Array.isArray(items))
            setTermName(
              items.find((item) => item.id === settings.qbo_term_ref)?.name,
            );
        })
        .catch(() => {});
    return () => abort.abort();
  }, [provider, connected, settings?.qbo_term_ref]);

  useEffect(() => {
    if (openQueue)
      document
        .getElementById(`connection-queue-${openQueue}`)
        ?.scrollIntoView({ block: "start" });
  }, [openQueue]);

  useEffect(() => {
    if (
      managedStripe &&
      new URLSearchParams(window.location.search).get("connection") === "failed"
    )
      setError(
        "Stripe connection could not be completed. Start again from Yeswell.",
      );
  }, [managedStripe]);

  useEffect(() => {
    if (!stripeSetup && !stripeDisconnecting) return;
    const abort = new AbortController();
    const timer = setInterval(() => {
      void api<ConnectionStatus>("/api/connections", { signal: abort.signal })
        .then((next) => {
          if (!abort.signal.aborted) setHealth(next);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [stripeSetup, stripeDisconnecting]);

  const [syncedCount, setSyncedCount] = useState<number>();

  async function manage(action: Action) {
    if (busy) return;
    setMenu(false);
    setBusy(action);
    setError("");
    setNotice("");
    try {
      if (action === "stripe-authorize") {
        const { url } = await post<{ url: string }>(
          "/api/connections/stripe/authorize",
          { mode: "test" },
        );
        window.location.assign(url);
        return;
      }
      if (action === "stripe-setup") {
        await post("/api/connections/stripe/setup");
        setNotice("Stripe setup will continue here.");
      } else if (action === "stripe-disconnect") {
        if (
          !(await confirmDialog({
            title: "Disconnect Stripe?",
            description:
              "New recurring billing will wait until you reconnect. Existing subscriptions and payments stay in Stripe.",
            details: (
              <div className="connection-disconnect-impact">
                <strong>
                  {withCount(
                    stripeIssues.length,
                    "proposal has",
                    "proposals have",
                  )}{" "}
                  Stripe billing to finish
                </strong>
                {stripeIssues.length > 0 && (
                  <ul>
                    {stripeIssues.slice(0, 5).map((p) => (
                      <li key={p.id}>{proposalLabel(p)}</li>
                    ))}
                  </ul>
                )}
                {stripeIssues.length > 5 && (
                  <p>And {stripeIssues.length - 5} more.</p>
                )}
              </div>
            ),
            confirmLabel: "Disconnect",
            destructive: true,
          }))
        )
          return;
        const next = await post<
          NonNullable<ConnectionStatus["stripe_connect"]>
        >("/api/connections/stripe/disconnect");
        setHealth(
          (previous) =>
            previous && { ...previous, stripe: false, stripe_connect: next },
        );
        setNotice("Stripe disconnected.");
      } else if (action === "disconnect") {
        if (
          !(await confirmDialog({
            title: "Disconnect QuickBooks?",
            description:
              "New one-time invoices will wait until QuickBooks is connected again. Existing invoices stay in QuickBooks.",
            details: (
              <div className="connection-disconnect-impact">
                <strong>
                  {withCount(waiting.length, "proposal is", "proposals are")}{" "}
                  waiting on an invoice
                </strong>
                {waiting.length > 0 && (
                  <ul>
                    {waiting.slice(0, 5).map((p) => (
                      <li key={p.id}>{proposalLabel(p)}</li>
                    ))}
                  </ul>
                )}
                {waiting.length > 5 && <p>And {waiting.length - 5} more.</p>}
              </div>
            ),
            confirmLabel: "Disconnect",
            destructive: true,
          }))
        )
          return;
        const next = await post<
          NonNullable<ConnectionStatus["qbo_connection"]>
        >("/api/connections/qbo/disconnect");
        setHealth(
          (previous) =>
            previous && { ...previous, qbo: false, qbo_connection: next },
        );
        setNotice("QuickBooks disconnected.");
      } else if (action === "authorize") {
        const { url } = await post<{ url: string }>(
          "/api/connections/qbo/authorize",
        );
        window.location.assign(url);
        return;
      } else if (action === "refresh") {
        const next = await post<
          NonNullable<ConnectionStatus["qbo_connection"]>
        >("/api/connections/qbo/refresh");
        setHealth(
          (previous) => previous && { ...previous, qbo_connection: next },
        );
        setNotice("QuickBooks connection refreshed.");
      } else {
        const result = await post<{ imported?: number; synced_at?: string }>(
          "/api/catalog-sync/stripe",
        );
        if (typeof result?.imported === "number")
          setSyncedCount(result.imported);
        await api<Item[]>("/api/pricing_items")
          .then((items) => {
            if (Array.isArray(items)) setRefreshedCatalog(items);
          })
          .catch(() => {});
        setNotice("Stripe test products synced.");
      }
      await loadActivity();
    } catch (err) {
      setError((err as Error).message);
      if (action === "refresh" || action === "stripe-disconnect")
        await api<ConnectionStatus>("/api/connections")
          .then(setHealth)
          .catch(() => {});
    } finally {
      setBusy(undefined);
    }
  }

  const lastSync = qbo
    ? connection?.last_sync
    : (activity?.lastSync ?? stripe?.products?.at);
  const connectedBy =
    qbo && (connected || reconnect) ? activity?.connected : undefined;
  const staffName =
    connectedBy &&
    (connectedBy.name ??
      data.staff.find(
        (member) => `staff:${member.user_id}` === connectedBy.actor,
      )?.display_name ??
      "Staff member");
  const eventStatus = activity?.lastBillingEvent
    ? "Receiving"
    : health?.stripe_webhooks_configured
      ? "Configured"
      : "Not configured";
  const totalProducts = catalog.length;
  const item =
    itemName ??
    (settings?.qbo_custom_item_ref ? "Mapped in Billing defaults" : "Not set");
  const terms = settings?.qbo_term_ref
    ? (termName ?? "Set in Billing defaults")
    : "Use QuickBooks default";
  const paymentMethods =
    settings?.payment_methods === "card_ach"
      ? "Card + US bank account (ACH)"
      : "Card";
  const emailInvoices = settings?.qbo_invoice_delivery === "email";
  const billingSteps: ConnectionStep[] = qbo
    ? [
        {
          title: "Invoice",
          icon: FileText,
          detail: emailInvoices
            ? "Created and emailed to the client from QuickBooks."
            : "Draft for review. QuickBooks creates the invoice for you to review and send.",
        },
        {
          title: "Default item",
          icon: Package,
          detail: (
            <>
              {item}. Products can map to their own item in{" "}
              <a href="/studio/products">Products</a>.
            </>
          ),
        },
        { title: "Terms", icon: Clock3, detail: terms },
        {
          title: "Customers",
          icon: UsersRound,
          detail:
            "Matched by billing email. When the match isn’t clear, the proposal asks you to choose.",
        },
      ]
    : [
        {
          title: "New clients",
          icon: CreditCard,
          detail:
            "Pay monthly and yearly items through Stripe Checkout right after signing.",
        },
        {
          title: "Existing subscribers",
          icon: UsersRound,
          detail:
            "New items are added to the current subscription without a new payment step.",
        },
        {
          title: "Payment methods",
          icon: LockKeyhole,
          detail: `${paymentMethods}. Shown in Stripe Checkout.`,
        },
      ];
  const aboutSteps: ConnectionStep[] = qbo
    ? [
        {
          title: "Invoices one-time fees",
          icon: FileText,
          detail: quickBooksInvoiceTiming,
        },
        {
          title: "Uses your customers",
          icon: UsersRound,
          detail:
            "Clients are matched to QuickBooks customers by billing email.",
        },
        {
          title: "Keeps status in sync",
          icon: RefreshCw,
          detail: "Open a proposal record to see its current invoice status.",
        },
      ]
    : [
        {
          title: "Brings in your products",
          icon: Package,
          detail:
            "Recurring products and plan terms sync from Stripe. You still type every amount on a proposal.",
        },
        {
          title: "Takes the first payment",
          icon: CreditCard,
          detail:
            "New clients pay recurring items through Stripe Checkout right after signing.",
        },
        {
          title: "Recognizes subscribers",
          icon: UsersRound,
          detail:
            "Existing subscribers have new items added to their subscription without a payment step.",
        },
      ];
  const tiles: ConnectionTile[] = [
    {
      label: "Connection",
      value: reconnect ? "Reconnect needed" : "Healthy",
      tone: reconnect ? "warning" : "success",
      detail: qbo
        ? connection?.company
        : mode === "test"
          ? "Test mode"
          : "Live mode",
    },
    qbo
      ? {
          label: "Invoices",
          value:
            reconnect || invoiceWaiting.length
              ? `${invoiceWaiting.length} waiting`
              : drafts.length
                ? withCount(
                    drafts.length,
                    "draft to review",
                    "drafts to review",
                  )
                : "Up to date",
          tone:
            reconnect || invoiceWaiting.length || drafts.length
              ? "warning"
              : "success",
          detail: reconnect
            ? "Needs a QuickBooks connection"
            : "Created after countersignature",
          action: invoiceWaiting.length
            ? queueLink("waiting", "See proposals")
            : drafts.length
              ? queueLink("drafts", "Review drafts")
              : undefined,
        }
      : {
          label: "Products",
          value: lastSync
            ? `Synced ${time(lastSync)}`
            : busy === "sync"
              ? "Syncing products…"
              : "Ready to sync",
          tone: lastSync ? "success" : undefined,
          detail: withCount(totalProducts, "product", "products"),
        },
    qbo
      ? {
          label: "Customers",
          value: reconnect
            ? "Paused"
            : customers.length
              ? `${customers.length} to choose`
              : "No matches to review",
          tone: reconnect
            ? undefined
            : customers.length
              ? "warning"
              : "success",
          detail: reconnect
            ? "Paused until reconnected"
            : (customers[0]?.client.company ?? "Matched by billing email"),
          action:
            !reconnect && customers.length
              ? queueLink("customers", "Choose customer")
              : undefined,
        }
      : {
          label: "Billing events",
          value: eventStatus,
          tone: activity?.lastBillingEvent
            ? "success"
            : health?.stripe_webhooks_configured
              ? undefined
              : "warning",
          detail: "Signing and payments update proposals",
          action: stripeIssues.length
            ? queueLink("stripe", "See proposals")
            : undefined,
        },
  ];
  const showMenu = qbo
    ? owner && (connected || reconnect)
    : managedStripe
      ? owner && !!connected
      : canSync;
  const sync = (
    <Button disabled={!!busy} onClick={() => void manage("sync")}>
      Sync now
    </Button>
  );
  const actions = (
    <>
      {connected && (
        <a
          className="btn connection-open-provider"
          href={providerDashboard}
          target="_blank"
          rel="noreferrer"
        >
          Open {name}
        </a>
      )}
      {reconnect && owner && (
        <Button
          className="studio-primary"
          disabled={!!busy}
          onClick={() => void manage("authorize")}
        >
          Reconnect QuickBooks
        </Button>
      )}
      {showMenu && (
        <button
          type="button"
          className="btn icon-only connection-more"
          ref={menuTrigger}
          title={`${name} actions`}
          aria-label={`${name} actions`}
          aria-haspopup="dialog"
          aria-expanded={menu}
          onClick={() => setMenu(true)}
        >
          <chromeIcons.more size={18} aria-hidden="true" />
        </button>
      )}
    </>
  );

  function renderQueue(queue: Queue) {
    return (
      <ConnectionPanel
        title={queueTitles[queue]}
        id={`connection-queue-${queue}`}
      >
        {queues[queue].length ? (
          <StaffTable inline density="compact" className="connection-activity">
            <StaffTableHead>
              <span>Proposal</span>
              {queue === "waiting" && <span>Status</span>}
            </StaffTableHead>
            {queues[queue].map((p) => (
              <div className="staff-table-row" key={p.id}>
                <span>
                  <a href={proposalLink(p)}>
                    <strong>{proposalLabel(p)}</strong>
                  </a>
                  {queue === "waiting" && (
                    <small>
                      {money(
                        oneTimeInvoiceLines(p).reduce(
                          (sum, line) => sum + line.amount * line.qty,
                          0,
                        ),
                        p.currency,
                      )}{" "}
                      one-time
                      {p.client_signed_at &&
                        ` · signed ${format(p.client_signed_at)}`}
                    </small>
                  )}
                </span>
                {queue === "waiting" && (
                  <span className="pill warning">Waiting</span>
                )}
              </div>
            ))}
          </StaffTable>
        ) : (
          <p className="connection-panel-body muted">
            No proposals are waiting.
          </p>
        )}
      </ConnectionPanel>
    );
  }

  return (
    <ConnectionDetailLayout
      {...connectionDetails[qbo ? "quickbooks" : "stripe"]}
      status={status}
      tone={
        stripeSetup || stripeDisconnecting
          ? "info"
          : connected
            ? "success"
            : reconnect
              ? "warning"
              : undefined
      }
      actions={(connected || reconnect) && !stripeSetup ? actions : undefined}
    >
      {error && <Banner tone="danger" title={error} />}
      {notice && (
        <p
          className="connection-notice staff-surface staff-surface-note"
          role="status"
        >
          {notice}
        </p>
      )}
      {menu && (
        <Sheet
          title={`${name} actions`}
          menu
          anchor={menuTrigger.current}
          onClose={() => setMenu(false)}
        >
          <div className="action-menu">
            {connected && (
              <a
                className="connection-mobile-menu-link"
                href={providerDashboard}
                target="_blank"
                rel="noreferrer"
              >
                Open {name}
              </a>
            )}
            {qbo && (
              <button type="button" onClick={() => void manage("refresh")}>
                Refresh connection
              </button>
            )}
            {canSync && (
              <button type="button" onClick={() => void manage("sync")}>
                Sync products now
              </button>
            )}
            {managedStripe && (
              <>
                <button type="button" disabled title="Available after go-live">
                  Switch to live mode… <small>Available after go-live</small>
                </button>
                <button
                  type="button"
                  className="connection-danger"
                  disabled={stripe?.setupRunning}
                  onClick={() => void manage("stripe-disconnect")}
                >
                  Disconnect Stripe…
                </button>
              </>
            )}
            {qbo && (
              <button
                type="button"
                className="connection-danger"
                onClick={() => void manage("disconnect")}
              >
                Disconnect from QuickBooks…
              </button>
            )}
          </div>
        </Sheet>
      )}
      {stripeDisconnecting && (
        <Banner tone="warning" title="Stripe is disconnecting">
          {owner && !stripe?.setupRunning && (
            <Button
              disabled={!!busy}
              onClick={() => void manage("stripe-disconnect")}
            >
              Retry disconnect
            </Button>
          )}
        </Banner>
      )}
      {stripeSetup ? (
        <>
          <Banner
            title={`Connected to ${stripe.accountName ?? "Stripe"} in test mode`}
            tone={stripe.setupError ? "warning" : "info"}
          >
            {stripe.setupError
              ? "Setup paused. Retry to finish syncing products and matching customers."
              : "Finishing setup. You can leave this page while it runs."}
          </Banner>
          <ConnectionColumns
            main={
              <ConnectionPanel
                title="Set up Stripe"
                action={
                  owner &&
                  !stripe.setupRunning && (
                    <Button
                      disabled={!!busy}
                      onClick={() => void manage("stripe-setup")}
                    >
                      {stripe.setupError ? "Retry setup" : "Continue setup"}
                    </Button>
                  )
                }
              >
                <ConnectionSteps
                  steps={[
                    {
                      title: "Account connected",
                      icon: CircleCheck,
                      detail: stripe.accountSuffix
                        ? `Ending in ${stripe.accountSuffix} · test mode`
                        : "Test mode",
                    },
                    {
                      title: stripe.products
                        ? "Products synced"
                        : "Sync products",
                      icon: stripe.products ? CircleCheck : RefreshCw,
                      detail: stripe.products
                        ? `${withCount(stripe.products.count, "price", "prices")} synced`
                        : stripe.setupRunning
                          ? "Reading Stripe products and prices…"
                          : "Waiting to sync",
                    },
                    {
                      title: "Matching customers by email",
                      icon: stripe.customers ? CircleCheck : UsersRound,
                      detail: stripe.customers
                        ? `${stripe.customers.linked} linked · ${stripe.customers.review} to review`
                        : "Only an exact, unique email match is linked.",
                    },
                    {
                      title: "Billing events",
                      icon: health?.stripe_webhooks_configured
                        ? CircleCheck
                        : CircleAlert,
                      detail: eventStatus,
                    },
                  ]}
                />
              </ConnectionPanel>
            }
            aside={
              <ConnectionPanel title="Check after setup">
                <ConnectionSteps
                  steps={[
                    {
                      title: "Plan terms to confirm",
                      icon: Package,
                      detail: (
                        <>
                          Review the synced prices and plan terms in{" "}
                          <a href="/studio/products">Products</a> before
                          quoting.
                        </>
                      ),
                    },
                  ]}
                />
              </ConnectionPanel>
            }
          />
        </>
      ) : !connected && !reconnect && !stripeDisconnecting ? (
        <ConnectionColumns
          main={
            <ConnectionPanel title={`What ${name} does in Yeswell`}>
              <ConnectionSteps steps={aboutSteps} />
            </ConnectionPanel>
          }
          aside={
            <>
              <ConnectionPanel
                title={
                  (qbo || managedStripe) && !owner
                    ? `A super admin connects ${name}`
                    : `Connect ${name}`
                }
              >
                <div className="connection-panel-body stack">
                  {!qbo && !managedStripe ? (
                    <p>Stripe is set up by your Yeswell administrator.</p>
                  ) : managedStripe && owner ? (
                    <>
                      <fieldset className="stripe-connection-mode">
                        <legend>Start in</legend>
                        <label>
                          <input
                            type="radio"
                            name="stripe-connect-mode"
                            defaultChecked
                          />
                          <span>
                            <strong>Test mode</strong>
                            <small>No real charges.</small>
                          </span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="stripe-connect-mode"
                            disabled
                          />
                          <span>
                            <strong>Live mode</strong>
                            <small>Available after go-live.</small>
                          </span>
                        </label>
                      </fieldset>
                      <Button
                        className="studio-primary"
                        disabled={!!busy || stripe?.available !== true}
                        onClick={() => void manage("stripe-authorize")}
                      >
                        Connect Stripe
                      </Button>
                      <p>
                        {stripe?.available
                          ? "Sign in to Stripe and choose the account you already use."
                          : "A Yeswell administrator must set up Stripe Connect in test mode."}
                      </p>
                    </>
                  ) : owner ? (
                    <>
                      <QuickBooksConnectButton
                        disabled={!!busy || connection?.available !== true}
                        onClick={() => void manage("authorize")}
                      />
                      <p>
                        {connection?.available === false
                          ? "A Yeswell administrator must configure sandbox OAuth first."
                          : "Sign in to QuickBooks Online and choose the company. Then set the invoice item and terms in Billing defaults."}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        {admin
                          ? `Ask ${admin.display_name} to connect it.`
                          : "Ask a super admin to connect it."}{" "}
                        {qbo &&
                          "Until then, record invoice numbers on the proposal by hand."}
                      </p>
                      {admin?.email && (
                        <a className="btn" href={`mailto:${admin.email}`}>
                          Email {admin.display_name.split(" ")[0]}
                        </a>
                      )}
                    </>
                  )}
                </div>
              </ConnectionPanel>
              <p className="connection-setup-note staff-surface staff-surface-note">
                {qbo
                  ? "Until QuickBooks is connected, staff record the invoice number on the proposal by hand."
                  : "You can send proposals with custom lines. Clients need Stripe to set up recurring billing after signing."}
              </p>
            </>
          }
        />
      ) : stripeDisconnecting ? null : (
        <>
          {reconnect && (
            <Banner tone="warning" title="QuickBooks needs to reconnect">
              Your billing defaults and invoice history are kept.
            </Banner>
          )}
          <ConnectionTiles tiles={tiles} />
          <ConnectionColumns
            main={
              <>
                {reconnect && renderQueue("waiting")}
                {openQueue &&
                  !(reconnect && openQueue === "waiting") &&
                  renderQueue(openQueue)}
                {!qbo && busy === "sync" && !lastSync && (
                  <ConnectionPanel
                    title="Setting up Stripe products"
                    subtitle="You can stay here while the test catalog syncs."
                  >
                    <ConnectionSteps
                      steps={[
                        {
                          title: "Account configured",
                          icon: CircleCheck,
                          detail: "Test mode",
                        },
                        {
                          title: "Syncing products",
                          icon: RefreshCw,
                          detail: (
                            <span role="status">
                              Reading Stripe products and prices…
                            </span>
                          ),
                        },
                        {
                          title: "Billing events",
                          icon: CircleCheck,
                          detail: eventStatus,
                        },
                      ]}
                    />
                  </ConnectionPanel>
                )}
                <ConnectionPanel
                  className={qbo ? "connection-billing-compact" : undefined}
                  title={
                    qbo ? (
                      <>
                        <span className="connection-billing-desktop">
                          How billing uses QuickBooks
                        </span>
                        <span className="connection-billing-phone">
                          How billing uses it
                        </span>
                      </>
                    ) : (
                      "How billing uses Stripe"
                    )
                  }
                  subtitle={
                    qbo
                      ? quickBooksInvoiceTiming
                      : "After a client signs, recurring services bill through Stripe."
                  }
                  action={
                    <a
                      className="connection-billing-link"
                      href={billingDefaults}
                    >
                      Edit in Billing defaults
                    </a>
                  }
                >
                  <ConnectionSteps steps={billingSteps} />
                  {qbo && (
                    <dl className="connection-billing-phone">
                      <ConnectionFact label="Invoice">
                        {emailInvoices ? "Email to client" : "Draft for review"}
                      </ConnectionFact>
                      <ConnectionFact label="Default item">
                        {item}
                      </ConnectionFact>
                      <ConnectionFact label="Terms">{terms}</ConnectionFact>
                    </dl>
                  )}
                </ConnectionPanel>
                {!qbo && (
                  <ConnectionPanel title="Products">
                    <div className="connection-panel-body connection-product-summary">
                      <div>
                        <strong>
                          {withCount(totalProducts, "product", "products")}
                        </strong>
                        <p>
                          {recurring} recurring · {totalProducts - recurring}{" "}
                          one-time{lastSync && ` · synced ${format(lastSync)}`}.
                        </p>
                        {syncedCount !== undefined && (
                          <p>
                            {withCount(
                              syncedCount,
                              "Stripe price read",
                              "Stripe prices read",
                            )}{" "}
                            in the last sync.
                          </p>
                        )}
                        <p>
                          Prices change in Stripe. You still type every amount
                          on a proposal.
                        </p>
                      </div>
                      <div>
                        {canSync && sync}
                        <a className="btn" href="/studio/products">
                          Open products
                        </a>
                      </div>
                    </div>
                  </ConnectionPanel>
                )}
              </>
            }
            aside={
              <>
                <ConnectionPanel title="Connection">
                  <dl>
                    {qbo && connection?.company && (
                      <ConnectionFact label="Company">
                        {connection.company}
                      </ConnectionFact>
                    )}
                    {stripe?.accountSuffix && (
                      <ConnectionFact label="Account">
                        {[
                          stripe.accountName,
                          `ending in ${stripe.accountSuffix}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </ConnectionFact>
                    )}
                    {stripe?.connectedAt && stripe.actorName && (
                      <ConnectionFact label="Connected by">
                        {stripe.actorName} ·{" "}
                        <time dateTime={stripe.connectedAt}>
                          {format(stripe.connectedAt)}
                        </time>
                      </ConnectionFact>
                    )}
                    {!qbo && lastSync && (
                      <ConnectionFact label="Last sync">
                        <time dateTime={lastSync}>{format(lastSync)}</time>
                      </ConnectionFact>
                    )}
                    <ConnectionFact label="Environment">
                      {qbo
                        ? "Sandbox. Synthetic clients and amounts only."
                        : mode === "test"
                          ? "Test mode. No real charges."
                          : "Live mode"}
                    </ConnectionFact>
                    {connectedBy && (
                      <ConnectionFact label="Connected by">
                        {staffName} ·{" "}
                        <time dateTime={connectedBy.created_at}>
                          {format(connectedBy.created_at)}
                        </time>
                      </ConnectionFact>
                    )}
                    {qbo ? (
                      <>
                        {lastSync && (
                          <ConnectionFact label="Last sync">
                            <time dateTime={lastSync}>{format(lastSync)}</time>
                          </ConnectionFact>
                        )}
                        <ConnectionFact label="Access renews">
                          {reconnect
                            ? "Reconnect needed"
                            : "Automatically. Reconnect if prompted."}
                        </ConnectionFact>
                      </>
                    ) : (
                      <ConnectionFact label="Billing events">
                        {eventStatus}
                        {activity?.lastBillingEvent && (
                          <>
                            {" "}
                            · last received{" "}
                            <time dateTime={activity.lastBillingEvent}>
                              {time(activity.lastBillingEvent)}
                            </time>
                          </>
                        )}
                      </ConnectionFact>
                    )}
                  </dl>
                </ConnectionPanel>
                {!reconnect && (
                  <ConnectionPanel title="Recent activity">
                    {activityError ? (
                      <p className="connection-panel-body muted">
                        Recent activity is temporarily unavailable.
                      </p>
                    ) : !activity ? (
                      <p className="connection-panel-body muted" role="status">
                        Loading activity…
                      </p>
                    ) : !activity.rows.length ? (
                      <p className="connection-panel-body muted">
                        No activity recorded yet.
                      </p>
                    ) : (
                      <StaffTable
                        inline
                        density="compact"
                        className="connection-activity"
                      >
                        <StaffTableHead>
                          <span>Event</span>
                          <span>Date</span>
                        </StaffTableHead>
                        {activity.rows.map((event) => (
                          <div className="staff-table-row" key={event.id}>
                            <span>
                              <strong>{event.label}</strong>
                              {event.proposal_id && (
                                <a href={`/proposals/${event.proposal_id}`}>
                                  {event.detail}
                                </a>
                              )}
                            </span>
                            <time dateTime={event.created_at}>
                              {format(event.created_at)}
                            </time>
                          </div>
                        ))}
                      </StaffTable>
                    )}
                    <footer>
                      <a href="/studio/activity">View Activity log</a>
                    </footer>
                  </ConnectionPanel>
                )}
              </>
            }
          />
        </>
      )}
    </ConnectionDetailLayout>
  );
}
