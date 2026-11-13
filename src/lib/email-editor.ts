import type { RichText } from "./model";
import {
  emailFields,
  definition,
  type EmailTemplate,
} from "./email-template-content";
/** Picker policy only. Existing saved content and send-time validation stay unchanged. */
export function emailPickerFields(key: string) {
  const prefixes = key.startsWith("team_")
    ? ["team.", "sender.", "workspace."]
    : key === "staff_billing_failed"
      ? ["job.", "client.", "proposal."]
      : key === "question_reply"
        ? ["sender.", "workspace."]
        : ["client.", "proposal.", "quote.", "sender.", "workspace."];
  return Object.fromEntries(
    Object.entries(emailFields).filter(([path]) =>
      prefixes.some((prefix) => path.startsWith(prefix)),
    ),
  );
}
export function emailButtonCaption(key: string, staff: boolean) {
  return `Button label · opens ${key.startsWith("team_") ? "the set-password page" : staff ? "the proposal record" : "the secure proposal"}`;
}
export const emailAttachments = (key: string) =>
  ["signed_copy", "completed", "staff_copy"].includes(key)
    ? "Signed PDF"
    : "None";
export function emailIsDefault(
  t: Pick<EmailTemplate, "key" | "subject" | "body" | "button_label">,
) {
  const d = definition(t.key);
  // Text tokens and atomic field chips are the same authored value.
  function normalized(n: RichText): RichText {
    if (n.type === "variable")
      return {
        type: "text",
        text: `{{${n.attrs?.path}}}`,
        ...(n.marks?.length ? { marks: n.marks } : {}),
      };
    const children: RichText[] = [];
    for (const child of n.content ?? []) {
      const next = normalized(child),
        last = children.at(-1);
      if (
        next.type === "text" &&
        last?.type === "text" &&
        JSON.stringify(last.marks ?? []) === JSON.stringify(next.marks ?? [])
      )
        last.text = (last.text ?? "") + (next.text ?? "");
      else children.push(next);
    }
    return { ...n, ...(n.content ? { content: children } : {}) };
  }
  // JSONB may reorder keys. This is a UI equality check, never a version hash.
  const bodyKey = (body: RichText) =>
    JSON.stringify(normalized(body), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0,
            ),
          )
        : value,
    );
  return (
    t.subject === d.subject &&
    t.button_label === d.button_label &&
    bodyKey(t.body) === bodyKey(d.body)
  );
}
