import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Repository } from "./repository";
import { check, type Actor } from "./model";
import { sha256 } from "./content";
import { encryptSecret, decryptSecret } from "./providers/secrets";
import {
  fetchReference,
  referenceUrl,
  REFERENCE_LIMIT,
} from "./reference-fetch";
export type ReferenceVersion = {
  version_id: string;
  version: string;
  content_hash: string;
  fetched_at: string | null;
};
export type ReferenceDocument = ReferenceVersion & {
  id: string;
  name: string;
  source_type: "pasted" | "linked";
  format: string;
  content: string;
  url?: string;
  has_auth?: boolean;
  last_attempt_at?: string;
  last_success_at?: string | null;
  fetch_error?: string | null;
};
const inputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  source_type: z.enum(["pasted", "linked"]).default("pasted"),
  version: z.string().max(200).default(""),
  format: z.enum(["markdown", "json", "text"]).default("text"),
  content: z.string().max(REFERENCE_LIMIT).default(""),
  url: z.string().max(2048).optional(),
  username: z.string().max(1000).optional(),
  password: z.string().max(1000).optional(),
  clear_auth: z.boolean().default(false),
});
/** Explicit projection: stored credentials and history can never enter API responses. */
export function documentView(d: ReferenceDocument): ReferenceDocument {
  return {
    id: d.id,
    name: d.name,
    source_type: d.source_type ?? "pasted",
    format: d.format,
    content: d.content ?? "",
    version: d.version ?? "",
    version_id: d.version_id ?? d.id,
    content_hash: d.content_hash ?? sha256(d.content ?? ""),
    fetched_at: d.fetched_at ?? null,
    url: d.url,
    has_auth: !!d.has_auth,
    last_attempt_at: d.last_attempt_at,
    last_success_at: d.last_success_at ?? null,
    fetch_error: d.fetch_error ?? null,
  };
}
export async function documents(repo: Repository) {
  return (await repo.entities<ReferenceDocument>("workspace_documents")).map(
    documentView,
  );
}
function label(content: string) {
  return /^\s*PLAYBOOK_VERSION\s*=\s*(['"])([^\r\n]*?)\1\s*;?\s*$/m
    .exec(content)?.[2]
    ?.slice(0, 200);
}
async function storeVersion(
  repo: Repository,
  doc: ReferenceDocument,
  content: string,
  fetchedAt: string | null,
  attempt?: string,
) {
  const content_hash = sha256(content),
    version_id = randomUUID();
  const version =
    label(content) ||
    (doc.source_type === "pasted" ? doc.version : "") ||
    content_hash.slice(0, 12);
  const next = {
    ...doc,
    content,
    content_hash,
    version_id,
    version,
    fetched_at: fetchedAt,
    last_success_at: fetchedAt,
    fetch_error: null,
  };
  // Existing append-only workspace events retain every successful fetch, even unchanged bytes.
  await repo.put("workspace_events", {
    id: version_id,
    type: "document_version",
    created_at: new Date().toISOString(),
    document_id: doc.id,
    version,
    content_hash,
    fetched_at: fetchedAt,
    content,
  });
  if (attempt) {
    if (!(await repo.finishDocumentRefresh(next, attempt)))
      return (await documents(repo)).find((d) => d.id === doc.id)!;
  } else await repo.put("workspace_documents", next);
  return next;
}
export async function refreshDocument(
  repo: Repository,
  id: string,
  fetcher = fetchReference,
  encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
) {
  const doc = (await documents(repo)).find((d) => d.id === id);
  check(doc?.source_type === "linked", "Linked reference not found", 404);
  const attempt = randomUUID();
  const next = {
    ...doc,
    last_attempt_at: new Date().toISOString(),
    refresh_id: attempt,
  };
  await repo.put("workspace_documents", next);
  let content: string;
  try {
    const saved = (
      await repo.entities<{ id: string; ciphertext: string }>(
        "provider_credentials",
      )
    ).find((c) => c.id === id);
    const credentials =
      doc.has_auth && saved
        ? JSON.parse(
            decryptSecret(
              saved.ciphertext,
              encryptionKey,
              repo.workspaceId + ":reference:" + id,
            ),
          )
        : undefined;
    check(!doc.has_auth || credentials, "Reference credentials unavailable");
    content = await fetcher(doc.url!, { credentials });
    check(
      Buffer.byteLength(content) <= REFERENCE_LIMIT,
      "Reference exceeds the 1 MB limit",
    );
  } catch (error) {
    // Never echo URLs, auth headers, usernames, passwords or arbitrary network errors.
    const message = error instanceof Error ? error.message : "";
    next.fetch_error =
      /^(Reference (fetch|redirect|host|URL|connection|response|exceeds|must)|Compressed references)/.test(
        message,
      )
        ? message
        : "Reference fetch failed; check the URL and saved credentials";
    if (!(await repo.finishDocumentRefresh(next, attempt)))
      return (await documents(repo)).find((d) => d.id === id)!;
    return documentView(next);
  }
  return documentView(
    await storeVersion(repo, next, content, new Date().toISOString(), attempt),
  );
}
export async function saveDocument(
  repo: Repository,
  raw: unknown,
  fetcher = fetchReference,
  encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
) {
  const input = inputSchema.parse(raw);
  const old = input.id
    ? (await documents(repo)).find((d) => d.id === input.id)
    : undefined;
  check(!input.id || old, "Reference not found", 404);
  const id = input.id ?? randomUUID();
  if (input.source_type === "linked") {
    check(input.url, "HTTPS reference URL required");
    referenceUrl(input.url);
    check(
      !input.username?.includes(":"),
      "Basic auth username cannot contain a colon",
    );
    const authChanged = !!input.username || !!input.password;
    check(
      !authChanged || (!!input.username && !!input.password),
      "Enter both Basic auth username and password",
    );
    // Do not silently carry saved credentials to a newly configured host.
    check(
      !old?.has_auth ||
        !old.url ||
        new URL(old.url).origin === new URL(input.url).origin ||
        authChanged ||
        input.clear_auth,
      "Changing hosts requires replacing or clearing saved credentials",
    );
    if (authChanged && !input.clear_auth)
      await repo.put("provider_credentials", {
        id,
        kind: "reference_basic_auth",
        ciphertext: encryptSecret(
          JSON.stringify({
            username: input.username,
            password: input.password,
          }),
          encryptionKey,
          repo.workspaceId + ":reference:" + id,
        ),
      });
    if (input.clear_auth)
      await repo.put("provider_credentials", {
        id,
        kind: "reference_basic_auth",
        ciphertext: "",
      });
    const doc: ReferenceDocument = {
      ...old,
      id,
      name: input.name,
      source_type: "linked",
      format: "text",
      url: input.url,
      content: old?.content ?? "",
      version: old?.version ?? "",
      version_id: old?.version_id ?? "",
      content_hash: old?.content_hash ?? "",
      fetched_at: old?.fetched_at ?? null,
      has_auth: !input.clear_auth && (authChanged || !!old?.has_auth),
    };
    await repo.put("workspace_documents", doc);
    return refreshDocument(repo, id, fetcher, encryptionKey);
  }
  check(
    Buffer.byteLength(input.content) <= REFERENCE_LIMIT,
    "Reference exceeds the 1 MB limit",
  );
  return documentView(
    await storeVersion(
      repo,
      {
        id,
        name: input.name,
        source_type: "pasted",
        format: input.format,
        content: "",
        version: input.version,
        version_id: "",
        content_hash: "",
        fetched_at: null,
      },
      input.content,
      null,
    ),
  );
}
export async function refreshDueDocuments(
  repo: Repository,
  now = Date.now(),
  fetcher = fetchReference,
  encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
) {
  const results = [];
  for (const doc of await documents(repo))
    if (
      doc.source_type === "linked" &&
      (!doc.last_attempt_at ||
        Math.floor(now / 3600000) >
          Math.floor(Date.parse(doc.last_attempt_at) / 3600000))
    )
      results.push(await refreshDocument(repo, doc.id, fetcher, encryptionKey));
  return results.map((d) => ({
    id: d.id,
    version: d.version,
    fetch_error: d.fetch_error,
  }));
}
export async function recordDocumentRead(
  repo: Repository,
  actor: Actor,
  doc: ReferenceDocument,
) {
  const connector = actor.connector_id ?? actor.actor;
  const id = sha256(
    repo.workspaceId +
      ":reference-read:" +
      connector +
      ":" +
      doc.id +
      ":" +
      doc.version_id,
  )
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  await repo.put("provider_actions", {
    id,
    kind: "document_read",
    connector,
    document: {
      id: doc.id,
      name: doc.name,
      version_id: doc.version_id,
      version: doc.version,
      content_hash: doc.content_hash,
      fetched_at: doc.fetched_at,
    },
    read_at: new Date().toISOString(),
  });
}
export async function readDocumentsForDraft(repo: Repository, actor: Actor) {
  return (
    await repo.entities<{
      kind: string;
      connector: string;
      document: ReferenceVersion & { id: string };
      read_at: string;
    }>("provider_actions")
  )
    .filter(
      (r) =>
        r.kind === "document_read" &&
        r.connector === (actor.connector_id ?? actor.actor),
    )
    .map((r) => ({ ...r.document, read_at: r.read_at }));
}
