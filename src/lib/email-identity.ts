import type { Proposal } from "./model";
export type ProposalSender = {
  user_id: string;
  display_name: string;
  email: string;
  company_name: string;
  sending_domain: string;
};
export function emailIdentity(p: Proposal) {
  const sender = p.sender;
  const name = sender
    ? `${sender.display_name} · ${sender.company_name}`
    : undefined;
  const email = sender?.email;
  if (!name || !email)
    throw new Error(
      "Choose a staff sender by sending or re-sending this proposal first",
    );
  if (/[\r\n]/.test(name + email)) throw new Error("Invalid email sender");
  return { from: `${JSON.stringify(name)} <${email}>`, reply_to: email };
}
export function staffRecipients(p: Proposal) {
  return [
    ...new Set(
      p.notification_emails?.length
        ? p.notification_emails
        : p.sender
          ? [p.sender.email]
          : [p.workspace_settings?.email ?? ""],
    ),
  ].filter(Boolean);
}
