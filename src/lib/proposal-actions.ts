import {
  publishedExpiry,
  editableProposal,
  editorialVersion,
  publicationState,
} from "./editor-publication";
import { freezeStyles } from "./proposal-styles";
import { randomUUID } from "node:crypto";
import { check, type Actor, type Proposal, type Version } from "./model";
import { mutate, type Repository } from "./repository";
import { event, queue, ProposalService } from "./service";
import { draftItems } from "./quote-model";
import { settingsSnapshot } from "./proposal-settings";
import type { WorkspaceSettings } from "./workspace";
import { defaultValidUntil } from "./validity";
import { variables } from "./presentation";
import { versionHash, sha256, canonical } from "./content";
import { proposalLink } from "./links";
export const proposalActions = [
  "duplicate",
  "mark_won",
  "mark_lost",
  "remind",
  "resend_billing_link",
  "mark_sent",
  "archive",
  "unarchive",
  "invoice_manually",
  "preview_pdf",
] as const;
export type ProposalAction = (typeof proposalActions)[number];
export async function proposalAction(
  repo: Repository,
  id: string,
  revision: number,
  action: ProposalAction,
  actor: Actor,
  note = "",
  now = new Date(),
  service = new ProposalService(repo),
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const original = await repo.get(id);
  check(original, "Proposal not found", 404);
  check(
    original.revision === revision,
    "Proposal changed; reload and try again",
    409,
  );
  if (action === "mark_sent") {
    check(
      editableProposal(original) &&
        ["declined", "expired"].includes(original.status) &&
        original.versions.length &&
        original.token,
      "Only unsigned Lost or Expired proposals with a sent version can be reopened",
      409,
    );
    const settings = (
      await repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const candidate = structuredClone(original);
    candidate.valid_until = defaultValidUntil(settings, now);
    candidate.status = candidate.first_viewed_at ? "viewed" : "sent";
    const ready = await service.checkReady(candidate, false, true);
    check(ready.ready, ready.errors.join("; "));
    candidate.versions.push(editorialVersion(candidate, now.toISOString()));
    candidate.published_state = publicationState(candidate);
    delete candidate.live_blockers;
    delete candidate.marked_lost_by;
    event(
      candidate,
      "reopened",
      actor,
      {
        previous_status: original.status,
        version: candidate.versions.at(-1)!.version_no,
      },
      now.toISOString(),
    );
    return mutate(repo, id, (p) => {
      check(
        p.revision === revision && editableProposal(p),
        "Proposal changed; reload",
        409,
      );
      for (const key of Object.keys(p))
        if (!(key in candidate))
          delete (p as unknown as Record<string, unknown>)[key];
      Object.assign(p, candidate);
    });
  }
  if (action === "duplicate") {
    check(
      original.source === "native",
      "Imported proposals are read-only",
      409,
    );
    const settings = (
      await repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    check(settings, "Workspace settings required");
    const p: Proposal = {
      ...structuredClone(original),
      ...structuredClone(original.unpublished_work ?? {}),
      id: randomUUID(),
      title: (original.unpublished_work?.title ?? original.title) + " (copy)",
      revision: 0,
      status: "draft",
      token: null,
      password_hash: null,
      valid_until: defaultValidUntil(settings, now),
      created_by: actor.actor,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      sent_at: null,
      first_viewed_at: null,
      client_signed_at: null,
      completed_at: null,
      quote: draftItems(original.unpublished_work?.quote ?? original.quote),
      versions: [],
      events: [],
      signers: [],
      files: [],
      jobs: [],
      billing_links: [],
      search_text: "",
    };
    delete p.workspace_settings;
    delete p.live_blockers;
    delete p.published_state;
    delete p.unpublished_work;
    delete p.delivery_method;
    delete p.automatic_reminders;
    delete p.owner;
    delete p.sender;
    delete p.notification_emails;
    delete p.archived_at;
    delete p.archived_by;
    delete p.marked_won_by;
    delete p.marked_lost_by;
    event(p, "created", actor, { duplicated_from: id }, now.toISOString());
    await repo.save(p, -1);
    return p;
  }
  const settings =
    action === "preview_pdf"
      ? (await repo.entities<WorkspaceSettings>("workspace_settings"))[0]
      : undefined;
  return mutate(repo, id, (p) => {
    check(
      p.revision === revision,
      "Proposal changed; reload and try again",
      409,
    );
    check(
      p.source === "native" || ["archive", "unarchive"].includes(action),
      "Imported proposals are read-only",
      409,
    );
    const timestamp = now.toISOString();
    if (action === "archive" || action === "unarchive") {
      if (action === "archive") {
        p.archived_at = timestamp;
        p.archived_by = actor.actor;
      } else {
        p.archived_at = null;
        delete p.archived_by;
      }
      event(
        p,
        action === "archive" ? "archived" : "unarchived",
        actor,
        {},
        timestamp,
      );
      return;
    }
    check(!p.archived_at, "Unarchive this proposal first", 409);
    if (action === "mark_won" || action === "mark_lost") {
      check(
        (["draft", "sent", "viewed", "expired"].includes(p.status) ||
          (action === "mark_won" && p.status === "declined")) &&
          !p.signers.length,
        "Signed or closed proposals cannot be marked by hand",
        409,
      );
      p.status = action === "mark_won" ? "completed" : "declined";
      if (action === "mark_won") p.marked_won_by = actor.actor;
      else p.marked_lost_by = actor.actor;
      event(
        p,
        action === "mark_won" ? "marked_won" : "marked_lost",
        actor,
        { reason: note },
        timestamp,
      );
      return;
    }
    if (action === "resend_billing_link") {
      check(
        !!p.client_signed_at &&
          !!p.token &&
          p.billing_links.some(
            (l) =>
              l.provider === "stripe" && l.metadata?.requires_checkout === true,
          ),
        "No client payment setup is pending",
        409,
      );
      event(p, "billing_link_resent", actor, {}, timestamp);
      queue(
        p,
        "email",
        "billing-link:" + p.events.at(-1)!.id,
        {
          to: p.client.email,
          subject: `Finish billing setup: ${p.title}`,
          text: `Your proposal is signed. Finish payment setup here: ${proposalLink(p)}`,
        },
        timestamp,
      );
      return;
    }
    if (action === "remind") {
      check(
        p.token &&
          (!publishedExpiry(p) ||
            Date.parse(publishedExpiry(p)!) > now.getTime()),
        "Proposal expired or unavailable",
        409,
      );
      check(
        ["sent", "viewed"].includes(p.status),
        "Only open proposals can be sent again",
        409,
      );
      event(
        p,
        "reminder_requested",
        actor,
        { version: p.versions.length },
        timestamp,
      );
      queue(
        p,
        "email",
        "manual-reminder:" + p.events.at(-1)!.id,
        {
          to: p.client.email,
          subject: `Reminder: ${p.title}`,
          text: `Review your proposal: ${proposalLink(p)}`,
          reminder_day: "manual",
          version: p.versions.length,
        },
        timestamp,
      );
      return;
    }
    if (action === "invoice_manually") {
      check(!!p.client_signed_at, "Client signature required", 409);
      const link = p.billing_links.find(
        (l) => l.provider === "qbo" && l.status === "needs_review",
      );
      check(link, "No manual invoice is waiting for review", 409);
      link.status = "succeeded";
      link.last_error = undefined;
      link.metadata = {
        ...link.metadata,
        manual_invoice: true,
        reference: note,
        marked_by: actor.actor,
        marked_at: timestamp,
      };
      event(
        p,
        "manual_invoice_recorded",
        actor,
        { reference: note },
        timestamp,
      );
      return;
    }
    if (action === "preview_pdf") {
      check(settings, "Workspace settings required");
      const v: Version =
        p.status === "draft" || !p.versions.length
          ? {
              id: randomUUID(),
              version_no: p.versions.length + 1,
              ...(p.pagination
                ? { pagination: structuredClone(p.pagination) }
                : {}),
              ...(p.cover ? { cover: structuredClone(p.cover) } : {}),
              resolved_styles: freezeStyles(
                settings,
                p.template_style_overrides,
                p.style_overrides,
              ),
              content: structuredClone(p.content),
              quote: draftItems(p.quote),
              variables_resolved: variables({
                ...p,
                workspace_settings: settingsSnapshot(settings),
              }),
              content_hash: "",
              created_at: timestamp,
              frozen: false,
            }
          : structuredClone(p.versions.at(-1)!);
      check(v, "No document available");
      v.content_hash = versionHash(v);
      const renderSettings =
        p.status === "draft" || !p.workspace_settings
          ? settingsSnapshot(settings)
          : p.workspace_settings;
      const stage =
        "preview:" +
        sha256(canonical({ hash: v.content_hash, settings: renderSettings }));
      queue(
        p,
        "pdf",
        stage,
        {
          stage,
          preview: true,
          version: v,
          signers: [],
          events: [],
          settings: renderSettings,
        },
        timestamp,
      );
    }
  });
}
