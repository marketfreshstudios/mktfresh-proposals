import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setup, staff, clientActor } from "./helpers";
import { EngagementClock } from "../src/lib/engagement-clock";
import {
  EngagementSnapshotSchema,
  emptyEngagement,
  engagementTargets,
  publicEngagement,
} from "../src/lib/engagement";
import {
  engagementBot,
  startEngagement,
  recordEngagement,
  engagementReport,
  readEngagementTicket,
} from "../src/lib/engagement-server";
import { cycleViewedAt, dueClientReminders } from "../src/lib/reminders";
import { mutate } from "../src/lib/repository";
beforeEach(() => {
  vi.stubEnv("APP_MODE", "local");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-08T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const f = await setup();
  const p = await f.service.send(f.draft.id, staff, false, undefined, {
    pagination: { format: 1, pages: 1, starts: [] },
  });
  const input = {
    session_id: crypto.randomUUID(),
    browser_id: crypto.randomUUID(),
    device: "desktop" as const,
    intent: "read" as const,
    activity: "pointer" as const,
  };
  return { ...f, p, input };
}
it("clock counts half-visible focused sections, pauses on blur/hidden and stops exactly at 60 seconds idle", () => {
  const clock = new EngagementClock(0.7);
  clock.step(0, true, ["section:a", "page:1"]);
  clock.step(10000, false, []);
  clock.step(40000, true, ["section:a", "page:1"]);
  clock.step(90000, true, ["section:a", "page:1"]);
  expect(clock.snapshot.active_ms).toBe(30000);
  clock.activity(90000);
  clock.step(90000, true, ["section:b", "page:2"]);
  clock.step(95000, false, []);
  clock.step(120000, false, []);
  expect(clock.snapshot.active_ms).toBe(35000);
  expect(clock.snapshot.targets).toEqual({
    "section:a": 30000,
    "page:1": 30000,
    "section:b": 5000,
    "page:2": 5000,
  });
  expect(EngagementSnapshotSchema.parse(clock.batch())).toMatchObject({
    seq: 2,
    active_ms: 35000,
  });
});
it("sessions and cumulative beacons deduplicate and merge concurrent browsers without touching any frozen content", async () => {
  const f = await fixture(),
    before = structuredClone(f.p);
  const [a, b] = await Promise.all([
    startEngagement(f.repo, f.p, f.input),
    startEngagement(f.repo, f.p, {
      ...f.input,
      session_id: crypto.randomUUID(),
    }),
  ]);
  await startEngagement(f.repo, f.p, f.input);
  const target = engagementTargets(f.p)[0].key;
  vi.advanceTimersByTime(10000);
  const snapshot = {
    seq: 2,
    active_ms: 10000,
    targets: { [target]: 10000, "page:1": 10000 },
    actions: [],
    ended: false,
  };
  await Promise.all([
    recordEngagement(f.repo, f.p, a.ticket, snapshot),
    recordEngagement(f.repo, f.p, a.ticket, snapshot),
    recordEngagement(f.repo, f.p, b.ticket, snapshot),
  ]);
  await recordEngagement(f.repo, f.p, a.ticket, {
    ...snapshot,
    seq: 1,
    active_ms: 0,
    targets: {},
  });
  const report = await engagementReport(f.repo, f.p);
  expect(report).toMatchObject({
    views: 2,
    unique_viewers: 1,
    total_ms: 20000,
  });
  expect(report.targets.find((t) => t.key === target)).toMatchObject({
    ms: 20000,
    percent: 100,
    reached: 1,
  });
  expect(await f.repo.get(f.p.id)).toEqual(before);
  expect(
    JSON.stringify(await f.repo.engagementSession(f.p.id, a.session.id)),
  ).not.toMatch(/203\.0\.113|user_agent|\"ip\"/);
});
it("validates ticket, workspace, timing, section, choice and download identities", async () => {
  const f = await fixture(),
    a = await startEngagement(f.repo, f.p, f.input);
  vi.advanceTimersByTime(10000);
  const snapshot = {
    seq: 2,
    active_ms: 1000,
    targets: { "page:1": 1000 },
    actions: [],
    ended: false,
  };
  await expect(
    recordEngagement(f.repo, f.p, a.ticket + "x", snapshot),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    recordEngagement(f.repo, f.p, a.ticket, { ...snapshot, active_ms: 60000 }),
  ).rejects.toThrow("Invalid active time");
  await expect(
    recordEngagement(f.repo, f.p, a.ticket, {
      ...snapshot,
      targets: { secret: 1000 },
    }),
  ).rejects.toThrow("Invalid section time");
  await expect(
    recordEngagement(f.repo, f.p, a.ticket, {
      ...snapshot,
      targets: { constructor: 1000 },
    }),
  ).rejects.toThrow("Invalid section time");

  await expect(
    recordEngagement(f.repo, f.p, a.ticket, {
      ...snapshot,
      actions: [
        {
          id: crypto.randomUUID(),
          kind: "choice",
          item_id: crypto.randomUUID(),
          selected: true,
        },
      ],
    }),
  ).rejects.toThrow("Invalid choice");
  await expect(
    recordEngagement(f.repo, f.p, a.ticket, {
      ...snapshot,
      actions: [
        {
          id: crypto.randomUUID(),
          kind: "download",
          file_id: crypto.randomUUID(),
        },
      ],
    }),
  ).rejects.toThrow("Invalid PDF");
  expect(() =>
    readEngagementTicket(
      a.ticket,
      { ...f.repo, workspaceId: crypto.randomUUID() } as any,
      f.p,
      Date.now(),
    ),
  ).toThrow("expired");
  await recordEngagement(f.repo, f.p, a.ticket, { ...snapshot, ended: true });
  await expect(
    recordEngagement(f.repo, f.p, a.ticket, { ...snapshot, seq: 3 }),
  ).rejects.toThrow("ended");
});
it("choice events never change prices; sealed downloads are useful after signing but new reading sessions and archived beacons are dropped", async () => {
  const f = await fixture();
  f.p.quote[0].optional = true;
  f.p.versions[0].quote[0].optional = true;
  await f.repo.save(f.p, f.p.revision);
  const a = await startEngagement(f.repo, f.p, f.input),
    quote = structuredClone(f.p.quote);
  await recordEngagement(f.repo, f.p, a.ticket, {
    seq: 2,
    active_ms: 0,
    targets: {},
    actions: [
      {
        id: crypto.randomUUID(),
        kind: "choice",
        item_id: quote[0].id,
        selected: false,
      },
    ],
    ended: true,
  });
  expect((await f.repo.get(f.p.id))!.quote).toEqual(quote);
  const file = crypto.randomUUID();
  await mutate(f.repo, f.p.id, (p) => {
    p.status = "completed";
    p.client_signed_at = new Date().toISOString();
    p.files.push({
      id: file,
      kind: "sealed",
      stage: "company",
      storage_path: "example",
      sha256: "a".repeat(64),
      bytes: 10,
      created_at: new Date().toISOString(),
    } as any);
  });
  const signed = (await f.repo.get(f.p.id))!;
  await expect(
    startEngagement(f.repo, signed, {
      ...f.input,
      session_id: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 410 });
  const d = await startEngagement(f.repo, signed, {
    ...f.input,
    session_id: crypto.randomUUID(),
    intent: "download",
  });
  await recordEngagement(f.repo, signed, d.ticket, {
    seq: 2,
    active_ms: 0,
    targets: {},
    actions: [{ id: crypto.randomUUID(), kind: "download", file_id: file }],
    ended: true,
  });
  expect(await engagementReport(f.repo, signed)).toMatchObject({
    views: 1,
    choices: 1,
    downloads: 1,
  });
  await expect(
    recordEngagement(
      f.repo,
      { ...signed, archived_at: new Date().toISOString() },
      a.ticket,
      { seq: 3, active_ms: 0, targets: {}, actions: [], ended: true },
    ),
  ).rejects.toMatchObject({ status: 410 });
});
it("first-view notification fires once; defaults are in-app on/email off; reminder cycle reads the same viewed fact", async () => {
  const f = await fixture();
  const before = f.p.jobs.filter((j) =>
    j.id.includes(":notify:viewed:"),
  ).length;
  await f.service.view(f.p.token!, "", {
    ...clientActor,
    ip: "",
    user_agent: "",
  });
  let p = (await f.repo.get(f.p.id))!;
  expect(p.events.filter((e) => e.type === "viewed")).toHaveLength(1);
  expect(p.events.find((e) => e.type === "viewed")!.metadata.in_app).toBe(true);
  expect(p.jobs.filter((j) => j.id.includes(":notify:viewed:"))).toHaveLength(
    before,
  );
  const f2 = await fixture();
  await Promise.all([
    f2.service.view(f2.p.token!, "", clientActor, {
      in_app: false,
      email: true,
    }),
    f2.service.view(f2.p.token!, "", clientActor, {
      in_app: false,
      email: true,
    }),
  ]);
  p = (await f2.repo.get(f2.p.id))!;
  expect(p.events.filter((e) => e.type === "viewed")).toHaveLength(1);
  expect(
    p.jobs.filter((j) => j.id.includes(":notify:viewed:")).length,
  ).toBeGreaterThan(0);
  expect(new Set(p.jobs.map((j) => j.id)).size).toBe(p.jobs.length);
  p.workspace_settings!.reminder_rules = {
    enabled: true,
    unopened_days: 1,
    viewed_days: 2,
    stop_after: 3,
  };
  vi.advanceTimersByTime(3 * 86400000);
  expect(cycleViewedAt(p)).toBe(p.first_viewed_at);
  expect(
    dueClientReminders(p, new Date()).every((r) => r.kind === "viewed"),
  ).toBe(true);
});
it("details expire at 12 months while lifetime aggregates and browser reach counts stay", async () => {
  const f = await fixture(),
    a = await startEngagement(f.repo, f.p, f.input);
  vi.advanceTimersByTime(1000);
  await recordEngagement(f.repo, f.p, a.ticket, {
    seq: 2,
    active_ms: 1000,
    targets: { "page:1": 1000 },
    actions: [],
    ended: true,
  });
  const before = publicEngagement((await f.repo.engagementSummary(f.p.id))!);
  await f.repo.pruneEngagement("2027-11-09T00:00:00Z");
  expect(await f.repo.engagementSessions(f.p.id)).toEqual([]);
  expect(publicEngagement((await f.repo.engagementSummary(f.p.id))!)).toEqual(
    before,
  );
  expect(emptyEngagement(f.p.id).views).toBe(0);
});
it.each([
  "Slackbot-LinkExpanding 1.0",
  "Googlebot",
  "facebookexternalhit",
  "Proofpoint URL scanner",
  "MicrosoftPreview",
])("drops known scanner %s", (agent) => {
  expect(engagementBot(new Headers({ "user-agent": agent }))).toBe(true);
});
it("drops browser prefetch/prerender; ordinary browser is not classified by fingerprint", () => {
  expect(
    engagementBot(new Headers({ "sec-purpose": "prefetch;prerender" })),
  ).toBe(true);
  expect(
    engagementBot(new Headers({ "user-agent": "Mozilla/5.0 Chrome/130.0" })),
  ).toBe(false);
});

it("the optional first-view email sends once per recipient, and switching it off cancels a pending alert", async () => {
  const { Worker, MockMailer } = await import("../src/lib/jobs");
  const { MockBillingProvider } = await import("../src/lib/billing");
  const f = await fixture();
  await f.repo.put("workspace_settings", {
    ...f.settings,
    engagement_notifications: { in_app: true, email: true },
  });
  await f.service.view(f.p.token!, "", clientActor, {
    in_app: true,
    email: true,
  });
  const p = (await f.repo.get(f.p.id))!,
    mailer = new MockMailer();
  const worker = new Worker(
    f.repo,
    { get: async () => new Uint8Array(), put: async () => {} },
    mailer,
    {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    },
  );
  const jobs = p.jobs.filter((j) => j.id.includes(":notify:viewed:"));
  expect(jobs.length).toBeGreaterThan(0);
  for (const j of jobs)
    await Promise.all([
      worker.drain(p.id, "email", j.id),
      worker.drain(p.id, "email", j.id),
    ]);
  expect(mailer.sent.size).toBe(new Set(jobs.map((j) => j.payload.to)).size);
  expect((await f.repo.emailLog(p.id)).length).toBe(jobs.length);
  const f2 = await fixture();
  await f2.service.view(f2.p.token!, "", clientActor, {
    in_app: true,
    email: true,
  });
  const m2 = new MockMailer(),
    w2 = new Worker(
      f2.repo,
      { get: async () => new Uint8Array(), put: async () => {} },
      m2,
      {
        qbo: new MockBillingProvider("qbo"),
        stripe: new MockBillingProvider("stripe"),
      },
    );
  for (const j of (await f2.repo.get(f2.p.id))!.jobs.filter((j) =>
    j.id.includes(":notify:viewed:"),
  ))
    await w2.drain(f2.p.id, "email", j.id);
  expect(m2.sent.size).toBe(0);
});
it("older publications without a stored page plan keep section targets without inventing page positions", async () => {
  const f = await fixture();
  delete f.p.versions[0].pagination;
  expect(engagementTargets(f.p).some((t) => t.kind === "section")).toBe(true);
  expect(engagementTargets(f.p).some((t) => t.kind === "page")).toBe(false);
});

it("choice batches survive PostgreSQL JSONB key reordering and a choice-driven version hash change", async () => {
  const f = await fixture();
  f.p.quote[0].optional = true;
  f.p.versions[0].quote[0].optional = true;
  await f.repo.save(f.p, f.p.revision);
  const start = await startEngagement(f.repo, f.p, f.input);
  const action = {
    id: crypto.randomUUID(),
    kind: "choice" as const,
    item_id: f.p.quote[0].id,
    selected: false,
  };
  await recordEngagement(f.repo, f.p, start.ticket, {
    seq: 2,
    active_ms: 0,
    targets: {},
    actions: [action],
    ended: false,
  });
  const session = (await f.repo.engagementSession(f.p.id, start.session.id))!;
  session.actions = session.actions.map(
    (a) => Object.fromEntries(Object.entries(a).reverse()) as typeof action,
  );
  f.repo.catalog.get("proposal_engagement")!.set(session.id, session);
  const changed = await f.service.toggle(
    f.p.token!,
    "",
    {
      revision: f.p.revision,
      reviewed_hash: f.p.versions[0].content_hash,
      item_id: action.item_id,
      selected: false,
    },
    clientActor,
  );
  expect(changed.versions[0].content_hash).not.toBe(start.session.version_hash);
  await recordEngagement(f.repo, changed, start.ticket, {
    seq: 3,
    active_ms: 0,
    targets: {},
    actions: [action],
    ended: true,
  });
  expect(await engagementReport(f.repo, changed)).toMatchObject({
    views: 1,
    choices: 1,
  });
});
