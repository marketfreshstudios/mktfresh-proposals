import { formattedBusinessAddress } from "./business-details";
import { z } from "zod";
import { emailIdentity, staffFromAddress, yeswellFrom } from "./email-identity";
import { check, type Actor, type Proposal } from "./model";
import type { Repository } from "./repository";
import { workspaceStaff } from "./auth";
import {
  canReassign,
  liveSenderAssignment,
  proposalOwnerId,
  unfinishedAssignment,
  type ProposalOwner,
} from "./proposal-owner";
import { event } from "./service";
import { emailLayout } from "./email-layout";
import { appOrigin } from "./links";
import { escape } from "./content";
import type { WorkspaceSettings } from "./workspace";
export const ReassignSchema = z
  .object({
    user_id: z.uuid(),
    notify: z.boolean().default(true),
    proposals: z
      .array(
        z
          .object({ id: z.uuid(), revision: z.number().int().nonnegative() })
          .strict(),
      )
      .min(1),
    from_user_id: z.uuid().optional(),
  })
  .strict();
export class ReassignmentService {
  constructor(
    readonly repo: Repository,
    readonly members = workspaceStaff,
  ) {}
  async work(actor: Actor, userId: string) {
    check(
      actor.staff_role === "owner" && actor.actor.startsWith("staff:"),
      "Only a super admin can reassign another person's proposals",
      403,
    );
    return (await this.repo.list()).filter((p) =>
      unfinishedAssignment(p, userId),
    );
  }
  async reassign(actor: Actor, raw: unknown) {
    check(
      actor.actor.startsWith("staff:"),
      "Staff authorization required",
      403,
    );
    const input = ReassignSchema.parse(raw);
    check(
      new Set(input.proposals.map((p) => p.id)).size === input.proposals.length,
      "Choose each proposal only once",
    );
    if (input.from_user_id || input.proposals.length > 1)
      check(
        actor.staff_role === "owner",
        "Only a super admin can bulk reassign proposals",
        403,
      );
    const people = await this.members(this.repo.workspaceId);
    const target = people.find(
      (p) =>
        p.user_id === input.user_id &&
        (!("status" in p) || p.status === "active"),
    );
    check(target, "Choose an active staff member in this workspace", 400);
    const owner: ProposalOwner = {
      user_id: target.user_id,
      display_name: target.display_name,
      email: target.email,
    };
    const settings = (
      await this.repo.entities<WorkspaceSettings>("workspace_settings")
    )[0];
    const documents: Proposal[] = [];
    for (const choice of input.proposals) {
      const original = await this.repo.get(choice.id);
      check(original, "Proposal not found", 404);
      check(
        canReassign(original, actor),
        "You can only reassign proposals you own",
        403,
      );
      check(
        original.revision === choice.revision,
        "Proposal changed; reload and try again",
        409,
      );
      if (input.from_user_id)
        check(
          unfinishedAssignment(original, input.from_user_id),
          "This proposal is no longer assigned unfinished work; reload and try again",
          409,
        );
      if (proposalOwnerId(original) === owner.user_id) continue;
      const p = structuredClone(original),
        now = new Date().toISOString();
      const previousId = proposalOwnerId(p),
        previous = people.find((m) => m.user_id === previousId);
      p.owner = owner;
      if (liveSenderAssignment(p)) {
        const domain = settings?.sending_domain;
        const from = settings && staffFromAddress(owner.email, settings);
        check(
          domain && from,
          "Set a verified sending domain in Workspace before reassigning the sender",
          400,
        );
        check(
          !p.jobs.some(
            (j) =>
              j.kind === "email" &&
              j.status === "running" &&
              Date.parse(j.lease_until ?? "") > Date.now(),
          ),
          "An email is being delivered. Try reassignment again when it finishes.",
          409,
        );
        p.sender = {
          ...owner,
          company_name:
            p.workspace_settings?.company_name ?? settings!.company_name,
          sending_domain: domain,
          ...(from === owner.email ? {} : { from_email: from }),
        };
        // Unsent jobs must use the new sender; delivered snapshots remain immutable.
        const logged = await this.repo.emailLog<{
          id: string;
          snapshot?: unknown;
        }>(p.id);
        for (const j of p.jobs)
          if (
            !j.id.startsWith(p.id + ":reassigned:") &&
            j.kind === "email" &&
            ["pending", "failed"].includes(j.status)
          ) {
            // A prepared snapshot may represent an already delivered, retried job.
            // Preserve it when the immutable email log records its delivery.
            const snapshot = j.payload.email_snapshot;
            if (
              snapshot &&
              logged.some(
                (e) => JSON.stringify(e.snapshot) === JSON.stringify(snapshot),
              )
            )
              continue;
            if (j.payload.to !== p.client.email) j.payload.to = owner.email;
            delete j.payload.email_snapshot;
            const identity = emailIdentity(p);
            j.payload.from = identity.from;
            j.payload.reply_to = identity.reply_to;
          }
      }
      event(
        p,
        "reassigned",
        actor,
        {
          previous_user_id: previousId,
          previous_name:
            original.owner?.display_name ??
            previous?.display_name ??
            original.sender?.display_name ??
            original.created_by,
          owner_user_id: owner.user_id,
          owner_name: owner.display_name,
          actor_name: actor.staff_name ?? actor.staff_email ?? "Staff",
        },
        now,
      );
      if (input.notify) {
        const from =
          settings && staffFromAddress(actor.staff_email ?? "", settings);
        check(
          settings && actor.staff_email && (from || yeswellFrom()),
          "Set a verified sending domain in Workspace before notifying the new owner",
          400,
        );
        const name = actor.staff_name ?? actor.staff_email,
          subject = `${name} assigned you ${p.title}`.replace(/[\r\n]+/g, " ");
        const text = `${name} assigned you ${p.title}.`;
        const layout = emailLayout({
          staff: true,
          origin: appOrigin(),
          title: p.title,
          workspace: settings.company_name,
          sender: name,
          accent: settings.accent_colour,
          contact: [
            settings.email,
            settings.phone,
            formattedBusinessAddress(settings),
          ]
            .filter(Boolean)
            .join(" | "),
          bodyHtml: `<p>${escape(text)}</p>`,
          bodyText: text,
          button: {
            label: "Open proposal",
            url: `${appOrigin()}/proposals/${p.id}`,
          },
        });
        // Snapshot and queue once with the normal idempotent email worker.
        const payload = {
          to: owner.email,
          from:
            yeswellFrom(`${name} via Yeswell`) ??
            `${JSON.stringify(from === actor.staff_email ? `${name} | ${settings.company_name}` : name)} <${from}>`,
          reply_to: actor.staff_email,
          subject,
          ...layout,
        };
        const id = `${p.id}:reassigned:${p.events.at(-1)!.id}`;
        p.jobs.push({
          id,
          kind: "email",
          status: "pending",
          attempts: 0,
          available_at: now,
          payload: {
            email_snapshot: {
              ...payload,
              body_html: `<p>${escape(text)}</p>`,
              button_url: `${appOrigin()}/proposals/${p.id}`,
              button_label: "Open proposal",
              template_key: "staff_reassigned",
              template_version_id: null,
              prepared_at: now,
            },
          },
        });
      }
      p.revision++;
      p.updated_at = now;
      documents.push(p);
    }
    if (documents.length) await this.repo.saveReassignments(documents, actor);
    return documents;
  }
}
