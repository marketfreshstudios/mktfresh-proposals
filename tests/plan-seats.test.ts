import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { teamFixture } from "./fixtures/team";
import { seatLimit, seatsInUse, TRIAL_SEATS } from "../src/lib/plan-seats";
import {
  addSeat,
  forgetPrices,
  previewAddSeat,
  type BillingStore,
  type StripeApi,
} from "../src/lib/yeswell-billing";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => forgetPrices());

describe("seats", () => {
  it("trials get 5, subscriptions their people, not-billed workspaces no limit", () => {
    expect(
      seatLimit({
        plan_status: "trial",
        stripe_subscription_id: null,
        subscription: null,
      }),
    ).toBe(TRIAL_SEATS);
    expect(
      seatLimit({
        plan_status: "active",
        stripe_subscription_id: "sub_1",
        subscription: { people: 3 },
      }),
    ).toBe(3);
    expect(
      seatLimit({
        plan_status: "active",
        stripe_subscription_id: null,
        subscription: null,
      }),
    ).toBeNull();
    expect(
      seatsInUse([
        { status: "active" },
        { status: "invited" },
        { status: "deactivated" },
      ]),
    ).toBe(2);
  });
  it("refuses invites and reactivations when every seat is in use", async () => {
    vi.stubEnv("LOCAL_SEAT_LIMIT", "2");
    const f = await teamFixture();
    const id = f.member.actor.slice(6);
    await expect(
      f.team.invite(f.admin, {
        email: "new@example.test",
        display_name: "New",
      }),
    ).rejects.toMatchObject({
      status: 402,
      code: "SEAT_LIMIT",
      message:
        "All 2 people on your plan are in use. Add a person to your plan first.",
    });
    // A deactivated person frees a seat; bringing them back needs one again.
    await f.team.change(f.admin, id, { action: "deactivate" });
    const added = await f.team.invite(f.admin, {
      email: "new@example.test",
      display_name: "New",
    });
    expect(added.invited).toBe(true);
    await expect(
      f.team.change(f.admin, id, { action: "reactivate" }),
    ).rejects.toMatchObject({ code: "SEAT_LIMIT" });
    vi.stubEnv("LOCAL_SEAT_LIMIT", "3");
    await f.team.change(f.admin, id, { action: "reactivate" });
    expect((await f.store.get(id))!.status).not.toBe("deactivated");
  });
});

describe("adding a person", () => {
  const sub = (seatQty?: number) => ({
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_plan",
          price: { id: "p", lookup_key: "yeswell_studio_monthly" },
          quantity: 1,
          current_period_end: 1797206400,
        },
        ...(seatQty
          ? [
              {
                id: "si_seat",
                price: { id: "ps", lookup_key: "yeswell_seat_monthly" },
                quantity: seatQty,
              },
            ]
          : []),
      ],
    },
  });
  function fakes(current: any) {
    const posts: { path: string; params: any; key?: string }[] = [];
    const synced: any[] = [];
    const stripe: StripeApi = {
      async get(path) {
        if (path === "/v1/prices")
          return {
            data: [{ id: "price_seat_m", lookup_key: "yeswell_seat_monthly" }],
          } as any;
        return current as any;
      },
      async post(path, params, key) {
        posts.push({ path, params, key });
        if (path === "/v1/invoices/create_preview")
          return { amount_due: 750, currency: "usd" } as any;
        return {
          ...current,
          items: {
            data: [
              ...current.items.data.filter((i: any) => i.id !== "si_seat"),
              {
                id: "si_seat",
                price: { id: "ps", lookup_key: "yeswell_seat_monthly" },
                quantity: (params as any).items[0].quantity,
              },
            ],
          },
        } as any;
      },
    };
    const store = {
      workspace: async () => ({
        id: "w",
        name: "N",
        slug: "n",
        plan_status: "active",
        trial_ends_at: null,
        stripe_customer_id: "cus_1",
        stripe_subscription_id: "sub_1",
        subscription: null,
        launch_price: true,
      }),
      sync: async (...a: any[]) => (synced.push(a), "active"),
    } as unknown as BillingStore;
    return { stripe, store, posts, synced };
  }
  it("previews today's prorated charge from Stripe", async () => {
    const f = fakes(sub(1));
    expect(await previewAddSeat(f.stripe, f.store, "w")).toMatchObject({
      people_now: 3,
      people_after: 4,
      due_today_cents: 750,
      interval: "month",
    });
    expect(f.posts[0].params).toEqual({
      customer: "cus_1",
      subscription: "sub_1",
      subscription_details: {
        items: [{ id: "si_seat", quantity: 2 }],
        proration_behavior: "always_invoice",
      },
    });
  });
  it("adds one seat and charges now, adding the seat line when there was none", async () => {
    const f = fakes(sub());
    expect(await addSeat(f.stripe, f.store, "w")).toEqual({ people: 3 });
    const update = f.posts.find((p) => p.path === "/v1/subscriptions/sub_1")!;
    expect(update.params).toEqual({
      items: [{ price: "price_seat_m", quantity: 1 }],
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
    expect(update.key).toBe("yeswell-seat-sub_1-3");
    expect(f.synced[0][4]).toMatchObject({ people: 3 });
  });
});
