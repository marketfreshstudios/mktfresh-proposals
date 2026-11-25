import { expect, it } from "vitest";
import {
  billingAwaitsClient,
  deferBilling,
  isBillingNudge,
  scheduleBillingEmails,
} from "../src/lib/billing-nudges";
import { setup, staff, signature, clientActor } from "./helpers";

async function signed() {
  const { service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  p.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      metadata: { requires_checkout: true },
    } as any,
  ];
  p.jobs = p.jobs.filter((j) => !isBillingNudge(p, j));
  return p;
}
const at = (p: any, key: string) =>
  p.jobs.find((j: any) => j.id === `${p.id}:${key}`)?.available_at;

it("schedules one email an hour after signing and reminders at 3 and 7 days", async () => {
  const p = await signed();
  const signedAt = Date.parse(p.client_signed_at!);
  scheduleBillingEmails(p, signedAt + 5_000);
  expect(Date.parse(at(p, "billing-setup"))).toBe(signedAt + 3_600_000);
  expect(Date.parse(at(p, "billing-reminder:3"))).toBe(
    signedAt + 3 * 86_400_000,
  );
  expect(Date.parse(at(p, "billing-reminder:7"))).toBe(
    signedAt + 7 * 86_400_000,
  );
  const job = p.jobs.find((j) => j.id === `${p.id}:billing-setup`)!;
  expect(job.payload.email_template_key).toBe("billing_setup");
});

it("'I'll do this later' sends the first email now, and only once", async () => {
  const p = await signed();
  const signedAt = Date.parse(p.client_signed_at!);
  scheduleBillingEmails(p, signedAt + 5_000);
  const now = new Date(signedAt + 60_000);
  expect(deferBilling(p, clientActor, now)).toBe(true);
  expect(at(p, "billing-setup")).toBe(now.toISOString());
  // Sent: clicking "later" again (e.g. from that email) changes nothing.
  p.jobs.find((j) => j.id === `${p.id}:billing-setup`)!.status = "done";
  expect(deferBilling(p, clientActor, new Date(signedAt + 120_000))).toBe(
    false,
  );
  expect(p.events.filter((e) => e.type === "billing_deferred")).toHaveLength(1);
  // Reminders keep their own schedule.
  expect(Date.parse(at(p, "billing-reminder:3"))).toBe(
    signedAt + 3 * 86_400_000,
  );
});

it("'later' while billing is still being prepared makes the first email go out as soon as it's ready", async () => {
  const p = await signed();
  p.billing_links = [];
  const signedAt = Date.parse(p.client_signed_at!);
  expect(deferBilling(p, clientActor, new Date(signedAt + 2_000))).toBe(false);
  p.billing_links = [
    {
      provider: "stripe",
      status: "succeeded",
      metadata: { requires_checkout: true },
    } as any,
  ];
  scheduleBillingEmails(p, signedAt + 6_000);
  expect(Date.parse(at(p, "billing-setup"))).toBe(signedAt + 6_000);
});

it("billing that is finished, declined or archived gets no emails", async () => {
  const p = await signed();
  expect(billingAwaitsClient(p)).toBe(true);
  p.billing_links[0].metadata = { requires_checkout: false };
  expect(billingAwaitsClient(p)).toBe(false);
  p.billing_links[0].metadata = { requires_checkout: true };
  p.archived_at = new Date().toISOString();
  expect(billingAwaitsClient(p)).toBe(false);
});
