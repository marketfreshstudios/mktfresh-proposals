import { escape } from "./presentation";
import { accessibleAccent } from "./brand";
import {
  curatedFonts,
  type FontChoice,
  type FontSettings,
} from "./proposal-fonts";
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
  senderTitle?: string;
  senderPhoto?: string;
  contact: string;
  accent: string;
  logo?: string;
  test?: boolean;
  staff?: boolean;
  fonts?: FontSettings["proposal_fonts"];
  poweredBy?: { origin: string };
};
const emailSans =
  "Instrument Sans,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif";
function emailFont(choice: FontChoice | undefined, fallback: string) {
  if (!choice) return fallback;
  const selected =
    typeof choice === "string"
      ? curatedFonts.find((font) => font.id === choice)
      : undefined;
  const name = typeof choice === "string" ? selected?.name : choice.name;
  const family = name?.replace(/[^a-zA-Z0-9 _-]/g, "").trim();
  const stack =
    selected?.category === "Monospace"
      ? "SFMono-Regular,Consolas,monospace"
      : selected?.category === "Sans"
        ? emailSans
        : "Georgia,Times New Roman,serif";
  return family ? `'${family}',${stack}` : fallback;
}

/** Inline fallbacks and table layout also work in clients that strip CSS. */
export function emailLayout(c: EmailLayoutContent) {
  const e = escape;
  const accent = /^#[a-f0-9]{6}$/i.test(c.accent) ? c.accent : "#365c4a";
  const band = c.staff ? "#13303a" : accent;
  const action = c.staff ? "#b4532a" : accent;
  const darkAction = c.staff ? "#e07a4a" : action;
  const bodyFont = c.staff ? emailSans : emailFont(c.fonts?.body, emailSans);
  const titleFont = c.staff
    ? "'DM Serif Display',Georgia,serif"
    : emailFont(c.fonts?.heading, "Georgia,Times New Roman,serif");
  const headingInk = c.staff ? "#13303a" : "#1c1b18";
  const darkLink = c.staff ? "#f3a683" : "#f2f5f5";
  const html = `<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${e(c.title)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}table{border-collapse:collapse!important}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}a{overflow-wrap:anywhere}
.email-body a{color:${accessibleAccent(band)}}
@media screen and (max-width:620px){.email-pad{padding:28px 22px!important}.email-outer{padding:12px 8px!important}.email-title{font-size:26px!important;line-height:34px!important}}
@media(prefers-color-scheme:dark){
.email-bg{background-color:${c.staff ? "#11181b" : "#12191c"}!important}
.email-card{background-color:${c.staff ? "#1c2529" : "#1d2529"}!important}
.email-ink,.email-body p,.email-body li{color:#f2f5f5!important}
.email-muted,.email-muted a{color:#cdd8db!important}.email-line{border-color:#52636b!important}
.email-body a{color:${darkLink}!important}
.email-test-tag{color:#f2f5f5!important;background-color:#303d43!important}
.email-action{background-color:${darkAction}!important;border-color:${darkAction}!important}
.email-cta{color:${accentText(darkAction)}!important}
}
</style>
<!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:#f1f4f5;color:#1c1b18;font-family:${e(bodyFont)}">
<div class="email-content" role="main">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="email-outer" align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;table-layout:fixed;word-wrap:break-word;overflow-wrap:anywhere;background-color:#ffffff;border-top:6px solid ${band}">
<tr><td class="email-pad" style="padding:36px 40px;font-family:${e(bodyFont)}">
${c.logo ? `<img src="${e(c.logo)}" alt="${e(c.workspace)}" width="160" style="display:block;max-width:160px;width:auto;max-height:64px;height:auto;margin:0 0 26px;background:#ffffff;border-radius:4px">` : `<p class="email-ink" style="font-size:16px;font-weight:700;line-height:23px;color:${headingInk};margin:0 0 26px">${e(c.workspace)}</p>`}
${c.test ? '<p style="margin:0 0 12px"><span class="email-test-tag" style="display:inline-block;border-radius:6px;padding:3px 8px;font-size:12px;line-height:18px;color:#3c4a50;background-color:#e4eaed">TEST EMAIL · SENT ONLY TO YOU</span></p>' : ""}
<h1 class="email-title email-ink" style="font-family:${e(titleFont)};font-size:34px;line-height:40px;font-weight:${c.staff ? 400 : 650};color:${headingInk};margin:0 0 20px">${e(c.title)}</h1>
<div class="email-body email-ink" style="font-size:16px;line-height:26px;color:#1c1b18">${c.bodyHtml}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="360" style="width:100%;max-width:360px;table-layout:fixed;border-collapse:separate!important;margin-top:24px">
<tr><td class="email-action" bgcolor="${action}" style="background-color:${action};border:1px solid ${action};border-radius:9999px;mso-padding-alt:14px 24px;text-align:center">
<a class="email-cta" href="${e(c.button.url)}" style="display:block;word-break:break-word;overflow-wrap:anywhere;padding:14px 24px;border-radius:9999px;font-family:${e(bodyFont)};font-size:16px;font-weight:600;line-height:22px;color:${accentText(action)};text-decoration:none;mso-padding-alt:0"><!--[if mso]><i style="mso-font-width:150%;mso-text-raise:21pt" hidden>&emsp;</i><span style="mso-text-raise:10.5pt"><![endif]-->${e(c.button.label)}<!--[if mso]></span><i style="mso-font-width:150%" hidden>&emsp;&#8203;</i><![endif]--></a>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px"><tr><td class="email-line" style="border-top:1px solid #dce3e6;padding-top:18px">
${c.senderPhoto ? `<img src="${e(c.senderPhoto)}" alt="" width="32" height="32" style="display:block;border-radius:50%;margin:0 0 8px">` : ""}
<p class="email-muted" style="font-size:12px;line-height:19px;color:#56646a;margin:0">Sent by ${e(c.sender)} at ${e(c.workspace)}</p>${c.senderTitle ? `<p class="email-muted" style="font-size:12px;line-height:19px;color:#56646a;margin:0">${e(c.senderTitle)}</p>` : ""}
${c.staff ? '<p class="email-muted" style="font-size:12px;line-height:19px;color:#56646a;margin:6px 0 0">Yeswell · Staff notification</p>' : ""}
${c.contact ? `<p class="email-muted" style="font-size:12px;line-height:19px;color:#56646a;margin:6px 0 0;white-space:pre-line">${e(c.contact)}</p>` : ""}
${c.poweredBy && !c.staff ? `<p class="email-muted" style="font-size:11px;line-height:18px;color:#56646a;margin:18px 0 0"><a href="https://yeswell.co" rel="noopener" style="color:#56646a;text-decoration:none"><img src="${e(c.poweredBy.origin)}/favicon-16.png" width="14" height="14" alt="" style="vertical-align:middle;margin-right:5px">Powered by Yeswell</a></p>` : ""}
</td></tr></table></td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></div></body></html>`;
  const text = [
    c.workspace,
    c.test ? "TEST EMAIL · SENT ONLY TO YOU" : "",
    c.title,
    c.bodyText,
    `${c.button.label}: ${c.button.url}`,
    `Sent by ${c.sender} at ${c.workspace}`,
    c.senderTitle,
    c.contact,
    c.staff ? "Yeswell · Staff notification" : "",
    c.poweredBy && !c.staff ? "Powered by Yeswell · https://yeswell.co" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
