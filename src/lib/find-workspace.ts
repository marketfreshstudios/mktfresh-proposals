import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, check } from "./model";
import { supabase } from "./repository";
import { SupabaseTeamAuth } from "./team";
import { ResendMailer } from "./jobs";
import { yeswellFrom } from "./email-identity";
import { workspaceOrigin } from "./links";
import { keyHash } from "./signup";
import { yeswellEmail } from "./yeswell-email";
import { databaseAddresses } from "./workspace-host";
import { runtime } from "./runtime";
import { workspaceBusinessName } from "./business-details";
import type { WorkspaceSettings } from "./workspace";

export type FindWorkspaceDeps = {
  admit(emailHash: string, ipHash: string): Promise<boolean>;
  /** The active member with this email: first name, workspace and address. */
  member(email: string): Promise<{
    first_name: string;
    business: string;
    slug: string | null;
  } | null>;
  send(
    message: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    },
    key: string,
  ): Promise<void>;
  from(): string | null;
};

/** Emails the sign-in link for the workspace this email belongs to. The answer
 * is the same either way, so it never reveals who has a workspace. */
export async function findWorkspace(
  raw: unknown,
  ip: string,
  deps: FindWorkspaceDeps,
) {
  const { email } = z
    .object({
      email: z
        .string()
        .trim()
        .max(254)
        .pipe(z.email())
        .transform((e) => e.toLowerCase()),
    })
    .strict()
    .parse(raw);
  const from = deps.from();
  check(from, "Workspace email is not set up yet", 503);
  if (!(await deps.admit(keyHash("find-email", email), keyHash("find-ip", ip))))
    throw new AppError(429, "Too many requests. Try again in an hour.");
  const member = await deps.member(email);
  if (member) {
    const origin = workspaceOrigin(member.slug);
    const host = new URL(origin).host;
    await deps.send(
      {
        from: from!,
        to: email,
        subject: `Sign in to ${member.business}`,
        ...yeswellEmail({
          origin,
          title: "Your Yeswell workspace",
          greeting: `Hi ${member.first_name},`,
          paragraphs: [
            `Your workspace address is ${host}. Bookmark it to sign in directly next time.`,
            "If you didn't ask for this, you can ignore this email.",
          ],
          button: {
            label: `Sign in to ${member.business}`,
            url: `${origin}/login`,
          },
          workspace: member.business,
        }),
      },
      // One email per address an hour, however often it's asked for.
      `find-workspace:${createHash("sha256").update(email).digest("hex").slice(0, 32)}:${Math.floor(Date.now() / 3600000)}`,
    );
  }
  return { sent: true };
}

export function supabaseFindWorkspaceDeps(): FindWorkspaceDeps {
  const db = supabase();
  const auth = new SupabaseTeamAuth(db);
  const mailer = new ResendMailer();
  return {
    async admit(emailHash, ipHash) {
      const { data, error } = await db.rpc("admit_staff_password_reset", {
        target_email_hash: emailHash,
        target_ip_hash: ipHash,
      });
      if (error) throw new AppError(503, "Unavailable right now. Try again.");
      return data === true;
    },
    async member(email) {
      const identity = await auth.findByEmail(email);
      if (!identity?.confirmed || !identity.workspace_id) return null;
      const { data } = await db
        .from("staff_users")
        .select("display_name,status")
        .eq("user_id", identity.id)
        .eq("workspace_id", identity.workspace_id)
        .maybeSingle();
      if (data?.status !== "active") return null;
      const settings = (
        await runtime(identity.workspace_id).repo.entities<WorkspaceSettings>(
          "workspace_settings",
        )
      )[0];
      return {
        first_name: String(data.display_name).split(" ")[0],
        business: workspaceBusinessName(settings) || "your workspace",
        slug: await databaseAddresses.slugForId(identity.workspace_id),
      };
    },
    send: (message, key) => mailer.send(message, key),
    from: () => yeswellFrom(),
  };
}
