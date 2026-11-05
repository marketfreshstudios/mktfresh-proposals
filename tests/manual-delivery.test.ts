import { it, expect, vi, afterEach } from "vitest";
import {
  setup,
  staff,
  signature,
  clientActor,
  companyConsent,
} from "./helpers";
import { Worker, MockMailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { versionHash, passwordMatches, sha256 } from "../src/lib/content";
import { eventLabel } from "../src/lib/event-label";
import { proposalAction } from "../src/lib/proposal-actions";
import { automaticRemindersEnabled } from "../src/lib/delivery";
import type { Proposal } from "../src/lib/model";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function fixture() {
  const f = await setup();
  const mailer = new MockMailer(),
    bytes = Buffer.from("mock signed PDF");
  const worker = new Worker(
    f.repo,
    { put: async () => {}, get: async () => bytes },
    mailer,
    {
      stripe: new MockBillingProvider("stripe"),
      qbo: new MockBillingProvider("qbo"),
    },
    async () => ({ body: bytes, pdf: bytes, bodyHash: sha256(bytes) }),
  );
  const plan = {
    format: 1 as const,
    pages: 2,
    starts: [
      {
        page: 2,
        block: f.draft.content.find((b) => b.type !== "page_break")!.id!,
        offset: 0,
        explicit: true,
      },
    ],
  };
  const send = () =>
    f.service.send(f.draft.id, staff, false, undefined, {
      delivery_method: "manual",
      pagination: plan,
      expected_revision: f.repo.rows.get(f.draft.id)!.revision,
    });
  return { ...f, mailer, worker, send, plan };
}
it("manual delivery publishes the same version and plan as email delivery, with no client email or email log", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  const f = await fixture();
  f.service.clock = () => new Date(f.draft.created_at);
  const before = (await f.repo.get(f.draft.id))!;
  const p = await f.send();
  expect(p.status).toBe("sent");
  expect(p.token).toHaveLength(43);
  expect(p.delivery_method).toBe("manual");
  expect(p.automatic_reminders).toBe(false);
  expect(p.sent_at).toBeTruthy();
  expect(p.sender?.user_id).toBe(staff.actor.slice(6));
  expect(p.versions).toHaveLength(1);
  expect(p.versions[0].pagination).toEqual(f.plan);
  expect(p.versions[0].content_hash).toBe(versionHash(p.versions[0]));
  expect(eventLabel(p.events.at(-1)!)).toBe(
    "Sent manually by Alex Morgan (link copied, no email from the app)",
  );
  expect(p.jobs).toEqual([]);
  await f.worker.drain(p.id);
  expect(f.mailer.sent.size).toBe(0);
  expect(await f.repo.emailLog(p.id)).toEqual([]);
  // The delivery flag is outside the version and its hash; a normal send creates
  // the same document snapshot, with only its mail job and delivery policy different.
  f.repo.rows.set(before.id, before);
  const normal = await f.service.send(before.id, staff, false, undefined, {
    pagination: f.plan,
  });
  expect(normal.versions[0].content_hash).toBe(p.versions[0].content_hash);
  expect(normal.versions[0].pagination).toEqual(p.versions[0].pagination);
  expect(normal.jobs.some((j) => j.payload.proposal_email)).toBe(true);
  expect(automaticRemindersEnabled(normal)).toBe(true);
});
it("manual delivery enforces the same readiness, AI confirmation, sender, password and revision checks", async () => {
  const f = await fixture();
  let p = await f.service.edit(
    f.draft.id,
    {
      revision: 0,
      content: f.draft.content.filter((b) => b.type !== "pricing_table"),
    },
    staff,
  );
  for (const delivery_method of ["email", "manual"] as const)
    await expect(
      f.service.send(p.id, staff, false, undefined, { delivery_method }),
    ).rejects.toThrow("Add a pricing table");
  expect((await f.repo.get(p.id))!.token).toBeNull();
  p = await f.service.edit(
    p.id,
    {
      revision: p.revision,
      content: f.draft.content.map((b) => ({
        ...b,
        ai_review: { reviewed: false, source: "assistant" },
      })),
    },
    staff,
  );
  await expect(
    f.service.send(p.id, staff, false, undefined, {
      delivery_method: "manual",
    }),
  ).rejects.toThrow("review");
  await expect(
    f.service.send(p.id, staff, true, crypto.randomUUID(), {
      delivery_method: "manual",
    }),
  ).rejects.toThrow("sender");
  await expect(
    f.service.send(p.id, staff, true, undefined, {
      delivery_method: "manual",
      expected_revision: 0,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const sent = await f.service.send(p.id, staff, true, undefined, {
    delivery_method: "manual",
    password: "client-password",
    pagination: { format: 1, pages: 1, starts: [] },
  });
  expect(passwordMatches("client-password", sent.password_hash!)).toBe(true);
  expect(sent.content.every((b) => !b.ai_review || b.ai_review.reviewed)).toBe(
    true,
  );
  expect(sent.jobs).toEqual([]);
});
it("manual delivery does not depend on an email template, and AI cannot publish in either mode", async () => {
  const f = await fixture();
  const original = f.repo.entities.bind(f.repo);
  vi.spyOn(f.repo, "entities").mockImplementation((async (table: string) => {
    if (table === "email_templates") throw new Error("Template unavailable");
    return original(table as any);
  }) as any);
  const p = await f.send();
  expect(p.token).toBeTruthy();
  for (const delivery_method of ["email", "manual"] as const)
    await expect(
      f.service.send(
        p.id,
        { ...staff, actor: "ai:assistant" },
        false,
        undefined,
        { delivery_method },
      ),
    ).rejects.toMatchObject({ status: 403 });
});
it("manual proposals expire normally, while automatic client emails stay off until explicitly enabled", async () => {
  const f = await fixture(),
    p = await f.send();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 4 * 86400000);
  f.service.clock = () => new Date();
  await f.service.tick();
  await f.worker.drain(p.id);
  expect(f.mailer.sent.size).toBe(0);
  expect((await f.repo.get(p.id))!.jobs).toEqual([]);
  let current = (await f.repo.get(p.id))!;
  const enabled = await f.service.setAutomaticReminders(
    p.id,
    current.revision,
    true,
    staff,
  );
  expect(enabled.versions).toEqual(p.versions);
  expect(enabled.token).toBe(p.token);
  expect(enabled.events.at(-1)).toMatchObject({
    type: "automatic_reminders_changed",
    metadata: { enabled: true },
  });
  await f.service.tick();
  await f.worker.drain(p.id);
  expect([...f.mailer.sent.values()]).toEqual([
    expect.objectContaining({ to: p.client.email }),
  ]);
  current = (await f.repo.get(p.id))!;
  await f.service.setAutomaticReminders(p.id, current.revision, false, staff);
  vi.setSystemTime(Date.parse(p.valid_until!) + 1000);
  await f.service.tick();
  expect((await f.repo.get(p.id))!.status).toBe("expired");
  expect(f.mailer.sent.size).toBe(1);
});
it("disabling reminders gates already queued automatic jobs but on-demand reminders still work after live edits", async () => {
  const f = await fixture(),
    p = await f.send();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 4 * 86400000);
  f.service.clock = () => new Date();
  let current = await f.service.setAutomaticReminders(
    p.id,
    p.revision,
    true,
    staff,
  );
  await f.service.tick();
  current = (await f.repo.get(p.id))!;
  await f.service.setAutomaticReminders(p.id, current.revision, false, staff);
  await f.worker.drain(p.id);
  expect(f.mailer.sent.size).toBe(0);
  current = (await f.repo.get(p.id))!;
  current = await f.service.edit(
    p.id,
    { revision: current.revision, title: "Updated after manual send" },
    staff,
  );
  expect(current.token).toBe(p.token);
  expect(current.delivery_method).toBe("manual");
  await proposalAction(f.repo, p.id, current.revision, "remind", staff);
  await f.worker.drain(p.id);
  expect(f.mailer.sent.size).toBe(1);
  expect((await f.repo.emailLog<any>(p.id))[0].snapshot.template_key).toMatch(
    /^reminder_/,
  );
  current = (await f.repo.get(p.id))!;
  await f.service.setAutomaticReminders(p.id, current.revision, true, staff);
  await f.worker.drain(p.id);
  expect(f.mailer.sent.size).toBe(2);
});
it("viewing, both signatures and their client copies still work on the same manually published link", async () => {
  const f = await fixture();
  const sent = await f.send();
  let p = await f.service.view(sent.token!, "", clientActor);
  expect(p.status).toBe("viewed");
  expect(p.jobs.every((j) => j.payload.to !== p.client.email)).toBe(true);
  p = await f.service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: sent.token!,
    password: "",
  });
  await f.worker.drain(p.id);
  expect(
    [...f.mailer.sent.values()].some(
      (m: any) => m.to === p.client.email && m.attachments,
    ),
  ).toBe(true);
  p = (await f.repo.get(p.id))!;
  p = await f.service.sign(
    p.id,
    companyConsent(p.revision, f.settings),
    "company",
    staff,
  );
  await f.worker.drain(p.id);
  expect(
    (await f.repo.get(p.id))!.files.some(
      (file) => file.stage === "company" && file.kind === "sealed",
    ),
  ).toBe(true);
  expect(p.token).toBe(sent.token);
  expect(p.versions[0].frozen).toBe(true);
});
it("manual mode keeps one token on another publication and duplication restores email-default policy", async () => {
  const f = await fixture();
  let p = await f.send();
  const token = p.token;
  p = await f.service.send(p.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  expect(p.token).toBe(token);
  expect(p.versions).toHaveLength(2);
  expect(p.jobs).toEqual([]);
  const copy = await proposalAction(
    f.repo,
    p.id,
    p.revision,
    "duplicate",
    staff,
  );
  expect(copy.delivery_method).toBeUndefined();
  expect(copy.automatic_reminders).toBeUndefined();
  expect(copy.token).toBeNull();
  expect(automaticRemindersEnabled(copy)).toBe(true);
});
