import { afterEach, describe, expect, it, vi } from "vitest";
import { postgresFixture } from "./postgres-fixture";
import { planState } from "../src/lib/plan";
import {
  closeAbandonedWorkspaces,
  closureWarningEmail,
  type ClosingDeps,
} from "../src/lib/workspace-closing";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
afterEach(() => vi.unstubAllEnvs());

type Db = Awaited<ReturnType<typeof postgresFixture>>;
async function trialWorkspace(db: Db, slug: string) {
  const user = crypto.randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,$2)", [
    user,
    `${slug}@x.test`,
  ]);
  await db.query("select public.reserve_workspace_signup($1,$2,$3,'Ann Lee')", [
    user,
    slug,
    slug,
  ]);
  return (
    await db.query<{ workspace_id: string }>(
      "select * from public.complete_workspace_signup($1)",
      [user],
    )
  ).rows[0].workspace_id;
}
const ids = async (db: Db, fn: string) =>
  (await db.query<{ id: string }>(`select id from public.${fn}() id`)).rows.map(
    (r) => r.id,
  );
const warnList = async (db: Db) =>
  (
    await db.query<{ id: string; read_only_since: Date; closes_at: Date }>(
      "select * from public.workspaces_due_for_closure_warning()",
    )
  ).rows;
const row = async (db: Db, ws: string) =>
  (
    await db.query<any>(
      "select plan_status, canceled_at, closed_at, closure_warning_sent_at from public.workspaces where id=$1",
      [ws],
    )
  ).rows[0];

describe("closing abandoned workspaces in the database", () => {
  it("warns 30 days ahead, closes after 12 months read-only, and reopens on payment", async () => {
    const db = await postgresFixture();
    const old = await trialWorkspace(db, "old-trial");
    const fresh = await trialWorkspace(db, "fresh-trial");
    const paying = await trialWorkspace(db, "paying");
    await db.query(
      "update public.workspaces set plan_status='active' where id=$1",
      [paying],
    );
    // Trial ended 11 months and 10 days ago: 12 months comes in about 20 days.
    await db.query(
      "update public.workspaces set trial_ends_at = now() - interval '11 months' - interval '10 days' where id=$1",
      [old],
    );
    // Trial ended 2 months ago: nothing yet.
    await db.query(
      "update public.workspaces set trial_ends_at = now() - interval '2 months' where id=$1",
      [fresh],
    );

    const due = await warnList(db);
    expect(due.map((d) => d.id)).toEqual([old]);
    // Never sooner than 30 days from the warning.
    expect(new Date(due[0].closes_at).getTime()).toBeGreaterThanOrEqual(
      Date.now() + 29.9 * 86400000,
    );
    expect(await ids(db, "workspaces_due_for_closure")).toEqual([]);

    // Warned once; a second mark is refused.
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.mark_closure_warning_sent($1) ok",
          [old],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select public.mark_closure_warning_sent($1) ok",
          [old],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(await warnList(db)).toEqual([]);

    // 12 months read-only but warned only 10 days ago: still waits.
    await db.query(
      "update public.workspaces set trial_ends_at = now() - interval '13 months', closure_warning_sent_at = now() - interval '10 days' where id=$1",
      [old],
    );
    expect(await ids(db, "workspaces_due_for_closure")).toEqual([]);
    await db.query(
      "update public.workspaces set closure_warning_sent_at = now() - interval '31 days' where id=$1",
      [old],
    );
    expect(await ids(db, "workspaces_due_for_closure")).toEqual([old]);

    await db.query("select public.close_workspace($1)", [old]);
    const closed = await row(db, old);
    expect(closed.plan_status).toBe("canceled");
    expect(closed.closed_at).toBeTruthy();
    expect(closed.canceled_at).toBeTruthy();
    expect(await ids(db, "workspaces_due_for_closure")).toEqual([]);
    expect(await warnList(db)).toEqual([]);

    // Choosing a plan before deletion reopens it.
    await db.query(
      "update public.workspaces set plan_status='active' where id=$1",
      [old],
    );
    expect(await row(db, old)).toMatchObject({
      plan_status: "active",
      closed_at: null,
      canceled_at: null,
      closure_warning_sent_at: null,
    });
  });

  it("counts canceled plans from the cancellation and overdue payments after the 7-day grace", async () => {
    const db = await postgresFixture();
    const canceled = await trialWorkspace(db, "canceled");
    const overdue = await trialWorkspace(db, "overdue");
    await db.query(
      "update public.workspaces set plan_status='canceled' where id=$1",
      [canceled],
    );
    expect((await row(db, canceled)).canceled_at).toBeTruthy();
    await db.query(
      "update public.workspaces set canceled_at = now() - interval '12 months' where id=$1",
      [canceled],
    );
    await db.query(
      "update public.workspaces set plan_status='past_due', past_due_since = now() - interval '11 months' where id=$1",
      [overdue],
    );
    // Overdue: read-only from 7 days after the failed payment, so 11 months
    // past due is not yet within the warning window.
    expect((await warnList(db)).map((d) => d.id)).toEqual([canceled]);
    await db.query(
      "update public.workspaces set past_due_since = now() - interval '11 months' - interval '7 days' - interval '5 days' where id=$1",
      [overdue],
    );
    expect((await warnList(db)).map((d) => d.id).sort()).toEqual(
      [canceled, overdue].sort(),
    );

    // A status change forgets an earlier warning.
    await db.query("select public.mark_closure_warning_sent($1)", [overdue]);
    await db.query(
      "update public.workspaces set plan_status='canceled' where id=$1",
      [overdue],
    );
    expect((await row(db, overdue)).closure_warning_sent_at).toBeNull();
  });

  it("leaves the functions to the server only", async () => {
    const db = await postgresFixture();
    for (const fn of [
      "workspaces_due_for_closure_warning()",
      "mark_closure_warning_sent(uuid)",
      "workspaces_due_for_closure()",
    ])
      for (const role of ["anon", "authenticated"])
        expect(
          (
            await db.query<{ ok: boolean }>(
              `select has_function_privilege('${role}','public.${fn}','execute') ok`,
            )
          ).rows[0].ok,
        ).toBe(false);
  });
});

