import { qboAddress, normalizedPhone } from "../client-contact";
import { AppError, check, type Client, type BillingLine } from "../model";
import { canonical, sha256 } from "../content";
import { proposalInvoiceRef } from "../qbo-mapping";
import {
  BillingProgressError,
  NeedsReview,
  type BillingProvider,
  type Customer,
} from "../billing";
import type { Repository } from "../repository";
import { QboConnection, qboUuid, type QboConfig } from "./qbo-connection";
export type { QboConfig } from "./qbo-connection";

type QCustomer = {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
};
type QInvoice = {
  Id: string;
  DocNumber?: string;
  EmailStatus?: string;
  TotalAmt?: number;
  Balance?: number;
  CurrencyRef?: { value: string };
  PrivateNote?: string;
};
type InvoiceReceipt = { Invoice: QInvoice };
type InvoiceAttempt = {
  id: string;
  realm: string;
  customer: string;
  body: object;
  fingerprint: string;
  send: boolean;
  email: string;
  invoice?: QInvoice;
};
const customer = (c: QCustomer): Customer => ({
  id: c.Id,
  company: c.CompanyName ?? c.DisplayName,
  email: c.PrimaryEmailAddr?.Address ?? "",
});
const literal = (s: string) =>
  "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
const recordRef = (realm: string, id: string) => realm + ":" + id;

export class QboProvider implements BillingProvider {
  readonly connection: QboConnection;
  constructor(
    private repo: Repository,
    private config: QboConfig,
    fetcher: typeof fetch = fetch,
  ) {
    this.connection = new QboConnection(repo, config, fetcher);
  }
  async request<T>(
    path: string,
    body?: unknown,
    key?: string,
    realm?: string,
  ): Promise<T> {
    const auth = await this.connection.access();
    check(
      !realm || realm === auth.realm,
      "QuickBooks company changed. Reconnect the original sandbox to continue.",
      409,
    );
    return this.connection.request<T>(
      auth,
      path,
      body,
      key && this.repo.workspaceId + ":" + key,
    );
  }
  private query<T>(query: string, realm?: string) {
    return this.request<{ QueryResponse: T }>(
      "query?query=" + encodeURIComponent(query),
      undefined,
      undefined,
      realm,
    );
  }
  async findCustomers(c: Client) {
    if (c.qbo_customer_id) {
      const r = await this.request<{ Customer: QCustomer }>(
        "customer/" + encodeURIComponent(c.qbo_customer_id),
      );
      return [customer(r.Customer)];
    }
    const exact = await this.query<{ Customer?: QCustomer[] }>(
      `select * from Customer where PrimaryEmailAddr = ${literal(c.email)} maxresults 1000`,
    );
    if (exact.QueryResponse.Customer?.length)
      return exact.QueryResponse.Customer.map(customer);
    const company = await this.query<{ Customer?: QCustomer[] }>(
      `select * from Customer where CompanyName = ${literal(c.company)} maxresults 1000`,
    );
    return (company.QueryResponse.Customer ?? []).map(customer);
  }

  async createCustomer(c: Client, key: string) {
    const r = await this.request<{ Customer: QCustomer }>(
      "customer",
      {
        DisplayName: c.company,
        CompanyName: c.company,
        GivenName: c.first_name,
        FamilyName: c.last_name,
        PrimaryEmailAddr: { Address: c.email },
        ...(c.phone
          ? { PrimaryPhone: { FreeFormNumber: normalizedPhone(c.phone) } }
          : {}),
        ...(qboAddress(c.address) ? { BillAddr: qboAddress(c.address) } : {}),
      },
      key,
    );
    return customer(r.Customer);
  }

