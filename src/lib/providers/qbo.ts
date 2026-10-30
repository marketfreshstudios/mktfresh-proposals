import { qboAddress, normalizedPhone } from "../client-contact";
import { randomUUID } from "node:crypto";
import {
  check,
  ItemSchema,
  type Client,
  type BillingLine,
  type Item,
} from "../model";
import { canonical, sha256 } from "../content";
import { type BillingProvider, type Customer } from "../billing";
import type { Repository } from "../repository";
import { encryptSecret, decryptSecret } from "./secrets";
export type QboConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  realm: string;
  environment: string;
  encryptionKey: string;
};
type QCustomer = {
  Id: string;
  DisplayName: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address: string };
};
const customer = (c: QCustomer): Customer => ({
  id: c.Id,
  company: c.CompanyName ?? c.DisplayName,
  email: c.PrimaryEmailAddr?.Address ?? "",
});
const literal = (s: string) =>
  "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
export class QboProvider implements BillingProvider {
  private refreshing?: Promise<string>;
  constructor(
    private repo: Repository,
    private config: QboConfig,
    private fetcher: typeof fetch = fetch,
  ) {
    check(
      config.environment === "sandbox",
      "Only QuickBooks sandbox is permitted",
      503,
    );
    check(/^\d+$/.test(config.realm), "QuickBooks sandbox realm required", 503);
  }
  private async accessToken() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = undefined;
    }
  }
  private async refresh() {
    const id = this.repo.workspaceId;
    const old = (
      await this.repo.entities<{ id: string; ciphertext: string }>(
        "provider_credentials",
      )
    ).find((c) => c.id === id);
    const stored = old
      ? JSON.parse(decryptSecret(old.ciphertext, this.config.encryptionKey, id))
      : null;
    if (stored?.expires_at > Date.now() + 60000)
      return stored.access_token as string;
    const refreshToken = stored?.refresh_token ?? this.config.refreshToken;
    check(refreshToken, "QuickBooks refresh token required", 503);
    const response = await this.fetcher(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              this.config.clientId + ":" + this.config.clientSecret,
            ).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    check(
      response.ok,
      `QuickBooks token refresh failed (${response.status})`,
      502,
    );
    const token = await response.json();
    check(
      token.access_token && token.refresh_token,
      "QuickBooks returned incomplete tokens",
      502,
    );
    await this.repo.put("provider_credentials", {
      id,
      ciphertext: encryptSecret(
        JSON.stringify({
          ...token,
          expires_at: Date.now() + token.expires_in * 1000,
        }),
        this.config.encryptionKey,
        id,
      ),
    });
    return token.access_token as string;
  }
  async request<T>(path: string, body?: unknown, key?: string): Promise<T> {
    check(
      this.config.environment === "sandbox",
      "Only QuickBooks sandbox is permitted",
      503,
    );
    const id = key
      ? sha256(this.repo.workspaceId + ":qbo:" + key)
          .slice(0, 32)
          .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")
      : null;
    const fingerprint = sha256(canonical({ path, body: body ?? null }));
    if (id) {
      const prior = (
        await this.repo.entities<{
          id: string;
          fingerprint: string;
          response: T;
        }>("provider_actions")
      ).find((a) => a.id === id);
      if (prior) {
        check(
          prior.fingerprint === fingerprint,
          "QuickBooks idempotency payload changed",
        );
        return prior.response;
      }
    }
    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${this.config.realm}/${path}${path.includes("?") ? "&" : "?"}minorversion=75${key ? "&requestid=" + sha256(key).slice(0, 40) : ""}`;
    const response = await this.fetcher(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + (await this.accessToken()),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    check(response.ok, `QuickBooks request failed (${response.status})`, 502);
    const data = await response.json();
    check(!data.Fault, "QuickBooks rejected the request", 502);
    if (id)
      await this.repo.put("provider_actions", {
        id,
        fingerprint,
        response: data,
      });
    return data as T;
  }
  async findCustomers(c: Client) {
    if (c.qbo_customer_id) {
      const r = await this.request<{ Customer: QCustomer }>(
        "customer/" + encodeURIComponent(c.qbo_customer_id),
      );
      return [customer(r.Customer)];
    }
    const exact = await this.request<{
      QueryResponse: { Customer?: QCustomer[] };
    }>(
      "query?query=" +
        encodeURIComponent(
          `select * from Customer where PrimaryEmailAddr = ${literal(c.email)} maxresults 1000`,
        ),
    );
    if (exact.QueryResponse.Customer?.length)
      return exact.QueryResponse.Customer.map(customer);
    const company = await this.request<{
      QueryResponse: { Customer?: QCustomer[] };
    }>(
      "query?query=" +
        encodeURIComponent(
          `select * from Customer where CompanyName = ${literal(c.company)} maxresults 1000`,
        ),
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
  async createObject(
    c: Customer,
    lines: BillingLine[],
    key: string,
    metadata: Record<string, unknown>,
  ) {
    check(
      lines.every((l) => l.qbo_item_ref),
      "QuickBooks item reference required",
    );
    const result = await this.request<{
      Invoice: { Id: string; EmailStatus: string };
    }>(
      "invoice",
      {
        CustomerRef: { value: c.id },
        EmailStatus: "NotSet",
        PrivateNote: String(metadata.proposal_id),
        BillingLine: lines.map((l) => ({
          Amount: (l.amount * l.qty) / 100,
          Description: l.name + "\n" + l.description,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: l.qbo_item_ref },
            Qty: l.qty,
            UnitPrice: l.amount / 100,
          },
        })),
      },
      key,
    );
    check(
      result.Invoice.EmailStatus !== "EmailSent",
      "QuickBooks unexpectedly marked the invoice emailed",
      502,
    );
    return {
      id: result.Invoice.Id,
      metadata: { ...metadata, email_status: result.Invoice.EmailStatus },
    };
  }
  async syncCatalog() {
    const existing = await this.repo.entities<Item>("pricing_items");
    let imported = 0;
    for (let start = 1; ; start += 1000) {
      const result = await this.request<{
        QueryResponse: {
          Item?: {
            Id: string;
            Name: string;
            Description?: string;
            UnitPrice?: number;
            Active: boolean;
          }[];
        };
      }>(
        "query?query=" +
          encodeURIComponent(
            `select * from Item where Active = true startposition ${start} maxresults 1000`,
          ),
      );
      const items = result.QueryResponse.Item ?? [];
      for (const i of items) {
        const old = existing.find((x) => x.qbo_item_ref === i.Id);
        await this.repo.put(
          "pricing_items",
          ItemSchema.parse({
            ...old,
            id: old?.id ?? randomUUID(),
            sku: "qbo-" + i.Id,
            name: i.Name,
            description: i.Description ?? "",
            amount: Math.round((i.UnitPrice ?? 0) * 100),
            interval: "one_time",
            qbo_item_ref: i.Id,
            active: i.Active,
          }),
        );
        imported++;
      }
      if (items.length < 1000) break;
    }
    return { imported, synced_at: new Date().toISOString() };
  }
}
