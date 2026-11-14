import { afterEach, describe, expect, it, vi } from "vitest";
import { setup, staff } from "./helpers";
import { postgresFixture } from "./postgres-fixture";
const state = vi.hoisted(() => ({ fixture: null as any, actor: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => state.actor,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  publicRuntime: async () => state.fixture,
  allRuntimes: vi.fn(async () => []),
}));
import { handle } from "../src/lib/http";
import { allowedWhileReadOnly, planState } from "../src/lib/plan";
import { dueTrialEmails, trialEmail } from "../src/lib/plan-email";
afterEach(() => vi.unstubAllEnvs());

const now = new Date("2026-11-14T12:00:00Z");
const days = (n: number) =>
  new Date(now.getTime() + n * 86400000).toISOString();

describe("plan state", () => {
  it("counts trial days, warns in the last 3 and goes read-only at the end", () => {
    const trial = (n: number) =>
      planState(
        { plan_status: "trial", trial_ends_at: days(n), past_due_since: null },
        now,
      );
    expect(trial(11)).toMatchObject({
      mode: "full",
      notice: "trial",
      days_left: 11,
    });
    expect(trial(3)).toMatchObject({
      mode: "full",
      notice: "trial_ending",
      days_left: 3,
    });
    expect(trial(0.2)).toMatchObject({
      mode: "full",
      notice: "trial_ending",
      days_left: 1,
    });
    expect(trial(-0.01)).toMatchObject({
      mode: "read_only",
      notice: "trial_ended",
    });
  });
  it("gives a failed payment 7 days, then goes read-only; canceled is read-only", () => {
    const due = (n: number) =>
      planState(
        {
          plan_status: "past_due",
          trial_ends_at: null,
          past_due_since: days(-n),
        },
        now,
      );
    expect(due(2)).toMatchObject({
      mode: "full",
      notice: "payment_failed",
      grace_ends_at: days(5),
    });
    expect(due(7.01)).toMatchObject({
      mode: "read_only",
      notice: "payment_overdue",
    });
    expect(
      planState(
        { plan_status: "canceled", trial_ends_at: null, past_due_since: null },
        now,
      ),
    ).toMatchObject({ mode: "read_only", notice: "canceled" });
    expect(
      planState(
        { plan_status: "active", trial_ends_at: null, past_due_since: null },
        now,
      ),
    ).toMatchObject({ mode: "full", notice: null });
  });
  it("keeps sign-in, your account, billing and finishing signed work open", () => {
    for (const p of [
      ["auth", "logout"],
      ["account"],
      ["billing", "checkout"],
      ["proposals", "x", "countersign"],
      ["proposals", "x", "retry"],
    ])
      expect(allowedWhileReadOnly(p), p.join("/")).toBe(true);
    for (const p of [
      ["proposals"],
      ["proposals", "x", "send"],
      ["clients"],
      ["templates", "x"],
      ["workspace_settings"],
    ])
      expect(allowedWhileReadOnly(p), p.join("/")).toBe(false);
  });
});

