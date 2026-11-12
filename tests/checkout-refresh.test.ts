import { describe, expect, it } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import { approveBilling, freshCheckoutUrl } from "../src/lib/checkout-refresh";
import { NeedsReview } from "../src/lib/billing";
import { billingLines } from "../src/lib/quote-model";
import type { StripeProvider } from "../src/lib/providers/stripe";

async function signedWithCheckout() {
  const { repo, service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const lines = billingLines(signed.versions.at(-1)!.quote).filter(
    (l) => l.interval !== "one_time",
  );
  const lineIds = lines.length ? [lines[0].id] : ["missing"];
  signed.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      attempts: 1,
      external_customer_id: "cus_test",
      metadata: {
        requires_checkout: true,
        checkout: [
          {
            id: "cs_old",
            url: "https://checkout.stripe.test/old",
            line_ids: lineIds,
            mode: "setup",
          },
        ],
      },
    },
  ];
  await repo.save(signed, signed.revision);
  return { repo, signed: (await repo.get(signed.id))!, lineIds };
}

function fakeStripe(
  session: { status: string; url: string | null; expires_at: number },
  active: unknown[] = [],
) {
  const created: string[] = [];
  const provider = {
    api: {
      get: async (path: string) =>
        path.startsWith("/v1/checkout/sessions/")
          ? session
          : { data: active, has_more: false },
    },
    createObject: async (_c: unknown, lines: { id: string }[], key: string) => {
      created.push(key);
      return {
        id: "cs_new",
        metadata: {
          checkout: [
            {
              id: "cs_new",
              url: "https://checkout.stripe.test/new",
              line_ids: lines.map((l) => l.id),
              mode: "setup",
            },
          ],
        },
      };
    },
  } as unknown as StripeProvider;
  return { provider, created };
}

describe("permanent payment link", () => {
  it("reuses an open checkout page", async () => {
    const { repo, signed } = await signedWithCheckout();
    const { provider, created } = fakeStripe({
      status: "open",
      url: "https://checkout.stripe.test/old",
      expires_at: Date.now() / 1000 + 3600,
    });
    expect(await freshCheckoutUrl(repo, provider, signed, "cs_old")).toBe(
      "https://checkout.stripe.test/old",
    );
    expect(created).toEqual([]);
  });

  it("replaces an expired checkout page and records the new session", async () => {
    const { repo, signed, lineIds } = await signedWithCheckout();
    const { provider, created } = fakeStripe({
      status: "expired",
      url: null,
      expires_at: Date.now() / 1000 - 60,
    });
    expect(await freshCheckoutUrl(repo, provider, signed, "cs_old")).toBe(
      "https://checkout.stripe.test/new",
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toContain(":refresh:cs_old");
    const saved = (await repo.get(signed.id))!;
    const checkout = saved.billing_links[0].metadata?.checkout as {
      id: string;
      line_ids: string[];
    }[];
    expect(checkout.map((s) => s.id)).toEqual(["cs_new"]);
    expect(checkout[0].line_ids).toEqual(lineIds);
    expect(saved.events.at(-1)?.type).toBe("billing_checkout_renewed");
  });

  it("turns an expired page into an approval when the client now pays a subscription", async () => {
    const { repo, signed, lineIds } = await signedWithCheckout();
    const { provider } = fakeStripe({
      status: "expired",
      url: null,
      expires_at: 0,
    });
    (provider as unknown as { createObject: unknown }).createObject =
      async () => ({
        id: "approve:month",
        metadata: {
          checkout: [],
          approval: [
            {
              id: "approve:month",
              kind: "add",
              subscription_id: "sub_1",
              payment_method: "pm_1",
              card: { brand: "visa", last4: "4242" },
              line_ids: lineIds,
              items: [],
              interval: "month",
              first_charge: 1_900_000_000,
            },
          ],
        },
      });
    const url = await freshCheckoutUrl(repo, provider, signed, "cs_old");
    expect(url).toContain(`/p/${signed.token}`);
    const saved = (await repo.get(signed.id))!;
    const meta = saved.billing_links[0].metadata!;
    expect(meta.checkout).toEqual([]);
    expect((meta.approval as { id: string }[]).map((a) => a.id)).toEqual([
      "approve:month",
    ]);
    expect(meta.requires_checkout).toBe(true);
  });

  it("refuses sessions that aren't pending for this proposal", async () => {
    const { repo, signed } = await signedWithCheckout();
    const { provider } = fakeStripe({
      status: "open",
      url: "https://checkout.stripe.test/old",
      expires_at: Date.now() / 1000 + 3600,
    });
    await expect(
      freshCheckoutUrl(repo, provider, signed, "cs_other"),
    ).rejects.toThrow("no longer pending");
  });
});

describe("client approval for an existing subscription", () => {
  async function signedWithApproval() {
    const { repo, signed, lineIds } = await signedWithCheckout();
    signed.billing_links[0].metadata = {
      requires_checkout: true,
      checkout: [],
      approval: [
        {
          id: "approve:month",
          kind: "add",
          subscription_id: "sub_1",
          payment_method: "pm_1",
          card: { brand: "visa", last4: "4242" },
          line_ids: lineIds,
          items: [],
          interval: "month",
          first_charge: 1_900_000_000,
        },
      ],
    };
    await repo.save(signed, signed.revision);
    return { repo, signed: (await repo.get(signed.id))!, lineIds };
  }

  it("adds only after approval, then records it and emails the client", async () => {
    const { repo, signed, lineIds } = await signedWithApproval();
    const applied: string[] = [];
    const provider = {
      applyApproval: async (
        _c: unknown,
        _lines: unknown,
        approval: { id: string },
      ) => {
        applied.push(approval.id);
        return {
          id: "sub_1",
          line_ids: lineIds,
          items: [],
          monthly_total: 12500,
          yearly_total: 0,
        };
      },
    } as unknown as StripeProvider;
    await approveBilling(repo, provider, signed, "approve:month");
    expect(applied).toEqual(["approve:month"]);
    const saved = (await repo.get(signed.id))!;
    const meta = saved.billing_links[0].metadata!;
    expect(meta.approval).toEqual([]);
    expect(meta.requires_checkout).toBe(false);
    expect((meta.added_existing as { id: string }[])[0].id).toBe("sub_1");
    expect(saved.events.at(-1)?.type).toBe("billing_approved");
    expect(
      saved.jobs.find((j) => j.id.endsWith(":billing-added:approve:month"))
        ?.payload.email_template_key,
    ).toBe("billing_updated");
    await expect(
      approveBilling(repo, provider, saved, "approve:month"),
    ).rejects.toThrow("no longer pending");
  });

  it("hands a changed card or duplicate to staff instead of charging", async () => {
    const { repo, signed } = await signedWithApproval();
    const provider = {
      applyApproval: async () => {
        throw new NeedsReview("The subscription or card on file changed");
      },
    } as unknown as StripeProvider;
    await expect(
      approveBilling(repo, provider, signed, "approve:month"),
    ).rejects.toThrow("We’ve let the sender know");
    const saved = (await repo.get(signed.id))!;
    expect(saved.billing_links[0].status).toBe("needs_review");
    expect(saved.billing_links[0].last_error).toMatch(/card on file changed/);
  });
});
