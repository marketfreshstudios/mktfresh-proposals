import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { sha256 } from "../src/lib/content";
import { MockBillingProvider } from "../src/lib/billing";
import { MockMailer, Worker } from "../src/lib/jobs";
import { mutate } from "../src/lib/repository";
import { LocalStorage } from "../src/lib/storage";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
} from "./helpers";
it("recovers failed provider jobs, continues other providers, seals and verifies evidence", async () => {
  const { repo, service, draft, settings } = await setup();
  await service.edit(
    draft.id,
    {
      revision: draft.revision,
      pagination: { format: 1, pages: 1, starts: [] },
    },
    staff,
  );
  const p = await service.send(draft.id, staff);
  await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const dir = await mkdtemp(join(tmpdir(), "proposal-jobs-")),
    storage = new LocalStorage(dir),
    mailer = new MockMailer(),
    qbo = new MockBillingProvider("qbo"),
    stripe = new MockBillingProvider("stripe");
  qbo.failure = new Error("Unavailable");
  const worker = new Worker(
    repo,
    storage,
    mailer,
    { qbo, stripe },
    async () => {
      const doc = await PDFDocument.create();
      doc.addPage().drawText("Test-only PDF renderer");
      const body = Buffer.from(await doc.save());
      return { body, pdf: body, bodyHash: sha256(body) };
    },
  );
  await worker.drain(p.id);
  let state = (await repo.get(p.id))!;
  expect(state.status).toBe("signed_by_client");
  expect(state.billing_links.find((l) => l.provider === "qbo")).toBeUndefined();
  expect(qbo.objects.size).toBe(0);
  expect(state.billing_links.find((l) => l.provider === "stripe")!.status).toBe(
    "succeeded",
  );
  await worker.retry(p.id);
  await worker.drain(p.id);
  expect(qbo.objects.size).toBe(0);
  state = (await repo.get(p.id))!;
  await service.sign(
    p.id,
    companyConsent(state.revision, settings),
    "company",
    staff,
  );
  await worker.drain(p.id);
  state = (await repo.get(p.id))!;
  expect(state.billing_links.find((l) => l.provider === "qbo")?.status).toBe(
    "failed",
  );
  expect(state.events.some((e) => e.type === "sync_failed")).toBe(true);
  qbo.failure = undefined;
  await worker.retry(p.id);
  await worker.drain(p.id);
  state = (await repo.get(p.id))!;
  expect(state.billing_links.every((l) => l.status === "succeeded")).toBe(true);
  expect(stripe.objects.size).toBe(1);
  expect(qbo.objects.size).toBe(1);
  const file = state.files.find((f) => f.kind === "sealed")!;
  expect((await worker.verify(state, file.id)).valid).toBe(true);
  const tampered = structuredClone(state);
  tampered.versions.at(-1)!.pagination = {
    format: 1,
    pages: 2,
    starts: [
      { page: 2, block: draft.content[0].id!, offset: 0, explicit: false },
    ],
  };
  expect((await worker.verify(tampered, file.id)).version_valid).toBe(false);
  const bytes = await readFile(join(dir, file.storage_path));
  await writeFile(
    join(dir, file.storage_path),
    Buffer.concat([bytes, Buffer.from("tamper")]),
  );
  expect((await worker.verify(state, file.id)).valid).toBe(false);
  expect(mailer.sent.size).toBeGreaterThan(1);
});

it("defers an old combined billing job until the company signs and leaves the invoice to the new job", async () => {
  const { repo, service, draft, settings } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  await mutate(repo, signed.id, (p) => {
    delete p.jobs.find((job) => job.kind === "billing")!.payload.provider;
  });
  const qbo = new MockBillingProvider("qbo");
  const stripe = new MockBillingProvider("stripe");
  const worker = new Worker(
    repo,
    { put: async () => {}, get: async () => new Uint8Array() },
    new MockMailer(),
    { qbo, stripe },
  );
  await worker.drain(signed.id, "billing");
  expect(qbo.objects.size).toBe(0);
  expect(stripe.objects.size).toBe(1);
  const before = (await repo.get(signed.id))!;
  await service.sign(
    signed.id,
    companyConsent(before.revision, settings),
    "company",
    staff,
  );
  await mutate(repo, signed.id, (p) => {
    p.jobs.find((job) => job.id === p.id + ":billing")!.status = "pending";
  });
  await worker.drain(signed.id, "billing");
  const final = (await repo.get(signed.id))!;
  expect(qbo.objects.size).toBe(1);
  expect(stripe.objects.size).toBe(1);
  expect(
    final.events.filter((event) => event.type === "invoice_created"),
  ).toHaveLength(1);
});
