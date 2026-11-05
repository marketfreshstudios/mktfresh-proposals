import { it, expect, vi, afterEach } from "vitest";
import {
  setup,
  staff,
  signature,
  clientActor,
  companyConsent,
} from "./helpers";
import { ReassignmentService } from "../src/lib/reassignment";
import { proposalOwnerId } from "../src/lib/proposal-owner";
import { staffRecipients } from "../src/lib/email-identity";
import { versionHash } from "../src/lib/content";
import { publicResult } from "../src/lib/service";
import { MockMailer, Worker } from "../src/lib/jobs";

import { MockBillingProvider } from "../src/lib/billing";
import { TeamService } from "../src/lib/team";
import { teamFixture } from "./fixtures/team";
afterEach(() => vi.useRealTimers());
const target = {
  user_id: "00000000-0000-4000-8000-000000000002",
  display_name: "Jamie Example",
  email: "jamie@example.test",
  name: "Jamie Example",
  role: "member",
  status: "active",
};
async function fixture() {
  const f = await setup();
  const reassign = new ReassignmentService(f.repo, async () => [
    ...f.members,
    target,
  ]);
  const assign = async (
    id = f.draft.id,
    notify = false,
    actor = staff,
    user_id = target.user_id,
  ) =>
    reassign.reassign(actor, {
      user_id,
      notify,
      proposals: [{ id, revision: (await f.repo.get(id))!.revision }],
    });
  return { ...f, reassign, assign };
}
it("only owning Staff or a super admin may reassign; inactive and foreign targets are rejected", async () => {
  const f = await fixture(),
    other = {
      ...staff,
      staff_role: "member" as const,
      actor: "staff:" + target.user_id,
    };
  await expect(f.assign(f.draft.id, false, other)).rejects.toMatchObject({
    status: 403,
  });
  await f.assign(f.draft.id, false, { ...staff, staff_role: "member" });
  expect(proposalOwnerId((await f.repo.get(f.draft.id))!)).toBe(target.user_id);
  await f.assign(f.draft.id, false, staff, staff.actor.slice(6));
  for (const status of ["invited", "deactivated"]) {
    const service = new ReassignmentService(f.repo, async () => [
      { ...target, status },
    ]);
    await expect(
      service.reassign(staff, {
        user_id: target.user_id,
        notify: false,
        proposals: [
          {
            id: f.draft.id,
            revision: (await f.repo.get(f.draft.id))!.revision,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  }
  await expect(
    f.assign(f.draft.id, false, staff, crypto.randomUUID()),
  ).rejects.toMatchObject({ status: 400 });
});
it("draft ownership changes without rewriting creation history; bulk is all-or-nothing on conflict", async () => {
  const f = await fixture();
  const second = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Second",
    },
    staff,
  );
  await expect(
    f.reassign.reassign(staff, {
      user_id: target.user_id,
      notify: false,
      proposals: [
        { id: f.draft.id, revision: f.draft.revision },
        { id: second.id, revision: 99 },
      ],
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await f.repo.get(f.draft.id))!.owner).toBeUndefined();
  await f.assign();
  const p = (await f.repo.get(f.draft.id))!;
  expect(p.created_by).toBe(staff.actor);
  expect(p.sender).toBeUndefined();
  expect(p.token).toBeNull();
  expect(p.versions).toEqual([]);
  expect(p.events.at(-1)).toMatchObject({
    type: "reassigned",
    actor: staff.actor,
    metadata: {
      previous_name: "Alex Morgan",
      owner_name: "Jamie Example",
      actor_name: "Alex Morgan",
    },
  });
  expect(
    (await f.repo.entities<any>("workspace_events")).at(-1).metadata
      .proposal_id,
  ).toBe(p.id);
});
it("sent reassignment updates the next reminder and contact, with no new version, link, client email or past-email change", async () => {
  const f = await fixture();
  await f.service.send(f.draft.id, staff);
  const sent = (await f.repo.get(f.draft.id))!;
  // Treat existing send jobs as delivered and preserve their immutable snapshots.
  sent.jobs.forEach((j) => (j.status = "done"));
  await f.repo.save({ ...sent, revision: sent.revision + 1 }, sent.revision);
  const past = {
    id: crypto.randomUUID(),
    proposal_id: sent.id,
    snapshot: {
      subject: "Past email",
      from: "Original",
      html: "Original rendered email",
    },
  };
  await f.repo.put("email_log", past);
  const before = (await f.repo.get(sent.id))!;
  await f.assign(sent.id, true);
  let p = (await f.repo.get(sent.id))!;
  expect(p.versions).toEqual(before.versions);
  expect(p.token).toBe(before.token);
  expect(p.pagination).toEqual(before.pagination);
  expect(versionHash(p.versions.at(-1)!)).toBe(
    before.versions.at(-1)!.content_hash,
  );
  expect(publicResult(p).contact).toEqual({
    name: target.display_name,
    email: target.email,
  });
  const mailer = new MockMailer(),
    worker = new Worker(
      f.repo,
      { put: async () => {}, get: async () => new Uint8Array() },
      mailer,
      {
        stripe: new MockBillingProvider("stripe"),
        qbo: new MockBillingProvider("qbo"),
      },
    );
  await worker.drain(p.id, "email");
  expect(mailer.sent.size).toBe(1);
  expect(([...mailer.sent.values()] as any[])[0].to).toBe(target.email);
  expect(([...mailer.sent.values()] as any[])[0].subject).toBe(
    `Alex Morgan assigned you ${p.title}`,
  );
  await worker.drain(p.id, "email");
  expect(mailer.sent.size).toBe(1);
  const now = new Date(Date.parse(p.sent_at!) + 3 * 86400000 + 1000);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  f.service.clock = () => now;
  await f.service.tick();
  await worker.drain(p.id, "email");
  expect(([...mailer.sent.values()] as any[]).at(-1)).toMatchObject({
    to: p.client.email,
    reply_to: target.email,
  });
  expect(([...mailer.sent.values()] as any[]).at(-1)!.from).toContain(
    target.display_name,
  );
  expect(
    (await f.repo.emailLog<any>(p.id)).find((e) => e.id === past.id),
  ).toEqual(past);
});
it("signed reassignment only changes internal ownership; files, signers, PDF inputs, hashes and sender remain exact", async () => {
  const f = await fixture();
  await f.service.send(f.draft.id, staff);
  let p = (await f.repo.get(f.draft.id))!;
  await f.service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  p = (await f.repo.get(p.id))!;
  p.files.push({
    id: crypto.randomUUID(),
    kind: "sealed",
    storage_path: "immutable/sealed.pdf",
    sha256: "unchanged",
    bytes: 100,
    created_at: new Date().toISOString(),
  });
  await f.repo.save({ ...p, revision: p.revision + 1 }, p.revision);
  const before = (await f.repo.get(p.id))!;
  await f.assign(p.id, false);
  p = (await f.repo.get(p.id))!;
  for (const key of [
    "versions",
    "sender",
    "files",
    "signers",
    "pagination",
    "token",
    "content",
    "quote",
  ] as const)
    expect(p[key]).toEqual(before[key]);
  expect(p.owner?.user_id).toBe(target.user_id);
});
it("bulk reassignment permits removal while keeping created_by and historical senders", async () => {
  const f = await teamFixture();
  const person = (await f.team.list()).find((p) => p.role === "member")!;
  const draft = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Assigned draft",
    },
    { ...f.admin, actor: "staff:" + person.user_id },
  );
  await expect(
    f.team.change(f.admin, person.user_id, { action: "remove" }),
  ).rejects.toMatchObject({ status: 409 });
  const assignments = new ReassignmentService(f.repo, async () =>
    f.team.list(),
  );
  const work = await assignments.work(f.admin, person.user_id);
  await assignments.reassign(f.admin, {
    from_user_id: person.user_id,
    user_id: f.admin.actor.slice(6),
    notify: false,
    proposals: work.map((p) => ({ id: p.id, revision: p.revision })),
  });
  await f.team.change(f.admin, person.user_id, { action: "remove" });
  expect(await f.store.get(person.user_id)).toBeNull();
  expect((await f.repo.get(draft.id))!.created_by).toBe(
    "staff:" + person.user_id,
  );
});

it("closed and archived handoffs only change internal ownership, and no-op handoffs send nothing", async () => {
  for (const status of [
    "completed",
    "declined",
    "expired",
    "archived",
  ] as const) {
    const f = await fixture();
    await f.service.send(f.draft.id, staff);
    const before = (await f.repo.get(f.draft.id))!;
    before.status = status;
    if (status === "archived") before.archived_at = new Date().toISOString();
    await f.repo.save(
      { ...before, revision: before.revision + 1 },
      before.revision,
    );
    await f.assign();
    const p = (await f.repo.get(before.id))!;
    expect(p.sender).toEqual(before.sender);
    expect(p.versions).toEqual(before.versions);
    expect(p.jobs).toEqual(before.jobs);
    expect(p.token).toBe(before.token);
    expect(staffRecipients(p)).toEqual([target.email]);
    const revision = p.revision,
      count = p.events.length;
    expect(await f.assign()).toEqual([]);
    const unchanged = (await f.repo.get(p.id))!;
    expect(unchanged.revision).toBe(revision);
    expect(unchanged.events).toHaveLength(count);
  }
});
it("pending reminder jobs adopt the live sender; AI and off-domain live senders are refused", async () => {
  const f = await fixture();
  const p = await f.service.send(f.draft.id, staff);
  await expect(
    f.assign(p.id, false, { ...staff, actor: "ai:connector" }),
  ).rejects.toMatchObject({ status: 403 });
  const offDomain = new ReassignmentService(f.repo, async () => [
    { ...target, email: "jamie@other.test" },
  ]);
  await expect(
    offDomain.reassign(staff, {
      user_id: target.user_id,
      notify: false,
      proposals: [{ id: p.id, revision: p.revision }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  f.service.clock = () => new Date(Date.now() + 4 * 86400000);
  await f.service.tick();
  await f.assign();
  const after = (await f.repo.get(p.id))!;
  const reminder = after.jobs.find((j) => j.payload.reminder_day)!;
  expect(reminder.payload.reply_to).toBe(target.email);
  expect(reminder.payload.from).toContain(target.display_name);
  expect(reminder.payload.to).toBe(p.client.email);
  expect(after.versions).toEqual(p.versions);
});

it("a draft assignment notification retains normal retries and emits a final staff-only failure alert without needing a client sender", async () => {
  const f = await fixture();
  await f.assign(f.draft.id, true);
  let fail = true;
  const messages: any[] = [];
  const worker = new Worker(
    f.repo,
    { put: async () => {}, get: async () => new Uint8Array() },
    {
      send: async (m) => {
        if (fail) throw new Error("Delivery unavailable");
        messages.push(m);
      },
    },
    {
      stripe: new MockBillingProvider("stripe"),
      qbo: new MockBillingProvider("qbo"),
    },
  );
  const job = (await f.repo.get(f.draft.id))!.jobs[0];
  for (let i = 0; i < 5; i++) {
    const p = (await f.repo.get(f.draft.id))!;
    p.jobs.find((j) => j.id === job.id)!.available_at =
      new Date().toISOString();
    await f.repo.save({ ...p, revision: p.revision + 1 }, p.revision);
    await worker.drain(p.id, "email", job.id);
  }
  const failed = (await f.repo.get(f.draft.id))!;
  expect(failed.jobs.find((j) => j.id === job.id)!.status).toBe("failed");
  expect(failed.jobs.filter((j) => j.payload.job_failure)).toHaveLength(1);
  expect(failed.sender).toBeUndefined();
  fail = false;
  await worker.drain(f.draft.id, "email");
  expect(messages).toHaveLength(1);
  expect(messages[0].to).toBe(target.email);
  expect(messages[0].subject).toContain("Email delivery needs attention");
});
