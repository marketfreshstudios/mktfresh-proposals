import { flatQuote, quoteItems } from "../src/lib/quote-model";
import { expect, it, vi } from "vitest";
import { MemoryRepository } from "../src/lib/repository";
import {
  saveDocument,
  refreshDocument,
  documents,
  readDocumentsForDraft,
  refreshDueDocuments,
} from "../src/lib/documents";
import { decryptSecret } from "../src/lib/providers/secrets";
import {
  fetchReference,
  publicAddress,
  referenceUrl,
  REFERENCE_LIMIT,
} from "../src/lib/reference-fetch";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { request } from "node:https";
import { setup, staff } from "./helpers";
import { aiTool } from "../src/lib/ai-tools";
const key = Buffer.alloc(32, 7).toString("base64");
const linked = {
  name: "Pricing",
  source_type: "linked",
  url: "https://pricing.example.test/reference.txt",
};
const content =
  "PLAYBOOK_VERSION = 'v2.3'\nthrow new Error('never execute me');";
it("encrypts both credentials, returns no secrets, stores each successful version and preserves last good content after failure", async () => {
  const repo = new MemoryRepository();
  const fetcher = vi.fn().mockResolvedValue(content);
  const saved = await saveDocument(
    repo,
    { ...linked, username: "secret-user", password: "secret-pass" },
    fetcher,
    key,
  );
  expect(fetcher).toHaveBeenCalledWith(linked.url, {
    credentials: { username: "secret-user", password: "secret-pass" },
  });
  expect(saved).toMatchObject({
    version: "v2.3",
    content,
    has_auth: true,
    fetch_error: null,
  });
  expect(saved.content_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(saved.fetched_at).toBeTruthy();
  expect(JSON.stringify(await documents(repo))).not.toMatch(
    /secret-user|secret-pass|ciphertext/,
  );
  const [credential] = await repo.entities<{ ciphertext: string }>(
    "provider_credentials",
  );
  expect(credential.ciphertext).not.toContain("secret-pass");
  expect(
    JSON.parse(
      decryptSecret(
        credential.ciphertext,
        key,
        repo.workspaceId + ":reference:" + saved.id,
      ),
    ),
  ).toEqual({ username: "secret-user", password: "secret-pass" });
  const second = await refreshDocument(repo, saved.id, fetcher, key);
  expect(second.version_id).not.toBe(saved.version_id);
  expect(second.content_hash).toBe(saved.content_hash);
  const failed = await refreshDocument(
    repo,
    saved.id,
    vi.fn().mockRejectedValue(new Error("Reference fetch failed (HTTP 401)")),
    key,
  );
  expect(failed).toMatchObject({
    content,
    content_hash: second.content_hash,
    version_id: second.version_id,
    fetched_at: second.fetched_at,
    last_success_at: second.last_success_at,
    fetch_error: "Reference fetch failed (HTTP 401)",
  });
  expect(await repo.entities("workspace_events")).toHaveLength(2);
  await expect(
    saveDocument(
      repo,
      { ...linked, id: saved.id, url: "https://another.example.test/file" },
      fetcher,
      key,
    ),
  ).rejects.toThrow("Changing hosts");
  await saveDocument(
    repo,
    { ...linked, id: saved.id, clear_auth: true },
    fetcher,
    key,
  );
  expect(fetcher).toHaveBeenLastCalledWith(linked.url, {
    credentials: undefined,
  });
});
it("keeps pasted documents as inert text and handles a first-fetch failure without fabricating a version", async () => {
  const repo = new MemoryRepository();
  const pasted = await saveDocument(repo, {
    name: "Pasted",
    format: "json",
    content: "not JSON; just text",
    version: "manual-v1",
  });
  expect(pasted).toMatchObject({
    source_type: "pasted",
    version: "manual-v1",
    content: "not JSON; just text",
    fetched_at: null,
  });
  const failed = await saveDocument(
    repo,
    linked,
    vi.fn().mockRejectedValue(new Error("password=private")),
  );
  expect(failed.content_hash).toBe("");
  expect(failed.fetched_at).toBeNull();
  expect(failed.fetch_error).not.toContain("private");
});
function network(
  responses: {
    status?: number;
    headers?: Record<string, string>;
    chunks?: Buffer[];
    hang?: boolean;
  }[],
) {
  const calls: { url: URL; options: any }[] = [];
  const send = ((url: URL, options: any, callback: any) => {
    calls.push({ url, options });
    const req = new EventEmitter() as any;
    req.end = () =>
      queueMicrotask(() => {
        const spec = responses.shift()!;
        if (spec.hang) return;
        const response = Readable.from(
          spec.chunks ?? [Buffer.from(content)],
        ) as any;
        response.statusCode = spec.status ?? 200;
        response.headers = spec.headers ?? {};
        callback(response);
      });
    return req;
  }) as typeof request;
  const resolve = vi
    .fn()
    .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  return { request: send, resolve, calls };
}
it("fetches UTF-8 text using Basic auth and pins the validated DNS address", async () => {
  const net = network([{}]);
  expect(
    await fetchReference(linked.url, {
      ...net,
      credentials: { username: "u", password: "p" },
    }),
  ).toBe(content);
  expect(net.calls[0].options.headers.Authorization).toBe("Basic dTpw");
  const callback = vi.fn();
  net.calls[0].options.lookup("pricing.example.test", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  expect(net.calls[0].options.agent).toBe(false);
});
it("allows same-origin redirects but rejects cross-host and downgrade redirects before sending auth", async () => {
  const net = network([{ status: 302, headers: { location: "/new" } }, {}]);
  expect(await fetchReference(linked.url, net)).toBe(content);
  expect(net.calls[1].url.pathname).toBe("/new");
  for (const location of [
    "https://other.example.test/file",
    "http://pricing.example.test/file",
    "https://127.0.0.1/file",
  ]) {
    const bad = network([{ status: 302, headers: { location } }]);
    await expect(fetchReference(linked.url, bad)).rejects.toThrow();
    expect(bad.calls).toHaveLength(1);
  }
});
it.each([
  "127.0.0.1",
  "10.0.0.1",
  "172.16.2.1",
  "192.168.1.1",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "224.1.1.1",
  "::1",
  "::",
  "::ffff:127.0.0.1",
  "fc00::1",
  "fe80::1",
  "2002:7f00:1::1",
  "2001:db8::1",
])("rejects non-public IP %s", (address) =>
  expect(publicAddress(address)).toBe(false),
);
it("rejects encoded IPs, credentials in URLs, private DNS answers and DNS rebinding", async () => {
  for (const url of [
    "http://public.test",
    "https://user:pass@public.test",
    "https://2130706433",
    "https://0x7f000001",
    "https://[::1]",
    "https://localhost",
  ])
    expect(() => referenceUrl(url)).toThrow();
  const net = network([{}]);
  net.resolve.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
  await expect(fetchReference(linked.url, net)).rejects.toThrow(
    "public addresses",
  );
  expect(net.calls).toHaveLength(0);
  const rebound = network([{ status: 302, headers: { location: "/next" } }]);
  rebound.resolve
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
  await expect(fetchReference(linked.url, rebound)).rejects.toThrow(
    "public addresses",
  );
  expect(rebound.calls).toHaveLength(1);
  expect(publicAddress("2606:4700:4700::1111")).toBe(true);
});
it("enforces declared and streamed size limits and a total timeout covering DNS and response", async () => {
  for (const spec of [
    { headers: { "content-length": String(REFERENCE_LIMIT + 1) } },
    { chunks: [Buffer.alloc(REFERENCE_LIMIT), Buffer.from("x")] },
  ])
    await expect(fetchReference(linked.url, network([spec]))).rejects.toThrow(
      "1 MB",
    );
  expect(
    (
      await fetchReference(
        linked.url,
        network([{ chunks: [Buffer.alloc(REFERENCE_LIMIT, 97)] }]),
      )
    ).length,
  ).toBe(REFERENCE_LIMIT);
  await expect(
    fetchReference(linked.url, { ...network([{ hang: true }]), timeout: 10 }),
  ).rejects.toThrow("timed out");
  const net = network([]);
  net.resolve.mockImplementation(() => new Promise(() => {}));
  await expect(
    fetchReference(linked.url, { ...net, timeout: 10 }),
  ).rejects.toThrow("timed out");
  expect(net.calls).toHaveLength(0);
});
it("records the actual version read, even after refresh, on the draft's first event and isolates connector grants", async () => {
  const { repo, draft } = await setup();
  const ai = {
    ...staff,
    workspace_id: repo.workspaceId,
    actor: "ai:Assistant",
    connector_id: "grant-1",
  };
  const scopes = ["proposals:read", "proposals:draft"];
  const doc = await saveDocument(repo, {
    name: "Reference",
    content,
    version: "v1",
  });
  const list = (await aiTool(repo, ai, "list_documents", {}, scopes)) as any[];
  expect(list.find((d) => d.id === doc.id)).toMatchObject({
    content_hash: doc.content_hash,
    version: "v2.3",
    fetched_at: null,
  });
  const read = (await aiTool(
    repo,
    ai,
    "get_document",
    { id: doc.id },
    scopes,
  )) as any;
  expect(read).toMatchObject({ content, content_hash: doc.content_hash });
  await saveDocument(repo, {
    id: doc.id,
    name: "Reference",
    content: "new text",
    version: "v3",
  });
  const p = (await aiTool(
    repo,
    ai,
    "create_proposal_draft",
    {
      brief: "Read reference",
      template_id: draft.template_id,
      client_id: draft.client.id,
      title: "Draft",
      content_markdown: "Text",
      lines: flatQuote(draft.quote),
    },
    scopes,
  )) as any;
  expect((await repo.get(p.id))!.events[0].metadata.document_versions).toEqual([
    expect.objectContaining({
      id: doc.id,
      version_id: doc.version_id,
      version: "v2.3",
      content_hash: doc.content_hash,
    }),
  ]);
  expect(
    await readDocumentsForDraft(repo, { ...ai, connector_id: "grant-2" }),
  ).toEqual([]);
});

it("refreshes linked references each cron hour and leaves pasted references alone", async () => {
  const repo = new MemoryRepository();
  const fetcher = vi.fn().mockResolvedValue(content);
  const doc = await saveDocument(repo, linked, fetcher);
  await saveDocument(repo, { name: "Pasted", content: "Manual" });
  const hour = Math.floor(Date.parse(doc.last_attempt_at!) / 3600000) * 3600000;
  expect(await refreshDueDocuments(repo, hour, fetcher)).toEqual([]);
  const result = await refreshDueDocuments(repo, hour + 3600000, fetcher);
  expect(result).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("a slow failed refresh cannot overwrite a newer successful version", async () => {
  const repo = new MemoryRepository();
  const doc = await saveDocument(repo, linked, async () => "original");
  let fail!: (error: Error) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const slow = refreshDocument(
    repo,
    doc.id,
    () =>
      new Promise<string>((_, reject) => {
        fail = reject;
        started();
      }),
  );
  await ready;
  const latest = await refreshDocument(repo, doc.id, async () => "new version");
  fail(new Error("Reference fetch failed (HTTP 503)"));
  await slow;
  expect((await documents(repo))[0]).toMatchObject({
    content: "new version",
    version_id: latest.version_id,
    fetch_error: null,
  });
});

it.each(["", "const ", "let ", "var "])(
  "extracts non-ASCII PLAYBOOK_VERSION labels with %s declarations and either quote style",
  async (declaration) => {
    for (const quote of ["'", '"']) {
      const repo = new MemoryRepository();
      const text =
        declaration +
        "PLAYBOOK_VERSION = " +
        quote +
        "v1.17 · 15 October 2026" +
        quote +
        ";\nOther text";
      const doc = await saveDocument(repo, linked, async () => text);
      expect(doc.version).toBe("v1.17 · 15 October 2026");
      expect(doc.content).toBe(text);
      expect(doc.content_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  },
);
