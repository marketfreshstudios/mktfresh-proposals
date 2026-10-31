import { escape } from "./presentation";
export function accentText(hex: string) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 > 0.179
    ? "#000000"
    : "#ffffff";
}
export type EmailLayoutContent = {
  title: string;
  bodyHtml: string;
  bodyText: string;
  button: { label: string; url: string };
  workspace: string;
  sender: string;
  contact: string;
  accent: string;
  logo?: string;
  test?: boolean;
};
/** Table layout/inline fallbacks survive stripped CSS and classic Outlook's Word renderer. */
export function emailLayout(c: EmailLayoutContent) {
  const e = escape,
    font = "-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif",
    ink = accentText(c.accent);
  const html = `<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(c.title)}</title><style>:root{color-scheme:light dark;supported-color-schemes:light dark}body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}table{border-collapse:collapse!important}img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}a{overflow-wrap:anywhere}@media screen and (max-width:620px){.email-pad{padding:28px 22px!important}.email-outer{padding:12px 8px!important}.email-title{font-size:26px!important;line-height:34px!important}}@media(prefers-color-scheme:dark){.email-bg{background-color:#161614!important}.email-card{background-color:#24231f!important}.email-ink,.email-body p,.email-body li{color:#f4f2ed!important}.email-muted{color:#c7c4bb!important}.email-line{border-color:#524f46!important}.email-body a{color:#bcd8ca!important}}</style><!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head><body class="email-bg" style="margin:0;padding:0;background-color:#f3f1eb;color:#24231f;font-family:${font}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="email-outer" align="center" style="padding:32px 12px"><!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]--><table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;table-layout:fixed;word-wrap:break-word;overflow-wrap:anywhere;background-color:#ffffff;border-top:4px solid ${c.accent}"><tr><td class="email-pad" style="padding:40px 40px 36px;font-family:${font}">${c.logo ? `<img src="${e(c.logo)}" alt="${e(c.workspace)}" width="160" style="display:block;max-width:160px;width:auto;max-height:64px;height:auto;margin:0 0 32px">` : `<p class="email-ink" style="font-size:17px;font-weight:700;line-height:24px;color:#24231f;margin:0 0 32px">${e(c.workspace)}</p>`}${c.test ? '<p class="email-muted" style="font-size:12px;line-height:18px;color:#625f56;margin:0 0 12px">TEST EMAIL · SENT ONLY TO YOU</p>' : ""}<h1 class="email-title email-ink" style="font-family:${font};font-size:30px;line-height:38px;font-weight:650;color:#24231f;margin:0 0 24px">${e(c.title)}</h1><div class="email-body email-ink" style="font-size:16px;line-height:26px;color:#24231f">${c.bodyHtml}</div><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="360" style="width:100%;max-width:360px;table-layout:fixed;border-collapse:separate!important;margin-top:28px"><tr><td bgcolor="${c.accent}" style="background-color:${c.accent};border:1px solid ${c.accent};border-radius:6px;mso-padding-alt:14px 24px;text-align:center"><a class="email-cta" href="${e(c.button.url)}" style="display:block;word-break:break-word;overflow-wrap:anywhere;padding:14px 24px;border-radius:6px;font-family:${font};font-size:16px;font-weight:600;line-height:22px;color:${ink};text-decoration:none;mso-padding-alt:0"><!--[if mso]><i style="mso-font-width:150%;mso-text-raise:21pt" hidden>&emsp;</i><span style="mso-text-raise:10.5pt"><![endif]-->${e(c.button.label)}<!--[if mso]></span><i style="mso-font-width:150%" hidden>&emsp;&#8203;</i><![endif]--></a></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px"><tr><td class="email-line" style="border-top:1px solid #e0ddd4;padding-top:22px"><p class="email-muted" style="font-size:12px;line-height:19px;color:#625f56;margin:0">Sent by ${e(c.sender)} at ${e(c.workspace)}</p>${c.contact ? `<p class="email-muted" style="font-size:12px;line-height:19px;color:#625f56;margin:6px 0 0;white-space:pre-line">${e(c.contact)}</p>` : ""}</td></tr></table></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;
  const text = [
    c.workspace,
    c.test ? "TEST EMAIL · SENT ONLY TO YOU" : "",
    c.title,
    c.bodyText,
    `${c.button.label}: ${c.button.url}`,
    `Sent by ${c.sender} at ${c.workspace}`,
    c.contact,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
