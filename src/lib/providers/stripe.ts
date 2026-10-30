import { stripeAddress, normalizedPhone } from "../client-contact";
import { appOrigin, AppUrlSchema } from "../links";
import { check, type Client, type BillingLine, type Item } from "../model";
import {
  NeedsReview,
  type BillingProvider,
  type Customer,
  paidInvoiceProgress,
} from "../billing";
import {
  resolveLookup,
  type StripeTransport,
  type StripePage,
} from "../catalog";
import type { Repository } from "../repository";
import type { WorkspaceSettings } from "../workspace";
type StripeCustomer = {
  id: string;
  email: string | null;
  name: string | null;
  deleted?: boolean;
  livemode?: boolean;
  invoice_settings?: { default_payment_method: string | null };
};
type Subscription = {
  id: string;
  status: string;
  customer: string;
  schedule: string | null;
  default_payment_method: string | null;
  currency: string;
  latest_invoice: string | null;
  current_period_start: number;
  current_period_end: number;
  items: {
    data: {
      id: string;
      quantity: number;
      price: {
        id: string;
        unit_amount: number;
        lookup_key: string | null;
        recurring: { interval: string };
        currency: string;
      };
    }[];
  };
  metadata: Record<string, string>;
};
const customer = (c: StripeCustomer): Customer => ({
  id: c.id,
  email: c.email ?? "",
  company: c.name ?? "",
});
export class StripeProvider implements BillingProvider {
  constructor(
    public api: StripeTransport,
    private repo: Repository,
  ) {}
  async findCustomers(c: Client) {
    if (c.stripe_customer_id) {
      const found = await this.api.get<StripeCustomer>(
        `/v1/customers/${c.stripe_customer_id}`,
        {},
      );
      if (found.livemode !== false)
        throw new NeedsReview("Test-mode customer required");
      if (found.email?.toLowerCase() !== c.email.toLowerCase())
        throw new NeedsReview(
          "Linked Stripe customer email does not match this client",
        );
      if (found.deleted)
        throw new NeedsReview("Stored Stripe customer was deleted");
      return [customer(found)];
    }
    const exact = await this.api.get<StripePage<StripeCustomer>>(
      "/v1/customers",
      { email: c.email, limit: "100" },
    );
    if (exact.data.length || exact.has_more) {
      if (exact.has_more)
        throw new NeedsReview("Too many matching Stripe customers");
      return exact.data.map(customer);
    }
    // Company matching is a review signal only, never an automatic link.
    const escaped = c.company.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const possible = await this.api.get<StripePage<StripeCustomer>>(
      "/v1/customers/search",
      { query: `name:'${escaped}'`, limit: "100" },
    );
    return possible.data.map(customer);
  }
  async createCustomer(c: Client, key: string) {
    return customer(
      await this.api.post<StripeCustomer>(
        "/v1/customers",
        {
          email: c.email,
          name: c.company,
          phone: normalizedPhone(c.phone) || undefined,
          address: stripeAddress(c.address),
        },
        key,
      ),
    );
  }
  private async item(line: BillingLine, currency: string) {
    if (line.stripe_lookup_key) {
      const price = await resolveLookup(this.api, line.stripe_lookup_key);
      if (price.currency && price.currency !== currency)
        throw new NeedsReview("Catalogue currency differs from proposal");
      if (price.recurring?.interval !== line.interval)
        throw new NeedsReview(`${line.name}: catalogue interval changed`);
      if (
        price.unit_amount !== line.list_amount &&
        price.unit_amount !== line.amount
      )
        throw new NeedsReview(
          `${line.name}: catalogue price changed after drafting`,
        );
      if (price.unit_amount === line.amount)
        return { price: price.id, quantity: line.qty };
      return {
        price_data: {
          product: price.product.id,
          unit_amount: line.amount,
          currency,
          recurring: { interval: line.interval },
        },
        quantity: line.qty,
      };
    }
    const family = (
      await this.repo.entities<{
        id: string;
        stripe_product_id: string;
        active: boolean;
      }>("custom_families")
    ).find((f) => f.id === line.custom_family_id && f.active);
    if (!family)
      throw new NeedsReview(
        `${line.name}: active custom product family required`,
      );
    const product = await this.api.get<{
      active: boolean;
      metadata: Record<string, string>;
    }>(`/v1/products/${family.stripe_product_id}`, {});
    if (!product.active || product.metadata.custom_family !== "true")
      throw new NeedsReview("Custom family is not active in Stripe");
    return {
      price_data: {
        product: family.stripe_product_id,
        unit_amount: line.amount,
        currency,
        recurring: { interval: line.interval },
      },
      quantity: line.qty,
    };
  }
  private plan(line: BillingLine) {
    return line.stripe_lookup_key ?? `custom:${line.custom_family_id}`;
  }
  private terms(line: BillingLine, proposal: string) {
    return {
      ...Object.fromEntries(
        Object.entries(line.plan_terms ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      plan: this.plan(line),
      proposal_id: proposal,
    };
  }
  private async workingCard(sub: Subscription, c: StripeCustomer) {
    const id =
      sub.default_payment_method ?? c.invoice_settings?.default_payment_method;
    if (!id) return false;
    const pm = await this.api.get<{
      customer: string;
      type: string;
      card?: { exp_year: number; exp_month: number };
    }>(`/v1/payment_methods/${id}`, {});
    const now = new Date();
    return (
      pm.customer === c.id &&
      pm.type === "card" &&
      !!pm.card &&
      (pm.card.exp_year > now.getUTCFullYear() ||
        (pm.card.exp_year === now.getUTCFullYear() &&
          pm.card.exp_month >= now.getUTCMonth() + 1))
    );
  }
  async createObject(
    c: Customer,
    lines: BillingLine[],
    key: string,
    metadata: Record<string, unknown>,
  ) {
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const returnOrigin = metadata.client_origin
      ? AppUrlSchema.parse(metadata.client_origin).replace(/\/+$/, "")
      : appOrigin();
    const clientReturn = metadata.client_return_url
      ? AppUrlSchema.parse(metadata.client_return_url)
      : null;
    const currency = String(metadata.currency),
      proposal = String(metadata.proposal_id),
      title = String(metadata.proposal_title);
    const sc = await this.api.get<StripeCustomer>(`/v1/customers/${c.id}`, {});
    await this.api.post(
      `/v1/customers/${c.id}`,
      { name: c.company },
      key + ":company-name",
    );
    const all: Subscription[] = [];
    let cursor = "";
    do {
      const page = await this.api.get<StripePage<Subscription>>(
        "/v1/subscriptions",
        {
          customer: c.id,
          status: "active",
          limit: "100",
          ...(cursor ? { starting_after: cursor } : {}),
        },
      );
      all.push(...page.data);
      if (!page.has_more) break;
      check(page.data.length, "Empty Stripe subscription page");
      cursor = page.data.at(-1)!.id;
    } while (true);
    const checkout: { id: string; url: string; line_ids: string[] }[] = [];
    const added: {
      id: string;
      line_ids: string[];
      monthly_total: number;
      yearly_total: number;
    }[] = [];
    const ordinary = lines.filter((l) => !l.schedule);
    // Mixed intervals are separate Checkout sessions to avoid interval conversion.
    for (const interval of ["month", "year"] as const) {
      const group = ordinary.filter((l) => l.interval === interval);
      if (!group.length) continue;
      const candidates = all.filter(
        (s) =>
          !s.schedule &&
          s.currency === currency &&
          s.items.data.every((i) => i.price.recurring.interval === interval),
      );
      let existing: Subscription | undefined;
      for (const sub of candidates)
        if (await this.workingCard(sub, sc)) {
          existing = sub;
          break;
        }
      const items = await Promise.all(group.map((l) => this.item(l, currency)));
      if (existing) {
        const priorPlan = existing.metadata.plan;
        const priorKeys =
          priorPlan === "multi"
            ? (existing.metadata.plan_items ?? "")
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
            : priorPlan
              ? [priorPlan]
              : [];
        const keys = [
          ...new Set([
            ...priorKeys,
            ...existing.items.data
              .map((i) => i.price.lookup_key)
              .filter((k): k is string => !!k),
            ...group.map((l) => this.plan(l)),
          ]),
        ].filter((k) => k !== "multi");
        for (let i = 0; i < group.length; i++)
          await this.api.post(
            "/v1/subscription_items",
            {
              subscription: existing.id,
              ...items[i],
              proration_behavior: "none",
              metadata: { proposal_id: proposal, line_id: group[i].id },
            },
            key + ":add:" + group[i].id,
          );
        await this.api.post(
          `/v1/subscriptions/${existing.id}`,
          {
            metadata: {
              plan: keys.length > 1 ? "multi" : keys[0],
              plan_items: keys.join(","),
            },
          },
          key + ":metadata:" + interval,
        );
        // Query after writes rather than adding to a potentially stale pre-write total on retry.
        const current = await this.api.get<Subscription>(
          `/v1/subscriptions/${existing.id}`,
          {},
        );
        const total = current.items.data
          .filter((i) => i.price.recurring.interval === "month")
          .reduce((sum, i) => sum + i.price.unit_amount * i.quantity, 0);
        added.push({
          id: existing.id,
          line_ids: group.map((l) => l.id),
          monthly_total: total,
          yearly_total: current.items.data
            .filter((i) => i.price.recurring.interval === "year")
            .reduce((sum, i) => sum + i.price.unit_amount * i.quantity, 0),
        });
      } else {
        const session = await this.api.post<{ id: string; url: string }>(
          "/v1/checkout/sessions",
          {
            customer: c.id,
            mode:
              settings.collection_method === "send_invoice"
                ? "setup"
                : "subscription",
            ...(settings.collection_method === "send_invoice"
              ? { currency }
              : {
                  line_items: items,
                  subscription_data: {
                    description: title,
                    metadata: {
                      plan: group.length > 1 ? "multi" : this.plan(group[0]),
                      plan_items: group.map((l) => this.plan(l)).join(","),
                      proposal_id: proposal,
                    },
                  },
                }),
            metadata: {
              proposal_id: proposal,
              line_ids: JSON.stringify(group.map((l) => l.id)),
              workspace_id: this.repo.workspaceId,
            },
            success_url: clientReturn
              ? clientReturn + "?billing=returned"
              : returnOrigin + "/billing/complete",
            cancel_url: clientReturn
              ? clientReturn + "?billing=pending"
              : returnOrigin + "/billing/pending",
          },
          key + ":checkout:" + interval,
        );
        checkout.push({ ...session, line_ids: group.map((l) => l.id) });
      }
    }
    for (const line of lines.filter((l) => l.schedule)) {
      const usable = all.find(
        (s) =>
          s.default_payment_method ||
          sc.invoice_settings?.default_payment_method,
      );
      if (usable && (await this.workingCard(usable, sc))) {
        const subscriptions = await this.finishSetup(
          c.id,
          [line],
          usable.default_payment_method ??
            sc.invoice_settings!.default_payment_method!,
          key + ":own:" + line.id,
          metadata,
        );
        added.push({
          id: subscriptions[0],
          line_ids: [line.id],
          monthly_total: line.interval === "month" ? line.amount * line.qty : 0,
          yearly_total: line.interval === "year" ? line.amount * line.qty : 0,
        });
        continue;
      }
      const session = await this.api.post<{ id: string; url: string }>(
        "/v1/checkout/sessions",
        {
          customer: c.id,
          mode: "setup",
          currency,
          metadata: {
            proposal_id: proposal,
            line_ids: JSON.stringify([line.id]),
            workspace_id: this.repo.workspaceId,
          },
          success_url: clientReturn
            ? clientReturn + "?billing=returned"
            : returnOrigin + "/billing/complete",
          cancel_url: clientReturn
            ? clientReturn + "?billing=pending"
            : returnOrigin + "/billing/pending",
        },
        key + ":schedule-setup:" + line.id,
      );
      checkout.push({ ...session, line_ids: [line.id] });
    }
    return {
      id: added[0]?.id ?? checkout[0]?.id,
      metadata: {
        ...metadata,
        added_existing: added,
        checkout,
        requires_checkout: checkout.length > 0,
      },
    };
  }
  async finishSetup(
    c: string,
    lines: BillingLine[],
    pm: string,
    key: string,
    metadata: Record<string, unknown>,
  ) {
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const subscriptions: string[] = [];
    for (const line of lines) {
      const item = await this.item(line, String(metadata.currency));
      const sub = await this.api.post<Subscription>(
        "/v1/subscriptions",
        {
          customer: c,
          default_payment_method: pm,
          items: [item],
          description: metadata.proposal_title,
          metadata: this.terms(line, String(metadata.proposal_id)),
          collection_method: settings.collection_method,
          ...(settings.collection_method === "send_invoice"
            ? { days_until_due: 30 }
            : {}),
          proration_behavior: "none",
        },
        key + ":subscription:" + line.id,
      );
      if (settings.collection_method === "send_invoice" && sub.latest_invoice) {
        await this.api.post(
          `/v1/invoices/${sub.latest_invoice}/finalize`,
          {},
          key + ":finalize:" + line.id,
        );
        await this.api.post(
          `/v1/invoices/${sub.latest_invoice}/send`,
          {},
          key + ":send:" + line.id,
        );
      }
      if (line.schedule)
        await this.configureSchedule(
          sub,
          line,
          key + ":" + line.id,
          String(metadata.proposal_id),
        );
      subscriptions.push(sub.id);
    }
    return subscriptions;
  }
  async configureSchedule(
    sub: Subscription,
    line: BillingLine,
    key: string,
    proposal: string,
  ) {
    check(line.schedule, "Schedule required");
    const paid: { id: string; amount_paid: number; status: string }[] = [];
    let cursor = "";
    do {
      const page = await this.api.get<
        StripePage<{ id: string; amount_paid: number; status: string }>
      >("/v1/invoices", {
        subscription: sub.id,
        status: "paid",
        limit: "100",
        ...(cursor ? { starting_after: cursor } : {}),
      });
      paid.push(...page.data);
      if (!page.has_more) break;
      check(page.data.length, "Empty invoice page");
      cursor = page.data.at(-1)!.id;
    } while (true);
    const progress = paidInvoiceProgress(line, paid);
    const next = await resolveLookup(this.api, line.schedule.then.lookup_key);
    if (next.recurring?.interval !== line.interval)
      throw new NeedsReview(
        "Step-down billing interval differs from signed terms",
      );
    if (next.unit_amount !== line.schedule.then.amount)
      throw new NeedsReview(
        "Scheduled step-down amount differs from catalogue",
      );
    const schedule = sub.schedule
      ? await this.api.get<{
          id: string;
          current_phase?: { start_date: number };
        }>(`/v1/subscription_schedules/${sub.schedule}`, {})
      : await this.api.post<{
          id: string;
          current_phase?: { start_date: number };
        }>(
          "/v1/subscription_schedules",
          { from_subscription: sub.id },
          key + ":schedule-create",
        );
    // Preserve the actual schedule phase anchor. A subscription billing period moves
    // each month; replacing the phase start with it would rewrite an active phase.
    const currentPaid = paid.some((i) => i.id === sub.latest_invoice);
    const periods = Math.max(1, progress.remaining + (currentPaid ? 1 : 0));
    const end = new Date(sub.current_period_start * 1000);
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(
      end.getUTCMonth() + periods * (line.interval === "year" ? 12 : 1),
    );
    const lastDay = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
    const phases = [
      {
        items: sub.items.data.map((i) => ({
          price: i.price.id,
          quantity: i.quantity,
        })),
        start_date:
          schedule.current_phase?.start_date ?? sub.current_period_start,
        end_date:
          progress.remaining === 0
            ? sub.current_period_end
            : Math.floor(end.getTime() / 1000),
        metadata: this.terms(line, proposal),
        proration_behavior: "none",
      },
      {
        items: [{ price: next.id, quantity: line.qty }],
        iterations: 1,
        metadata: {
          plan: line.schedule.then.lookup_key,
          proposal_id: proposal,
        },
        proration_behavior: "none",
      },
    ];
    await this.api.post(
      `/v1/subscription_schedules/${schedule.id}`,
      { end_behavior: "release", proration_behavior: "none", phases },
      key + ":schedule-update",
    );
  }
}
