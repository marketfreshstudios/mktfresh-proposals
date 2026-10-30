import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Repository } from "./repository";
import type { Storage } from "./storage";
import type { Mailer } from "./jobs";
import { check, type Actor, type Proposal } from "./model";
import type { WorkspaceSettings } from "./workspace";
import {
  emailTemplates,
  renderTemplate,
  definition,
  emailValues,
} from "./email-templates";
import { validateTemplate } from "./email-template-content";
import { emailIdentity } from "./email-identity";
import { defaultValidUntil } from "./validity";
import { appOrigin } from "./links";
const PreviewSchema = z
  .object({
    proposal_id: z.string().uuid().nullable().optional(),
    subject: z.string().optional(),
    body: z.unknown().optional(),
    button_label: z.string().optional(),
    request_id: z.string().uuid().optional(),
  })
  .strict();
export async function emailStudioPreview(
  repo: Repository,
  storage: Storage,
  actor: Actor,
  key: string,
  input: unknown,
  test = false,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const options = PreviewSchema.parse(input),
    stored =
      (await emailTemplates(repo)).find((t) => t.key === key) ??
      definition(key);
  check(
    !stored.staff ||
      (!options.subject && !options.body && !options.button_label),
    "Staff notifications are read-only",
    403,
  );
  const template = {
    ...stored,
    ...validateTemplate({
      subject: options.subject ?? stored.subject,
      body: options.body ?? stored.body,
      button_label: options.button_label ?? stored.button_label,
    }),
  };
  const settings = (
    await repo.entities<WorkspaceSettings>("workspace_settings")
  )[0];
  check(settings, "Configure Workspace first", 409);
  let p: Proposal;
  if (options.proposal_id) {
    const existing = await repo.get(options.proposal_id);
    check(existing, "Proposal not found", 404);
    p = structuredClone(existing);
    if (p.status === "draft") p.workspace_settings = settings;
  } else {
    const now = new Date().toISOString();
    p = {
      id: randomUUID(),
      revision: 0,
      title: "Your next project",
      client: {
        id: randomUUID(),
        company: "Example client",
        first_name: "Jamie",
        last_name: "Example",
        email: "client@example.test",
        phone: "",
        address: {},
        notes: "",
        qbo_customer_id: null,
        stripe_customer_id: null,
      },
      workspace_settings: settings,
      workspace_id: repo.workspaceId,
      template_id: null,
      status: "draft",
      token: "x".repeat(43),
      password_hash: null,
      valid_until: defaultValidUntil(settings),
      currency: settings.currency,
      source: "native",
      proposify_id: null,
      created_by: actor.actor,
      created_at: now,
      updated_at: now,
      sent_at: null,
      first_viewed_at: null,
      client_signed_at: null,
      completed_at: null,
      content: [],
      quote: [],
      versions: [],
      signers: [],
      events: [],
      files: [],
      billing_links: [],
      jobs: [],
      search_text: "",
    };
  }
  p.sender = {
    user_id: actor.actor.slice(6),
    display_name: actor.staff_name || actor.staff_email || "Staff",
    email: actor.staff_email || "",
    company_name: settings.company_name,
    sending_domain: settings.sending_domain,
  };
  let logo: string | undefined, logo_error: string | undefined;
  if (p.workspace_settings?.logo) {
    try {
      check(
        p.workspace_settings.logo.startsWith(repo.workspaceId + "/"),
        "Logo unavailable",
      );
      logo =
        "data:image/png;base64," +
        Buffer.from(await storage.get(p.workspace_settings.logo)).toString(
          "base64",
        );
    } catch {
      logo_error = "The saved logo could not be loaded; check it in Workspace.";
    }
  }
  const result = renderTemplate(template, p, {
    test,
    logo: logo ?? "",
    url: options.proposal_id
      ? `${appOrigin()}/p/${p.id}?preview=1`
      : `${appOrigin()}/studio/emails/${key}`,
  });
  return {
    p,
    template,
    result,
    values: emailValues(p),
    logo_error,
    request_id: options.request_id,
  };
}
export async function sendEmailTest(
  repo: Repository,
  storage: Storage,
  mailer: Mailer,
  actor: Actor,
  key: string,
  input: unknown,
) {
  const preview = await emailStudioPreview(
      repo,
      storage,
      actor,
      key,
      input,
      true,
    ),
    sender = preview.p.sender!;
  check(
    sender.email &&
      sender.sending_domain &&
      sender.email.split("@")[1].toLowerCase() ===
        sender.sending_domain.toLowerCase(),
    `Your email must use the workspace's verified sending domain (${sender.sending_domain || "set it in Workspace"}) before sending a test`,
  );
  check(preview.request_id, "Test request ID required");
  await mailer.send(
    {
      to: sender.email,
      ...emailIdentity(preview.p),
      subject: preview.result.subject,
      html: preview.result.html,
      text: preview.result.text,
    },
    `email-test:${repo.workspaceId}:${actor.actor}:${preview.request_id}`,
  );
  return { sent_to: sender.email };
}
