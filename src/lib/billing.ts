import { billingLines } from "./quote-model";
import { proposalOrigin, proposalLink } from "./links";
import {
  check,
  type BillingLink,
  type Client,
  type BillingLine,
  type Proposal,
  type Item,
} from "./model";
import { sha256 } from "./content";
import type { WorkspaceSettings } from "./workspace";
import { qboBillingEmail, qboItemMapping } from "./qbo-mapping";
export class NeedsReview extends Error {}
export class BillingProgressError extends Error {
  constructor(
    message: string,
    readonly customerId: string,
    readonly objectId: string,
    readonly metadata: Record<string, unknown>,
  ) {
    super(message);
  }
}
export type Customer = { id: string; email: string; company: string };
export interface BillingProvider {
  findCustomers(client: Client): Promise<Customer[]>;
  createCustomer(client: Client, key: string): Promise<Customer>;
  createObject(
    customer: Customer,
    lines: BillingLine[],
    key: string,
    metadata: Record<string, unknown>,
  ): Promise<{ id: string; metadata: Record<string, unknown> }>;
}
export function paidInvoiceProgress(
  line: BillingLine,
  invoices: { id: string; amount_paid: number; status: string }[],
) {
  check(line.schedule, "Scheduled line required");
  const paid = new Set(
    invoices
      .filter(
        (i) => i.status === "paid" && i.amount_paid >= line.amount * line.qty,
      )
      .map((i) => i.id),
  ).size;
  return {
    paid,
    remaining: Math.max(0, line.schedule.after_paid_invoices - paid),
    action:
      paid >= line.schedule.after_paid_invoices ? "switch_now" : "schedule",
    then: line.schedule.then,
    plan_terms: line.plan_terms,
  };
}
export class MockBillingProvider implements BillingProvider {
  customers: Customer[] = [];
  objects = new Map<
    string,
    { id: string; metadata: Record<string, unknown> }
  >();
  failure?: Error;
  constructor(public provider: "qbo" | "stripe") {}
  async findCustomers(c: Client) {
    if (this.failure) throw this.failure;
    return this.customers.filter(
      (x) =>
        x.email.toLowerCase() === c.email.toLowerCase() ||
        x.company.toLowerCase() === c.company.toLowerCase(),
    );
  }
  async createCustomer(c: Client, key: string) {
    const customer = {
      id: "mock_customer_" + sha256(key).slice(0, 20),
      email: c.email,
      company: c.company,
    };
    this.customers.push(customer);
    return customer;
  }
  async createObject(
    customer: Customer,
    lines: BillingLine[],
    key: string,
    metadata: Record<string, unknown>,
  ) {
    if (this.failure) throw this.failure;
    if (this.objects.has(key)) return this.objects.get(key)!;
    const object = {
      id: `mock_${this.provider}_${sha256(key).slice(0, 20)}`,
      metadata: {
        ...metadata,
        mocked: true,
        customer_id: customer.id,
        lines: structuredClone(lines),
      },
    };
    this.objects.set(key, object);
    return object;
  }
}
export class UnconfiguredBillingProvider implements BillingProvider {
  constructor(private name: string) {}
  async findCustomers(): Promise<Customer[]> {
    throw new NeedsReview(
      `${this.name} live adapter requires credentials and sandbox acceptance; see HANDOFF_PHASE1.md`,
    );
  }
  async createCustomer(): Promise<Customer> {
    throw new NeedsReview("Live adapter unavailable");
  }
  async createObject(): Promise<{
    id: string;
    metadata: Record<string, unknown>;
  }> {
    throw new NeedsReview("Live adapter unavailable");
  }
}
export async function bill(
  p: Proposal,
  provider: "qbo" | "stripe",
  adapter: BillingProvider,
  quickbooks?: {
    workspace?: WorkspaceSettings;
    catalog: Item[];
    connected: boolean;
    realm?: string;
  },
): Promise<BillingLink> {
  const lines = billingLines(p.versions.at(-1)!.quote).filter((l) =>
    provider === "qbo" ? l.interval === "one_time" : l.interval !== "one_time",
  );
  const previous = p.billing_links.find((x) => x.provider === provider);
  if (previous?.status === "succeeded") return previous;
  const base: BillingLink = {
    provider,
    status: "pending",
    attempts: (previous?.attempts ?? 0) + 1,
  };
  if (!lines.length)
    return {
      ...base,
      status: "succeeded",
      metadata: { skipped: "No selected items" },
    };
  const workspace = quickbooks?.workspace ?? p.workspace_settings;
  const pendingInvoice =
    provider === "qbo" &&
    previous?.external_object_id &&
    previous.external_customer_id
      ? {
          id: previous.external_customer_id,
          company: p.client.company,
          email: String(
            previous.metadata?.billing_email ?? qboBillingEmail(p.client),
          ),
        }
      : undefined;
  const invoiceLines =
    provider === "qbo" && quickbooks
      ? lines.map((line) => ({
          ...line,
          qbo_item_ref: qboItemMapping(
            line,
            quickbooks.catalog,
            workspace?.qbo_custom_item_ref,
            quickbooks.realm,
          ),
        }))
      : lines;
  const choice = previous?.metadata?.customer_choice as
    { id: string; realm?: string; email: string } | undefined;
  if (provider === "qbo" && quickbooks && !quickbooks.connected)
    return {
      ...base,
      status: "needs_review",
      last_error:
        "Connect or reconnect QuickBooks in Studio, then retry billing.",
      metadata: previous?.metadata,
      external_object_id: previous?.external_object_id,
      external_customer_id: previous?.external_customer_id,
    };
  if (
    provider === "qbo" &&
    (adapter instanceof UnconfiguredBillingProvider ||
      (!pendingInvoice &&
        invoiceLines.some(
          (l) =>
            !l.qbo_item_ref && (quickbooks || !workspace?.qbo_custom_item_ref),
        )))
  )
    return {
      ...base,
      status: "needs_review",
      last_error: quickbooks
        ? "Choose a QuickBooks item or default, then retry billing."
        : "Invoice manually",
      metadata: {
        ...(quickbooks ? previous?.metadata : { action: "Invoice manually" }),
        ...(choice ? { customer_choice: choice } : {}),
        line_ids: lines.map((l) => l.id),
      },
    };
  const billingEmail =
    provider === "qbo"
      ? (pendingInvoice?.email ?? qboBillingEmail(p.client))
      : p.client.email;
  const client =
    provider === "qbo"
      ? {
          ...p.client,
          email: billingEmail,
          qbo_customer_id:
            choice &&
            choice.realm === quickbooks?.realm &&
            choice.email === billingEmail
              ? choice.id
              : quickbooks?.realm
                ? null
                : p.client.qbo_customer_id,
        }
      : p.client;
  try {
    const matches = pendingInvoice
        ? [pendingInvoice]
        : await adapter.findCustomers(client),
      emailMatches = matches.filter(
        (x) => x.email.toLowerCase() === client.email.toLowerCase(),
      );
    if (
      emailMatches.length > 1 &&
      !(provider === "stripe"
        ? client.stripe_customer_id
        : client.qbo_customer_id)
    ) {
      if (provider === "qbo" && quickbooks)
        return {
          ...base,
          status: "needs_review",
          last_error:
            "Several QuickBooks customers have the billing email. Choose the correct customer.",
          metadata: {
            customer_candidates: emailMatches,
            billing_email: billingEmail,
            realm: quickbooks.realm,
          },
        };
      throw new NeedsReview("Multiple customers with recipient email");
    }
    const storedId =
      provider === "stripe"
        ? client.stripe_customer_id
        : client.qbo_customer_id;
    let customer =
      pendingInvoice ??
      (storedId
        ? emailMatches.find((c) => c.id === storedId)
        : emailMatches[0]);
    if (storedId && !customer)
      throw new NeedsReview(
        "Linked customer is missing or its email differs; review customer mapping",
      );
    if (
      !customer &&
      matches.some(
        (x) => x.company.toLowerCase() === p.client.company.toLowerCase(),
      )
    )
      throw new NeedsReview(
        "Company matches but email differs; review customer mapping",
      );
    if (!customer)
      customer = await adapter.createCustomer(
        client,
        p.id + ":" + provider + ":customer",
      );
    const metadata: Record<string, unknown> =
      provider === "qbo"
        ? {
            email_status: "NotSet",
            send_invoice: workspace?.qbo_invoice_delivery === "email",
            billing_email: billingEmail,
            term_ref: workspace?.qbo_term_ref ?? null,
            ...(choice ? { customer_choice: choice } : {}),
          }
        : { billing_start: "on_signature", trial_days: 0 };
    metadata.proposal_id = p.id;
    if (provider === "stripe") {
      metadata.client_origin = proposalOrigin(p);
      metadata.client_return_url = proposalLink(p);
    }
    metadata.proposal_title = p.title;
    metadata.currency = p.currency.toLowerCase();
    metadata.schedules = lines
      .filter((l) => l.schedule)
      .map((l) => ({ line_id: l.id, ...paidInvoiceProgress(l, []) }));
    const result = await adapter.createObject(
      customer,
      invoiceLines.map((l) =>
        provider === "qbo" && !quickbooks
          ? {
              ...l,
              qbo_item_ref:
                l.qbo_item_ref ?? workspace?.qbo_custom_item_ref ?? null,
            }
          : l,
      ),
      p.id + ":" + provider + ":v" + p.versions.at(-1)!.version_no,
      metadata,
    );
    return {
      ...base,
      status: "succeeded",
      external_customer_id: customer.id,
      external_object_id: result.id,
      metadata: result.metadata,
    };
  } catch (e) {
    return {
      ...base,
      status: e instanceof NeedsReview ? "needs_review" : "failed",
      ...(provider === "qbo"
        ? {
            external_object_id: previous?.external_object_id,
            external_customer_id: previous?.external_customer_id,
            metadata: previous?.metadata,
          }
        : {}),
      ...(e instanceof BillingProgressError
        ? {
            external_customer_id: e.customerId,
            external_object_id: e.objectId,
            metadata: e.metadata,
          }
        : {}),
      last_error: e instanceof Error ? e.message : "Provider failed",
    };
  }
}
