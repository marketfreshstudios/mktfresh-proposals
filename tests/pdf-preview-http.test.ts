import { beforeEach, expect, it, vi } from "vitest";
import { setup, staff } from "./helpers";
import { handle } from "../src/lib/http";
const state = vi.hoisted(() => ({
  rt: null as any,
  user: null as any,
  render: vi.fn(async () => ({
    pdf: Buffer.from("%PDF-preview"),
    body: Buffer.from("%PDF-preview"),
    bodyHash: "hash",
    layout: { pages: 1, boundaries: [] },
  })),
}));
vi.mock("../src/lib/pdf", () => ({ sealedPdf: state.render }));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.rt,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
vi.mock("../src/lib/auth", async (original) => {
  const actual = await original<typeof import("../src/lib/auth")>();
  const { AppError } = await import("../src/lib/model");
  return {
    ...actual,
    staff: async (req: Request) => {
      if (req.headers.get("authorization") !== "Bearer staff")
        throw new AppError(401, "Staff required");
      return state.user;
    },
  };
});
beforeEach(() => state.render.mockClear());
it("requires staff, rejects cross-workspace IDs and stale revisions, and never persists preview edits", async () => {
  const f = await setup();
  const put = vi.fn();
  state.rt = { repo: f.repo, storage: { put, get: vi.fn() } };
  state.user = { ...staff, workspace_id: f.repo.workspaceId };
  const path = ["proposals", f.draft.id, "preview-pdf"],
    url = `http://localhost/api/${path.join("/")}`;
  const input = {
    revision: f.draft.revision,
    title: "Unsaved preview text",
    content: f.draft.content,
    quote: f.draft.quote,
    valid_until: f.draft.valid_until,
  };
  const request = (body: unknown, token = "staff") =>
    new Request(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify(body),
    });
  expect((await handle(request(input, "no"), path)).status).toBe(401);
  expect(
    (await handle(request({ ...input, revision: 999 }), path)).status,
  ).toBe(409);
  expect(
    (
      await handle(request(input), [
        "proposals",
        crypto.randomUUID(),
        "preview-pdf",
      ])
    ).status,
  ).toBe(404);
  const before = JSON.stringify(await f.repo.get(f.draft.id));
  const result = await handle(request(input), path);
  expect(result.status).toBe(200);
  expect((await result.json()).layout.pages).toBe(1);
  expect(put).not.toHaveBeenCalled();
  expect(JSON.stringify(await f.repo.get(f.draft.id))).toBe(before);
  const download = await handle(
    new Request(url, { headers: { authorization: "Bearer staff" } }),
    path,
  );
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe("application/pdf");
  expect(download.headers.get("cache-control")).toContain("no-store");
  expect(await download.text()).toBe("%PDF-preview");
});
it("a sent snapshot cannot accept edited preview input", async () => {
  const f = await setup();
  state.rt = { repo: f.repo, storage: { put: vi.fn(), get: vi.fn() } };
  state.user = { ...staff, workspace_id: f.repo.workspaceId };
  const sent = await f.service.send(f.draft.id, staff),
    before = JSON.stringify(await f.repo.get(sent.id));
  const req = new Request(
    `http://localhost/api/proposals/${sent.id}/preview-pdf`,
    {
      method: "POST",
      headers: {
        authorization: "Bearer staff",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        revision: sent.revision,
        title: "Rewrite",
        content: sent.content,
        quote: sent.quote,
        valid_until: sent.valid_until,
      }),
    },
  );
  expect(
    (await handle(req, ["proposals", sent.id, "preview-pdf"])).status,
  ).toBe(409);
  expect(state.render).not.toHaveBeenCalled();
  expect(JSON.stringify(await f.repo.get(sent.id))).toBe(before);
});
it("template document previews are staff-only ephemeral specimens with no persistence", async () => {
  const f = await setup(),
    put = vi.fn();
  state.rt = { repo: f.repo, storage: { put, get: vi.fn() } };
  state.user = { ...staff, workspace_id: f.repo.workspaceId };
  const input = {
    id: crypto.randomUUID(),
    content: f.draft.content,
    quote: f.draft.quote,
    style_overrides: { density: "comfortable", margins: { left: 1 } },
  };
  const request = (token: string) =>
    new Request("http://localhost/api/document-preview", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  expect((await handle(request("no"), ["document-preview"])).status).toBe(401);
  const before = JSON.stringify(await f.repo.get(f.draft.id));
  const response = await handle(request("staff"), ["document-preview"]);
  expect(response.status).toBe(200);
  expect((await response.json()).layout.pages).toBe(1);
  expect(state.render).toHaveBeenCalledWith(
    expect.objectContaining({
      resolved_styles: expect.objectContaining({
        layout: expect.objectContaining({
          density: "comfortable",
          margins: expect.objectContaining({ left: 1 }),
        }),
      }),
    }),
    [],
    [],
    expect.any(String),
    expect.any(Object),
    { preview: true },
  );
  expect(put).not.toHaveBeenCalled();
  expect(JSON.stringify(await f.repo.get(f.draft.id))).toBe(before);
});
