"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Data } from "./staff-app";
import type { ConnectionStatus } from "../lib/workspace-setup";
import { staffIcons } from "./staff-icons";
import { confirmDialog } from "./dialog-actions";
import { api, Banner, Button, post } from "./ui";
import { useQuickBooksItemName } from "./quickbooks-fields";

const billingDefaults = "/studio/workspace?view=billing";
const ChevronLeft = staffIcons["chevron-left"];

export function ConnectionDetailLayout({
  name,
  mark,
  status,
  tone,
  subtitle,
  children,
}: {
  name: string;
  mark: string;
  status?: string;
  tone?: "success" | "warning" | "info";
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article className="studio-connection-detail">
      <a className="connection-back" href="/studio/connections">
        <ChevronLeft size={16} aria-hidden="true" /> Connections
      </a>
      <header className="connection-detail-header">
        <div className="connection-detail-title">
          <span className="connection-monogram" aria-hidden="true">
            {mark}
          </span>
          <h1 className="t-page-title">{name}</h1>
          {status && <span className={`pill ${tone ?? ""}`}>{status}</span>}
        </div>
        <p>{subtitle}</p>
      </header>
      {children}
    </article>
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
};

function Fact({
  label,
  children,
  link,
}: {
  label: string;
  children: ReactNode;
  link?: ReactNode;
}) {
  return (
    <div className="connection-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
      {link && <dd>{link}</dd>}
    </div>
  );
}

function ChangeBilling() {
  return <a href={billingDefaults}>Change in Billing defaults</a>;
}

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
  const [busy, setBusy] = useState(false);
  const settings = data.settings;
  const owner = data.user.staff_role === "owner";
  const connection = health?.qbo_connection;
  const connected = qbo ? connection?.state === "connected" : health?.stripe;
  const reconnect = qbo && connection?.state === "reconnect";
  const mode = health?.mode === "live" ? "live" : "test";
  const status = connected
    ? `Connected · ${qbo ? "sandbox" : mode + " mode"}`
    : reconnect
      ? "Reconnect needed"
      : health
        ? "Not connected"
        : "Loading status…";
  const itemName = useQuickBooksItemName(
    settings?.qbo_custom_item_ref,
    qbo && !!connected,
  );
  const [termName, setTermName] = useState<string>();
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: settings?.timezone ?? "UTC",
    }).format(new Date(value));
  const loadActivity = (signal?: AbortSignal) =>
    api<Activity>(`/api/connections/${provider}/activity`, { signal })
      .then((result) => {
        if (signal?.aborted) return;
        if (!Array.isArray(result?.rows))
          throw new Error("Activity unavailable");
        setActivity(result);
        setActivityError(false);
      })
      .catch(() => {
        if (!signal?.aborted) setActivityError(true);
      });

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

  const manage = async (action: "authorize" | "disconnect" | "sync") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "disconnect") {
        if (
          !(await confirmDialog({
            title: "Disconnect QuickBooks?",
            description:
              "New one-time invoices will wait until QuickBooks is connected again. Existing invoices stay in QuickBooks.",
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
      } else {
        await post("/api/catalog-sync/stripe");
        setNotice("Stripe test products synced.");
      }
      await loadActivity();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const lastSync = qbo ? connection?.last_sync : activity?.lastSync;
  const connectedBy =
    qbo && (connected || reconnect) ? activity?.connected : undefined;
  const staffName =
    connectedBy &&
    (connectedBy.name ??
      data.staff.find(
        (member) => `staff:${member.user_id}` === connectedBy.actor,
      )?.display_name ??
      "Staff member");

  return (
    <ConnectionDetailLayout
      name={name}
      mark={qbo ? "qb" : "S"}
      status={status}
      tone={connected ? "success" : reconnect ? "warning" : "info"}
      subtitle={
        qbo
          ? "Create one-time invoices for signed proposals."
          : "Take recurring payments and sync products from Stripe."
      }
    >
      {error && <Banner tone="danger" title={error} />}
      {notice && <p role="status">{notice}</p>}
      <section aria-labelledby="provider-connection">
        <h2 id="provider-connection">Connection</h2>
        <dl>
          <Fact label={qbo ? "Company" : "Account"}>
            {qbo
              ? ((connected || reconnect) && connection?.company) ||
                "Not connected"
              : connected
                ? "Configured for this deployment"
                : "Not connected"}
          </Fact>
          <Fact label="Environment">
            {qbo
              ? "Sandbox — synthetic clients and amounts only"
              : mode === "live"
                ? "Live mode"
                : "Test mode — no real charges"}
          </Fact>
          <Fact label="Last sync">
            {lastSync ? (
              <time dateTime={lastSync}>{format(lastSync)}</time>
            ) : (
              "Not recorded"
            )}
          </Fact>
          <Fact label="Connected by">
            {connectedBy ? (
              <>
                {staffName} ·{" "}
                <time dateTime={connectedBy.created_at}>
                  {format(connectedBy.created_at)}
                </time>
              </>
            ) : connected ? (
              "Not recorded"
            ) : (
              "—"
            )}
          </Fact>
          {!qbo && (
            <>
              <Fact label="Webhooks">
                {health?.stripe_webhooks_configured
                  ? "Configured"
                  : "Not configured"}
              </Fact>
              <Fact
                label="Product sync"
                link={
                  connected && mode === "test" ? (
                    <Button disabled={busy} onClick={() => void manage("sync")}>
                      Sync now
                    </Button>
                  ) : undefined
                }
              >
                {lastSync ? "Synced" : "No sync recorded"} ·{" "}
                <a href="/studio/products">Open products</a>
              </Fact>
            </>
          )}
        </dl>
        {qbo && owner && (
          <div className="connection-detail-actions">
            {connected || reconnect ? (
              <>
                <Button
                  disabled={busy}
                  variant={reconnect ? "primary" : ""}
                  onClick={() => void manage("authorize")}
                >
                  Reconnect
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void manage("disconnect")}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                disabled={busy || connection?.available !== true}
                onClick={() => void manage("authorize")}
              >
                Connect QuickBooks
              </Button>
            )}
          </div>
        )}
        {qbo && !owner && (
          <p className="muted">A super admin manages this connection.</p>
        )}
        {qbo && connection?.available === false && (
          <p className="muted">
            Sandbox OAuth credentials are required on this deployment.
          </p>
        )}
      </section>
      <section aria-labelledby="provider-billing">
        <h2 id="provider-billing">How billing uses it</h2>
        <dl>
          {qbo ? (
            <>
              <Fact label="Invoices" link={<ChangeBilling />}>
                {settings?.qbo_invoice_delivery === "email"
                  ? "Email to client"
                  : "Draft for review"}
              </Fact>
              <Fact label="Default item" link={<ChangeBilling />}>
                {itemName ??
                  (settings?.qbo_custom_item_ref
                    ? "Name unavailable"
                    : "Not set")}
              </Fact>
              <Fact label="Terms" link={<ChangeBilling />}>
                {settings?.qbo_term_ref
                  ? (termName ?? "Name unavailable")
                  : "Use QuickBooks default"}
              </Fact>
            </>
          ) : (
            <>
              <Fact label="New clients">Checkout for recurring payments</Fact>
              <Fact label="Existing clients">
                Add items to their subscription
              </Fact>
              <Fact label="Payment methods" link={<ChangeBilling />}>
                {settings?.payment_methods === "card_ach"
                  ? "Card + US bank account (ACH)"
                  : "Card"}
              </Fact>
            </>
          )}
        </dl>
      </section>
      <section aria-labelledby="provider-activity">
        <h2 id="provider-activity">Recent activity</h2>
        {activityError ? (
          <p className="muted">Recent activity is temporarily unavailable.</p>
        ) : !activity ? (
          <p className="muted" role="status">
            Loading activity…
          </p>
        ) : !activity.rows.length ? (
          <p className="muted">No activity recorded yet.</p>
        ) : (
          <ul className="connection-activity">
            {activity.rows.map((event) => (
              <li key={event.id}>
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
              </li>
            ))}
          </ul>
        )}
        <a href="/studio/activity">View Activity log</a>
      </section>
    </ConnectionDetailLayout>
  );
}
