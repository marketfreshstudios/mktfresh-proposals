import { beforeEach, expect, it, vi } from "vitest";
import { setup, staff } from "./helpers";
import { MemoryRepository } from "../src/lib/repository";
import { pdfPreview } from "../src/lib/pdf-preview";
const render = vi.hoisted(() =>
  vi.fn(async () => ({
    body: Buffer.from("%PDF-preview"),
    pdf: Buffer.from("%PDF-preview"),
    bodyHash: "hash",
    layout: {
      pages: 2,
      boundaries: [{ page: 2, block: "body", offset: 42, explicit: false }],
    },
  })),
);
vi.mock("../src/lib/pdf", () => ({ sealedPdf: render }));
beforeEach(() => render.mockClear());
it("renders an ephemeral watermarked version without writes, events, jobs or sealing", async () => {
  const { repo, draft, settings } = await setup(),
    put = vi.fn(),
    get = vi.fn();
  const original = JSON.stringify(await repo.get(draft.id));
  const result = await pdfPreview(repo, { put, get }, draft, settings);
  expect(result.layout.boundaries[0]).toMatchObject({
    block: "body",
    offset: 42,
  });
  expect(result.pdf_base64).toBe(
    Buffer.from("%PDF-preview").toString("base64"),
  );
  expect(render).toHaveBeenCalledWith(
    expect.objectContaining({
      frozen: false,
      resolved_styles: expect.any(Object),
    }),
    [],
    [],
    draft.currency,
    expect.objectContaining({ settings: expect.any(Object) }),
    { preview: true },
  );
  expect(put).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(JSON.stringify(await repo.get(draft.id))).toBe(original);
});
it("single-flights an unchanged layout but isolates workspaces, revisions and edits", async () => {
  const { repo, draft, settings } = await setup(),
    storage = { put: vi.fn(), get: vi.fn() };
  const [one, two] = await Promise.all([
    pdfPreview(repo, storage, draft, settings),
    pdfPreview(repo, storage, draft, settings),
  ]);
  expect(one.fingerprint).toBe(two.fingerprint);
  expect(render).toHaveBeenCalledTimes(1);
  const same = await pdfPreview(
    repo,
    storage,
    { ...draft, revision: draft.revision + 1 },
    settings,
  );
  expect(same.revision).toBe(draft.revision + 1);
  expect(render).toHaveBeenCalledTimes(1);
  await pdfPreview(
    repo,
    storage,
    { ...draft, title: "Changed title" },
    settings,
  );
  expect(render).toHaveBeenCalledTimes(2);
  await pdfPreview(
    new MemoryRepository(crypto.randomUUID()),
    storage,
    draft,
    settings,
  );
  expect(render).toHaveBeenCalledTimes(3);
});
it("rejects foreign logo assets and retries failed renders instead of caching failures", async () => {
  const { repo, draft, settings } = await setup(),
    storage = { put: vi.fn(), get: vi.fn() };
  await expect(
    pdfPreview(repo, storage, draft, { ...settings, logo: "foreign/logo.png" }),
  ).rejects.toThrow("Logo unavailable");
  expect(storage.get).not.toHaveBeenCalled();
  render.mockRejectedValueOnce(new Error("Renderer missing"));
  await expect(pdfPreview(repo, storage, draft, settings)).rejects.toThrow(
    "Renderer missing",
  );
  await expect(
    pdfPreview(repo, storage, draft, settings),
  ).resolves.toHaveProperty("layout.pages", 2);
});
it("ships the matching self-hosted PDF.js worker and its license", async () => {
  const { readFile } = await import("node:fs/promises");
  const { sha256 } = await import("../src/lib/content");
  expect(sha256(await readFile("public/pdf.worker.min.mjs"))).toBe(
    sha256(await readFile("node_modules/pdfjs-dist/build/pdf.worker.min.mjs")),
  );
  expect(await readFile("public/pdfjs-LICENSE.txt", "utf8")).toContain(
    "Apache License",
  );
});
