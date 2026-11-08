import { ReassignmentService } from "../src/lib/reassignment";
import { afterEach, expect, it, vi } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import { Worker, MockMailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { mutate } from "../src/lib/repository";
import { type EmailLog } from "../src/lib/email-templates";
import {
  automaticRemindersEnabled,
  isAutomaticReminder,
} from "../src/lib/delivery";
import { proposalAction } from "../src/lib/proposal-actions";
import { cycleViewedAt, countersignDue } from "../src/lib/reminders";
import {
  WorkspaceSettingsSchema,
  type WorkspaceSettings,
} from "../src/lib/workspace";
import { eventLabel } from "../src/lib/event-label";

const reminderDeliveries = (f: { mailer: MockMailer }) =>
  [...f.mailer.sent.entries()].filter(([key]) =>
    /:reminder:|:manual-reminder:|:countersign-reminder:/.test(key),
  );
const start = "2026-03-06T14:00:00.000Z";
const rules = {
  enabled: true,
  unopened_days: 1,
  viewed_days: 2,
  stop_after: 3,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function fixture(
  patch: Partial<WorkspaceSettings> = { reminder_rules: rules },
) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(start));
  const f = await setup();
  await f.repo.put("workspace_settings", { ...f.settings, ...patch });
  const sent = await f.service.send(f.draft.id, staff);
  await mutate(f.repo, sent.id, (p) => {
    p.jobs = [];
  }); // Isolate scheduled mail from the initial Send.
  const mailer = new MockMailer();
  const worker = new Worker(
    f.repo,
    { get: async () => new Uint8Array(), put: async () => {} },
    mailer,
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
  );
  const now = (at: string) => {
    vi.setSystemTime(new Date(at));
    f.service.clock = () => new Date();
  };
  const row = async () => (await f.repo.get(sent.id))!;
  const run = async () => {
    await f.service.tick();
    await worker.drain(sent.id, "email");
  };
  return { ...f, sent, mailer, worker, now, row, run };
}
it("repeats in workspace calendar days across DST, switches on first view, and shares one cap", async () => {
  const f = await fixture();
  f.now("2026-03-07T13:59:59Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(0);
  f.now("2026-03-07T14:00:00Z");
  await Promise.all([f.service.tick(), f.service.tick()]);
  await Promise.all([f.worker.drain(f.sent.id), f.worker.drain(f.sent.id)]);
  expect(reminderDeliveries(f).length).toBe(1);
  expect(
    (await f.repo.emailLog<EmailLog>(f.sent.id))[0].snapshot.template_key,
  ).toBe("reminder_unopened");
  f.now("2026-03-07T20:00:00Z");
  await f.service.view(f.sent.token!, "", clientActor);
  f.now("2026-03-09T18:59:59Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(1);
  f.now("2026-03-09T19:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(2);
  await f.service.view(f.sent.token!, "", clientActor); // Another visit never resets the first-view clock.
  expect(cycleViewedAt(await f.row())).toBe("2026-03-07T20:00:00.000Z");
  f.now("2026-03-11T19:00:00Z");
  await f.run();
  f.now("2026-03-25T19:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(3);
  const logs = await f.repo.emailLog<EmailLog>(f.sent.id);
  expect(
    logs
      .filter((l) => l.snapshot.template_key.startsWith("reminder_"))
      .map((l) => l.snapshot.template_key),
  ).toEqual(["reminder_unopened", "reminder_viewed", "reminder_viewed"]);
  const events = (await f.row()).events.filter(
    (e) => e.type === "reminder_sent",
  );
  expect(events).toHaveLength(3);
  expect(events.map((e) => e.metadata.due_at)).toEqual([
    "2026-03-07T14:00:00.000Z",
    "2026-03-09T19:00:00.000Z",
    "2026-03-11T19:00:00.000Z",
  ]);
  expect(eventLabel(events[0])).toBe("Automatic reminder emailed · unopened");
  expect((await f.row()).versions).toEqual(f.sent.versions);
});
it("keeps exact legacy elapsed offsets and snapshots, even after workspace rules change", async () => {
  const f = await fixture({ reminder_days: [2, 5] });
  expect(
    WorkspaceSettingsSchema.parse(f.settings).reminder_rules,
  ).toBeUndefined();
  await f.repo.put("workspace_settings", {
    ...f.settings,
    reminder_rules: rules,
  });
  f.now("2026-03-08T13:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(0); // A calendar-day migration would change this by an hour.
  f.now("2026-03-08T14:00:00Z");
  await f.run();
  f.now("2026-03-11T14:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(2);
  expect(
    (await f.row()).jobs
      .filter(isAutomaticReminder)
      .map((j) => j.payload.reminder_day),
  ).toEqual([2, 5]);
  expect((await f.row()).workspace_settings!.reminder_rules).toBeUndefined();
  const resent = await f.service.send(f.sent.id, staff);
  expect(resent.workspace_settings!.reminder_rules).toEqual(rules);
  expect(cycleViewedAt(resent)).toBeNull();
});
it("resend/reopen adopts new settings and a new first-view clock, but the per-proposal cap never resets", async () => {
  const f = await fixture({ reminder_rules: { ...rules, stop_after: 1 } });
  f.now("2026-03-07T14:00:00Z");
  await f.run();
  await f.service.view(f.sent.token!, "", clientActor);
  await f.repo.put("workspace_settings", {
    ...f.settings,
    reminder_rules: { ...rules, stop_after: 2 },
    email_reply_to: "workspace",
  });
  let p = await f.service.send(f.sent.id, staff);
  expect(cycleViewedAt(p)).toBeNull();
  await mutate(f.repo, p.id, (row) => {
    row.jobs = row.jobs.filter((j) => !j.id.includes(":send:"));
  });
  f.now("2026-03-08T13:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(2);
  await f.service.view(f.sent.token!, "", clientActor);
  expect(cycleViewedAt(await f.row())).toBe("2026-03-08T13:00:00.000Z");
  p = await f.row();
  p = await proposalAction(f.repo, p.id, p.revision, "mark_lost", staff);
  p = await proposalAction(
    f.repo,
    p.id,
    p.revision,
    "mark_sent",
    staff,
    "",
    new Date(),
    f.service,
  );
  expect(p.workspace_settings!.reminder_rules!.stop_after).toBe(2);
  expect(p.workspace_settings!.email_reply_to).toBe("workspace");
  f.now("2026-03-20T14:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(2);
});
it("a first view cancels queued unopened mail; the viewed rule gets its own due times", async () => {
  const f = await fixture();
  f.now("2026-03-07T14:00:00Z");
  await f.service.tick();
  await f.service.view(f.sent.token!, "", clientActor);
  await f.worker.drain(f.sent.id, "email");
  expect(reminderDeliveries(f).length).toBe(0);
  f.now("2026-03-09T13:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(1);
  expect(
    (await f.repo.emailLog<EmailLog>(f.sent.id)).find(
      (l) => l.snapshot.to === f.sent.client.email,
    )!.snapshot.template_key,
  ).toBe("reminder_viewed");
});
it.each([
  "signed",
  "declined",
  "expired",
  "archived",
  "archived_at",
  "off",
  "expiry",
  "workspace_off",
])("queued client reminders are suppressed after %s", async (change) => {
  const f = await fixture();
  f.now("2026-03-07T14:00:00Z");
  await f.service.tick();
  await mutate(f.repo, f.sent.id, (p) => {
    if (change === "signed") {
      p.status = "signed_by_client";
      p.signers.push({ role: "client" } as any);
    } else if (change === "off") p.automatic_reminders = false;
    else if (change === "workspace_off")
      p.workspace_settings!.reminder_rules!.enabled = false;
    else if (change === "archived_at") p.archived_at = new Date().toISOString();
    else if (change === "expiry")
      p.published_state!.valid_until = new Date().toISOString();
    else p.status = change as any;
  });
  await f.worker.drain(f.sent.id, "email");
  expect(reminderDeliveries(f).length).toBe(0);
  expect(
    (await f.row()).events.filter((e) => e.type === "reminder_sent"),
  ).toEqual([]);
});
it("rechecks after rendering/log I/O, so a newly declined proposal gets no queued reminder", async () => {
  const f = await fixture();
  f.now("2026-03-07T14:00:00Z");
  await f.service.tick();
  const original = f.repo.emailLog.bind(f.repo);
  vi.spyOn(f.repo, "emailLog").mockImplementation(async (id) => {
    await mutate(f.repo, id, (p) => {
      p.status = "declined";
    });
    return original(id);
  });
  await f.worker.drain(f.sent.id, "email");
  expect(reminderDeliveries(f).length).toBe(0);
});
it("overlapping workers hold one durable lease and reserve only the capped number of reminders", async () => {
  const f = await fixture({ reminder_rules: { ...rules, stop_after: 1 } });
  f.now("2026-03-20T14:00:00Z");
  await Promise.all([f.service.tick(), f.service.tick()]);
  expect((await f.row()).jobs.filter(isAutomaticReminder)).toHaveLength(1);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const original = f.mailer.send.bind(f.mailer);
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const spy = vi
    .spyOn(f.mailer, "send")
    .mockImplementation(async (data, key) => {
      entered();
      await gate;
      await original(data, key);
    });
  const first = f.worker.drain(f.sent.id, "email");
  await started;
  await f.worker.drain(f.sent.id, "email");
  release();
  await first;
  expect(spy).toHaveBeenCalledTimes(1);
  expect(
    (await f.row()).events.filter((e) => e.type === "reminder_sent"),
  ).toHaveLength(1);
  expect(await f.repo.emailLog(f.sent.id)).toHaveLength(1);
});
it("manual delivery stays off, and on-demand reminders neither use nor reset the automatic cap", async () => {
  const f = await fixture({ reminder_rules: { ...rules, stop_after: 1 } });
  const manual = await f.service.send(f.sent.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  await mutate(f.repo, manual.id, (p) => {
    p.jobs = [];
  });
  expect(automaticRemindersEnabled(manual)).toBe(false);
  f.now("2026-03-07T14:00:00Z");
  await f.run();
  expect(reminderDeliveries(f).length).toBe(0);
  let p = await f.row();
  await proposalAction(f.repo, p.id, p.revision, "remind", staff);
  await f.worker.drain(p.id, "email");
  expect(reminderDeliveries(f).length).toBe(1);
  p = await f.row();
  await f.service.setAutomaticReminders(p.id, p.revision, true, staff);
  await f.run();
  expect(reminderDeliveries(f).length).toBe(2);
  expect(
    (await f.row()).events.filter(
      (e) => e.type === "reminder_sent" && e.metadata.automatic,
    ),
  ).toHaveLength(1);
});
it.each(["off", "next_morning", "after_days"] as const)(
  "countersign %s uses workspace time and sends once only to staff",
  async (mode) => {
    const f = await fixture({ countersign_reminder: { mode, days: 2 } });
    f.now("2026-03-06T22:00:00Z");
    const before = await f.row();
    const signed = await f.service.sign(
      before.id,
      signature(before.revision),
      "client",
      clientActor,
      { token: before.token!, password: "" },
    );
    await mutate(f.repo, signed.id, (p) => {
      p.jobs = [];
    });
    const due =
      mode === "next_morning"
        ? "2026-03-09T13:00:00.000Z"
        : "2026-03-08T21:00:00.000Z";
    expect(countersignDue(signed)).toBe(mode === "off" ? null : due);
    f.now(new Date(Date.parse(due) - 1).toISOString());
    await f.run();
    expect(reminderDeliveries(f).length).toBe(0);
    f.now(due);
    await Promise.all([f.service.tick(), f.service.tick()]);
    await Promise.all([f.worker.drain(signed.id), f.worker.drain(signed.id)]);
    await f.run();
    expect(reminderDeliveries(f).length).toBe(mode === "off" ? 0 : 1);
    if (mode !== "off") {
      const log = (await f.repo.emailLog<EmailLog>(signed.id))[0];
      expect(log.snapshot.to).toBe(staff.staff_email);
      expect(log.snapshot.template_key).toBe("staff_countersign_reminder");
      expect(log.snapshot.button_url).toContain("?action=countersign");
      expect((await f.row()).events.at(-1)!.type).toBe(
        "countersign_reminder_sent",
      );
    }
  },
);
it.each(["completed", "archived", "off"])(
  "queued countersign reminders are cancelled after %s",
  async (change) => {
    const f = await fixture({
      countersign_reminder: { mode: "after_days", days: 1 },
    });
    const before = await f.row();
    const signed = await f.service.sign(
      before.id,
      signature(before.revision),
      "client",
      clientActor,
      { token: before.token!, password: "" },
    );
    await mutate(f.repo, signed.id, (p) => {
      p.jobs = [];
    });
    f.now("2026-03-07T14:00:00Z");
    await f.service.tick();
    await mutate(f.repo, signed.id, (p) => {
      if (change === "off")
        p.workspace_settings!.countersign_reminder!.mode = "off";
      else p.status = change as any;
    });
    await f.worker.drain(signed.id, "email");
    expect(reminderDeliveries(f).length).toBe(0);
  },
);

it("reassignment keeps Workspace Reply-to on an already queued reminder", async () => {
  const f = await fixture({
    reminder_rules: rules,
    email_reply_to: "workspace",
    email: "office@example.test",
  });
  f.now("2026-03-07T14:00:00Z");
  await f.service.tick();
  const target = {
    user_id: crypto.randomUUID(),
    display_name: "Jamie Example",
    name: "Jamie Example",
    email: "jamie@example.test",
    role: "member",
    status: "active",
  };
  const assign = new ReassignmentService(f.repo, async () => [
    ...f.members,
    target,
  ]);
  const p = await f.row();
  await assign.reassign(staff, {
    user_id: target.user_id,
    notify: false,
    proposals: [{ id: p.id, revision: p.revision }],
  });
  await f.worker.drain(p.id, "email");
  const log = (await f.repo.emailLog<EmailLog>(p.id))[0];
  expect(log.snapshot.from).toContain(target.email);
  expect(log.snapshot.reply_to).toBe("office@example.test");
  expect((await f.row()).versions).toEqual(p.versions);
});
it("legacy off/empty stays off when settings are merely loaded", async () => {
  const f = await fixture({ reminder_days: [] });
  f.now("2026-03-20T14:00:00Z");
  await f.run();
  expect(reminderDeliveries(f)).toEqual([]);
  expect((await f.row()).workspace_settings!.reminder_rules).toBeUndefined();
});

it("on-demand reminders keep their existing closed-state delivery guard", async () => {
  const f = await fixture();
  const p = await f.row();
  await proposalAction(f.repo, p.id, p.revision, "remind", staff);
  await mutate(f.repo, p.id, (row) => {
    row.status = "declined";
  });
  await f.worker.drain(p.id, "email");
  expect(reminderDeliveries(f)).toEqual([]);
});
