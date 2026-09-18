import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { sha256 } from "../src/lib/content";
import { MockBillingProvider } from "../src/lib/billing";
import { MockMailer, Worker } from "../src/lib/jobs";
import { LocalStorage } from "../src/lib/storage";
import { setup, staff, clientActor, signature } from "./helpers";
it("recovers failed provider jobs, continues other providers, seals and verifies evidence", async () => {
  const { repo, service, draft } = await setup();
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
  expect(state.billing_links.find((l) => l.provider === "qbo")!.status).toBe(
    "failed",
  );
  expect(state.billing_links.find((l) => l.provider === "stripe")!.status).toBe(
    "succeeded",
  );
  expect(state.events.some((e) => e.type === "sync_failed")).toBe(true);
  qbo.failure = undefined;
  await worker.retry(p.id);
  await worker.drain(p.id);
  state = (await repo.get(p.id))!;
  expect(state.billing_links.every((l) => l.status === "succeeded")).toBe(true);
  expect(stripe.objects.size).toBe(1);
  const file = state.files.find((f) => f.kind === "sealed")!;
  expect((await worker.verify(state, file.id)).valid).toBe(true);
  const bytes = await readFile(join(dir, file.storage_path));
  await writeFile(
    join(dir, file.storage_path),
    Buffer.concat([bytes, Buffer.from("tamper")]),
  );
  expect((await worker.verify(state, file.id)).valid).toBe(false);
  expect(mailer.sent.size).toBeGreaterThan(1);
});
