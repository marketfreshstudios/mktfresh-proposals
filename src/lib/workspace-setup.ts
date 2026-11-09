import type { StripeConnectionStatus } from "./stripe-connect-status";
import type { QboConnectionStatus } from "./providers/qbo-connection";
import type { WorkspaceSettings } from "./workspace";
import type { Item, Proposal } from "./model";
export type ConnectionStatus = {
  stripe: boolean;
  stripe_connect?: StripeConnectionStatus;
  stripe_platform?: boolean;
  stripe_webhooks_configured?: boolean;
  qbo: boolean;
  qbo_connection?: QboConnectionStatus;
  email: boolean;
  mock: boolean;
  mode?: "test" | "live" | "mock";
};
export function connectionStatus(value: unknown): ConnectionStatus | null {
  if (
    !value ||
    typeof value !== "object" ||
    !["stripe", "qbo", "email", "mock"].every(
      (k) => typeof (value as Record<string, unknown>)[k] === "boolean",
    )
  )
    return null;
  return value as ConnectionStatus;
}
export function workspaceSetup(data: {
  settings?: WorkspaceSettings | null;
  connections?: ConnectionStatus | null;
  staff: { user_id: string; status?: string }[];
  assistants: { revoked: boolean }[];
  proposals: Pick<Proposal, "source">[];
}) {
  const { settings, connections } = data;
  const active = data.staff.filter(
    (member) => !member.status || member.status === "active",
  );
  const signatory = settings?.company_signatory;
  const manual = settings?.qbo_manual_invoice === true;
  const required = [
    {
      id: "brand",
      label: "Brand and fonts",
      complete: !!(settings?.logo || settings?.logo_icon),
      detail: "Logo, accent color and the fonts clients see",
      href: "/studio/workspace?view=brand",
      action: "Set up",
    },
    {
      id: "signatory",
      label: "Company signatory",
      complete:
        !!signatory?.image &&
        active.some((member) => member.user_id === signatory.user_id),
      detail: "Whose name goes on the company signature",
      href: "/studio/workspace?view=signatory",
      action: "Set up",
    },
    {
      id: "email",
      label: "Email sending",
      complete: !!settings?.sending_domain && connections?.email === true,
      detail: settings?.sending_domain
        ? `Send proposals from ${settings.sending_domain}`
        : "Set the verified domain that proposals come from",
      href: "/studio/workspace?view=email-sending",
      action: "Set up",
    },
    {
      id: "stripe",
      label: "Connect Stripe",
      complete:
        connections?.stripe === true &&
        (!connections.stripe_connect ||
          connections.stripe_connect.state === "connected"),
      detail: !connections
        ? "Connection status unavailable"
        : "Sync products and collect recurring payments through Checkout",
      href: "/studio/connections/stripe",
      action:
        connections?.stripe_connect?.state === "setting_up"
          ? "Finish setup"
          : "Connect",
    },
    {
      id: "qbo",
      label: "Connect QuickBooks",
      complete: connections?.qbo === true || manual,
      detail:
        manual && connections?.qbo !== true
          ? "Record invoice numbers by hand"
          : "Use QuickBooks for one-time invoices, or record invoice numbers by hand",
      href: "/studio/connections/quickbooks",
      action:
        connections?.qbo_connection?.state === "reconnect"
          ? "Reconnect"
          : "Connect",
    },
  ] as const;
  const optional = [
    {
      id: "team",
      label: "Invite your team",
      complete:
        active.length > 1 ||
        data.staff.some((member) => member.status === "invited"),
      detail: "Staff can draft, send and countersign",
      href: "/studio/workspace?view=team",
      action: "Invite",
    },
    {
      id: "assistant",
      label: "Connect Claude",
      complete: data.assistants.some((a) => !a.revoked),
      detail: "Claude can draft proposals for you to review",
      href: "/studio/connections/assistants",
      action: "Connect",
    },
    {
      id: "imports",
      label: "Import from Proposify",
      complete: data.proposals.some((p) => p.source === "proposify_import"),
      detail: "Bring over past proposals and their PDFs",
      href: "/studio/connections/imports",
      action: "Import",
    },
  ] as const;
  return {
    required,
    optional,
    complete: required.every((r) => r.complete),
  };
}
export function productMappings(item: Item, qboConnected: boolean | null) {
  return (item.sublines?.length ? item.sublines : [item]).map((line) => {
    if (line.interval !== "one_time")
      return line.stripe_lookup_key
        ? {
            label: "Stripe",
            warning: false,
            detail:
              "This recurring item uses its Stripe lookup key for subscription billing after signature.",
          }
        : {
            label: "Needs Stripe price",
            warning: true,
            detail:
              "Add a Stripe lookup key before sending this recurring item. Billing cannot start without a Stripe price.",
          };
    if (line.qbo_item_ref)
      return {
        label: "QuickBooks",
        warning: false,
        detail:
          "This one-time item is mapped to a QuickBooks item. With a sandbox connection it creates an invoice for review; without one, invoice it manually.",
      };
    if (qboConnected === null)
      return {
        label: "Check QuickBooks connection",
        warning: true,
        detail:
          "Connection status could not be loaded. Check Connections before confirming how this item will be invoiced.",
      };
    return qboConnected
      ? {
          label: "Needs QuickBooks item",
          warning: true,
          detail:
            "QuickBooks is connected. Add a QuickBooks item reference to create its invoice automatically; until then this item needs manual review.",
        }
      : {
          label: "Invoice manually",
          warning: false,
          detail:
            "QuickBooks is not connected. After signature this one-time item is recorded as Invoice manually for staff review.",
        };
  });
}
