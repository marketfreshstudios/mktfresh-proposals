import { supabase } from "./repository";
import { ResendMailer } from "./jobs";
import { yeswellFrom } from "./email-identity";
import { workspaceOrigin } from "./links";
import { yeswellEmail } from "./yeswell-email";
import { workspaceDomain } from "./workspace-address";
import { LOCAL_WORKSPACE_ID } from "./workspace";
import { DELETE_AFTER_DAYS, PAST_DUE_GRACE_DAYS } from "./plan";

// A workspace that stays read-only (no active plan: trial over, payment
// overdue or plan canceled) for 12 months is closed, then deleted 90 days
// later (Terms 12, Privacy 5). Owners are emailed at least 30 days before
// it closes; choosing a plan before deletion keeps it.

type Workspace = { id: string; name: string; slug: string | null };
type Due = {
  id: string;
  plan_status: string;
  read_only_since: string;
  closes_at: string;
};
type Owner = { id: string; email: string; first_name: string };

export type ClosingDeps = {
  dueForWarning(): Promise<Due[]>;
  workspace(id: string): Promise<Workspace | null>;
  owners(workspace: string): Promise<Owner[]>;
  send(
    message: { to: string; subject: string; text: string; html: string },
    key: string,
  ): Promise<void>;
  markWarned(workspace: string): Promise<boolean>;
  dueForClosure(): Promise<string[]>;
  close(workspace: string): Promise<void>;
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function closureWarningEmail(
  workspace: Workspace,
  owner: { email: string; first_name: string },
  due: Pick<Due, "plan_status" | "read_only_since" | "closes_at">,
) {
  const closesAt = due.closes_at;
  const url = `${workspaceOrigin(workspace.slug)}/billing`;
  const host = workspaceDomain() ? new URL(url).host : workspace.name;
  const deletes = new Date(
    Date.parse(closesAt) + DELETE_AFTER_DAYS * 86400000,
  ).toISOString();
  // Say why in the owner's terms; "read-only" is ours.
  const since = date(due.read_only_since);
  const why =
    due.plan_status === "canceled"
      ? `Your Yeswell plan for ${host} was canceled on ${since}.`
      : due.plan_status === "past_due"
        ? `A Yeswell payment for ${host} didn't go through on ${date(new Date(Date.parse(due.read_only_since) - PAST_DUE_GRACE_DAYS * 86400000).toISOString())}, and it hasn't been paid since.`
        : `Your free trial of ${host} ended on ${since}.`;
  return {
    to: owner.email,
    subject: `Your Yeswell workspace closes on ${date(closesAt)}`,
    ...yeswellEmail({
      origin: workspaceOrigin(workspace.slug),
      title: "Your workspace will close",
      greeting: `Hi ${owner.first_name},`,
      paragraphs: [
        `${why} You can still view and download your proposals, but you can't create or send new ones.`,
        `We'll close the workspace on ${date(closesAt)} and delete its proposals, clients and files on ${date(deletes)}.`,
        "To keep it, choose a plan before then. To keep copies instead, download the proposals you need as PDFs.",
      ],
      button: { label: "Choose a plan", url },
      workspace: workspace.name,
    }),
  };
}

/** Warns owners of workspaces about to close, then closes the ones due. Cron only. */
export async function closeAbandonedWorkspaces(
  deps: ClosingDeps = supabaseClosingDeps(),
) {
  let warned = 0,
    closed = 0;
  for (const due of await deps.dueForWarning()) {
    if (due.id === LOCAL_WORKSPACE_ID) continue;
    try {
      const workspace = await deps.workspace(due.id);
      if (!workspace) continue;
      let sent = 0;
      for (const owner of await deps.owners(due.id))
        await deps
          .send(
            closureWarningEmail(workspace, owner, due),
            `closure-warning:${due.id}:${owner.id}`,
          )
          .then(() => sent++)
          .catch(() => console.error("Unable to send a closing warning"));
      // Only a warning that reached an owner starts the 30 days.
      if (sent > 0 && (await deps.markWarned(due.id))) warned++;
    } catch {
      console.error("Unable to warn a workspace about closing");
    }
  }
  for (const id of await deps.dueForClosure()) {
    if (id === LOCAL_WORKSPACE_ID) continue;
    try {
      await deps.close(id);
      closed++;
    } catch {
      console.error("Unable to close a workspace");
    }
  }
  return { warned, closed };
}

export function supabaseClosingDeps(): ClosingDeps {
  const db = supabase();
  const mailer = new ResendMailer();
  return {
    async dueForWarning() {
      const { data, error } = await db.rpc(
        "workspaces_due_for_closure_warning",
      );
      if (error) throw new Error("Unable to load workspaces to warn");
      return (data ?? []) as Due[];
    },
    async workspace(id) {
      const { data } = await db
        .from("workspaces")
        .select("id,name,slug")
        .eq("id", id)
        .maybeSingle();
      return (data as Workspace | null) ?? null;
    },
    async owners(workspace) {
      const { data } = await db
        .from("staff_users")
        .select("user_id,display_name")
        .eq("workspace_id", workspace)
        .eq("role", "owner")
        .eq("status", "active");
      const out: Owner[] = [];
      for (const o of data ?? []) {
        const user = await db.auth.admin.getUserById(o.user_id);
        const email = user.data.user?.email;
        if (email)
          out.push({
            id: o.user_id,
            email,
            first_name: String(o.display_name).split(" ")[0],
          });
      }
      return out;
    },
    async send(message, key) {
      const from = yeswellFrom();
      if (!from) throw new Error("No sender");
      await mailer.send({ from, ...message }, key);
    },
    async markWarned(workspace) {
      const { data, error } = await db.rpc("mark_closure_warning_sent", {
        target_workspace: workspace,
      });
      if (error) throw new Error("Unable to record the warning");
      return data === true;
    },
    async dueForClosure() {
      const { data, error } = await db.rpc("workspaces_due_for_closure");
      if (error) throw new Error("Unable to load workspaces to close");
      return (data ?? []) as string[];
    },
    async close(workspace) {
      const { error } = await db.rpc("close_workspace", {
        target_workspace: workspace,
      });
      if (error) throw new Error("Unable to close the workspace");
    },
  };
}
