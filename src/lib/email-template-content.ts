import { z } from "zod";
import { check, type Proposal, type RichText } from "./model";
import { escape, variables } from "./presentation";
export const emailFields = {
  "client.first_name": "Client first name",
  "client.full_name": "Client full name",
  "client.company": "Client company",
  "sender.name": "Sender name",
  "workspace.name": "Workspace name",
  "proposal.title": "Proposal title",
  "proposal.validity": "Validity sentence",
  "proposal.date": "Proposal date",
  "quote.one_time_total": "One-time total",
  "quote.monthly_total": "Monthly total",
  "quote.yearly_total": "Yearly total",
  "quote.selected_items": "Selected products",
};
export const plainBody = (text: string): RichText => ({
  type: "doc",
  content: text.split(/\n\s*\n/).map((text) => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  })),
});
const def = (
  key: string,
  name: string,
  subject: string,
  body: string,
  label: string,
  staff = false,
) => ({
  key,
  name,
  subject,
  body: plainBody(body),
  button_label: label,
  staff,
  version_id: null as string | null,
  updated_at: null as string | null,
  updated_by: null as string | null,
});
export const emailDefaults = [
  def(
    "proposal_sent",
    "Proposal sent",
    "{{proposal.title}}",
    "Hi {{client.first_name}},\n\nYour proposal is ready. It sets out the scope, the next steps and the agreement.\n\n{{proposal.validity}}\n\nPlease take a look, and reply if you have any questions.",
    "View proposal",
  ),
  def(
    "reminder_unopened",
    "Reminder · unopened",
    "Reminder: {{proposal.title}}",
    "Hi {{client.first_name}},\n\nHere’s a reminder that your proposal is ready whenever you are.\n\n{{proposal.validity}}\n\nPlease reply if you have any questions.",
    "View proposal",
  ),
  def(
    "reminder_viewed",
    "Reminder · viewed, not signed",
    "Any questions about {{proposal.title}}?",
    "Hi {{client.first_name}},\n\nI’m following up on the proposal you viewed. If anything needs clarification, just reply to this email.\n\n{{proposal.validity}}",
    "View proposal",
  ),
  def(
    "signed_copy",
    "Signed copy (client)",
    "Your signed copy: {{proposal.title}}",
    "Hi {{client.first_name}},\n\nThank you for signing. Your signed copy is attached, and our company countersignature is next.\n\nYou can also open the secure proposal to read or download your copy.",
    "View signed copy",
  ),
  def(
    "billing_setup",
    "Finish billing setup",
    "Finish billing setup: {{proposal.title}}",
    "Hi {{client.first_name}},\n\nYour proposal is signed. There’s one more step to finish setting up the recurring services you chose.\n\nOpen the secure proposal to review the billing details and continue.",
    "Finish billing setup",
  ),
  def(
    "completed",
    "Countersigned / completed",
    "Your completed agreement: {{proposal.title}}",
    "Hi {{client.first_name}},\n\nYour proposal is now signed by both parties. The completed copy is attached for your records.\n\nThank you for choosing {{workspace.name}}.",
    "View completed copy",
  ),
  def(
    "billing_updated",
    "Subscription updated",
    "Billing updated: {{proposal.title}}",
    "Hi {{client.first_name}},\n\nThe recurring services in your signed proposal have been added to your subscription. You can review the agreed services in your proposal.\n\nAny one-time fees are invoiced separately.",
    "View proposal",
  ),
  def(
    "staff_viewed",
    "Client opened proposal",
    "Client opened {{proposal.title}}",
    "{{client.full_name}} at {{client.company}} opened the proposal.",
    "Review proposal",
    true,
  ),
  def(
    "staff_signed",
    "Client signed",
    "Client signed {{proposal.title}}",
    "{{client.full_name}} signed the proposal. Review the agreement and apply the company countersignature when you’re ready.",
    "Review and countersign",
    true,
  ),
  def(
    "staff_completed",
    "Agreement completed",
    "Agreement completed: {{proposal.title}}",
    "The client and company signatures have been recorded. The completed agreement is available on the proposal record.",
    "Review proposal",
    true,
  ),
  def(
    "staff_declined",
    "Client declined",
    "Client declined {{proposal.title}}",
    "{{client.full_name}} at {{client.company}} declined the proposal.",
    "Review proposal",
    true,
  ),
  def(
    "staff_billing_failed",
    "Billing needs attention",
    "Billing needs attention: {{proposal.title}}",
    "Background work needs attention. Open the proposal record to review the billing or document job and retry when ready.",
    "Review proposal",
    true,
  ),
  def(
    "staff_copy",
    "Signed document copy",
    "Signed copy: {{proposal.title}}",
    "A signed document copy is attached. The proposal record contains the signatures and full evidence.",
    "Review proposal",
    true,
  ),
];
export type EmailTemplate = (typeof emailDefaults)[number];
export function definition(key: string) {
  const t = emailDefaults.find((t) => t.key === key);
  check(t, "Unknown email template", 404);
  return structuredClone(t);
}
export function emailValues(p: Proposal) {
  const all = variables(p);
  return Object.fromEntries(
    Object.keys(emailFields).map((k) => [k, all[k] ?? ""]),
  );
}
export function resolveEmailText(text: string, map?: Record<string, string>) {
  const rendered = text.replace(/{{\s*([^{}]*?)\s*}}/g, (_, raw) => {
    const key = raw.trim();
    check(Object.hasOwn(emailFields, key), `Unknown email field: ${key}`);
    return map ? (map[key] ?? "") : `{{${key}}}`;
  });
  check(
    !/[{}]{2}/.test(text.replace(/{{\s*[^{}]*?\s*}}/g, "")),
    "Invalid email field: check the {{field.name}} spelling",
  );
  return rendered;
}
const safeLink = (href: string) => {
  check(
    !/{{|}}/.test(href),
    "Fields cannot be used in link destinations; the primary link is managed automatically",
  );
  try {
    const u = new URL(href);
    check(
      u.protocol === "https:" || u.protocol === "mailto:",
      "Email links must use HTTPS or mailto",
    );
    if (u.protocol === "mailto:")
      check(
        z.email().safeParse(u.pathname).success,
        "Enter a valid email link",
      );
    check(
      !/^\/(?:p|api\/public)\//.test(u.pathname),
      "The proposal link is managed by the primary button; remove this manually entered link",
    );
    return u.href;
  } catch (e) {
    throw e instanceof Error ? e : new Error("Invalid email link");
  }
};
export function validateEmailBody(body: RichText) {
  let size = 0,
    count = 0;
  function visit(n: RichText, depth = 0) {
    check(n && typeof n === "object", "Invalid email content");
    check(
      n.content === undefined || Array.isArray(n.content),
      "Invalid email content",
    );
    check(
      n.marks === undefined || Array.isArray(n.marks),
      "Invalid email formatting",
    );
    check(depth < 16 && ++count <= 1000, "Email body is too complex");
    check(
      [
        "doc",
        "paragraph",
        "text",
        "hardBreak",
        "bulletList",
        "orderedList",
        "listItem",
        "variable",
      ].includes(n.type),
      `Unsupported email content: ${n.type}`,
    );
    if (n.type === "variable")
      resolveEmailText(`{{${String(n.attrs?.path ?? "")}}}`);
    if (n.text) {
      size += n.text.length;
      resolveEmailText(n.text);
    }
    for (const m of n.marks ?? []) {
      check(m && typeof m === "object", "Invalid email formatting");
      check(
        ["bold", "italic", "link"].includes(m.type),
        `Unsupported email formatting: ${m.type}`,
      );
      if (m.type === "link") safeLink(String(m.attrs?.href ?? ""));
    }
    for (const c of n.content ?? []) visit(c, depth + 1);
  }
  visit(body);
  check(
    body.type === "doc" && size <= 20000,
    "Email body must be a document under 20,000 characters",
  );
  return body;
}
export function validateTemplate(input: unknown) {
  const t = z
    .object({
      subject: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .refine((v) => !/[\r\n]/.test(v), "Subject must be one line"),
      body: z.custom<RichText>((v) => typeof v === "object" && v !== null),
      button_label: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .refine((v) => !/[\r\n{}]/.test(v), "Button label must be plain text"),
    })
    .strict()
    .parse(input);
  resolveEmailText(t.subject);
  validateEmailBody(t.body);
  return t;
}
export function renderEmailBody(
  body: RichText,
  map: Record<string, string>,
): { html: string; text: string } {
  function render(n: RichText): { html: string; text: string } {
    if (n.type === "variable")
      return render({
        ...n,
        type: "text",
        text: `{{${String(n.attrs?.path)}}}`,
      });
    if (n.type === "text") {
      let text = resolveEmailText(n.text ?? "", map),
        html = escape(text).replaceAll("\n", "<br>");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") html = `<strong>${html}</strong>`;
        if (m.type === "italic") html = `<em>${html}</em>`;
        if (m.type === "link") {
          const href = safeLink(String(m.attrs?.href));
          html = `<a href="${escape(href)}" style="color:#365c4a;text-decoration:underline">${html}</a>`;
          text += ` (${href})`;
        }
      }
      return { html, text };
    }
    if (n.type === "hardBreak") return { html: "<br>", text: "\n" };
    const children = (n.content ?? []).map(render),
      text = children.map((c) => c.text).join("");
    if (!text.trim()) return { html: "", text: "" };
    const html = children.map((c) => c.html).join("");
    if (n.type === "paragraph")
      return {
        html: `<p style="margin:0 0 18px;font-size:16px;line-height:26px">${html}</p>`,
        text: text + "\n\n",
      };
    if (n.type === "listItem")
      return {
        html: `<li style="margin:0 0 8px;font-size:16px;line-height:26px">${html}</li>`,
        text: text,
      };
    if (n.type === "bulletList" || n.type === "orderedList")
      return {
        html: `<${n.type === "bulletList" ? "ul" : "ol"} style="margin:0 0 18px;padding-left:24px">${html}</${n.type === "bulletList" ? "ul" : "ol"}>`,
        text:
          children
            .map(
              (c, i) =>
                `${n.type === "orderedList" ? `${i + 1}.` : "•"} ${c.text.trim()}`,
            )
            .join("\n") + "\n\n",
      };
    return { html, text };
  }
  const r = render(body);
  return { html: r.html, text: r.text.trim() };
}
