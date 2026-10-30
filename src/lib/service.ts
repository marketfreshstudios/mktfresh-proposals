import { proposalEmailNote } from "./branding";
import { stripeCustomerMatches } from "./client-billing";
import type { StripeTransport } from "./catalog";
import { defaultValidUntil } from "./validity";
import { reviewBlocks, pendingSections } from "./ai-review";
import {
  cloneQuote,
  draftItems,
  chooseItem,
  quoteSublines,
  selected as itemSelected,
  prepareQuote,
  billingLines,
  selectedContent,
} from "./quote-model";
import { settingsSnapshot, withDraftSettings } from "./proposal-settings";
import { templateDefaultQuote } from "./template-quote";
import { workspaceStaff } from "./auth";
import { proposalLink, appOrigin } from "./links";
import { emailIdentity, staffRecipients } from "./email-identity";
import { companySignature } from "./company-signatory";
import { PlaybookDraftSchema } from "./playbook";
import type { WorkspaceSettings } from "./workspace";
import { readiness } from "./quote";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  check,
  SignatureSchema,
  type Actor,
  type Block,
  type Client,
  type Item,
  type Job,
  type Proposal,
  type SignatureInput,
  type Template,
} from "./model";
import {
  CONSENT,
  sha256,
  hashPassword,
  passwordMatches,
  renderBlocks,
  totals,
  variables,
  versionHash,
} from "./content";
import { mutate, type Repository } from "./repository";
export const system: Actor = { actor: "system", ip: "", user_agent: "" };
export function event(
  p: Proposal,
  type: string,
  actor: Actor,
  metadata: Record<string, unknown> = {},
  now = new Date().toISOString(),
) {
  p.events.push({
    id: randomUUID(),
    type,
    ...actor,
    metadata,
    created_at: now,
  });
}
export function queue(
  p: Proposal,
  kind: Job["kind"],
  key: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const id = p.id + ":" + key;
  if (!p.jobs.some((j) => j.id === id))
    p.jobs.push({
      id,
      kind,
      payload: kind === "email" ? { ...payload, ...emailIdentity(p) } : payload,
      status: "pending",
      attempts: 0,
      available_at: now,
    });
}
export function notify(p: Proposal, type: string) {
  const declineNote =
    type === "declined"
      ? p.events.findLast((e) => e.type === "declined")?.metadata.note
      : undefined;
  for (const to of staffRecipients(p))
    queue(p, "email", "notify:" + type + ":" + p.events.length + ":" + to, {
      to,
      subject: `Proposal ${type}: ${p.title}`,
      text: `${p.title} for ${p.client.company}: ${type}${type === "signed" ? `\n\nReview and countersign: ${appOrigin()}/proposals/${p.id}?action=countersign` : ""}${typeof declineNote === "string" && declineNote ? `\n\nClient note:\n${declineNote}` : ""}`,
    });
}
export function publicAccess(p: Proposal, password = "", now = new Date()) {
  check(p.source === "native" && p.token, "Not found", 404);
  check(
    !p.archived_at &&
      !["draft", "expired", "declined", "archived"].includes(p.status),
    "Proposal unavailable",
    410,
  );
  if (p.valid_until && ["sent", "viewed"].includes(p.status))
    check(new Date(p.valid_until) > now, "Proposal expired", 410);
  if (p.password_hash)
    check(
      passwordMatches(password, p.password_hash),
      "Proposal password required",
      401,
    );
}
export class ProposalService {
  constructor(
    public repo: Repository,
    public clock = () => new Date(),
    private members = workspaceStaff,
    private stripeApi?: StripeTransport,
  ) {}
  async checkReady(proposal: Proposal, confirmAiReview = false) {
    const p = await this.forRead(proposal);
    const ready = readiness(
      p,
      await this.repo.entities<Item>("pricing_items"),
      this.clock(),
      confirmAiReview,
    );
    const client =
      (await this.repo.entities<Client>("clients")).find(
        (c) => c.id === p.client.id,
      ) ?? p.client;
    let customerChoiceUrl: string | undefined;
    if (this.stripeApi && !client.stripe_customer_id) {
      try {
        const matches = await stripeCustomerMatches(
          { ...client, email: p.client.email },
          this.stripeApi,
        );
        if (matches.length > 1) {
          ready.errors.push("Choose which Stripe customer this client is");
          customerChoiceUrl = `/clients/${client.id}#stripe-customers`;
        }
      } catch (e) {
        ready.errors.push(
          `Stripe customer check unavailable: ${(e as Error).message}`,
        );
      }
    }
    return { ...ready, ready: !ready.errors.length, customerChoiceUrl };
  }
  async create(
    input: {
      client_id: string;
      template_id: string;
      title: string;
      valid_until?: string | null;
      currency?: string;
      password?: string;
      playbook?: unknown;
      document_versions?: Record<string, unknown>[];
      brief?: string;
      content?: Block[];
      quote?: Proposal["quote"];
    },
    actor: Actor,
  ) {
    const client = (await this.repo.entities<Client>("clients")).find(
        (c) => c.id === input.client_id,
      ),
      template = (await this.repo.entities<Template>("templates")).find(
        (t) => t.id === input.template_id && t.active,
      );
    check(client && template, "Client and active template required");
    check(input.title?.trim() && input.title.length <= 300, "Title required");
    check(/^[A-Z]{3}$/.test(input.currency ?? "USD"), "Currency required");
    // Explicit lines (including an empty list) and playbook lines fully replace defaults.
    const supplied = input.quote !== undefined || input.playbook !== undefined;
    const defaults = supplied
      ? { quote: [], warnings: [] }
      : templateDefaultQuote(
          template,
          await this.repo.entities<Item>("pricing_items"),
        );
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const validity =
      input.valid_until === undefined
        ? defaultValidUntil(settings, this.clock())
        : input.valid_until;
    check(
      validity === null ||
        (Number.isFinite(Date.parse(validity)) &&
          new Date(validity) > this.clock()),
      "Future expiry required",
    );
    const now = this.clock().toISOString();
    const p: Proposal = {
      id: randomUUID(),
      workspace_id: this.repo.workspaceId,
      revision: 0,
      client,
      template_id: template.id,
      title: input.title,
      status: "draft",
      token: null,
      password_hash: input.password
        ? hashPassword(input.password)
        : (settings.default_password_hash ?? null),
      valid_until: validity === null ? null : new Date(validity).toISOString(),
      currency: input.currency ?? settings.currency ?? "USD",
      source: "native",
      proposify_id: null,
      created_by: actor.actor,
      created_at: now,
      updated_at: now,
      sent_at: null,
      first_viewed_at: null,
      client_signed_at: null,
      completed_at: null,
      content: reviewBlocks(
        input.content ?? structuredClone(template.content),
        actor.actor.startsWith("ai:"),
      ),
      quote: prepareQuote(
        input.quote ?? defaults.quote,
        await this.repo.entities<Item>("pricing_items"),
        actor.actor.startsWith("ai:"),
      ),

      creation_warnings: defaults.warnings,
      brief: input.brief,
      ai_unreviewed: actor.actor.startsWith("ai:"),
      ai_connector: actor.actor.startsWith("ai:")
        ? actor.actor.slice(3)
        : undefined,
      versions: [],
      signers: [],
      events: [],
      files: [],
      billing_links: [],
      jobs: [],
      search_text: "",
    };
    if (input.playbook) {
      const payload = PlaybookDraftSchema.parse(input.playbook);
      p.quote = prepareQuote(
        payload.items,
        await this.repo.entities<Item>("pricing_items"),
        actor.actor.startsWith("ai:"),
      );
      p.origin = {
        source: payload.source,
        source_version: payload.source_version,
      };
      if (payload.title) p.title = payload.title;
      if (payload.notes)
        p.content.unshift({ type: "paragraph", text: payload.notes });
      event(p, "created", actor, { playbook: payload }, now);
    } else
      event(
        p,
        "created",
        actor,
        actor.actor.startsWith("ai:")
          ? {
              document_versions: input.document_versions ?? [],
              warnings: defaults.warnings,
            }
          : { warnings: defaults.warnings },
        now,
      );
    await this.repo.save(p, -1);
    return withDraftSettings(p, settings);
  }
  async forRead(p: Proposal) {
    if (p.status !== "draft") return p;
    p = { ...p, quote: draftItems(p.quote) };
    const current = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(current, "Workspace settings required");
    return withDraftSettings(p, current);
  }
  async edit(
    id: string,
    input: {
      revision: number;
      title?: string;
      brief?: string;
      content?: Block[];
      quote?: Proposal["quote"];
      valid_until?: string | null;
    },
    actor: Actor,
  ) {
    const catalog = await this.repo.entities<Item>("pricing_items");
    const result = await mutate(this.repo, id, (p) => {
      check(p.revision === input.revision, "Proposal changed; reload", 409);
      check(
        p.source === "native" && p.status === "draft" && !p.archived_at,
        "Only drafts can be edited; archived and imported proposals are read-only",
        409,
      );
      delete p.workspace_settings;
      if (input.title) p.title = input.title;
      if (input.brief !== undefined) p.brief = input.brief;
      if (actor.actor.startsWith("ai:")) p.ai_connector = actor.actor.slice(3);
      if (input.content)
        p.content = reviewBlocks(input.content, actor.actor.startsWith("ai:"));
      p.ai_unreviewed =
        actor.actor.startsWith("ai:") || pendingSections(p).length > 0;
      if (input.quote)
        p.quote = prepareQuote(
          input.quote,
          catalog,
          actor.actor.startsWith("ai:"),
        );
      else p.quote = draftItems(p.quote);
      if (input.quote && actor.actor.startsWith("ai:")) {
        // Quote-only assistant edits must have a visible section to review.
        if (!p.content.some((b) => b.type === "pricing_table"))
          p.content.push({ id: randomUUID(), type: "pricing_table" });
        p.content = p.content.map((b) =>
          b.type === "pricing_table"
            ? { ...b, ai_review: { source: "assistant", reviewed: false } }
            : b,
        );
      }
      if (
        actor.actor.startsWith("ai:") &&
        !p.content.some((b) => b.ai_review && !b.ai_review.reviewed)
      ) {
        const target = p.content.findIndex(
          (b) =>
            !["contract", "signature_block", "page_break"].includes(b.type),
        );
        if (target >= 0)
          p.content[target] = {
            ...p.content[target],
            ai_review: { source: "assistant", reviewed: false },
          };
        else
          p.content.push({
            id: randomUUID(),
            type: "pricing_table",
            ai_review: { source: "assistant", reviewed: false },
          });
      }

      if (input.valid_until !== undefined) {
        check(
          input.valid_until === null ||
            Date.parse(input.valid_until) > this.clock().getTime(),
          "Future expiry required",
        );
        p.valid_until =
          input.valid_until === null
            ? null
            : new Date(input.valid_until).toISOString();
      }
      event(p, "edited", actor, {
        price_decisions: cloneQuote(p.quote)
          .filter((i) => i.price_review && Object.keys(i.price_review).length)
          .map((i) => ({ item_id: i.id, decisions: i.price_review })),
      });
    });
    return this.forRead(result);
  }
  async send(
    id: string,
    actor: Actor,
    confirmAiReview = false,
    senderId = actor.actor.slice(6),
    options: {
      note?: string;
      password?: string | null;
      reopen?: boolean;
      expected_revision?: number;
    } = {},
  ) {
    check(
      !actor.actor.startsWith("ai:"),
      "AI assistants cannot send proposals",
      403,
    );
    check(
      actor.actor.startsWith("staff:"),
      "Staff authorization required",
      403,
    );
    const members = await this.members(this.repo.workspaceId);
    const selected = members.find((m) => m.user_id === senderId);
    check(selected, "Choose a sender who belongs to this workspace", 400);
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    const domain = settings?.sending_domain?.toLowerCase();
    check(
      domain,
      "Set the workspace's verified sending domain in Settings before sending",
    );
    check(
      selected.email.split("@")[1]?.toLowerCase() === domain,
      `Sender ${selected.email} must use the workspace's verified sending domain (${domain})`,
    );
    const sender = {
      user_id: selected.user_id,
      display_name: selected.display_name,
      email: selected.email,
      company_name: settings.company_name,
      sending_domain: domain,
    };
    const catalog = await this.repo.entities<Item>("pricing_items");
    const before = await this.repo.get(id);
    check(before, "Not found", 404);
    const preflight = await this.checkReady(
      { ...before, workspace_settings: settingsSnapshot(settings) },
      confirmAiReview,
    );
    check(preflight.ready, preflight.errors.join("; "));
    return mutate(this.repo, id, (p) => {
      check(
        p.revision === before.revision,
        "Proposal changed; reload and try again",
        409,
      );
      check(
        !p.archived_at && p.source === "native",
        "Unarchive a native proposal before sending",
        409,
      );
      if (options.expected_revision !== undefined)
        check(
          p.revision === options.expected_revision,
          "Proposal changed; reload and try again",
          409,
        );
      const reopening =
        options.reopen === true &&
        p.status === "declined" &&
        !p.signers.length &&
        p.versions.length > 0;
      check(
        ["draft", "sent", "viewed"].includes(p.status) || reopening,
        "Cannot send signed or closed proposal",
        409,
      );
      check(
        !p.ai_unreviewed || confirmAiReview,
        "Confirm review of AI changes before sending",
      );
      p.quote = draftItems(p.quote);

      p.workspace_settings = settingsSnapshot(settings);
      const ready = readiness(p, catalog, this.clock(), confirmAiReview);
      check(ready.ready, ready.errors.join("; "));
      check(p.quote.length > 0, "Quote required");
      check(
        new Set(p.quote.map((l) => l.id)).size === p.quote.length,
        "Duplicate quote items must be combined using quantity",
      );
      for (const l of cloneQuote(p.quote)) {
        check(l.optional || itemSelected(l), "Required items must be selected");
      }
      const now = this.clock().toISOString();
      if (reopening) {
        delete p.marked_lost_by;
        event(p, "reopened", actor, { previous_status: "declined" }, now);
      }
      p.sender = sender;
      p.notification_emails = [
        ...new Set(
          [
            selected.email,
            actor.staff_email,
            members.find((m) => "staff:" + m.user_id === p.created_by)?.email,
          ].filter((email): email is string => !!email),
        ),
      ];
      const confirmedSections = pendingSections(p);
      if (confirmAiReview)
        p.content = p.content.map((b) =>
          b.ai_review
            ? { ...b, ai_review: { ...b.ai_review, reviewed: true } }
            : b,
        );
      p.ai_unreviewed = false;
      if (options.password !== undefined)
        p.password_hash =
          options.password === null ? null : hashPassword(options.password);
      p.sent_at = now;
      p.token = randomBytes(32).toString("base64url");
      p.status = "sent";
      p.first_viewed_at = null;
      const map = variables(p, p.quote);
      renderBlocks(p.content, p.quote, map, p.currency);
      const version = {
        id: randomUUID(),
        version_no: p.versions.length + 1,

        content: structuredClone(p.content),
        quote: structuredClone(p.quote),
        variables_resolved: map,
        content_hash: "",
        created_at: now,
        frozen: false,
      };
      version.content_hash = versionHash({
        content: version.content,
        quote: version.quote,
        variables_resolved: map,
      });
      p.versions.push(version);
      event(
        p,
        "sent",
        actor,
        {
          version: version.version_no,
          sender,
          confirmed_sections: confirmedSections,
        },
        now,
      );
      queue(
        p,
        "email",
        "send:" + version.version_no,
        {
          to: p.client.email,
          subject: p.title,
          send_version: version.version_no,
          proposal_email: true,
          note: options.note ?? "",
          text: `${options.note ? options.note + "\n\n" : ""}Review your proposal: ${proposalLink(p)}`,
        },
        now,
      );
    });
  }
  async byToken(token: string, password = "") {
    check(/^[A-Za-z0-9_-]{43}$/.test(token), "Not found", 404);
    const p = await this.repo.byToken(token);
    check(p, "Not found", 404);
    publicAccess(p, password, this.clock());
    return p;
  }
  async view(token: string, password: string, actor: Actor) {
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(p.token === token, "Link superseded", 410);
      if (!p.first_viewed_at) {
        p.first_viewed_at = this.clock().toISOString();
        if (p.status === "sent") p.status = "viewed";
        event(p, "viewed", actor, {}, p.first_viewed_at);
        notify(p, "viewed");
      }
    });
  }
  async toggle(
    token: string,
    password: string,
    input: {
      revision: number;
      reviewed_hash?: string;
      item_id: string;
      selected: boolean;
    },
    actor: Actor,
  ) {
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(p.token === token, "Link superseded", 410);
      check(["sent", "viewed"].includes(p.status), "Quote is frozen", 409);
      check(!p.archived_at, "Archived proposals cannot be signed", 409);
      check(
        input.reviewed_hash
          ? p.versions.at(-1)?.content_hash === input.reviewed_hash
          : p.revision === input.revision,
        "Quote changed; reload",
        409,
      );
      p.quote = chooseItem(p.quote, input.item_id, input.selected);
      const v = p.versions.at(-1)!;
      v.quote = structuredClone(p.quote);
      v.variables_resolved = variables(p, p.quote);
      renderBlocks(
        v.content,
        v.quote,
        v.variables_resolved,
        p.currency,
        p.workspace_settings?.money?.cents ?? "auto",
      );
      v.content_hash = versionHash({
        content: v.content,
        quote: v.quote,
        variables_resolved: v.variables_resolved,
      });
      event(p, "quote_changed", actor, {
        item_id: input.item_id,
        selected: input.selected,
        totals: totals(p.quote),
      });
    });
  }
  async sign(
    id: string,
    raw: unknown,
    role: "client" | "company",
    actor: Actor,
    access?: { token: string; password: string },
  ) {
    check(
      !actor.actor.startsWith("ai:"),
      "AI assistants cannot sign proposals",
      403,
    );
    const settings =
      role === "company"
        ? (await this.repo.entities<WorkspaceSettings>("workspace_settings"))[0]
        : undefined;
    if (role === "company") check(settings, "Workspace settings required");
    const company =
      role === "company"
        ? await companySignature(raw, actor, settings!)
        : undefined;
    const input: SignatureInput = company
      ? { ...company.input, ...company.signature }
      : SignatureSchema.parse(raw);
    if (input.kind === "drawn") {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      try {
        await doc.embedPng(Buffer.from(input.image!.split(",")[1], "base64"));
      } catch {
        throw new AppError(400, "Invalid PNG signature");
      }
    }
    return mutate(this.repo, id, (p) => {
      if (role === "client") {
        check(access, "Public access required");
        publicAccess(p, access.password, this.clock());
        check(access.token === p.token, "Link superseded", 410);
      }
      check(!p.archived_at, "Archived proposals cannot be signed", 409);
      check(
        input.reviewed_hash
          ? p.versions.at(-1)?.content_hash === input.reviewed_hash
          : p.revision === input.revision,
        "Proposal changed; reload before signing",
        409,
      );
      check(
        role === "client"
          ? ["sent", "viewed"].includes(p.status)
          : p.status === "signed_by_client",
        "Invalid signing order or already signed",
        409,
      );
      check(
        role !== "company" || actor.actor.startsWith("staff:"),
        "Staff authorization required",
        403,
      );
      if (role === "client")
        check(
          input.email.toLowerCase() === p.client.email.toLowerCase(),
          "Signer email must match recipient",
        );
      const now = this.clock().toISOString(),
        v = p.versions.at(-1)!;
      if (role === "client") {
        billingLines(v.quote);
        v.content = selectedContent(v.content, v.quote);
        v.frozen = true;
        v.content_hash = versionHash({
          content: v.content,
          quote: v.quote,
          variables_resolved: v.variables_resolved,
        });
        p.client_signed_at = now;
        p.status = "signed_by_client";
      } else {
        p.completed_at = now;
        p.status = "completed";
      }
      const {
        revision: _,
        consent: __,
        reviewed_hash: ___,
        ...signature
      } = input;
      p.signers.push({
        ...signature,
        ...company?.signature,
        ...actor,
        role,
        signed_at: now,
        consent_at: now,
        consent_text: p.workspace_settings?.consent_text ?? CONSENT,
        ...(input.kind === "drawn"
          ? {
              signature_image_path: `${p.id}/${sha256(Buffer.from(input.image!.split(",")[1], "base64"))}.png`,
            }
          : {}),
      });
      event(
        p,
        "consent_given",
        actor,
        { role, consent_text: p.workspace_settings?.consent_text ?? CONSENT },
        now,
      );
      event(
        p,
        role === "client" ? "signed" : "counter_signed",
        actor,
        {
          role,
          version_hash: v.content_hash,
          ...(company
            ? {
                application_statement: company.signature.application_statement,
                applied_by: company.signature.applied_by,
                signatory_name: company.signature.name,
                signatory_title: company.signature.title,
                company: company.signature.company,
                authorization_text:
                  company.signature.authorization_text ?? null,
              }
            : {}),
        },
        now,
      );
      queue(
        p,
        "pdf",
        "pdf:" + role,
        {
          stage: role,
          version: structuredClone(v),
          signers: structuredClone(p.signers),
          events: structuredClone(p.events),
        },
        now,
      );
      if (role === "client")
        queue(
          p,
          "billing",
          "billing",
          {
            selected_item_ids: cloneQuote(v.quote)
              .filter(itemSelected)
              .map((i) => i.id),
            lines: billingLines(v.quote),
          },
          now,
        );
      if (role === "company" && actor.staff_email)
        p.notification_emails = [
          ...new Set([...staffRecipients(p), actor.staff_email]),
        ];
      notify(p, role === "client" ? "signed" : "completed");
    });
  }
  async decline(token: string, password: string, actor: Actor, note = "") {
    check(
      !actor.actor.startsWith("ai:"),
      "AI assistants cannot decline proposals",
      403,
    );
    check(
      typeof note === "string" && note.length <= 2000,
      "Note must be at most 2000 characters",
    );
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(
        p.token === token && ["sent", "viewed"].includes(p.status),
        "Cannot decline",
        409,
      );
      p.status = "declined";
      event(p, "declined", actor, note ? { note } : {});
      notify(p, "declined");
    });
  }
  async tick() {
    for (const item of await this.repo.list()) {
      if (item.archived_at || !["sent", "viewed"].includes(item.status))
        continue;
      await mutate(this.repo, item.id, (p) => {
        if (!["sent", "viewed"].includes(p.status)) return;
        const now = this.clock();
        if (p.valid_until && new Date(p.valid_until) <= now) {
          p.status = "expired";
          event(p, "expired", system, {}, now.toISOString());
          return;
        }
        const age = (now.getTime() - Date.parse(p.sent_at!)) / 86400000;
        for (const day of p.workspace_settings?.reminder_days ?? [3, 7])
          if (
            age >= day &&
            !p.events.some(
              (e) =>
                e.type === "reminder_sent" &&
                e.metadata.day === day &&
                e.metadata.version === p.versions.length,
            )
          ) {
            queue(
              p,
              "email",
              `reminder:${p.versions.length}:${day}`,
              {
                to: p.client.email,
                subject: `Reminder: ${p.title}`,
                text: `Review your proposal: ${proposalLink(p)}`,
                proposal_email: true,
                note: (() => {
                  const sent = p.jobs.find(
                    (j) => j.payload.send_version === p.versions.length,
                  );
                  return (
                    sent?.payload.note ??
                    proposalEmailNote(String(sent?.payload.text ?? ""))
                  );
                })(),
                reminder_day: day,
                version: p.versions.length,
              },
              now.toISOString(),
            );
          }
      });
    }
  }
}
export function publicResult(p: Proposal, options?: { qboConnected: boolean }) {
  const v = p.versions.at(-1)!;
  return {
    id: p.id,
    quote: cloneQuote(v.quote).map(
      ({
        plan_terms: _plan,
        custom_family_id: _family,
        price_review: _review,
        ...item
      }) => ({
        ...item,
        sublines: item.sublines.map(
          ({ stripe_lookup_key: _key, qbo_item_ref: _qbo, ...s }) => s,
        ),
      }),
    ),
    sent_at: v.created_at,
    money_cents: p.workspace_settings?.money?.cents ?? "auto",
    timezone: p.workspace_settings?.timezone ?? "UTC",
    proposal_fonts: p.workspace_settings?.proposal_fonts,
    contact: {
      name: p.sender?.display_name ?? p.workspace_settings?.owner ?? "",
      email: p.sender?.email ?? p.workspace_settings?.email ?? "",
    },
    title: p.title,
    status: p.status,
    revision: p.revision,
    reviewed_hash: v.content_hash,
    valid_until: p.valid_until,
    currency: p.currency,
    recipient: {
      name: p.client.first_name + " " + p.client.last_name,
      email: p.client.email,
      title: p.client.title ?? "",
      company: p.client.company,
    },
    signers: p.signers.map((s) => ({
      role: s.role,
      name: s.name,
      title: s.title,
      company: s.company,
      signed_at: s.signed_at,
      kind: s.kind,
      typed_name: s.typed_name,
      image: s.image,
    })),
    content: v.content,
    variables: v.variables_resolved,
    html: renderBlocks(
      v.content,
      v.quote,
      v.variables_resolved,
      p.currency,
      p.workspace_settings?.money?.cents ?? "auto",
    ),
    totals: totals(v.quote),
    company: p.workspace_settings
      ? {
          name: p.workspace_settings.company_name,
          signatory_name: p.workspace_settings.company_signatory?.name,
          signatory_title: p.workspace_settings.company_signatory?.title,
          logo: p.workspace_settings.logo,
          accent_colour: p.workspace_settings.accent_colour,
          email: p.workspace_settings.email,
        }
      : {
          name: v.variables_resolved["company.name"] ?? "",
          logo: null,
          accent_colour: "#365C4A",
          email: "",
        },
    invoice_method: p.billing_links.some(
      (l) =>
        l.provider === "qbo" &&
        (l.last_error === "Invoice manually" ||
          l.metadata?.action === "Invoice manually"),
    )
      ? ("manual" as const)
      : options
        ? options.qboConnected
          ? ("quickbooks" as const)
          : ("manual" as const)
        : p.billing_links.some(
              (l) => l.provider === "qbo" && l.external_object_id,
            )
          ? ("quickbooks" as const)
          : ("manual" as const),
    billing: p.client_signed_at
      ? p.billing_links
          .filter((l) => l.provider === "stripe")
          .map((l) => ({
            status: l.status,
            requires_checkout: l.metadata?.requires_checkout === true,
            checkout: (
              (l.metadata?.checkout ?? []) as {
                url: string;
                line_ids?: string[];
                items?: { line_id: string; name: string }[];
                mode?: "setup" | "subscription";
              }[]
            ).map((s) => ({
              url: s.url,
              ...(s.line_ids ? { line_ids: s.line_ids } : {}),
              ...(s.items
                ? {
                    items: s.items.map((i) => ({
                      line_id: i.line_id,
                      name: i.name,
                    })),
                  }
                : {}),
              ...(s.mode ? { mode: s.mode } : {}),
            })),
            added_existing: (
              (l.metadata?.added_existing ?? []) as {
                monthly_total: number;
                yearly_total?: number;
                line_ids?: string[];
                items?: { line_id: string; name: string }[];
              }[]
            ).map((s) => ({
              monthly_total: s.monthly_total,
              yearly_total: s.yearly_total ?? 0,
              ...(s.line_ids ? { line_ids: s.line_ids } : {}),
              ...(s.items
                ? {
                    items: s.items.map((i) => ({
                      line_id: i.line_id,
                      name: i.name,
                    })),
                  }
                : {}),
            })),
          }))
      : [],
    consent_text: p.workspace_settings?.consent_text ?? CONSENT,
    version_hash: v.content_hash,
    files: p.files
      .filter((f) => f.kind === "sealed")
      .map((f) => ({ id: f.id, stage: f.stage, sha256: f.sha256 })),
  };
}
