import { emailLayout } from "./email-layout";

const escape = (v: string) =>
  v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Yeswell's own account emails (signup, trial, billing), in the team-email style. */
export function yeswellEmail(c: {
  origin: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  button: { label: string; url: string };
  workspace: string;
}) {
  const lines = [c.greeting, ...c.paragraphs];
  return emailLayout({
    staff: true,
    origin: c.origin,
    title: c.title,
    bodyHtml: lines
      .map((l) => `<p style="margin:0 0 18px">${escape(l)}</p>`)
      .join(""),
    bodyText: lines.join("\n\n"),
    button: c.button,
    workspace: c.workspace,
    sender: "Yeswell",
    contact: "",
    accent: "#13303a",
  });
}
