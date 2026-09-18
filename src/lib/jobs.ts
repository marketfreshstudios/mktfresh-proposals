import { randomUUID } from "node:crypto";
import { sha256, versionHash } from "./content";
import { bill, type BillingProvider } from "./billing";
import { sealedPdf } from "./pdf";
import { mutate, type Repository } from "./repository";
import { event, notify, queue, system } from "./service";
import {
  AppError,
  type Audit,
  type Job,
  type Proposal,
  type Signer,
  type Version,
} from "./model";
import type { Storage } from "./storage";
export interface Mailer {
  send(
    input: {
      to: string;
      subject: string;
      text: string;
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
      to: string;
      subject: string;
      text: string;
      attachments?: { filename: string; content: string }[];
    },
    key: string,
  ) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
      throw new Error("Resend credentials/from address missing");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": sha256(key),
      },
      body: JSON.stringify({ ...input, from: process.env.EMAIL_FROM }),
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
    private render = sealedPdf,
  ) {}
  async drain(id?: string) {
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
          const j = p.jobs.find(
            (j) =>
              j.status !== "done" &&
              j.status !== "failed" &&
              Date.parse(j.available_at) <= now.getTime() &&
              (j.status !== "running" ||
                Date.parse(j.lease_until ?? "") < now.getTime()),
          );
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
            event(p, "sync_failed", system, { job: j.id, error: j.last_error });
            if (j.kind !== "email") notify(p, "sync_failed");
          });
          results.push({ job: job.id, status: "failed" });
        }
      }
    }
    return results;
  }
  private async execute(p: Proposal, j: Job) {
    if (j.kind === "email") {
      const payload = j.payload;
      if (
        payload.reminder_day &&
        (!["sent", "viewed"].includes(p.status) ||
          payload.version !== p.versions.length ||
          Date.parse(p.valid_until) <= Date.now())
      )
        return;
      const attachments = payload.file_id
        ? await this.attachment(p, String(payload.file_id))
        : undefined;
      await this.mailer.send(
        {
          to: String(payload.to),
          subject: String(payload.subject),
          text: String(payload.text),
          ...(attachments ? { attachments } : {}),
        },
        j.id,
      );
      if (payload.reminder_day)
        await mutate(this.repo, p.id, (p) =>
          event(p, "reminder_sent", system, {
            day: payload.reminder_day,
            version: payload.version,
          }),
        );
      return;
    }
    if (j.kind === "billing") {
      const failures = [];
      for (const provider of ["qbo", "stripe"] as const) {
        const fresh = (await this.repo.get(p.id))!,
          old = fresh.billing_links.find((l) => l.provider === provider);
        const link = await bill(fresh, provider, this.providers[provider]);
        await mutate(this.repo, p.id, (p) => {
          p.billing_links = p.billing_links
            .filter((l) => l.provider !== provider)
            .concat(link);
          if (old?.status !== "succeeded")
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
        if (link.status === "needs_review")
          await mutate(this.repo, p.id, (p) => notify(p, "sync_failed"));
      }
      if (failures.length)
        throw new Error("Billing failed: " + failures.join(", "));
      return;
    }
    if (j.kind === "pdf") {
      const stage = String(j.payload.stage);
      if (p.files.some((f) => f.kind === "sealed" && f.stage === stage)) return;
      const v = j.payload.version as Version;
      const rendered = await this.render(
        v,
        j.payload.signers as Signer[],
        j.payload.events as Audit[],
        p.currency,
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
        if (p.files.some((f) => f.kind === "sealed" && f.stage === stage))
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
          kind: "sealed" as const,
          storage_path: path,
          sha256: hash,
          bytes: rendered.pdf.length,
          created_at: now,
          body_sha256: rendered.bodyHash,
          version_hash: v.content_hash,
          stage,
        };
        p.files.push(body, file);
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
        for (const to of new Set([
          p.client.email,
          process.env.STAFF_EMAIL ?? "staff@example.test",
        ]))
          queue(p, "email", `copy:${stage}:${to}`, {
            to,
            subject: `Signed copy: ${p.title}`,
            text: `Attached is your ${stage === "company" ? "fully countersigned" : "client-signed"} proposal.`,
            file_id: file.id,
          });
      });
    }
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
    const versionValid =
      !!v &&
      versionHash({
        content: v.content,
        quote: v.quote,
        variables_resolved: v.variables_resolved,
      }) === file.version_hash;
    return {
      valid: actual === file.sha256 && bodyValid && versionValid,
      file_sha256: actual,
      expected_sha256: file.sha256,
      body_valid: bodyValid,
      version_valid: versionValid,
    };
  }
}
