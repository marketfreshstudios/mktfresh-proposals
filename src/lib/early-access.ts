import { createHash, timingSafeEqual } from "node:crypto";
import { AppError, check } from "./model";

// The yeswell.co early-access form (Elementor, on the marketing site) posts
// here through a webhook whose URL carries a shared key. Each signup is added
// to the Resend segment the launch email goes to.

const EMAIL = /^[^\s@<>,;"]{1,64}@[^\s@<>,;"]{1,190}\.[a-z]{2,}$/i;

/** Pulls the email and name out of an Elementor webhook, in either of its
 * shapes: `Email=…&Name=…` (labels as keys) or `fields[email][value]=…`. */
export function earlyAccessFields(form: URLSearchParams) {
  let email = "",
    name = "";
  for (const [key, raw] of form) {
    const value = raw.trim();
    const label = key.toLowerCase();
    if (/raw_value|\[(?:id|type|title|required)\]$/.test(label)) continue;
    if (!email && EMAIL.test(value) && /mail|^[^[]*$/.test(label))
      email = value;
    else if (!name && /name/.test(label) && !/form_name|mail/.test(label))
      name = value.slice(0, 100);
  }
  return email ? { email: email.toLowerCase(), name } : null;
}

/** The webhook body as form fields; a JSON body is flattened to the same. */
export function earlyAccessBody(raw: string) {
  if (!raw.trim().startsWith("{")) return new URLSearchParams(raw);
  const out = new URLSearchParams();
  const walk = (value: unknown, key: string) => {
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value))
        walk(v, key ? `${key}[${k}]` : k);
    else if (typeof value === "string") out.append(key, value);
  };
  try {
    walk(JSON.parse(raw), "");
  } catch {
    throw new AppError(400, "Unreadable form");
  }
  return out;
}

const same = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest(),
    y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

export type EarlyAccessDeps = {
  add(contact: {
    email: string;
    first_name?: string;
    last_name?: string;
  }): Promise<void>;
};

export async function receiveEarlyAccess(
  key: string,
  form: URLSearchParams,
  deps: EarlyAccessDeps = resendEarlyAccess(),
) {
  const expected = process.env.EARLY_ACCESS_WEBHOOK_KEY ?? "";
  check(expected.length >= 24 && same(key, expected), "Not found", 404);
  const fields = earlyAccessFields(form);
  check(fields, "An email address is required", 400);
  const [first, ...rest] = fields!.name.split(/\s+/).filter(Boolean);
  await deps.add({
    email: fields!.email,
    ...(first ? { first_name: first } : {}),
    ...(rest.length ? { last_name: rest.join(" ") } : {}),
  });
  return { ok: true };
}

export function resendEarlyAccess(): EarlyAccessDeps {
  return {
    async add(contact) {
      // A separate Full access key, so the key that sends email can stay
      // limited to sending. The sending key works if it has Full access.
      const key =
          process.env.RESEND_CONTACTS_API_KEY || process.env.RESEND_API_KEY,
        segment = process.env.EARLY_ACCESS_SEGMENT_ID;
      if (!key || !segment)
        throw new AppError(503, "Early access isn't set up");
      const headers = {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };
      const created = await fetch("https://api.resend.com/contacts", {
        method: "POST",
        headers,
        body: JSON.stringify({ ...contact, segments: [{ id: segment }] }),
        signal: AbortSignal.timeout(15000),
      });
      if (created.ok) return;
      // Already a contact (from another list or an earlier signup): add them
      // to this segment as they are.
      const added = await fetch(
        `https://api.resend.com/contacts/${encodeURIComponent(contact.email)}/segments/${segment}`,
        { method: "POST", headers, signal: AbortSignal.timeout(15000) },
      );
      if (!added.ok) throw new AppError(502, "Couldn't save the signup");
    },
  };
}