  async items(search: string) {
    const { realm } = await this.connection.access();
    const filter = search
      ? ` and Name like ${literal("%" + search + "%")}`
      : "";
    const { QueryResponse } = await this.query<{
      Item?: { Id: string; Name: string }[];
    }>(
      `select * from Item where Active = true and Type in ('Service','Inventory','NonInventory')${filter} orderby Name maxresults 100`,
      realm,
    );
    return (QueryResponse.Item ?? []).map((item) => ({
      id: recordRef(realm, item.Id),
      name: item.Name,
    }));
  }
  async terms() {
    const { realm } = await this.connection.access();
    const { QueryResponse } = await this.query<{
      Term?: { Id: string; Name: string }[];
    }>(
      "select * from Term where Active = true orderby Name maxresults 100",
      realm,
    );
    return (QueryResponse.Term ?? []).map((term) => ({
      id: recordRef(realm, term.Id),
      name: term.Name,
    }));
  }

  private reference(ref: string | null, realm: string) {
    if (ref?.startsWith(realm + ":")) return ref.slice(realm.length + 1);
    if (this.config.realm === realm && ref && !ref.includes(":")) return ref;
    throw new NeedsReview(
      "Choose a QuickBooks item or default for the connected sandbox, then retry billing.",
    );
  }

  private async findExisting(attempt: InvoiceAttempt, note: string) {
    for (let start = 1; ; start += 1000) {
      const { QueryResponse } = await this.query<{ Invoice?: QInvoice[] }>(
        `select * from Invoice where CustomerRef = ${literal(attempt.customer)} startposition ${start} maxresults 1000`,
        attempt.realm,
      );
      const invoices = QueryResponse.Invoice ?? [];
      const matched = invoices.filter((i) => i.PrivateNote === note);
      if (matched.length > 1)
        throw new NeedsReview(
          "More than one QuickBooks invoice has this proposal reference. Review the invoices in QuickBooks.",
        );
      if (matched.length || invoices.length < 1000) return matched[0];
    }
  }

