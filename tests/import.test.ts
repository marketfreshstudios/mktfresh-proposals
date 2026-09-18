import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { MemoryRepository } from "../src/lib/repository";
import { LocalStorage } from "../src/lib/storage";
import {
  importCsv,
  parseCsv,
  uploadPdfs,
} from "../scripts/proposify-import/core";
it("imports quoted CSV, deduplicates rows/files, extracts text and reconciles missing PDFs", async () => {
  const repo = new MemoryRepository(),
    dir = await mkdtemp(join(tmpdir(), "proposal-import-")),
    storage = new LocalStorage(join(dir, "store"));
  const csv =
    'proposify_id,company,first_name,last_name,email,title,created_at\nabc123,"Acme, Inc",Jane,Doe,jane@example.test,"Website, design",2025-01-01\nmissing,Other,John,Doe,john@example.test,Other proposal,2025-01-02';
  expect((await importCsv(repo, csv)).inserted).toBe(2);
  expect((await importCsv(repo, csv)).updated).toBe(2);
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Historical signed agreement");
  await writeFile(join(dir, "abc123_Acme_Website.pdf"), await doc.save());
  const report = await uploadPdfs(repo, storage, dir);
  expect(report.uploaded).toBe(1);
  expect(report.missing_pdf).toEqual(["missing"]);
  expect(
    (await repo.list()).find((p) => p.proposify_id === "abc123")!.search_text,
  ).toContain("Historical signed agreement");
  expect((await uploadPdfs(repo, storage, dir)).skipped).toBe(1);
  expect(
    (await repo.list()).every(
      (p) => p.status === "archived" && !p.token && p.jobs.length === 0,
    ),
  ).toBe(true);
  expect(() => parseCsv("proposify_id,title\n../bad,Oops")).toThrow();
});