describe("read-only workspaces", () => {
  it("refuse creating and sending, but still read and countersign", async () => {
    vi.stubEnv("APP_URL", "http://localhost");
    vi.stubEnv("APP_MODE", "local");
    vi.stubEnv("LOCAL_PLAN", "trial:0");
    state.fixture = await setup();
    state.actor = {
      ...staff,
      workspace_id: state.fixture.repo.workspaceId,
      staff_role: "owner",
    };
    const call = (path: string[], method = "GET", body?: unknown) =>
      handle(
        new Request(`http://localhost/api/${path.join("/")}`, {
          method,
          headers: {
            origin: "http://localhost",
            "content-type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        path,
      );
    const send = await call(
      ["proposals", state.fixture.draft.id, "send"],
      "POST",
      {},
    );
    expect(send.status).toBe(402);
    expect(await send.json()).toMatchObject({
      code: "WORKSPACE_READ_ONLY",
      error: "Your trial has ended. Choose a plan to create and send again.",
    });
    expect((await call(["clients"], "POST", { company: "X" })).status).toBe(
      402,
    );
    expect((await call(["proposals"])).status).toBe(200);
    const session = await (await call(["auth", "session"])).json();
    expect(session.plan).toMatchObject({
      mode: "read_only",
      notice: "trial_ended",
    });
    // Countersign is not blocked by the plan (it fails later for its own reasons).
    expect(
      (
        await call(
          ["proposals", state.fixture.draft.id, "countersign"],
          "POST",
          {},
        )
      ).status,
    ).not.toBe(402);
    vi.stubEnv("LOCAL_PLAN", "trial:5");
    expect((await call(["clients"], "POST", { company: "X" })).status).not.toBe(
      402,
    );
  });
});

describe("trial emails", () => {
  const w = {
    id: "w",
    name: "North Star",
    slug: "northstar",
    trial_reminder_sent_at: null,
    trial_ended_sent_at: null,
  };
  it("sends the reminder 3 days out and the ended email once", () => {
    expect(dueTrialEmails([{ ...w, trial_ends_at: days(5) }], now)).toEqual([]);
    expect(
      dueTrialEmails([{ ...w, trial_ends_at: days(2.5) }], now).map(
        (d) => d.kind,
      ),
    ).toEqual(["reminder"]);
    expect(
      dueTrialEmails(
        [{ ...w, trial_ends_at: days(2.5), trial_reminder_sent_at: days(-1) }],
        now,
      ),
    ).toEqual([]);
    expect(
      dueTrialEmails([{ ...w, trial_ends_at: days(-0.1) }], now).map(
        (d) => d.kind,
      ),
    ).toEqual(["ended"]);
    expect(
      dueTrialEmails(
        [{ ...w, trial_ends_at: days(-0.1), trial_ended_sent_at: days(0) }],
        now,
      ),
    ).toEqual([]);
  });
  it("links to the workspace's billing page", () => {
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubEnv("WORKSPACE_DOMAIN", "example.test");
    const mail = trialEmail(
      "reminder",
      { ...w, trial_ends_at: "2026-11-17T12:00:00Z" },
      { email: "d@x.test", first_name: "Dana" },
    );
    expect(mail.subject).toBe("Your Yeswell trial ends Tuesday");
    expect(mail.text).toContain("ends on Tuesday, November 17");
    expect(mail.text).toContain("https://northstar.example.test/billing");
    expect(
      trialEmail(
        "ended",
        { ...w, trial_ends_at: days(0) },
        { email: "d@x.test", first_name: "Dana" },
      ).subject,
    ).toBe("Your Yeswell trial has ended");
  });
});

describe("plan database", () => {
  it("keeps existing workspaces active, starts signups on a trial and claims each email once", async () => {
    const db = await postgresFixture();
    expect(
      (await db.query("select plan_status from public.workspaces")).rows.every(
        (r: any) => r.plan_status === "active",
      ),
    ).toBe(true);
    const u = crypto.randomUUID();
    await db.query("insert into auth.users(id,email) values ($1,'a@x.test')", [
      u,
    ]);
    await db.query(
      "select public.reserve_workspace_signup($1,'acme','Acme','Ann Lee')",
      [u],
    );
    const ws = (
      await db.query<{ workspace_id: string }>(
        "select * from public.complete_workspace_signup($1)",
        [u],
      )
    ).rows[0].workspace_id;
    const row = (
      await db.query<{ plan_status: string; days: number }>(
        "select plan_status, round(extract(epoch from trial_ends_at - now()) / 86400) as days from public.workspaces where id=$1",
        [ws],
      )
    ).rows[0];
    expect(row).toMatchObject({ plan_status: "trial" });
    expect(Number(row.days)).toBe(14);
    const claim = async (kind: string) =>
      (
        await db.query<{ c: boolean }>(
          "select public.claim_trial_email($1,$2) c",
          [ws, kind],
        )
      ).rows[0].c;
    expect(await claim("reminder")).toBe(true);
    expect(await claim("reminder")).toBe(false);
    expect(await claim("ended")).toBe(true);
    await expect(
      db.query("update public.workspaces set trial_ends_at=null where id=$1", [
        ws,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("update public.workspaces set plan_status='free' where id=$1", [
        ws,
      ]),
    ).rejects.toThrow();
  });
});

describe("AI connector on a read-only workspace", () => {
  it("refuses draft writes but still reads", async () => {
    const { aiTool } = await import("../src/lib/ai-tools");
    const f = await setup();
    const ai = {
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      ip: "",
      user_agent: "MCP",
    };
    const scopes = [
      "proposals:read",
      "proposals:draft",
      "templates:edit",
      "clients:write",
    ];
    vi.stubEnv("LOCAL_PLAN", "canceled");
    await expect(
      aiTool(
        f.repo,
        ai,
        "create_proposal_draft",
        {
          template_id: f.draft.template_id,
          client_id: f.draft.client.id,
          title: "X",
          content_markdown: "# A",
          items: [],
        },
        scopes,
      ),
    ).rejects.toThrow("Your plan was canceled");
    await expect(
      aiTool(f.repo, ai, "get_proposal", { id: f.draft.id }, scopes),
    ).resolves.toBeTruthy();
  });
});
