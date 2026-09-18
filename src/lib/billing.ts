import {
  check,
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
export function oiOTSchedule(
  fullPrice: number,
  kickoff: number,
  paidInvoices: { amount_paid: number; status: string }[],
) {
  check(
    Number.isSafeInteger(fullPrice) &&
      Number.isSafeInteger(kickoff) &&
      kickoff > 0 &&
      fullPrice > kickoff,
    "Valid OIOT buyout amounts required",
  );
  const needed = Math.ceil((fullPrice - kickoff) / 7500),
    paid = paidInvoices.filter(
      (i) => i.status === "paid" && i.amount_paid >= 17500,
    ).length;
  return {
    payments_needed: needed,
    paid,
    remaining: Math.max(needed - paid, 0),
    monthly_cents: 17500,
    after_cents: 10000,
    build_credit_cents: 7500,
    proration_behavior: "none",
    minimum_term_months: 12,
    action: needed <= paid ? "switch_now" : "schedule",
    end_behavior: "release",
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
    .quote.filter(
      (l) =>
        (!l.optional || l.selected) &&
        l.billing === (provider === "qbo" ? "one_time" : "monthly"),
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
  try {
    const matches = await adapter.findCustomers(p.client),
      emailMatches = matches.filter(
        (x) => x.email.toLowerCase() === p.client.email.toLowerCase(),
      );
    if (emailMatches.length > 1)
      throw new NeedsReview("Multiple customers with recipient email");
    let customer = emailMatches[0];
    if (
      !customer &&
      provider === "qbo" &&
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
    if (provider === "stripe" && lines.some((l) => l.sku === "oiot-monthly")) {
      if (!p.oiot)
        throw new NeedsReview(
          "OIOT full price, kickoff and page count are required",
        );
      metadata.oiot = {
        ...p.oiot,
        ...oiOTSchedule(p.oiot.full_price, p.oiot.kickoff, []),
        kickoff_billed_in: "qbo",
        schedule_after: "successful payment",
        other_monthly_items: "preserve during step-down",
      };
    }
    const result = await adapter.createObject(
      customer,
      lines,
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