function fakeDeps(over: Partial<ClosingDeps> = {}) {
  const sent: { to: string; key: string }[] = [];
  const marked: string[] = [];
  const closed: string[] = [];
  const deps: ClosingDeps = {
    dueForWarning: async () => [
      {
        id: "w1",
        plan_status: "trial",
        read_only_since: "2025-12-01T00:00:00Z",
        closes_at: "2026-12-16T00:00:00Z",
      },
      {
        id: LOCAL_WORKSPACE_ID,
        plan_status: "trial",
        read_only_since: "2025-12-01T00:00:00Z",
        closes_at: "2026-12-16T00:00:00Z",
      },
    ],
    workspace: async (id) => ({ id, name: "Acme Studio", slug: "acme" }),
    owners: async () => [
      { id: "u1", email: "ann@acme.test", first_name: "Ann" },
      { id: "u2", email: "bo@acme.test", first_name: "Bo" },
    ],
    send: async (m, key) => {
      sent.push({ to: m.to, key });
    },
    markWarned: async (id) => {
      marked.push(id);
      return true;
    },
    dueForClosure: async () => ["w2", LOCAL_WORKSPACE_ID],
    close: async (id) => {
      closed.push(id);
    },
    ...over,
  };
  return { deps, sent, marked, closed };
}

describe("closing job", () => {
  it("emails every owner, then records the warning; never touches the home workspace", async () => {
    const { deps, sent, marked, closed } = fakeDeps();
    expect(await closeAbandonedWorkspaces(deps)).toEqual({
      warned: 1,
      closed: 1,
    });
    expect(sent).toEqual([
      { to: "ann@acme.test", key: "closure-warning:w1:u1" },
      { to: "bo@acme.test", key: "closure-warning:w1:u2" },
    ]);
    expect(marked).toEqual(["w1"]);
    expect(closed).toEqual(["w2"]);
  });

  it("doesn't start the 30 days when no warning was delivered", async () => {
    const { deps, marked } = fakeDeps({
      send: async () => {
        throw new Error("down");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await closeAbandonedWorkspaces(deps)).warned).toBe(0);
    expect(marked).toEqual([]);
    const none = fakeDeps({ owners: async () => [] });
    await closeAbandonedWorkspaces(none.deps);
    expect(none.marked).toEqual([]);
  });

  it("writes the warning in Yeswell's voice with both dates", () => {
    vi.stubEnv("APP_URL", "https://app.yeswell.co");
    vi.stubEnv("WORKSPACE_DOMAIN", "yeswell.co");
    const email = (plan_status: string) =>
      closureWarningEmail(
        { id: "w1", name: "Acme Studio", slug: "acme" },
        { email: "ann@acme.test", first_name: "Ann" },
        {
          plan_status,
          read_only_since: "2025-12-01T00:00:00Z",
          closes_at: "2026-12-16T00:00:00Z",
        },
      );
    const m = email("trial");
    expect(m.subject).toBe(
      "Your Yeswell workspace closes on December 16, 2026",
    );
    expect(m.text).toContain("Hi Ann,");
    expect(m.text).toContain(
      "Your free trial of acme.yeswell.co ended on December 1, 2025. You can still view and download your proposals, but you can't create or send new ones.",
    );
    expect(m.text).toContain(
      "We'll close the workspace on December 16, 2026 and delete its proposals, clients and files on March 16, 2027.",
    );
    expect(m.text).toContain("https://acme.yeswell.co/billing");
    expect(email("canceled").text).toContain(
      "Your Yeswell plan for acme.yeswell.co was canceled on December 1, 2025.",
    );
    // Read-only began 7 days after the failed payment.
    expect(email("past_due").text).toContain(
      "A Yeswell payment for acme.yeswell.co didn't go through on November 24, 2025, and it hasn't been paid since.",
    );
    for (const kind of ["trial", "canceled", "past_due"])
      expect(email(kind).text.toLowerCase()).not.toContain("read-only");
    expect(m.html).toContain("Choose a plan");
  });
});

describe("plan state for closing", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("shows the closing date once warned and the deletion date once closed", () => {
    const warned = planState(
      {
        plan_status: "trial",
        trial_ends_at: "2025-12-01T00:00:00.000Z",
        past_due_since: null,
        closure_warning_sent_at: "2026-11-10T00:00:00.000Z",
      },
      now,
    );
    expect(warned).toMatchObject({
      mode: "read_only",
      notice: "trial_ended",
      closes_at: "2026-12-10T00:00:00.000Z", // 30 days after the warning
      deletes_at: null,
    });
    const notWarned = planState(
      {
        plan_status: "trial",
        trial_ends_at: "2025-12-01T00:00:00.000Z",
        past_due_since: null,
      },
      now,
    );
    expect(notWarned.closes_at).toBeNull();
    const closed = planState(
      {
        plan_status: "canceled",
        trial_ends_at: null,
        past_due_since: null,
        canceled_at: "2026-11-01T00:00:00.000Z",
        closed_at: "2026-11-01T00:00:00.000Z",
      },
      now,
    );
    expect(closed).toMatchObject({
      mode: "read_only",
      notice: "closed",
      deletes_at: "2027-01-30T00:00:00.000Z",
    });
  });
});
