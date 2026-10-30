import type { Item, Template } from "./model";
export type ConnectionStatus = {
  stripe: boolean;
  qbo: boolean;
  email: boolean;
  mock: boolean;
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
  connections?: ConnectionStatus | null;
  catalog: Item[];
  templates: Template[];
  assistants: { revoked: boolean }[];
}) {
  const count = data.catalog.filter(
    (i) =>
      i.active &&
      !i.legacy &&
      [i, ...(i.sublines ?? [])].some((s) => s.stripe_lookup_key),
  ).length;
  const template = data.templates.some(
    (t) =>
      t.active &&
      t.content.some((b) => b.type === "pricing_table") &&
      ["client", "company"].every((role) =>
        t.content.some((b) => b.type === "signature_block" && b.role === role),
      ),
  );
  const rows = [
    {
      id: "stripe",
      label: "Stripe",
      complete: data.connections?.stripe === true,
      detail: data.connections
        ? data.connections.stripe
          ? "Configured (test mode)"
          : "Not connected"
        : "Status unavailable",
      href: "/studio/connections?view=stripe",
      action: "Connect Stripe",
      required: true,
    },
    {
      id: "products",
      label: "Products synced",
      complete: count > 0,
      detail: String(count),
      href: "/studio/products",
      action: "Sync products",
      required: true,
    },
    {
      id: "template",
      label: "Template",
      complete: template,
      detail: template ? "Ready" : "Not ready",
      href: "/studio/templates",
      action: "Prepare a template",
      required: true,
    },
    {
      id: "assistant",
      label: "Assistant",
      complete: data.assistants.some((a) => !a.revoked),
      detail: data.assistants.some((a) => !a.revoked)
        ? "Connected"
        : "Not connected",
      href: "/studio/connections?view=assistants",
      action: "Connect an assistant",
      required: true,
    },
    {
      id: "qbo",
      label: "QuickBooks",
      complete: data.connections?.qbo === true,
      detail: data.connections
        ? data.connections.qbo
          ? "Sandbox configured"
          : "Not connected; one-time items invoice manually"
        : "Status unavailable",
      href: "/studio/connections?view=qbo",
      action: "Set up QuickBooks (optional)",
      required: false,
    },
  ];
  return {
    rows,
    complete: rows.filter((r) => r.required).every((r) => r.complete),
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
