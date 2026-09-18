import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { ClientSchema, type Client, type Proposal } from "../../src/lib/model";
import { sha256 } from "../../src/lib/content";
import { mutate, type Repository } from "../../src/lib/repository";
import { event, system } from "../../src/lib/service";
import type { Storage } from "../../src/lib/storage";
export type ImportRow = {
  proposify_id: string;
  company: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  created_at: string;
  url?: string;
};
export function parseCsv(csv: string): ImportRow[] {
  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as ImportRow[];
  for (const [i, r] of rows.entries()) {
    if (!/^[A-Za-z0-9-]+$/.test(r.proposify_id ?? ""))
      throw new Error(`Row ${i + 2}: valid proposify_id required`);
    if (!r.title || !r.company || !r.email)
      throw new Error(`Row ${i + 2}: title, company and email required`);
    if (r.created_at && !Number.isFinite(Date.parse(r.created_at)))
      throw new Error(`Row ${i + 2}: invalid created_at`);
  }
  return rows;
}
export async function importCsv(repo: Repository, csv: string) {
  const rows = parseCsv(csv);
  let inserted = 0,
    updated = 0;
  for (const r of rows) {
    let client = (await repo.entities<Client>("clients")).find(
      (c) => c.email.toLowerCase() === r.email.toLowerCase(),
    );
    client = ClientSchema.parse({
      ...client,
      id: client?.id ?? randomUUID(),
      company: r.company,
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      email: r.email.toLowerCase(),
    });
    await repo.put("clients", client);
    const old = (await repo.list()).find(
      (p) => p.proposify_id === r.proposify_id,
    );
    if (old) {
      await mutate(repo, old.id, (p) => {
        p.title = r.title;
        p.client = client!;
      });
      updated++;
      continue;
    }
    const now = new Date().toISOString(),
      p: Proposal = {
        id: randomUUID(),
        revision: 0,
        client,
        template_id: null,
        title: r.title,
        status: "archived",
        token: null,
        password_hash: null,
        valid_until: now,
        currency: "USD",
        source: "proposify_import",
        proposify_id: r.proposify_id,
        created_by: "system",
        created_at: r.created_at ? new Date(r.created_at).toISOString() : now,
        updated_at: now,
        sent_at: null,
        first_viewed_at: null,
        client_signed_at: null,
        completed_at: null,
        content: [],
        quote: [],
        versions: [],
        signers: [],
        events: [],
        files: [],
        billing_links: [],
        jobs: [],
        search_text: "",
      };
    event(p, "created", system, {
      source: "proposify_import",
      proposify_id: r.proposify_id,
    });
    await repo.save(p, -1);
    inserted++;
  }
  return { rows: rows.length, inserted, updated };
}
export async function extractText(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
  });
  const document = await task.promise;
  try {
    let text = "";
    for (let i = 1; i <= document.numPages; i++) {
      const page = await document.getPage(i);
      const content = await page.getTextContent();
      text +=
        content.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
        "\n";
    }
    return text;
  } finally {
    await task.destroy();
  }
}
export async function uploadPdfs(
  repo: Repository,
  storage: Storage,
  dir: string,
) {
  const pdfs = (await readdir(dir)).filter((f) =>
      f.toLowerCase().endsWith(".pdf"),
    ),
    unmatched: string[] = [],
    errors: { file: string; error: string }[] = [];
  let uploaded = 0,
    skipped = 0;
  for (const file of pdfs) {
    try {
      const pid = file.split("_")[0],
        p = (await repo.list()).find((p) => p.proposify_id === pid);
      if (!p) {
        unmatched.push(file);
        continue;
      }
      const bytes = await readFile(join(dir, file));
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new Error("Invalid PDF");
      const hash = sha256(bytes);
      if (p.files.some((f) => f.kind === "import" && f.sha256 === hash)) {
        skipped++;
        continue;
      }
      const text = await extractText(bytes),
        path = `${p.id}/${hash}.pdf`;
      await storage.put(path, bytes);
      await mutate(repo, p.id, (p) => {
        if (p.files.some((f) => f.sha256 === hash)) return;
        p.files.push({
          id: randomUUID(),
          kind: "import",
          storage_path: path,
          sha256: hash,
          bytes: bytes.length,
          created_at: new Date().toISOString(),
        });
        p.search_text = text;
      });
      uploaded++;
    } catch (e) {
      errors.push({
        file,
        error: e instanceof Error ? e.message : "Upload failed",
      });
    }
  }
  const imported = (await repo.list()).filter(
    (p) => p.source === "proposify_import",
  );
  return {
    rows: imported.length,
    pdf_files: pdfs.length,
    uploaded,
    skipped,
    unmatched,
    errors,
    missing_pdf: imported
      .filter((p) => !p.files.some((f) => f.kind === "import"))
      .map((p) => p.proposify_id),
  };
}
