import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AfterSigning,
  afterSigningView,
  type AfterSigningProps,
} from "../src/components/after-signing";

const base = {
  completed: false,
  step: "billing" as const,
  requiresCheckout: false,
  billingProblem: false,
  bankState: undefined,
  returned: false,
  returnConfirmed: false,
  returnTimedOut: false,
};
describe("afterSigningView", () => {
  it("picks one screen for each situation", () => {
    expect(afterSigningView({ ...base, requiresCheckout: true })).toBe(
      "billing",
    );
    expect(
      afterSigningView({ ...base, requiresCheckout: true, step: "done" }),
    ).toBe("one_step_left");
    expect(afterSigningView({ ...base, returned: true })).toBe("confirming");
    expect(
      afterSigningView({ ...base, returned: true, returnTimedOut: true }),
    ).toBe("still_confirming");
    expect(
      afterSigningView({ ...base, returned: true, returnConfirmed: true }),
    ).toBe("all_set");
    expect(afterSigningView({ ...base, bankState: "processing" })).toBe(
      "bank_processing",
    );
    expect(afterSigningView({ ...base, bankState: "failed" })).toBe(
      "bank_failed",
    );
    expect(
      afterSigningView({
        ...base,
        requiresCheckout: true,
        billingProblem: true,
      }),
    ).toBe("billing_review");
    expect(afterSigningView(base)).toBe("all_set");
    expect(afterSigningView({ ...base, completed: true })).toBe("completed");
  });
});

const line = (id: string, name: string, amount: number, interval: string) =>
  ({ id, name, amount, qty: 1, interval }) as AfterSigningProps["recurring"][0];
const props = (over: Partial<AfterSigningProps>): AfterSigningProps => ({
  view: "billing",
  preview: false,
  firstName: "Dana",
  email: "dana@example.test",
  timezone: "America/New_York",
  currency: "USD",
  studio: "Acme Studio",
  contact: { name: "Jamie Lee", email: "jamie@example.test" },
  signedAt: "2026-11-12T14:41:00.000Z",
  collection: "charge_automatically",
  invoiceMethod: "quickbooks",
  recurring: [line("r1", "Care Standard", 8500, "month")],
  oneTime: [line("o1", "Kickoff", 50000, "one_time")],
  sessions: [
    {
      id: "cs_1",
      url: "https://checkout.example.test",
      mode: "subscription",
      lines: [line("r1", "Care Standard", 8500, "month")],
    },
  ],
  approvals: [],
  confirmations: [],
  added: [],
  leftCheckout: false,
  checkoutError: "",
  opening: "",
  approving: "",
  files: [{ id: "f1", stage: "client" }],
  showCopy: false,
  onOpen: () => {},
  onApprove: () => {},
  onLater: () => {},
  onFinishBilling: () => {},
  onCheckAgain: () => {},
  onDownload: () => {},
  onToggleCopy: () => {},
  ...over,
});
const html = (over: Partial<AfterSigningProps>) =>
  renderToStaticMarkup(<AfterSigning {...props(over)} />);