  async createObject(
    c: Customer,
    lines: BillingLine[],
    key: string,
    metadata: Record<string, unknown>,
  ) {
    const { realm } = await this.connection.access();
    const id = qboUuid(this.repo.workspaceId + ":qbo-invoice:" + key);
    const reference = proposalInvoiceRef(String(metadata.proposal_id));
    const note = `Yeswell proposal ${reference} (${String(metadata.proposal_id)})`;
    const prior = (
      await this.repo.entities<InvoiceAttempt>("provider_actions")
    ).find((a) => a.id === id && a.body);
    if (prior && (prior.realm !== realm || prior.customer !== c.id))
      throw new NeedsReview(
        "An invoice already started for a different QuickBooks company or customer. Review it in QuickBooks.",
      );
    const email = String(metadata.billing_email || c.email);
    const send = metadata.send_invoice === true;
    let attempt = prior;
    if (!attempt) {
      const { Preferences } = await this.request<{
        Preferences?: {
          SalesFormsPrefs?: {
            CustomTxnNumbers?: boolean;
            DefaultTerms?: { value: string };
          };
          CurrencyPrefs?: {
            MultiCurrencyEnabled?: boolean;
            HomeCurrency?: { value?: string };
          };
        };
      }>("preferences", undefined, undefined, realm);
      const prefs = Preferences?.SalesFormsPrefs;
      const currency = String(metadata.currency ?? "").toUpperCase();
      const home = Preferences?.CurrencyPrefs?.HomeCurrency?.value;
      if (
        currency &&
        home &&
        currency !== home &&
        !Preferences?.CurrencyPrefs?.MultiCurrencyEnabled
      )
        throw new NeedsReview(
          "This proposal currency differs from the QuickBooks company currency. Review the company settings.",
        );
      const terms = metadata.term_ref
        ? this.reference(String(metadata.term_ref), realm)
        : prefs?.DefaultTerms?.value;
      const body = {
        CustomerRef: { value: c.id },
        EmailStatus: "NotSet",
        PrivateNote: note,
        ...(prefs?.CustomTxnNumbers ? { DocNumber: reference } : {}),
        ...(email ? { BillEmail: { Address: email } } : {}),
        ...(terms ? { SalesTermRef: { value: terms } } : {}),
        ...(currency && Preferences?.CurrencyPrefs?.MultiCurrencyEnabled
          ? { CurrencyRef: { value: currency } }
          : {}),
        Line: lines.map((l) => ({
          Amount: (l.amount * l.qty) / 100,
          Description: l.description || l.name,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: this.reference(l.qbo_item_ref, realm) },
            Qty: l.qty,
            UnitPrice: l.amount / 100,
          },
        })),
      };
      attempt = {
        id,
        realm,
        customer: c.id,
        body,
        fingerprint: sha256(canonical(body)),
        send,
        email,
      };
      await this.repo.put("provider_actions", attempt);
    }
    let invoice = attempt.invoice;
    if (!invoice) {
      invoice = prior ? await this.findExisting(attempt, note) : undefined;
      if (!invoice) {
        try {
          invoice = (
            await this.request<InvoiceReceipt>(
              "invoice",
              attempt.body,
              key + ":create:" + attempt.fingerprint,
              realm,
            )
          ).Invoice;
        } catch (error) {
          if (error instanceof AppError && error.status === 422)
            await this.repo.put("provider_actions", {
              id,
              realm,
              rejected: true,
            });
          throw error;
        }
      }
      check(
        invoice?.Id,
        "QuickBooks did not return an invoice number. Retry to check its status.",
        502,
      );
      await this.repo.put("provider_actions", { ...attempt, invoice });
    }
    const snapshot = () => ({
      ...metadata,
      reference,
      billing_email: attempt.email,
      realm,
      invoice: this.invoiceDetails(invoice!, realm),
      email_status: invoice!.EmailStatus,
    });
    if (!attempt.send && invoice.EmailStatus === "EmailSent")
      throw new BillingProgressError(
        "QuickBooks marked the draft as emailed. Review its automatic delivery settings.",
        c.id,
        invoice.Id,
        snapshot(),
      );
    if (attempt.send && invoice.EmailStatus !== "EmailSent") {
      try {
        // Check the current status before retrying a potentially delivered send.
        if (prior)
          invoice = (
            await this.request<InvoiceReceipt>(
              "invoice/" + encodeURIComponent(invoice.Id),
              undefined,
              undefined,
              realm,
            )
          ).Invoice;
        if (invoice.EmailStatus !== "EmailSent") {
          invoice = (
            await this.request<InvoiceReceipt>(
              "invoice/" +
                encodeURIComponent(invoice.Id) +
                "/send?sendTo=" +
                encodeURIComponent(attempt.email),
              null,
              key + ":send",
              realm,
            )
          ).Invoice;
        }
        check(
          invoice.EmailStatus === "EmailSent",
          "QuickBooks created the invoice but did not confirm email delivery.",
          502,
        );
        await this.repo.put("provider_actions", { ...attempt, invoice });
      } catch (error) {
        throw new BillingProgressError(
          error instanceof AppError
            ? error.message
            : "QuickBooks created the invoice, but email delivery could not be confirmed.",
          c.id,
          invoice.Id,
          snapshot(),
        );
      }
    }
    return { id: invoice.Id, metadata: snapshot() };
  }

  private invoiceDetails(invoice: QInvoice, realm: string) {
    return {
      number: invoice.DocNumber || invoice.Id,
      amount:
        typeof invoice.TotalAmt === "number"
          ? Math.round(invoice.TotalAmt * 100)
          : undefined,
      status:
        invoice.TotalAmt && invoice.Balance === 0
          ? "Paid"
          : invoice.EmailStatus === "EmailSent"
            ? "Sent"
            : "Draft",
      currency: invoice.CurrencyRef?.value,
      url: `https://sandbox.qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(invoice.Id)}`,
      realm,
    };
  }
  async invoice(id: string, realm?: string) {
    const auth = await this.connection.access();
    check(
      !realm || auth.realm === realm,
      "This invoice belongs to a different QuickBooks sandbox.",
      409,
    );
    const { Invoice } = await this.connection.request<InvoiceReceipt>(
      auth,
      "invoice/" + encodeURIComponent(id),
    );
    return this.invoiceDetails(Invoice, auth.realm);
  }
}
