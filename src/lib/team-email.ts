import { randomUUID } from "node:crypto";
import type { Actor } from "./model";
import { check } from "./model";
import type { Repository } from "./repository";
import type { Mailer } from "./jobs";
import type { WorkspaceSettings } from "./workspace";
import type { StaffMember } from "./team-model";
import { staffRoleLabel } from "./team-model";
import {
  emailTemplates,
  definition,
  renderEmailBody,
  resolveEmailText,
} from "./email-templates";
import { emailLayout } from "./email-layout";
import { appOrigin } from "./links";
export async function sendTeamEmail(
  repo: Repository,
  mailer: Mailer,
  actor: Actor,
  input: {
    member: StaffMember;
    email: string;
    token: string;
    type: "invite" | "recovery";
    template?: "team_invite" | "team_password_reset";
  },
) {
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  check(settings, "Configure Workspace before inviting staff", 409);
  const email = actor.staff_email ?? "",
    domain = settings.sending_domain;
  check(
    email &&
      domain &&
      email.split("@")[1]?.toLowerCase() === domain.toLowerCase(),
    `Your email must use the workspace's verified sending domain (${domain || "set it in Workspace"}) before sending team email`,
    409,
  );
  const key =
    input.template ??
    (input.type === "invite" ? "team_invite" : "team_password_reset");
  const t =
    (await emailTemplates(repo)).find((t) => t.key === key) ?? definition(key);
  const values = {
    "team.name": input.member.display_name,
    "team.email": input.email,
    "team.role": staffRoleLabel(input.member.role),
    "sender.name": actor.staff_name ?? email,
    "workspace.name": settings.company_name,
  };
  const body = renderEmailBody(t.body, values),
    subject = resolveEmailText(t.subject, values);
  check(
    subject.trim() && !/[\r\n]/.test(subject),
    "Email subject must resolve to one line",
    409,
  );
  const url = new URL("/set-password", appOrigin());
  url.hash = new URLSearchParams({
    token_hash: input.token,
    type: input.type,
  }).toString();
  const layout = (buttonUrl: string) =>
    emailLayout({
      title: key === "team_invite" ? "You're invited" : "Choose a new password",
      bodyHtml: body.html,
      bodyText: body.text,
      button: { label: t.button_label, url: buttonUrl },
      workspace: settings.company_name,
      sender: actor.staff_name ?? email,
      contact: [settings.email, settings.phone, settings.address]
        .filter(Boolean)
        .join(" · "),
      accent: settings.accent_colour,
    });
  const id = randomUUID(),
    identity = {
      from: `${JSON.stringify(`${actor.staff_name ?? email} · ${settings.company_name}`)} <${email}>`,
      reply_to: email,
    };
  await mailer.send(
    { to: input.email, ...identity, subject, ...layout(url.toString()) },
    `team:${repo.workspaceId}:${id}`,
  );
  // Log the rendered message, but never retain a reusable password/invite credential.
  const redacted = layout(`${appOrigin()}/set-password`);
  await repo.put("email_log", {
    id,
    proposal_id: null,
    target_user_id: input.member.user_id,
    sent_at: new Date().toISOString(),
    snapshot: {
      template_key: key,
      template_version_id: t.version_id,
      subject,
      ...redacted,
      body_html: body.html,
      button_label: t.button_label,
      button_url: `${appOrigin()}/set-password`,
      to: input.email,
      ...identity,
      prepared_at: new Date().toISOString(),
      credential_redacted: true,
    },
  });
  return { sent: true };
}
