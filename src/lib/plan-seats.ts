import { AppError } from "./model";
import { supabase } from "./repository";

/** Trials get Agency's people. */
export const TRIAL_SEATS = 5;
export type SeatRow = {
  plan_status: string;
  stripe_subscription_id: string | null;
  subscription: { people?: number | null; plan?: string | null } | null;
};
/** How many people the plan covers; null means no limit (not billed). */
export function seatLimit(row: SeatRow): number | null {
  if (row.plan_status === "trial") return TRIAL_SEATS;
  if (!row.stripe_subscription_id) return null;
  const people = row.subscription?.people;
  return typeof people === "number" && people > 0 ? people : null;
}
export const seatsInUse = (people: { status?: string }[]) =>
  people.filter((p) => p.status !== "deactivated").length;

export async function workspaceSeatLimit(workspaceId: string) {
  // Local runs and tests: LOCAL_SEAT_LIMIT (unset = no limit).
  if (process.env.APP_MODE === "local" || !process.env.SUPABASE_URL) {
    const n = Number(process.env.LOCAL_SEAT_LIMIT ?? "");
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  const { data, error } = await supabase()
    .from("workspaces")
    .select("plan_status,stripe_subscription_id,subscription")
    .eq("id", workspaceId)
    .single();
  if (error) throw new AppError(503, "Workspace plan is unavailable");
  return seatLimit(data as SeatRow);
}

export class SeatLimitReached extends AppError {
  code = "SEAT_LIMIT";
  constructor(public limit: number) {
    super(
      402,
      `All ${limit} people on your plan are in use. Add a person to your plan first.`,
    );
  }
}
/** Refuses a new or returning person when every seat is in use. */
export async function assertSeatAvailable(
  workspaceId: string,
  people: { status?: string }[],
) {
  const limit = await workspaceSeatLimit(workspaceId);
  if (limit !== null && seatsInUse(people) >= limit)
    throw new SeatLimitReached(limit);
}
