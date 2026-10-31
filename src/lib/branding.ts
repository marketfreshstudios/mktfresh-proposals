import { proposalLink } from "./links";
import { escape } from "./presentation";
import type { Proposal } from "./model";
import { emailLayout } from "./email-layout";
export { accentText } from "./email-layout";
export function proposalEmailNote(text: string) {
  return text.replace(/(?:^|\n\n)Review your proposal: https?:\/\/\S+\s*$/, "");
}
export function emailHtml(
  p: Proposal,
  text: string,
  proposalEmail = false,
  note?: string,
) {
  const s = p.workspace_settings,
    message = proposalEmail ? (note ?? proposalEmailNote(text)) : text,
    url = proposalLink(p);
  return emailLayout({
    title: p.title,
    bodyHtml: `<p style="margin:0 0 18px;line-height:1.65">${escape(message).replaceAll("\n", "<br>")}</p>`,
    bodyText: message,
    button: { label: "View proposal", url },
    workspace: s?.company_name ?? "Proposal",
    sender: p.sender?.display_name ?? s?.owner ?? "Staff",
    contact: [s?.email, s?.phone, s?.address].filter(Boolean).join(" · "),
    accent: s?.accent_colour ?? "#365c4a",
    logo:
      s?.logo && p.token
        ? url.replace("/p/", "/api/public/") + "/brand/logo"
        : undefined,
  }).html;
}
