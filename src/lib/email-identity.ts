import type { Proposal } from "./model";
import type { WorkspaceSettings } from "./workspace";

type SendingSettings = Pick<WorkspaceSettings, "email" | "sending_domain">;
export function workspaceSecuritySender(settings: SendingSettings) {
  const domain = settings.sending_domain?.toLowerCase();
  if (!domain) return null;
  return settings.email.split("@").at(-1)?.toLowerCase() === domain
    ? settings.email
    : `notifications@${domain}`;
}

export function staffFromAddress(email: string, settings: SendingSettings) {
  if (!settings.sending_domain || !email) return null;
  return email.split("@").at(-1)?.toLowerCase() ===
    settings.sending_domain.toLowerCase()
    ? email
    : workspaceSecuritySender(settings);
}
export type ProposalSender = {
  user_id: string;
  display_name: string;
  email: string;
  from_email?: string;
  company_name: string;
  sending_domain: string;
  job_title?: string;
  phone?: string;
  photo_path?: string;
};
export function emailIdentity(p: Proposal) {
  const sender = p.sender;
  const name = sender
    ? sender.from_email
      ? sender.display_name
      : `${sender.display_name} · ${sender.company_name}`
    : undefined;
  const email = sender?.email;
  if (!name || !email)
    throw new Error(
      "Choose a staff sender by sending or re-sending this proposal first",
    );
  const from = sender?.from_email ?? email;
  if (/[\r\n]/.test(name + email + from))
    throw new Error("Invalid email sender");
  return {
    from: `${JSON.stringify(name)} <${from}>`,
    reply_to:
      from === email && p.workspace_settings?.email_reply_to === "workspace"
        ? p.workspace_settings.email
        : email,
  };
}
export function staffRecipients(p: Proposal) {
  return [
    ...new Set(
      p.owner?.email
        ? [p.owner.email]
        : p.notification_emails?.length
          ? p.notification_emails
          : p.sender
            ? [p.sender.email]
            : [p.workspace_settings?.email ?? ""],
    ),
  ].filter(Boolean);
}
