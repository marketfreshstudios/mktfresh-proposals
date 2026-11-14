import { AppError } from "./model";
import { supabase } from "./repository";

export type PlanStatus = "trial" | "active" | "past_due" | "canceled";
export type PlanRow = {
  plan_status: PlanStatus;
  trial_ends_at: string | null;
  past_due_since: string | null;
};
export type PlanState = {
  status: PlanStatus;
  /** "full" or "read_only": read-only blocks creating, editing and sending. */
  mode: "full" | "read_only";
  /** Why the workspace is read-only, or which banner to show. */
  notice:
    | null
    | "trial"
    | "trial_ending"
    | "trial_ended"
    | "payment_failed"
    | "payment_overdue"
    | "canceled";
  trial_ends_at: string | null;
  days_left: number | null;
  /** When a past-due workspace becomes read-only. */
  grace_ends_at: string | null;
};

const DAY = 86400000;
export const PAST_DUE_GRACE_DAYS = 7;
export const TRIAL_WARNING_DAYS = 3;

export function planState(row: PlanRow, now = new Date()): PlanState {
  const base = {
    status: row.plan_status,
    trial_ends_at: row.trial_ends_at,
    days_left: null,
    grace_ends_at: null,
  };
  if (row.plan_status === "trial") {
    const ends = Date.parse(row.trial_ends_at ?? "");
    if (!Number.isFinite(ends) || ends <= now.getTime())
      return {
        ...base,
        mode: "read_only",
        notice: "trial_ended",
        days_left: 0,
      };
    const days = Math.ceil((ends - now.getTime()) / DAY);
    return {
      ...base,
      mode: "full",
      notice: days <= TRIAL_WARNING_DAYS ? "trial_ending" : "trial",
      days_left: days,
    };
  }
  if (row.plan_status === "past_due") {
    const since = Date.parse(row.past_due_since ?? "");
    const grace = Number.isFinite(since)
      ? new Date(since + PAST_DUE_GRACE_DAYS * DAY).toISOString()
      : null;
    const over = !grace || Date.parse(grace) <= now.getTime();
    return {
      ...base,
      mode: over ? "read_only" : "full",
      notice: over ? "payment_overdue" : "payment_failed",
      grace_ends_at: grace,
    };
  }
  if (row.plan_status === "canceled")
    return { ...base, mode: "read_only", notice: "canceled" };
  return { ...base, mode: "full", notice: null };
}

const ACTIVE: PlanRow = {
  plan_status: "active",
  trial_ends_at: null,
  past_due_since: null,
};
export async function workspacePlan(workspaceId: string): Promise<PlanState> {
  // Local runs and tests without a database use LOCAL_PLAN (default active).
  if (process.env.APP_MODE === "local" || !process.env.SUPABASE_URL)
    return planState(localPlan());
  const { data, error } = await supabase()
    .from("workspaces")
    .select("plan_status,trial_ends_at,past_due_since")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new AppError(503, "Workspace plan is unavailable");
  return planState((data as PlanRow | null) ?? ACTIVE);
}
// Local and e2e runs can preview any state, e.g. LOCAL_PLAN=trial:2 (days
// left), trial:0, past_due:3 (days since the failed payment), canceled.
function localPlan(): PlanRow {
  const [status, n] = (process.env.LOCAL_PLAN ?? "active").split(":");
  const days = Number(n ?? 0);
  if (status === "trial")
    return {
      plan_status: "trial",
      trial_ends_at: new Date(Date.now() + days * DAY - 60000).toISOString(),
      past_due_since: null,
    };
  if (status === "past_due")
    return {
      plan_status: "past_due",
      trial_ends_at: null,
      past_due_since: new Date(Date.now() - days * DAY).toISOString(),
    };
  if (status === "canceled") return { ...ACTIVE, plan_status: "canceled" };
  return ACTIVE;
}

export class WorkspaceReadOnly extends AppError {
  code = "WORKSPACE_READ_ONLY";
  constructor(public notice: PlanState["notice"]) {
    super(
      402,
      notice === "canceled"
        ? "Your plan was canceled. Choose a plan to create and send again."
        : notice === "payment_overdue"
          ? "Your payment is overdue. Update your card to create and send again."
          : "Your trial has ended. Choose a plan to create and send again.",
    );
  }
}
export async function assertWorkspaceWritable(workspaceId: string) {
  const plan = await workspacePlan(workspaceId);
  if (plan.mode === "read_only") throw new WorkspaceReadOnly(plan.notice);
  return plan;
}

// Staff changes that stay open while read-only: signing in and out, your own
// account, finishing work already signed by a client, and paying.
export function allowedWhileReadOnly(path: string[]) {
  return (
    path[0] === "auth" ||
    path[0] === "account" ||
    path[0] === "billing" ||
    (path[0] === "proposals" &&
      ["countersign", "retry", "jobs"].includes(path[2] ?? ""))
  );
}