describe("AfterSigning", () => {
  it("1a: one success line, separate recurring and one-time cards, one action", () => {
    const out = html({});
    expect(out).toContain("Signed. Thank you, Dana.");
    expect(out).not.toContain("Your proposal is signed. Your copy");
    expect(out).toContain("Set up your monthly billing");
    expect(out).toContain("First payment today");
    expect(out).toContain("Invoiced separately");
    expect(out).toContain("Nothing to pay here.");
    expect(out).toContain("Continue to secure payment");
    expect(out).toContain("I’ll do this later");
    expect(out).not.toMatch(/·|—|…/);
  });
  it("1b: invoiced setup says nothing is due today", () => {
    const out = html({
      collection: "send_invoice",
      sessions: [{ ...props({}).sessions[0], mode: "setup" }],
    });
    expect(out).toContain("Save a card for your monthly billing");
    expect(out).toContain("Due today");
    expect(out).toContain("Save a card");
  });
  it("1d: approval names the card and the amount, nothing added until approved", () => {
    const out = html({
      sessions: [],
      approvals: [
        {
          id: "a1",
          kind: "add",
          card: { brand: "visa", last4: "4242" },
          interval: "month",
          first_charge: Date.parse("2026-12-01T12:00:00Z") / 1000,
          lines: [line("r1", "Care Standard", 8500, "month")],
        },
      ],
    });
    expect(out).toContain("Approve your new monthly service");
    expect(out).toContain("Visa ending 4242");
    expect(out).toContain("Nothing is added until you approve.");
    expect(out).toContain("Approve and add $85/mo");
  });
  it("1e: one card and button per session; finished ones lose the button", () => {
    const out = html({
      sessions: [
        { ...props({}).sessions[0], id: "cs_m" },
        {
          id: "cs_y",
          url: "https://checkout.example.test/y",
          mode: "subscription",
          lines: [line("y1", "Domain", 24000, "year")],
        },
      ],
      confirmations: [
        {
          checkout_session_id: "cs_m",
          mode: "subscription",
          collection_method: "charge_automatically",
          completed_at: "2026-11-12T15:00:00Z",
          currency: "USD",
          items: [],
          card: null,
          next_billing_at: null,
        },
      ],
    });
    expect(out).toContain("Set up your billing in two steps");
    expect(out).toContain("Step 1 of 2 | Monthly");
    expect(out).toContain("Step 2 of 2 | Yearly");
    expect(out.match(/Continue to secure payment/g)).toHaveLength(1);
  });
  it("1f and 1g: preparing and a failed open both stay calm", () => {
    expect(html({ sessions: [] })).toContain(
      "Preparing your secure payment page",
    );
    const failed = html({ checkoutError: "Stripe is unavailable." });
    expect(failed).toContain("The secure payment page didn’t open.");
    expect(failed).toContain("Nothing was charged.");
    expect(failed).toContain("Try again");
  });
  it("1h: billing review names the person and offers no payment button", () => {
    const out = html({ view: "billing_review" });
    expect(out).toContain("Jamie will finish your billing setup");
    expect(out).not.toContain("Continue to secure payment");
    expect(out).toContain("Questions? Email");
  });
  it("2a, 2c and 2d: confirming, still confirming and left checkout", () => {
    expect(html({ view: "confirming" })).toContain("Confirming your payment");
    const still = html({ view: "still_confirming" });
    expect(still).toContain("Still confirming your payment");
    expect(still).toContain("You don’t need to pay again.");
    expect(still).toContain("Check again");
    expect(html({ leftCheckout: true })).toContain(
      "You left the payment page.",
    );
  });
  it("2b: the confirmed card shows what was paid and the next payment", () => {
    const out = html({
      view: "all_set",
      confirmations: [
        {
          checkout_session_id: "cs_1",
          mode: "subscription",
          collection_method: "charge_automatically",
          completed_at: "2026-11-12T15:00:00Z",
          currency: "USD",
          items: [
            {
              id: "r1",
              name: "Care Standard",
              amount: 8500,
              qty: 1,
              interval: "month",
            },
          ],
          card: { brand: "visa", last4: "4242" },
          next_billing_at: "2026-12-12T15:00:00Z",
        },
      ],
    });
    expect(out).toContain("You’re all set, Dana.");
    expect(out).toContain("Monthly billing is set up");
    expect(out).toContain("$85 paid today with Visa ending 4242.");
    expect(out).toContain("Next payment $85 on December 12, 2026.");
  });
  it("2e and 2f: bank payment processing and failed", () => {
    expect(html({ view: "bank_processing" })).toContain(
      "Your bank payment is processing",
    );
    const failed = html({ view: "bank_failed" });
    expect(failed).toContain("Try another way to pay");
    expect(failed).toContain("Email Jamie");
    expect(failed).not.toContain("Signed. Thank you");
  });
  it("3a–3d: later visits", () => {
    const later = html({ view: "one_step_left" });
    expect(later).toContain("One step left: billing");
    expect(later).toContain("Finish billing");
    const none = html({ view: "all_set", recurring: [], sessions: [] });
    expect(none).toContain("You’re all set, Dana.");
    expect(none).toContain("Invoice for $500");
    const done = html({
      view: "completed",
      countersignedAt: "2026-11-13T15:05:00Z",
      files: [{ id: "f2", stage: "company" }],
    });
    expect(done).toContain("Your completed agreement");
    expect(done).toContain("Download the final copy");
    const sealing = html({ view: "all_set", files: [] });
    expect(sealing).toContain("Your signed copy is being prepared.");
    expect(sealing).not.toContain("Download your signed copy");
  });
});
