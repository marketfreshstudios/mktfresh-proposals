import { describe, expect, it } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import { freshCheckoutUrl } from "../src/lib/checkout-refresh";
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

  it("never re-creates billing for a customer who now has an active subscription", async () => {
    const { repo, signed } = await signedWithCheckout();
    const { provider, created } = fakeStripe(
      { status: "expired", url: null, expires_at: 0 },
      [{ id: "sub_1" }],
    );
    await expect(
      freshCheckoutUrl(repo, provider, signed, "cs_old"),
    ).rejects.toThrow("Payment setup needs staff review");
    expect(created).toEqual([]);
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
