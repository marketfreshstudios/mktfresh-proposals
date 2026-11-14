import { supabase } from "./repository";
import { ResendMailer } from "./jobs";
import { yeswellFrom } from "./email-identity";
import { workspaceOrigin } from "./links";
import { TRIAL_WARNING_DAYS } from "./plan";
import { yeswellEmail } from "./yeswell-email";
import { workspaceDomain } from "./workspace-address";

type Kind = "reminder" | "ended";
type Workspace = {
  id: string;
  name: string;
  slug: string | null;
  trial_ends_at: string;
};
export type TrialMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export function trialEmail(
  kind: Kind,
  workspace: Workspace,
  owner: { email: string; first_name: string },
): TrialMail {
  const url = `${workspaceOrigin(workspace.slug)}/billing`;
  const host = workspaceDomain() ? new URL(url).host : workspace.name;
  const subject =
    kind === "reminder"
      ? `Your Yeswell trial ends ${day(workspace.trial_ends_at).split(",")[0]}`
      : "Your Yeswell trial has ended";
  const lines =
    kind === "reminder"
      ? [
          `Your free trial of ${host} ends on ${day(workspace.trial_ends_at)}.`,
          "Choose a plan to keep creating and sending proposals. Your proposals and client links keep working either way.",
        ]
      : [
          `Your free trial of ${host} has ended.`,
          "Your proposals and client links still work. Choose a plan to create and send again.",
        ];
  return {
    to: owner.email,
    subject,
    ...yeswellEmail({
      origin: workspaceOrigin(workspace.slug),
      title:
        kind === "reminder" ? "Your trial ends soon" : "Your trial has ended",
      greeting: `Hi ${owner.first_name},`,
      paragraphs: lines,
      button: { label: "Choose a plan", url },
      workspace: workspace.name,
    }),
  };
}

/** Which trial emails are due now, oldest first. */
export function dueTrialEmails(
  rows: (Workspace & {
    trial_reminder_sent_at: string | null;
    trial_ended_sent_at: string | null;
  })[],
  now = new Date(),
) {
  const due: { kind: Kind; workspace: Workspace }[] = [];
  for (const w of rows) {
    const ends = Date.parse(w.trial_ends_at);
    if (!Number.isFinite(ends)) continue;
    if (ends <= now.getTime()) {
      if (!w.trial_ended_sent_at) due.push({ kind: "ended", workspace: w });
    } else if (
      !w.trial_reminder_sent_at &&
      ends - now.getTime() <= TRIAL_WARNING_DAYS * 86400000
    )
      due.push({ kind: "reminder", workspace: w });
  }
  return due;
}

/** Sends due trial emails to each workspace's active owners. Cron only. */
export async function sendTrialEmails(now = new Date()) {
  if (process.env.APP_MODE === "local") return 0;
  const from = yeswellFrom();
  if (!from) return 0;
  const db = supabase();
  const { data, error } = await db
    .from("workspaces")
    .select(
      "id,name,slug,trial_ends_at,trial_reminder_sent_at,trial_ended_sent_at",
    )
    .eq("plan_status", "trial");
  if (error) throw new Error("Unable to load trials");
  const mailer = new ResendMailer();
  let sent = 0;
  for (const { kind, workspace } of dueTrialEmails(data ?? [], now)) {
    const claimed = await db.rpc("claim_trial_email", {
      target_workspace: workspace.id,
      kind,
    });
    if (claimed.error || claimed.data !== true) continue;
    const owners = await db
      .from("staff_users")
      .select("user_id,display_name")
      .eq("workspace_id", workspace.id)
      .eq("role", "owner")
      .eq("status", "active");
    for (const owner of owners.data ?? []) {
      const user = await db.auth.admin.getUserById(owner.user_id);
      const email = user.data.user?.email;
      if (!email) continue;
      const message = trialEmail(kind, workspace, {
        email,
        first_name: String(owner.display_name).split(" ")[0],
      });
      await mailer
        .send(
          { from, ...message },
          `trial:${kind}:${workspace.id}:${owner.user_id}`,
        )
        .then(() => sent++)
        .catch(() => console.error("Unable to send a trial email"));
    }
  }
  return sent;
}
