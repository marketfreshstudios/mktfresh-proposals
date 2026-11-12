import { formatMoney } from "../money";
import { stripeCustomerMatches } from "../client-billing";
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
      metadata?: Record<string, string>;
      price: {
        id: string;
        unit_amount: number;
        lookup_key: string | null;
        recurring: { interval: string };
        currency: string;
        product?: string | { id: string };
      };
    }[];
  };
  metadata: Record<string, string>;
};
/** Recurring lines that would join a subscription the client already pays.
 * Nothing is added or charged until the client approves on the proposal. */
export type BillingApproval = {
  id: string;
  kind: "add" | "own";
  subscription_id: string | null;
  payment_method: string;
  card: { brand: string; last4: string } | null;
  line_ids: string[];
  items: { line_id: string; name: string }[];
  interval: "month" | "year";
  /** Unix seconds of the first charge: the next invoice, or now for "own". */
  first_charge: number | null;
};
const productOf = (price: { product?: string | { id: string } }) =>
  typeof price.product === "string" ? price.product : price.product?.id;
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
    const exact = await stripeCustomerMatches(c, this.api);
    if (exact.length)
      return exact.map((found) => ({
        id: found.id,
        email: c.email,
        company: found.name ?? "",
      }));
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
  private async item(
    line: BillingLine,
    currency: string,
    names?: Map<string, string>,
  ) {
    if (line.stripe_lookup_key) {
      const price = await resolveLookup(this.api, line.stripe_lookup_key);
      names?.set(line.id, price.product.name || line.name);
      if (price.currency && price.currency !== currency)
        throw new NeedsReview("Product currency differs from proposal");
      if (price.recurring?.interval !== line.interval)
        throw new NeedsReview(`${line.name}: product interval changed`);
      if (
        price.unit_amount !== line.list_amount &&
        price.unit_amount !== line.amount
      )
        throw new NeedsReview(
          `${line.name}: product price changed after drafting`,
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
        name?: string;
        active: boolean;
      }>("custom_families")
    ).find((f) => f.id === line.custom_family_id && f.active);
    if (!family)
      throw new NeedsReview(`${line.name}: choose an active billing category`);
    const product = await this.api.get<{
      name?: string;
      active: boolean;
      metadata: Record<string, string>;
    }>(`/v1/products/${family.stripe_product_id}`, {});
    if (!product.active || product.metadata.custom_family !== "true")
      throw new NeedsReview("Billing category is not active in Stripe");
    names?.set(line.id, product.name || family.name || line.name);
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
  /** The Stripe product a line bills under (catalog price or billing category). */
  private async productId(line: BillingLine) {
    if (line.stripe_lookup_key)
      return (await resolveLookup(this.api, line.stripe_lookup_key)).product.id;
    return (
      await this.repo.entities<{
        id: string;
        stripe_product_id: string;
        active: boolean;
      }>("custom_families")
    ).find((f) => f.id === line.custom_family_id)?.stripe_product_id;
  }
  /** Never bill a product the client already pays for in an active subscription. */
  private async rejectDuplicates(
    lines: BillingLine[],
    active: Subscription[],
    proposal: string,
  ) {
    // Items this proposal already created (a retried job or approval) are not
    // duplicates of themselves.
    const owned = new Set(
      active
        .filter((sub) => sub.metadata?.proposal_id !== proposal)
        .flatMap((sub) =>
          sub.items.data
            .filter((i) => i.metadata?.proposal_id !== proposal)
            .map((i) => productOf(i.price))
            .filter(Boolean),
        ),
    );
    for (const line of lines) {
      const product = await this.productId(line);
      if (product && owned.has(product))
        throw new NeedsReview(
          `${line.name}: this client already has an active subscription for this product. Review it before billing so they aren't charged twice.`,
        );
    }
  }
  private async cardOf(id: string) {
    const pm = await this.api.get<{
      card?: { brand: string; last4: string };
    }>(`/v1/payment_methods/${id}`, {});
    return pm.card && /^\d{4}$/.test(pm.card.last4)
      ? { brand: String(pm.card.brand), last4: pm.card.last4 }
      : null;
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
    await this.rejectDuplicates(
      lines.filter((l) => l.interval !== "one_time"),
      all,
      proposal,
    );
    const names = new Map<string, string>();
    const displayItems = (group: BillingLine[]) =>
      group.map((l) => ({ line_id: l.id, name: names.get(l.id) || l.name }));
    const setupMessage = (group: BillingLine[]) => {
      const message =
        group
          .map(
            (l) =>
              `${names.get(l.id) || l.name} · ${formatMoney(l.amount * l.qty, currency)}/${l.interval === "year" ? "year" : "month"}`,
          )
          .join("; ") +
        // Say plainly when saving the card starts the charge (scheduled plans
        // with automatic collection are charged as soon as the card is saved).
        (settings.collection_method === "send_invoice"
          ? ". Saving your card charges nothing today. Your subscription starts after you save it, and your first invoice is emailed."
          : `. Saving your card starts your subscription, and the first payment of ${formatMoney(
              group.reduce((sum, l) => sum + l.amount * l.qty, 0),
              currency,
            )} is charged right away.`);
      if (message.length > 1200)
        throw new NeedsReview(
          "Itemized card setup exceeds Stripe's text limit; staff must review billing",
        );
      return { submit: { message } };
    };
    const checkout: {
      id: string;
      url: string;
      line_ids: string[];
      items: { line_id: string; name: string }[];
      mode: "setup" | "subscription";
      collection_method: "send_invoice" | "charge_automatically";
      payment_methods: "card" | "card_ach";
      amount_due_today?: number;
    }[] = [];
    const added: {
      id: string;
      line_ids: string[];
      items: { line_id: string; name: string }[];
      monthly_total: number;
      yearly_total: number;
    }[] = [];
    const approval: BillingApproval[] = [];
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
      const items = await Promise.all(
        group.map((l) => this.item(l, currency, names)),
      );
      if (existing) {
        const pm = (existing.default_payment_method ??
          sc.invoice_settings?.default_payment_method)!;
        approval.push({
          id: `approve:${interval}`,
          kind: "add",
          subscription_id: existing.id,
          payment_method: pm,
          card: await this.cardOf(pm),
          line_ids: group.map((l) => l.id),
          items: displayItems(group),
          interval,
          first_charge: existing.current_period_end ?? null,
        });
      } else {
        const session = await this.api.post<{
          id: string;
          url: string;
          amount_total?: number;
        }>(
          "/v1/checkout/sessions",
          {
            customer: c.id,
            payment_method_types:
              settings.payment_methods === "card_ach"
                ? ["card", "us_bank_account"]
                : ["card"],
            mode:
              settings.collection_method === "send_invoice"
                ? "setup"
                : "subscription",
            ...(settings.collection_method === "send_invoice"
              ? { currency, custom_text: setupMessage(group) }
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
              ? clientReturn +
                "?billing=returned&session_id={CHECKOUT_SESSION_ID}"
              : returnOrigin + "/billing/complete",
            cancel_url: clientReturn
              ? clientReturn + "?billing=pending"
              : returnOrigin + "/billing/pending",
          },
          key + ":checkout:" + interval,
        );
        checkout.push({
          ...session,
          line_ids: group.map((l) => l.id),
          items: displayItems(group),
          mode:
            settings.collection_method === "send_invoice"
              ? "setup"
              : "subscription",
          collection_method: settings.collection_method,
          payment_methods: settings.payment_methods ?? "card",
          ...(typeof session.amount_total === "number"
            ? { amount_due_today: session.amount_total }
            : {}),
        });
      }
    }
    for (const line of lines.filter((l) => l.schedule)) {
      await this.item(line, currency, names);
      const usable = all.find(
        (s) =>
          s.default_payment_method ||
          sc.invoice_settings?.default_payment_method,
      );
      if (usable && (await this.workingCard(usable, sc))) {
        const pm = (usable.default_payment_method ??
          sc.invoice_settings!.default_payment_method)!;
        approval.push({
          id: `approve:${line.id}`,
          kind: "own",
          subscription_id: null,
          payment_method: pm,
          card: await this.cardOf(pm),
          line_ids: [line.id],
          items: displayItems([line]),
          interval: line.interval === "year" ? "year" : "month",
          first_charge: null,
        });
        continue;
      }
      const session = await this.api.post<{
        id: string;
        url: string;
        amount_total?: number;
      }>(
        "/v1/checkout/sessions",
        {
          customer: c.id,
          payment_method_types:
            settings.payment_methods === "card_ach"
              ? ["card", "us_bank_account"]
              : ["card"],
          mode: "setup",
          currency,
          custom_text: setupMessage([line]),
          metadata: {
            proposal_id: proposal,
            line_ids: JSON.stringify([line.id]),
            workspace_id: this.repo.workspaceId,
          },
          success_url: clientReturn
            ? clientReturn +
              "?billing=returned&session_id={CHECKOUT_SESSION_ID}"
            : returnOrigin + "/billing/complete",
          cancel_url: clientReturn
            ? clientReturn + "?billing=pending"
            : returnOrigin + "/billing/pending",
        },
        key + ":schedule-setup:" + line.id,
      );
      checkout.push({
        ...session,
        line_ids: [line.id],
        items: displayItems([line]),
        mode: "setup",
        collection_method: settings.collection_method,
        payment_methods: settings.payment_methods ?? "card",
        amount_due_today: 0,
      });
    }
    return {
      id: added[0]?.id ?? checkout[0]?.id ?? approval[0]?.id,
      metadata: {
        ...metadata,
        added_existing: added,
        checkout,
        approval,
        requires_checkout: checkout.length > 0 || approval.length > 0,
      },
    };
  }
  /**
   * Carries out an approval the client gave on the proposal: adds the lines to
   * the subscription they already pay, or starts a scheduled plan on their card
   * on file. Everything is re-checked first, because the subscription or card
   * may have changed since signing.
   */
  async applyApproval(
    c: Customer,
    lines: BillingLine[],
    approval: BillingApproval,
    key: string,
    metadata: Record<string, unknown>,
  ) {
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const currency = String(metadata.currency),
      proposal = String(metadata.proposal_id);
    const sc = await this.api.get<StripeCustomer>(`/v1/customers/${c.id}`, {});
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
    await this.rejectDuplicates(lines, all, proposal);
    const names = new Map<string, string>();
    const displayItems = (group: BillingLine[]) =>
      group.map((l) => ({ line_id: l.id, name: names.get(l.id) || l.name }));
    if (approval.kind === "own") {
      const line = lines[0];
      check(line?.schedule, "Scheduled plan required");
      await this.item(line, currency, names);
      const usable = all.find(
        (s) =>
          (s.default_payment_method ??
            sc.invoice_settings?.default_payment_method) ===
          approval.payment_method,
      );
      if (!usable || !(await this.workingCard(usable, sc)))
        throw new NeedsReview(
          "The card on file changed; the client needs to check out instead",
        );
      const subscriptions = await this.finishSetup(
        c.id,
        [line],
        approval.payment_method,
        key + ":own:" + line.id,
        { ...metadata, collection_method: settings.collection_method },
      );
      return {
        id: subscriptions[0],
        line_ids: [line.id],
        items: displayItems([line]),
        monthly_total: line.interval === "month" ? line.amount * line.qty : 0,
        yearly_total: line.interval === "year" ? line.amount * line.qty : 0,
      };
    }
    const existing = all.find((s) => s.id === approval.subscription_id);
    if (!existing || !(await this.workingCard(existing, sc)))
      throw new NeedsReview(
        "The subscription or card on file changed; the client needs to check out instead",
      );
    const group = lines;
    const interval = approval.interval;
    const items = await Promise.all(
      group.map((l) => this.item(l, currency, names)),
    );
    const added: {
      id: string;
      line_ids: string[];
      items: { line_id: string; name: string }[];
      monthly_total: number;
      yearly_total: number;
    }[] = [];
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
      items: displayItems(group),
      monthly_total: total,
      yearly_total: current.items.data
        .filter((i) => i.price.recurring.interval === "year")
        .reduce((sum, i) => sum + i.price.unit_amount * i.quantity, 0),
    });
    return added[0];
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
    const collection =
      metadata.collection_method === "send_invoice" ||
      metadata.collection_method === "charge_automatically"
        ? metadata.collection_method
        : settings.collection_method;
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
          collection_method: collection,
          ...(collection === "send_invoice" ? { days_until_due: 30 } : {}),
          proration_behavior: "none",
        },
        key + ":subscription:" + line.id,
      );
      if (collection === "send_invoice" && sub.latest_invoice) {
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
    options?: { preserveMetadata?: boolean },
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
    // Newly signed OIOT plans step down only once the paid-invoice threshold
    // has actually been met. A projected date can arrive while a debit is unpaid.
    if (line.plan_terms?.oiot_paid_step_down === true && progress.remaining > 0)
      return;
    const next = await resolveLookup(this.api, line.schedule.then.lookup_key);
    if (next.recurring?.interval !== line.interval)
      throw new NeedsReview(
        "Step-down billing interval differs from signed terms",
      );
    if (next.unit_amount !== line.schedule.then.amount)
      throw new NeedsReview("Scheduled step-down amount differs from products");
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
        ...(!options?.preserveMetadata
          ? { metadata: this.terms(line, proposal) }
          : {}),
        proration_behavior: "none",
      },
      {
        items: [{ price: next.id, quantity: line.qty }],
        iterations: 1,
        ...(!options?.preserveMetadata
          ? {
              metadata: {
                plan: line.schedule.then.lookup_key,
                proposal_id: proposal,
              },
            }
          : {}),
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
