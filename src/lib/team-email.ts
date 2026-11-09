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
import { escape } from "./presentation";
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
    replyTo?: string;
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
      staff: true,
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
      reply_to: input.replyTo ?? email,
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

/** A verified workspace domain can send even if the public contact uses another domain. */
export function workspaceSecuritySender(settings: WorkspaceSettings) {
  const domain = settings.sending_domain;
  if (!domain) return null;
  return settings.email.split("@")[1]?.toLowerCase() === domain
    ? settings.email
    : `notifications@${domain}`;
}

export async function sendPasswordChangedEmail(
  repo: Repository,
  mailer: Mailer,
  member: Pick<StaffMember, "workspace_id" | "user_id">,
  email: string,
) {
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  const from = settings && workspaceSecuritySender(settings);
  check(settings && from, "Configure a verified workspace sending domain", 409);
  const title = "Your Yeswell password was changed";
  const body = "Your Yeswell account now uses your new password.";
  const help = "Not you? Contact your workspace admin right away.";
  const button = { label: "Sign in", url: `${appOrigin()}/login` };
  const layout = emailLayout({
    title,
    staff: true,
    bodyHtml: `<p>${escape(body)}</p><p>${escape(help)}</p>`,
    bodyText: `${body}\n\n${help}`,
    button,
    workspace: settings.company_name,
    sender: "Yeswell",
    contact: settings.email,
    accent: settings.accent_colour,
  });
  const identity = {
    from: `${JSON.stringify(`Yeswell · ${settings.company_name}`)} <${from}>`,
    reply_to: settings.email,
  };
  const id = randomUUID();
  await mailer.send(
    { to: email, ...identity, subject: title, ...layout },
    `team:${repo.workspaceId}:${id}`,
  );
  await repo.put("email_log", {
    id,
    proposal_id: null,
    target_user_id: member.user_id,
    sent_at: new Date().toISOString(),
    snapshot: {
      template_key: "staff_password_changed",
      subject: title,
      ...layout,
      button_label: button.label,
      button_url: button.url,
      to: email,
      ...identity,
      prepared_at: new Date().toISOString(),
    },
  });
}
