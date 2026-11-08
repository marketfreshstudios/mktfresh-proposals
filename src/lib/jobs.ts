import {
  clientReminderAllowed,
  countersignReminderAllowed,
  reminderCount,
} from "./reminders";
import { publishedExpiry, reminderCycle } from "./editor-publication";
import { usesWorkspaceBrand } from "./workspace-brand";
import { automaticRemindersEnabled, isAutomaticReminder } from "./delivery";
import { shortPrintDiagnostics, type PrintDiagnostic } from "./pdf-diagnostics";
import { jobFailure } from "./job-presentation";
import { styleFonts } from "./proposal-styles";
import { readFont } from "./studio";
import { emailIdentity, staffRecipients } from "./email-identity";
import { proposalLink } from "./links";
import {
  prepareEmail,
  logSentEmail,
  type EmailSnapshot,
} from "./email-templates";
import { StripeProvider } from "./providers/stripe";
import { executeStripeWebhook } from "./providers/webhook";
import { randomUUID } from "node:crypto";
import { sha256, versionHash, money } from "./content";
import { bill, type BillingProvider } from "./billing";
import { mutate, type Repository } from "./repository";
import { event, queue, system } from "./service";
import {
  AppError,
  type Audit,
  type Job,
  type Proposal,
  type Client,
  type Signer,
  type Version,
} from "./model";
import type { Storage } from "./storage";
export interface Mailer {
  send(
    input: {
      from?: string;
      reply_to?: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
      attachments?: { filename: string; content: string }[];
    },
    key: string,
  ): Promise<void>;
}
export class MockMailer implements Mailer {
  sent = new Map<string, unknown>();
  async send(input: unknown, key: string) {
    this.sent.set(key, input);
  }
}
export class ResendMailer implements Mailer {
  async send(
    input: {
      from?: string;
      reply_to?: string;
      to: string;
      subject: string;
      text: string;
      html?: string;
      attachments?: { filename: string; content: string }[];
    },
    key: string,
  ) {
    if (!process.env.RESEND_API_KEY || !input.from)
      throw new Error("Resend credentials/from address missing");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": sha256(key),
      },
      body: JSON.stringify({ ...input, from: input.from }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Resend delivery failed (${res.status})`);
  }
}
export class Worker {
  constructor(
    private repo: Repository,
    private storage: Storage,
    private mailer: Mailer,
    public providers: Record<"qbo" | "stripe", BillingProvider>,
    private render?: (
      ...args: Parameters<typeof import("./pdf").sealedPdf>
    ) => Promise<{
      body: Uint8Array;
      pdf: Uint8Array;
      bodyHash: string;
      print_failures?: PrintDiagnostic[];
    }>,
  ) {}
  async drain(id?: string, kind?: Job["kind"], jobId?: string) {
    const results = [];
    const deadline = Date.now() + 240000;
    for (const row of await this.repo.list()) {
      if (id && row.id !== id) continue;
      for (let count = 0; count < 30; count++) {
        if (Date.now() > deadline) return results;
        let selected: Job | undefined;
        const now = new Date();
        await mutate(this.repo, row.id, (p) => {
          selected = undefined;
          // Confirm provider receipts before older mail/PDF work, within one drain budget.
          const j = p.jobs
            .filter(
              (j) =>
                (!isAutomaticReminder(j) || automaticRemindersEnabled(p)) &&
                (!jobId || j.id === jobId) &&
                (!kind || j.kind === kind) &&
                j.status !== "done" &&
                j.status !== "failed" &&
                Date.parse(j.available_at) <= now.getTime() &&
                (j.status !== "running" ||
                  Date.parse(j.lease_until ?? "") < now.getTime()),
            )
            .sort(
              (a, b) =>
                Number(b.kind === "stripe_webhook") -
                Number(a.kind === "stripe_webhook"),
            )[0];
          if (j) {
            j.status = "running";
            j.attempts++;
            j.lease_until = new Date(now.getTime() + 180000).toISOString();
            selected = structuredClone(j);
          }
        });
        if (!selected) break;
        const job: Job = selected;
        try {
          const p = (await this.repo.get(row.id))!;
          await this.execute(p, job);
          await mutate(this.repo, row.id, (p) => {
            const j = p.jobs.find((x) => x.id === job.id)!;
            j.status = "done";
            delete j.lease_until;
            delete j.last_error;
          });
          results.push({ job: job.id, status: "done" });
        } catch (e) {
          await mutate(this.repo, row.id, (p) => {
            const j = p.jobs.find((x) => x.id === job.id)!;
            j.status = j.attempts >= 5 ? "failed" : "pending";
            j.last_error = e instanceof Error ? e.message : "Job failed";
            j.available_at = new Date(
              Date.now() + Math.min(3600000, 30000 * 2 ** j.attempts),
            ).toISOString();
            delete j.lease_until;
            const diagnostics = (e as { pdf_diagnostics?: PrintDiagnostic[] })
              ?.pdf_diagnostics;
            const providers =
              j.kind === "billing"
                ? p.billing_links
                    .filter((l) => l.status === "failed")
                    .map((l) => l.provider)
                : [];
            event(p, "sync_failed", system, {
              job: j.id,
              job_kind: j.kind,
              stage: j.payload.stage,
              providers,
              error: j.last_error,
              terminal: j.status === "failed",
              ...(diagnostics?.length
                ? { pdf_diagnostics: shortPrintDiagnostics(diagnostics) }
                : {}),
            });
            if (j.status === "failed")
              this.alert(p, j, j.last_error, providers);
          });
          results.push({ job: job.id, status: "failed" });
        }
      }
    }
    return results;
  }
  private async execute(p: Proposal, j: Job) {
    if (j.kind === "stripe_webhook") {
      if (!(this.providers.stripe instanceof StripeProvider))
        throw new Error("Stripe test provider required");
      await executeStripeWebhook(this.repo, this.providers.stripe, p, j);
      return;
    }
    if (j.kind === "email") {
      if (j.id.startsWith(`${p.id}:notify:viewed:`)) {
        const current = (
          await this.repo.entities<NonNullable<Proposal["workspace_settings"]>>(
            "workspace_settings",
          )
        )[0];
        if (current?.engagement_notifications?.email !== true) return;
      }
      const payload = j.payload;
      const failure = payload.job_failure as { job_id: string } | undefined;
      if (failure) {
        const source = p.jobs.find((job) => job.id === failure.job_id);
        if (
          source?.status === "done" &&
          !(
            source.kind === "billing" &&
            p.billing_links.some((link) => link.status === "needs_review")
          )
        )
          return;
      }
      // Replace old per-attempt notices with one current, correctly named alert.
      if (j.id.includes(":notify:sync_failed:")) {
        const count = Number(
          j.id.split(":notify:sync_failed:")[1]?.split(":")[0],
        );
        await mutate(this.repo, p.id, (row) => {
          const oldEvent = row.events[count - 1];
          const source =
            row.jobs.find((job) => job.id === oldEvent?.metadata.job) ??
            (oldEvent?.metadata.provider
              ? row.jobs.find((job) => job.kind === "billing")
              : undefined);
          if (!source) return;
          const review =
            source.kind === "billing"
              ? row.billing_links.filter(
                  (link) => link.status === "needs_review",
                )
              : [];
          if (review.length)
            this.alert(
              row,
              source,
              review
                .map((link) => link.last_error || "A staff decision is needed")
                .join("; "),
              review.map((link) => link.provider),
            );
          else if (source.status === "failed")
            this.alert(
              row,
              source,
              source.last_error ||
                String(oldEvent?.metadata.error || "Job failed"),
              row.billing_links
                .filter((link) => link.status === "failed")
                .map((link) => link.provider),
            );
        });
        return;
      }
      if (
        payload.send_version &&
        (payload.send_version !== p.versions.length ||
          !p.token ||
          p.archived_at ||
          !["sent", "viewed", "signed_by_client", "completed"].includes(
            p.status,
          ))
      )
        return;
      // On-demand reminders retain their existing closed/version/expiry guard.
      if (
        payload.reminder_day === "manual" &&
        (p.archived_at ||
          !["sent", "viewed"].includes(p.status) ||
          payload.version !== reminderCycle(p).version ||
          (publishedExpiry(p) && Date.parse(publishedExpiry(p)!) <= Date.now()))
      )
        return;
      if (isAutomaticReminder(j) && !clientReminderAllowed(p, j)) return;
      if (payload.countersign_due && !countersignReminderAllowed(p, j)) return;
      const attachments = payload.file_id
        ? await this.attachment(p, String(payload.file_id))
        : undefined;
      const prepared =
        (payload.email_snapshot as EmailSnapshot | undefined) ??
        (await prepareEmail(this.repo, p, j));
      const stored = await mutate(this.repo, p.id, (row) => {
        const job = row.jobs.find((v) => v.id === j.id)!;
        job.payload.email_snapshot ??= prepared;
      });
      const snapshot = stored.jobs.find((v) => v.id === j.id)!.payload
        .email_snapshot as EmailSnapshot;
      await this.repo.emailLog(p.id);
      // Rendering/log reads can await I/O. Recheck the current aggregate immediately
      // before delivery, so signing/declining/archiving or switching off cancels queued mail.
      if (isAutomaticReminder(j) || payload.countersign_due) {
        const current = (await this.repo.get(p.id))!;
        if (
          isAutomaticReminder(j) &&
          (!clientReminderAllowed(current, j) ||
            (current.workspace_settings?.reminder_rules &&
              reminderCount(current) >=
                current.workspace_settings.reminder_rules.stop_after))
        )
          return;
        if (payload.countersign_due && !countersignReminderAllowed(current, j))
          return;
        if (
          current.events.some(
            (e) =>
              e.metadata.job === j.id &&
              ["reminder_sent", "countersign_reminder_sent"].includes(e.type),
          )
        )
          return;
      }
      await this.mailer.send(
        {
          from: snapshot.from,
          reply_to: snapshot.reply_to,
          to: snapshot.to,
          subject: snapshot.subject,
          text: snapshot.text,
          html: snapshot.html,
          ...(attachments ? { attachments } : {}),
        },
        j.id,
      );
      await logSentEmail(this.repo, p, j, snapshot);
      if (payload.reminder_day || payload.countersign_due)
        await mutate(this.repo, p.id, (p) => {
          const type = payload.countersign_due
            ? "countersign_reminder_sent"
            : "reminder_sent";
          if (p.events.some((e) => e.type === type && e.metadata.job === j.id))
            return;
          event(p, type, system, {
            job: j.id,
            day: payload.reminder_day,
            version: payload.version,
            kind: payload.reminder_kind,
            due_at: payload.reminder_due ?? payload.countersign_due,
            automatic: isAutomaticReminder(j),
          });
        });
      return;
    }
    if (j.kind === "billing") {
      const failures = [];
      for (const provider of ["qbo", "stripe"] as const) {
        const fresh = (await this.repo.get(p.id))!,
          old = fresh.billing_links.find((l) => l.provider === provider);
        const currentClient = (
          await this.repo.entities<Client>("clients")
        ).find((c) => c.id === fresh.client.id);
        // Only reviewed provider mappings may change after signing, never contract identity/content.
        if (currentClient)
          fresh.client = {
            ...fresh.client,
            address: currentClient.address,
            phone: currentClient.phone,
            stripe_customer_id: currentClient.stripe_customer_id,
            qbo_customer_id: currentClient.qbo_customer_id,
          };
        const link = await bill(fresh, provider, this.providers[provider]);
        await mutate(this.repo, p.id, (p) => {
          // A retry may have read this link before a payment webhook settled it.
          // Never replace the durable Stripe payment/completion ledger with that old copy.
          if (
            provider === "stripe" &&
            p.billing_links.some(
              (l) => l.provider === "stripe" && l.status === "succeeded",
            )
          )
            return;
          if (
            provider === "stripe" &&
            link.status === "succeeded" &&
            old?.status !== "succeeded"
          ) {
            const checkout = (link.metadata?.checkout ?? []) as {
              url: string;
            }[];
            const added = (link.metadata?.added_existing ?? []) as {
              monthly_total: number;
              yearly_total?: number;
            }[];
            if (checkout.length)
              queue(p, "email", "billing-setup", {
                to: p.client.email,
                subject: `Billing setup: ${p.title}`,
                text: `Your proposal is signed. Complete billing setup: ${checkout.map((s) => s.url).join("\n")}`,
              });
            if (added.length)
              queue(p, "email", "billing-added", {
                to: p.client.email,
                subject: `Billing updated: ${p.title}`,
                text: `Your signed services have been added to your billing. New monthly total: ${money(
                  added.reduce((sum, s) => sum + s.monthly_total, 0),
                  p.currency,
                )}. New yearly total: ${money(
                  added.reduce((sum, s) => sum + (s.yearly_total ?? 0), 0),
                  p.currency,
                )}.`,
              });
          }
          p.billing_links = p.billing_links
            .filter((l) => l.provider !== provider)
            .concat(link);
          if (
            old?.status !== "succeeded" &&
            (link.status !== "succeeded" || link.external_object_id)
          )
            event(
              p,
              link.status === "succeeded"
                ? provider === "qbo"
                  ? "invoice_created"
                  : "subscription_created"
                : "sync_failed",
              system,
              {
                provider,
                status: link.status,
                external_id: link.external_object_id ?? null,
                error: link.last_error ?? null,
              },
            );
        });
        if (link.status === "failed") failures.push(provider);
      }
      if (
        (await this.repo.get(p.id))!.billing_links.some(
          (link) => link.status === "needs_review",
        )
      )
        await mutate(this.repo, p.id, (row) => {
          const review = row.billing_links.filter(
            (l) => l.status === "needs_review",
          );
          if (review.length)
            this.alert(
              row,
              j,
              review
                .map((l) => l.last_error || "A staff decision is needed")
                .join("; "),
              review.map((l) => l.provider),
            );
        });
      if (failures.length)
        throw new Error("Billing failed: " + failures.join(", "));
      return;
    }
    if (j.kind === "pdf") {
      const stage = String(j.payload.stage);
      const renderSettings =
        (j.payload.settings as Proposal["workspace_settings"]) ??
        p.workspace_settings;
      if (
        p.files.some(
          (f) =>
            f.stage === stage &&
            (f.kind === "sealed" || j.payload.preview === true),
        )
      )
        return;
      const v = j.payload.version as Version;
      // Import failures belong to this retryable job, never API initialization.
      const render = this.render ?? (await import("./pdf")).sealedPdf;
      const rendered = await render(
        v,
        j.payload.signers as Signer[],
        j.payload.events as Audit[],
        p.currency,
        {
          settings: renderSettings,
          document: { id: p.id, title: p.title },
          fonts: await Promise.all(
            [
              ...new Map(
                [
                  ...Object.values(renderSettings?.proposal_fonts ?? {}),
                  ...styleFonts(v.resolved_styles),
                ]
                  .filter((f) => typeof f !== "string")
                  .map((f) => [f.id, f]),
              ).values(),
            ].map(async (f) => {
              return {
                ...f,
                data: Buffer.from(
                  await readFont(this.storage, f, this.repo.workspaceId),
                ).toString("base64"),
              };
            }),
          ),
          logoIcon:
            ((v.cover?.layout && v.cover.layout !== "custom") ||
              (!renderSettings?.logo && usesWorkspaceBrand(v))) &&
            renderSettings?.logo_icon
              ? "data:image/png;base64," +
                Buffer.from(
                  await this.storage.get(renderSettings.logo_icon.path),
                ).toString("base64")
              : undefined,
          logo: renderSettings?.logo
            ? "data:image/png;base64," +
              Buffer.from(await this.storage.get(renderSettings.logo)).toString(
                "base64",
              )
            : undefined,
        },
      );
      const bodyPath = `${p.id}/${rendered.bodyHash}.pdf`,
        hash = sha256(rendered.pdf),
        path = `${p.id}/${hash}.pdf`;
      await this.storage.put(bodyPath, rendered.body);
      await this.storage.put(path, rendered.pdf);
      const now = new Date().toISOString();
      const signatures = (j.payload.signers as Signer[]).filter(
        (s) => s.kind === "drawn" && s.signature_image_path,
      );
      for (const signer of signatures)
        await this.storage.put(
          signer.signature_image_path!,
          Buffer.from(signer.image!.split(",")[1], "base64"),
        );
      await mutate(this.repo, p.id, (p) => {
        if (
          p.files.some(
            (f) =>
              f.stage === stage &&
              (f.kind === "sealed" || j.payload.preview === true),
          )
        )
          return;
        const body = {
          id: randomUUID(),
          kind: "render" as const,
          storage_path: bodyPath,
          sha256: rendered.bodyHash,
          bytes: rendered.body.length,
          created_at: now,
          stage,
        };
        const file = {
          id: randomUUID(),
          kind: j.payload.preview ? ("render" as const) : ("sealed" as const),
          storage_path: path,
          sha256: hash,
          bytes: rendered.pdf.length,
          created_at: now,
          body_sha256: rendered.bodyHash,
          version_hash: v.content_hash,
          stage,
        };
        p.files.push(body, file);
        if (rendered.print_failures?.length)
          event(p, "pdf_print_recovered", system, {
            job: j.id,
            stage,
            pdf_diagnostics: shortPrintDiagnostics(rendered.print_failures),
          });
        for (const signer of signatures) {
          if (
            p.files.some((f) => f.storage_path === signer.signature_image_path)
          )
            continue;
          const bytes = Buffer.from(signer.image!.split(",")[1], "base64");
          p.files.push({
            id: randomUUID(),
            kind: "signature",
            storage_path: signer.signature_image_path!,
            sha256: sha256(bytes),
            bytes: bytes.length,
            created_at: now,
            stage: signer.role,
          });
        }
        if (!j.payload.preview)
          for (const to of new Set([p.client.email, ...staffRecipients(p)]))
            queue(p, "email", `copy:${stage}:${to}`, {
              to,
              subject: `Signed copy: ${p.title}`,
              text: `Attached is your ${stage === "company" ? "fully countersigned" : "client-signed"} proposal.`,
              file_id: file.id,
            });
      });
    }
  }
  private alert(
    p: Proposal,
    job: Job,
    error: string,
    providers: string[] = [],
  ) {
    if (job.payload.preview || job.payload.job_failure) return;
    const failure = jobFailure(job, error, providers);
    // Queue identity persists across manual retries, process restarts and email retries.
    const fingerprint = sha256(job.id + "\n" + error);
    const assignment =
      !p.sender && job.id.startsWith(p.id + ":reassigned:")
        ? (job.payload.email_snapshot as EmailSnapshot)
        : undefined;
    for (const to of staffRecipients(p))
      queue(
        p,
        "email",
        `job-alert:${fingerprint}:${to}`,
        {
          to,
          email_template_key: "staff_billing_failed",
          job_failure: failure,
        },
        undefined,
        assignment
          ? { from: assignment.from, reply_to: assignment.reply_to }
          : undefined,
      );
  }
  private async attachment(p: Proposal, id: string) {
    const f = p.files.find((x) => x.id === id);
    if (!f) throw new Error("Sealed file missing");
    return [
      {
        filename: "signed-proposal.pdf",
        content: Buffer.from(await this.storage.get(f.storage_path)).toString(
          "base64",
        ),
      },
    ];
  }
  async retry(id: string) {
    return mutate(this.repo, id, (p) => {
      for (const j of p.jobs) {
        if (
          j.status === "running" &&
          Date.parse(j.lease_until ?? "") > Date.now()
        )
          continue;
        if (
          j.status === "failed" ||
          j.status === "pending" ||
          (j.kind === "billing" &&
            p.billing_links.some((l) => l.status !== "succeeded"))
        ) {
          j.status = "pending";
          j.available_at = new Date().toISOString();
          j.attempts = 0;
          delete j.lease_until;
        }
      }
    });
  }
  async verify(p: Proposal, fileId: string) {
    const file = p.files.find((f) => f.id === fileId && f.kind === "sealed");
    if (!file) throw new AppError(404, "Sealed file not found");
    const actual = sha256(await this.storage.get(file.storage_path));
    const body = p.files.find(
      (f) => f.kind === "render" && f.sha256 === file.body_sha256,
    );
    const bodyValid =
      !!body &&
      sha256(await this.storage.get(body.storage_path)) === file.body_sha256;
    const v = p.versions.find((v) => v.content_hash === file.version_hash);
    const versionValid = !!v && versionHash(v) === file.version_hash;
    return {
      valid: actual === file.sha256 && bodyValid && versionValid,
      file_sha256: actual,
      expected_sha256: file.sha256,
      body_valid: bodyValid,
      version_valid: versionValid,
    };
  }
}
