import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  purgeTestProposals,
  validatePurgeProject,
  type PurgeStorage,
} from "../scripts/purge-test-proposals";
import { postgresFixture } from "./postgres-fixture";
import { setup, staff, clientActor, signature } from "./helpers";
import type { Proposal } from "../src/lib/model";
async function fixture() {
  const db = await postgresFixture(),
    ctx = await setup();
  let p = await ctx.service.send(ctx.draft.id, staff);
  p = await ctx.service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  p.files = [
    {
      id: randomUUID(),
      kind: "sealed",
      storage_path: `${p.id}/copy.pdf`,
      sha256: "0".repeat(64),
      bytes: 1,
      created_at: new Date().toISOString(),
    },
  ];
  p.revision = 0;
  await db.query("insert into clients(id,workspace_id,data) values($1,$2,$3)", [
    p.client.id,
    ctx.repo.workspaceId,
    JSON.stringify(p.client),
  ]);
  await db.query("select save_proposal($1::jsonb,-1)", [JSON.stringify(p)]);
  const imported: Proposal = {
    ...structuredClone(p),
    id: randomUUID(),
    source: "proposify_import",
    status: "archived",
    token: null,
    proposify_id: "original-import",
    versions: [],
    events: [],
    signers: [],
    jobs: [],
    billing_links: [],
    files: [],
  };
  imported.files = [
    {
      ...p.files[0],
      id: randomUUID(),
      kind: "import",
      storage_path: `${imported.id}/source.pdf`,
    },
  ];
  await db.query("select save_proposal($1::jsonb,-1)", [
    JSON.stringify(imported),
  ]);
  const secondWorkspace = "00000000-0000-4000-8000-000000000002",
    other = {
      ...structuredClone(imported),
      id: randomUUID(),
      source: "native" as const,
      proposify_id: null,
      workspace_id: secondWorkspace,
      client: { ...p.client, id: randomUUID() },
      files: [],
    };
  await db.query(
    "insert into workspaces(id,name) values($1,'Other workspace')",
    [secondWorkspace],
  );
  await db.query("insert into clients(id,workspace_id,data) values($1,$2,$3)", [
    other.client.id,
    secondWorkspace,
    JSON.stringify(other.client),
  ]);
  await db.query("select save_proposal($1::jsonb,-1)", [JSON.stringify(other)]);
  const objects = new Map([
    [p.files[0].storage_path, "copy"],
    [`${p.id}/orphan.png`, "orphan"],
    [imported.files[0].storage_path, "import"],
    [`${other.id}/other.pdf`, "other"],
  ]);
  let removes = 0,
    fail = false;
  const storage: PurgeStorage = {
    async list(prefix, offset) {
      return [...objects.keys()]
        .filter((k) => k.startsWith(prefix + "/"))
        .map((k) => ({ name: k.slice(prefix.length + 1), id: "object" }))
        .slice(offset, offset + 1000);
    },
    async remove(paths) {
      removes++;
      if (fail) throw new Error("Storage failure");
      for (const path of paths) objects.delete(path);
    },
  };
  return {
    db,
    ctx,
    p,
    imported,
    other,
    storage,
    objects,
    get removes() {
      return removes;
    },
    setFail() {
      fail = true;
    },
  };
}
it("purge defaults to a read-only count and confirmed purge keeps imports, clients, other workspaces and evidence guards", async () => {
  const f = await fixture();
  const before = (await f.db.query("select state from proposals order by id"))
    .rows;
  const dry = await purgeTestProposals(f.db, f.storage, f.ctx.repo.workspaceId);
  expect(dry.dry_run).toBe(true);
  expect(dry.counts).toMatchObject({
    proposals: 1,
    proposal_versions: 1,
    files: 1,
    signers: 1,
    stored_files: 2,
  });
  expect(f.removes).toBe(0);
  expect(
    (await f.db.query("select state from proposals order by id")).rows,
  ).toEqual(before);
  const result = await purgeTestProposals(
    f.db,
    f.storage,
    f.ctx.repo.workspaceId,
    true,
  );
  expect(result.dry_run).toBe(false);
  expect(
    (await f.db.query("select id from proposals order by id")).rows
      .map((r: any) => r.id)
      .sort(),
  ).toEqual([f.imported.id, f.other.id].sort());
  expect((await f.db.query("select id from clients")).rows).toHaveLength(2);
  expect([...f.objects.values()].sort()).toEqual(["import", "other"]);
  expect(
    (await f.db.query("select data from workspace_events")).rows[0],
  ).toMatchObject({
    data: {
      type: "test_proposals_purged",
      excluded_source: "proposify_import",
    },
  });
  await expect(f.db.exec("delete from files")).rejects.toThrow("Append-only");
  await f.db.query("select save_proposal($1::jsonb,-1)", [JSON.stringify(f.p)]);
  await expect(f.db.exec("delete from proposal_versions")).rejects.toThrow(
    "Frozen",
  );
  await expect(f.db.exec("update events set actor='tampered'")).rejects.toThrow(
    "Append-only",
  );
  await f.db.close();
});
it("storage failure rolls back database deletion and restores every immutable trigger", async () => {
  const f = await fixture();
  f.setFail();
  const before = (await f.db.query("select state from proposals order by id"))
    .rows;
  await expect(
    purgeTestProposals(f.db, f.storage, f.ctx.repo.workspaceId, true),
  ).rejects.toThrow("Storage failure");
  expect(
    (await f.db.query("select state from proposals order by id")).rows,
  ).toEqual(before);
  await expect(f.db.exec("delete from proposal_versions")).rejects.toThrow(
    "Frozen",
  );
  await expect(f.db.exec("delete from signers")).rejects.toThrow("Append-only");
  await f.db.close();
});
it("purge refuses cross-project connection details and accepts explicit same-project or local targets", () => {
  expect(() =>
    validatePurgeProject(
      "https://appref.supabase.co",
      "postgresql://postgres:password@db.otherref.supabase.co/postgres",
    ),
  ).toThrow("same project");
  expect(() =>
    validatePurgeProject(
      "https://appref.supabase.co",
      "postgresql://postgres.otherref:password@aws-1.pooler.supabase.com/postgres",
    ),
  ).toThrow("same project");
  expect(() =>
    validatePurgeProject(
      "https://appref.supabase.co",
      "postgresql://postgres.appref:password@aws-1.pooler.supabase.com/postgres",
    ),
  ).not.toThrow();
  expect(() =>
    validatePurgeProject(
      "http://127.0.0.1:55321",
      "postgresql://postgres:password@127.0.0.1:55322/postgres",
    ),
  ).not.toThrow();
});
