import { jobRecordAnchor, type JobFailure } from "./job-presentation";
import { publishedPresentation } from "./editor-publication";
import {
  billingCompletionText,
  completedCheckouts,
  type BillingCompletion,
} from "./billing-confirmation";
import { randomUUID } from "node:crypto";
import { check, type Actor, type Proposal, type Job } from "./model";
import type { Repository } from "./repository";
import { escape } from "./presentation";
import {
  resolveEmailText,
  emailDefaults,
  editableEmail,
  oldJobEmailDefault,
  definition,
  emailValues,
  validateTemplate,
  plainBody,
  renderEmailBody,
  type EmailTemplate,
} from "./email-template-content";
export * from "./email-template-content";
import { emailLayout } from "./email-layout";
import { proposalLink, appOrigin } from "./links";
import { emailIdentity } from "./email-identity";
import { sha256, canonical } from "./content";
export async function emailTemplates(repo: Repository) {
  const saved = await repo.entities<EmailTemplate>("email_templates");
  const previous = saved.find((t) => t.key === "staff_billing_failed");
  if (
    previous &&
    previous.subject === oldJobEmailDefault.subject &&
    previous.button_label === oldJobEmailDefault.button_label &&
    canonical(previous.body) === canonical(oldJobEmailDefault.body)
  ) {
    const replacement = {
      ...previous,
      ...definition(previous.key),
      version_id: randomUUID(),
      updated_at: new Date().toISOString(),
      updated_by: "system",
    };
    await repo.saveEmailTemplate(
      {
        ...replacement,
        id:
          (previous as EmailTemplate & { id?: string }).id ??
          emailId(`template:${repo.workspaceId}:${previous.key}`),
      },
      {
        id: replacement.version_id!,
        type: "email_template_saved",
        actor: "system",
        ip: "",
        user_agent: "",
        created_at: replacement.updated_at!,
        metadata: {
          key: previous.key,
          name: replacement.name,
          migration: true,
        },
      },
    );
    saved.splice(saved.indexOf(previous), 1, replacement);
  }
  return emailDefaults.map((d) =>
    editableEmail(d)
      ? structuredClone(saved.find((t) => t.key === d.key) ?? d)
      : structuredClone(d),
  );
}
function emailId(value: string) {
  const hash = sha256(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function saveEmailTemplate(
  repo: Repository,
  actor: Actor,
  key: string,
  input: unknown,
  reset = false,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const d = definition(key);
  if (key.startsWith("team_"))
    check(
      actor.staff_role === "owner",
      "Only a super admin can edit team emails",
      403,
    );
  check(editableEmail(d), "Staff notifications are read-only", 403);
  const data = reset ? d : validateTemplate(input, key);
  const previous = (await emailTemplates(repo)).find((t) => t.key === key);
  const id = randomUUID(),
    now = new Date(
      Math.max(
        Date.now(),
        previous?.updated_at ? Date.parse(previous.updated_at) + 1 : 0,
      ),
    ).toISOString();
  const template = {
    ...d,
    ...data,
    version_id: id,
    updated_at: now,
    updated_by: actor.actor,
  };
  await repo.saveEmailTemplate(
    {
      ...template,
      id:
        (previous as EmailTemplate & { id?: string })?.id ??
        emailId(`template:${repo.workspaceId}:${key}`),
    },
    {
      id,
      type: "email_template_saved",
      ...actor,
      created_at: now,
      metadata: {
        name: d.name,
        key,
        version_id: id,
        reset,
        subject: template.subject,
      },
    },
  );
  return template;
}
export function emailKey(p: Proposal, j: Pick<Job, "id" | "payload">) {
  if (["unopened", "viewed"].includes(String(j.payload.reminder_kind)))
    return `reminder_${j.payload.reminder_kind}`;
  if (
    typeof j.payload.email_template_key === "string" &&
    j.payload.email_template_key.startsWith("reminder_")
  )
    return p.first_viewed_at ? "reminder_viewed" : "reminder_unopened";
  if (typeof j.payload.email_template_key === "string")
    return j.payload.email_template_key;
  const id = j.id;
  if (id.includes(":send:")) return "proposal_sent";
  if (j.payload.reminder_day || id.includes(":reminder:"))
    return p.first_viewed_at ? "reminder_viewed" : "reminder_unopened";
  if (
    id.includes(":billing-setup") ||
    id.includes(":billing-resend:") ||
    id.includes(":billing-link:")
  )
    return "billing_setup";
  if (id.includes(":billing-added")) return "billing_updated";
  if (j.payload.file_id)
    return j.payload.to === p.client.email
      ? p.files.find((f) => f.id === j.payload.file_id)?.stage === "company"
        ? "completed"
        : "signed_copy"
      : "staff_copy";
  const kind = id.match(/:notify:([^:]+)/)?.[1];
  return (
    (
      {
        viewed: "staff_viewed",
        signed: "staff_signed",
        completed: "staff_completed",
        declined: "staff_declined",
        sync_failed: "staff_billing_failed",
      } as Record<string, string>
    )[kind ?? ""] ?? "staff_billing_failed"
  );
}
export type EmailSnapshot = {
  template_key: string;
  template_version_id: string | null;
  subject: string;
  html: string;
  text: string;
  body_html: string;
  button_label: string;
  button_url: string;
  to: string;
  from: string;
  reply_to: string;
  prepared_at: string;
};
export function renderTemplate(
  t: EmailTemplate,
  p: Proposal,
  options: {
    test?: boolean;
    showPoweredBy?: boolean;
    logo?: string;
    url?: string;
    declineNote?: string;
    billingConfirmation?: BillingCompletion;
    jobFailure?: JobFailure;
  } = {},
) {
  validateTemplate(
    {
      subject: t.subject,
      body: t.body,
      button_label: t.button_label,
    },
    t.key,
  );
  const map = {
      ...emailValues(p),
      ...(options.jobFailure
        ? {
            "job.name": options.jobFailure.name,
            "job.summary": options.jobFailure.summary,
          }
        : {}),
    },
    subject = resolveEmailText(t.subject, map);
  check(
    subject.trim() && !/[\r\n]/.test(subject),
    "Email subject must resolve to one line",
  );
  const body = renderEmailBody(t.body, map);
  if (options.declineNote) {
    body.html += `<p style="margin:0 0 18px"><strong>Client note</strong><br>${escape(options.declineNote).replaceAll("\n", "<br>")}</p>`;
    body.text += "\n\nClient note:\n" + options.declineNote;
  }
  if (["billing_complete", "staff_billing_complete"].includes(t.key)) {
    const confirmed =
      options.billingConfirmation ??
      p.billing_links.flatMap(completedCheckouts).at(-1);
    const facts = confirmed
      ? billingCompletionText(
          confirmed,
          p.workspace_settings?.timezone,
          p.workspace_settings?.money?.cents,
        )
      : "Confirmed billing details will appear here after Stripe finishes setup.";
    // Provider/product names are literal receipt data, never template instructions.
    body.html += facts
      .split("\n\n")
      .map(
        (text) =>
          `<p style="margin:0 0 18px;font-size:16px;line-height:26px">${escape(text).replaceAll("\n", "<br>")}</p>`,
      )
      .join("");
    body.text += "\n\n" + facts;
  }
  if (options.jobFailure?.details) {
    body.html += `<p style="margin:16px 0;font-size:12px;line-height:18px;color:#625f56"><strong>Details</strong><br>${escape(options.jobFailure.details).replaceAll("\n", "<br>")}</p>`;
    body.text += "\n\nDetails: " + options.jobFailure.details;
  }
  const s = p.workspace_settings,
    link = t.staff
      ? `${appOrigin()}/proposals/${p.id}${["staff_signed", "staff_countersign_reminder"].includes(t.key) ? "?action=countersign" : ""}`
      : proposalLink(p);
  const layout = emailLayout({
    title:
      t.key === "team_invite"
        ? "You're invited"
        : t.key === "team_password_reset"
          ? "Choose a new password"
          : t.key === "question_reply"
            ? "A reply to your question"
            : p.title,
    bodyHtml: body.html,
    bodyText: body.text,
    workspace: s?.company_name ?? "Workspace",
    sender: p.sender?.display_name ?? s?.owner ?? "Staff",
    contact: [s?.email, s?.phone, s?.address].filter(Boolean).join(" · "),
    accent: s?.accent_colour ?? "#365c4a",
    logo:
      options.logo ??
      (s?.logo && p.token
        ? proposalLink(p).replace("/p/", "/api/public/") + "/brand/logo"
        : undefined),
    button: {
      label: t.button_label,
      url:
        options.url ??
        (options.jobFailure
          ? `${appOrigin()}/proposals/${p.id}?job=${encodeURIComponent(options.jobFailure.job_id)}#${jobRecordAnchor(options.jobFailure.job_id)}`
          : link),
    },
    test: options.test,
    staff: t.staff,
    poweredBy:
      !t.staff && (options.showPoweredBy ?? s?.show_powered_by !== false)
        ? { origin: appOrigin() }
        : undefined,
  });
  return {
    ...layout,
    subject: options.test ? `[Test] ${subject}` : subject,
    body_html: body.html,
    button_url:
      options.url ??
      (options.jobFailure
        ? `${appOrigin()}/proposals/${p.id}?job=${encodeURIComponent(options.jobFailure.job_id)}#${jobRecordAnchor(options.jobFailure.job_id)}`
        : link),
    button_label: t.button_label,
  };
}
export async function prepareEmail(
  repo: Repository,
  p: Proposal,
  j: Job,
): Promise<EmailSnapshot> {
  // Client correspondence must describe the last publication, never invalid staff work.
  if (p.versions.length && !p.signers.length) {
    const v = p.versions.at(-1)!;
    p = { ...publishedPresentation(p), content: v.content, quote: v.quote };
  }
  const key = emailKey(p, j),
    templates = await emailTemplates(repo);
  let t = templates.find((t) => t.key === key) ?? definition(key);
  if (j.payload.email_template)
    t = { ...t, ...(j.payload.email_template as Partial<EmailTemplate>) };
  else if (key === "proposal_sent" && typeof j.payload.note === "string")
    t = {
      ...t,
      subject:
        typeof j.payload.subject === "string" ? j.payload.subject : t.subject,
      body: plainBody(j.payload.note || "Your proposal is ready to review."),
    };
  const currentSettings = (
    await repo.entities<import("./workspace").WorkspaceSettings>(
      "workspace_settings",
    )
  )[0];
  const r = renderTemplate(t, p, {
    url:
      typeof j.payload.question_url === "string"
        ? j.payload.question_url
        : undefined,
    showPoweredBy: currentSettings?.show_powered_by !== false,
    jobFailure: j.payload.job_failure as JobFailure | undefined,
    billingConfirmation: j.payload.billing_confirmation as
      BillingCompletion | undefined,
    declineNote:
      key === "staff_declined"
        ? String(j.payload.text ?? "").split("\n\nClient note:\n")[1]
        : undefined,
  });
  return {
    ...r,
    template_key: key,
    template_version_id: t.version_id,
    to: String(j.payload.to),
    ...(typeof j.payload.from === "string" &&
    typeof j.payload.reply_to === "string"
      ? { from: j.payload.from, reply_to: j.payload.reply_to }
      : emailIdentity(p)),
    prepared_at: new Date().toISOString(),
  };
}
export type EmailLog = {
  id: string;
  proposal_id: string;
  sent_at: string;
  snapshot: EmailSnapshot;
};
export async function logSentEmail(
  repo: Repository,
  p: Proposal,
  j: Pick<Job, "id">,
  snapshot: EmailSnapshot,
) {
  const id = emailId(`email:${repo.workspaceId}:${p.id}:${j.id}`);
  if ((await repo.emailLog<EmailLog>(p.id)).some((e) => e.id === id)) return;
  await repo.put("email_log", {
    id,
    proposal_id: p.id,
    sent_at: new Date().toISOString(),
    snapshot,
  });
}
export async function proposalEmailLog(
  repo: Repository,
  id: string,
): Promise<EmailLog[]> {
  check(await repo.get(id), "Not found", 404);
  return (await repo.emailLog<EmailLog>(id)).sort((a, b) =>
    b.sent_at.localeCompare(a.sent_at),
  );
}
