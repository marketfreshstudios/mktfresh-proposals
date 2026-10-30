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
  "edit_version",
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
      original.status === "declined" &&
        !original.signers.length &&
        original.versions.length > 0,
      "Only unsigned Lost proposals with a sent version can be reopened",
      409,
    );
    return service.send(id, actor, false, undefined, {
      reopen: true,
      expected_revision: revision,
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
      id: randomUUID(),
      title: original.title + " (copy)",
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
      quote: draftItems(original.quote),
      versions: [],
      events: [],
      signers: [],
      files: [],
      jobs: [],
      billing_links: [],
      search_text: "",
    };
    delete p.workspace_settings;
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
    if (action === "edit_version") {
      check(
        ["sent", "viewed"].includes(p.status),
        "Only an unsigned sent proposal can be edited as a new version",
        409,
      );
      p.status = "draft";
      p.token = null;
      p.quote = draftItems(p.quote);
      delete p.workspace_settings;
      for (const job of p.jobs)
        if (job.kind === "email" && job.status === "pending") {
          job.status = "done";
          job.payload.superseded = true;
        }
      event(
        p,
        "editing_new_version",
        actor,
        { previous_version: p.versions.length },
        timestamp,
      );
      return;
    }
    if (action === "mark_won" || action === "mark_lost") {
      check(
        (["draft", "sent", "viewed", "expired"].includes(p.status) ||
          (action === "mark_won" && p.status === "declined")) &&
          !p.signers.length,
        "Signed or closed proposals cannot be marked by hand",
        409,
      );
      p.status = action === "mark_won" ? "completed" : "declined";
      p.token = null;
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
          (!p.valid_until || Date.parse(p.valid_until) > now.getTime()),
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
