import { proposalLink } from "./links";
import { escape } from "./presentation";
import type { Proposal } from "./model";
// Pick black or white for at least 4.5:1 contrast on any entered sRGB accent.
export function accentText(hex: string) {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
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
    accent = s?.accent_colour ?? "#245547",
    url = proposalLink(p),
    message = proposalEmail ? (note ?? proposalEmailNote(text)) : text;
  return `<div style="max-width:600px;margin:auto;background:#fff;color:#12151a;font:15px/1.6 Arial,sans-serif;padding:32px;border-top:4px solid ${accent}">${s?.logo && p.token ? `<img src="${escape(url.replace("/p/", "/api/public/"))}/brand/logo" alt="${escape(s.company_name)}" style="max-width:160px;max-height:60px">` : ""}<p style="font-weight:bold">${escape(s?.company_name ?? "Proposal")}</p><h1 style="font-size:24px">${escape(p.title)}</h1>${proposalEmail ? "<p>Your proposal is ready to review.</p>" : ""}${message ? `<p style="white-space:pre-line">${escape(message)}</p>` : ""}${p.token ? `<p><a href="${escape(url)}" style="display:inline-block;background:${accent};color:${accentText(accent)};padding:12px 20px;text-decoration:none">View proposal</a></p>` : ""}<p style="font-size:12px;color:#555">Sent by ${escape(p.sender?.display_name ?? s?.owner ?? "your sender")} at ${escape(s?.company_name ?? "your workspace")}</p></div>`;
}
