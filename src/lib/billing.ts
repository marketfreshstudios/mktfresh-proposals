import { proposalOrigin, proposalLink } from "./links";
import {
  check,
  readLine,
  type BillingLink,
  type Client,
  type Line,
  type Proposal,
} from "./model";
import { sha256 } from "./content";
export class NeedsReview extends Error {}
export type Customer = { id: string; email: string; company: string };
export interface BillingProvider {
  findCustomers(client: Client): Promise<Customer[]>;
  createCustomer(client: Client, key: string): Promise<Customer>;
  createObject(
    customer: Customer,
    lines: Line[],
    key: string,
    metadata: Record<string, unknown>,
  ): Promise<{ id: string; metadata: Record<string, unknown> }>;
}
export function paidInvoiceProgress(
  line: Line,
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
    lines: Line[],
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
): Promise<BillingLink> {
  const lines = p.versions
    .at(-1)!
    .quote.map(readLine)
    .filter(
      (l) =>
        (!l.optional || l.selected) &&
        (provider === "qbo"
          ? l.interval === "one_time"
          : l.interval !== "one_time"),
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
  if (
    provider === "qbo" &&
    (adapter instanceof UnconfiguredBillingProvider ||
      lines.some(
        (l) => !l.qbo_item_ref && !p.workspace_settings?.qbo_custom_item_ref,
      ))
  )
    return {
      ...base,
      status: "needs_review",
      last_error: "Invoice manually",
      metadata: {
        action: "Invoice manually",
        line_ids: lines.map((l) => l.id),
      },
    };
  try {
    const matches = await adapter.findCustomers(p.client),
      emailMatches = matches.filter(
        (x) => x.email.toLowerCase() === p.client.email.toLowerCase(),
      );
    if (emailMatches.length > 1)
      throw new NeedsReview("Multiple customers with recipient email");
    const storedId =
      provider === "stripe"
        ? p.client.stripe_customer_id
        : p.client.qbo_customer_id;
    let customer =
      (storedId ? matches.find((c) => c.id === storedId) : undefined) ??
      emailMatches[0];
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
        p.client,
        p.id + ":" + provider + ":customer",
      );
    const metadata: Record<string, unknown> =
      provider === "qbo"
        ? { email_status: "NotSet", send_invoice: false }
        : { billing_start: "on_signature", trial_days: 0 };
    metadata.proposal_id = p.id;
    if (provider === "stripe") {
      metadata.client_origin = proposalOrigin(p);
      if (p.versions.at(-1)?.client_flow_version === 2)
        metadata.client_return_url = proposalLink(p);
    }
    metadata.proposal_title = p.title;
    metadata.currency = p.currency.toLowerCase();
    metadata.schedules = lines
      .filter((l) => l.schedule)
      .map((l) => ({ line_id: l.id, ...paidInvoiceProgress(l, []) }));
    const result = await adapter.createObject(
      customer,
      lines.map((l) =>
        provider === "qbo"
          ? {
              ...l,
              qbo_item_ref:
                l.qbo_item_ref ??
                p.workspace_settings?.qbo_custom_item_ref ??
                null,
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
      last_error: e instanceof Error ? e.message : "Provider failed",
    };
  }
}
