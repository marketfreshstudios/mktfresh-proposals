import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import {
  setup,
  staff,
  signature,
  clientActor,
  companyConsent,
} from "../helpers";
import { mutate } from "../../src/lib/repository";
import { versionHash } from "../../src/lib/content";
import { Worker, MockMailer } from "../../src/lib/jobs";
import { MockBillingProvider } from "../../src/lib/billing";
import { LocalStorage } from "../../src/lib/storage";
import { sealedPdf } from "../../src/lib/pdf";
import {
  BandSpacingSchema,
  defaultHeaderFooter,
} from "../../src/lib/page-bands";
import type { Version } from "../../src/lib/model";
export const regressionKinds = [
  "old-plan",
  "old-unplanned",
  "large-bands",
] as const;
export async function verifyPdfJobs(kind: (typeof regressionKinds)[number]) {
  const { repo, service, draft, settings } = await setup();
  let p = await service.send(draft.id, staff);
  p = await mutate(repo, p.id, (row) => {
    const v = row.versions[0];
    v.content = [
      {
        id: "intro",
        type: "paragraph",
        text: "This is the agreement introduction.",
      },
      { id: "page-marker", type: "page_break" },
      {
        id: "second",
        type: "paragraph",
        text: "Second page: the agreed scope and services.",
      },
      { id: "client-signature", type: "signature_block", role: "client" },
      { id: "company-signature", type: "signature_block", role: "company" },
    ];
    if (kind.startsWith("old")) {
      delete v.cover;
      delete v.header_footer;
      delete v.resolved_styles;
    } else {
      v.header_footer = defaultHeaderFooter();
      v.header_footer.headerSpacing = BandSpacingSchema.parse({
        heightIn: 0.6,
        distanceIn: 0.4,
      });
      v.header_footer.footerSpacing = BandSpacingSchema.parse({
        heightIn: 0.8,
        distanceIn: 0.5,
      });
    }
    if (kind === "old-unplanned") delete v.pagination;
    else
      v.pagination = {
        format: 1,
        pages: 2,
        starts: [
          {
            page: 2,
            block: "second",
            offset: 0,
            explicit: true,
            marker: "page-marker",
          },
        ],
      };
    v.content_hash = versionHash(v);
  });
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const dir = await mkdtemp(join(tmpdir(), "sealed-regression-")),
    storage = new LocalStorage(dir),
    mailer = new MockMailer(),
    providers = {
      qbo: new MockBillingProvider("qbo"),
      stripe: new MockBillingProvider("stripe"),
    };
  const worker = new Worker(repo, storage, mailer, providers);
  assert.equal((await worker.drain(p.id, "pdf"))[0].status, "done");
  p = (await repo.get(p.id))!;
  const frozen = JSON.stringify(p.versions[0]);
  const client = p.files.find(
    (f) => f.kind === "sealed" && f.stage === "client",
  )!;
  assert(client);
  assert.equal((await worker.verify(p, client.id)).valid, true);
  p = await service.sign(
    p.id,
    companyConsent(p.revision, settings),
    "company",
    staff,
  );
  // Exercise an exhausted company job and the owner's existing Retry path.
  await mutate(repo, p.id, (row) => {
    row.jobs.find(
      (j) => j.kind === "pdf" && j.payload.stage === "company",
    )!.attempts = 4;
  });
  const failing = new Worker(repo, storage, mailer, providers, async () => {
    throw new Error("Simulated prior print failure");
  });
  await failing.drain(p.id, "pdf");
  assert.equal(
    (await repo.get(p.id))!.jobs.find((j) => j.id.endsWith(":pdf:company"))!
      .status,
    "failed",
  );
  await worker.retry(p.id);
  await worker.drain(p.id, "pdf");
  await worker.drain(p.id, "email");
  p = (await repo.get(p.id))!;
  assert.equal(JSON.stringify(p.versions[0]), frozen);
  const company = p.files.find(
    (f) => f.kind === "sealed" && f.stage === "company",
  )!;
  assert(company);
  assert.equal((await worker.verify(p, company.id)).valid, true);
  const completedMail = () =>
    p.jobs.filter(
      (j) => j.kind === "email" && j.payload.file_id === company.id,
    );
  assert.equal(completedMail().length, 2);
  assert(completedMail().every((j) => j.status === "done" && j.attempts === 1));
  const sent = mailer.sent.size;
  await worker.retry(p.id);
  await worker.drain(p.id, "pdf");
  await worker.drain(p.id, "email");
  p = (await repo.get(p.id))!;
  assert.equal(mailer.sent.size, sent);
  const version = p.versions[0] as Version;
  const preview = await sealedPdf(
    version,
    [],
    [],
    "USD",
    { settings },
    { preview: true },
  );
  const previewCount = (await PDFDocument.load(preview.pdf)).getPageCount();
  for (const f of [client, company]) {
    const bytes = await storage.get(f.storage_path),
      pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), previewCount + 1);
    const file = join(dir, `${f.stage}.pdf`);
    await writeFile(file, bytes);
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    assert(text.includes("Certificate of completion"));
    assert(
      !text.includes("Yeswell"),
      "Product branding must stay out of proposal PDF and certificate",
    );
    assert(text.replace(/\s/g, "").includes(version.content_hash));
    if (kind.startsWith("old")) {
      // This checks legacy cover wording, not Poppler's treatment of its
      // historical uppercase tracking. Whole-word label checks stay separate.
      const wording = text.replace(/\s+/g, "").toLowerCase();
      assert(wording.includes("proposalforacme"));
      assert(wording.includes("fromalexmorgan"));
      assert(!wording.includes("preparedfor"));
    }
    if (version.pagination) {
      assert.equal(previewCount, version.pagination.pages);
      const page2 = execFileSync(
        "pdftotext",
        ["-f", "2", "-l", "2", file, "-"],
        { encoding: "utf8" },
      );
      assert(page2.includes("Second page:"));
    }
  }
  return {
    kind,
    body_pages: previewCount,
    sealed_pages: previewCount + 1,
    completion_copies: completedMail().length,
    dir,
    recovered: p.events
      .filter((e) => e.type === "pdf_print_recovered")
      .map((e) => e.metadata),
  };
}
