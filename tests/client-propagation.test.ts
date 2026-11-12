import { expect, it, vi } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import type { Proposal } from "../src/lib/model";
import { publicResult } from "../src/lib/service";
import { versionHash } from "../src/lib/content";
import { saveClient } from "../src/lib/clients";
import { postgresFixture } from "./postgres-fixture";

it("staff client edits update every unsigned native proposal, publish live changes normally and preserve signed evidence", async () => {
  const f = await setup();
  const sentDraft = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Live",
    },
    staff,
  );
  const plan = {
    format: 1 as const,
    pages: 2,
    starts: [
      {
        page: 2,
        block: sentDraft.content.find((b) => b.type !== "page_break")!.id!,
        offset: 0,
        explicit: true,
      },
    ],
  };
  const sent = await f.service.send(sentDraft.id, staff, false, undefined, {
    delivery_method: "manual",
    pagination: plan,
  });
  const signatureDraft = await f.service.create(
    {
      client_id: f.draft.client.id,
      template_id: f.draft.template_id!,
      title: "Signed",
    },
    staff,
  );
  const toSign = await f.service.send(signatureDraft.id, staff);
  const signed = await f.service.sign(
    toSign.id,
    signature(toSign.revision),
    "client",
    clientActor,
    { token: toSign.token!, password: "" },
  );
  const others: Proposal[] = ["viewed", "declined", "expired", "archived"].map(
    (status) => ({
      ...structuredClone(f.draft),
      id: crypto.randomUUID(),
      status: status as Proposal["status"],
      ...(status === "archived"
        ? { archived_at: new Date().toISOString() }
        : {}),
    }),
  );
  for (const p of others) f.repo.rows.set(p.id, p);
  const excluded = [
    {
      ...structuredClone(f.draft),
      id: crypto.randomUUID(),
      source: "proposify_import" as const,
    },
    {
      ...structuredClone(sent),
      id: crypto.randomUUID(),
      signers: [],
      versions: sent.versions.map((v) => ({ ...v, frozen: true })),
    },
    {
      ...structuredClone(f.draft),
      id: crypto.randomUUID(),
      workspace_id: crypto.randomUUID(),
    },
    {
      ...structuredClone(f.draft),
      id: crypto.randomUUID(),
      client: { ...f.draft.client, id: crypto.randomUUID() },
    },
  ];
  for (const p of excluded) f.repo.rows.set(p.id, p);
  const previousEmail = {
    id: crypto.randomUUID(),
    proposal_id: sent.id,
    subject: "Original email",
    body: "Already sent",
    to: sent.client.email,
  };
  await f.repo.put("email_log", previousEmail);
  const saved = await f.service.updateClient(
    {
      ...f.draft.client,
      first_name: "Jamie",
      email: "Jamie@Example.test",
      phone: "7045550123",
    },
    staff,
  );
  expect(saved.email).toBe("jamie@example.test");
  expect(saved.phone).toBe("+17045550123");
  for (const original of [f.draft, sent, ...others]) {
    const current = (await f.repo.get(original.id))!;
    expect(current.client).toEqual(saved);
    expect(current.revision).toBe(original.revision + 1);
    expect(current.token).toBe(original.token);
    expect(current.jobs).toEqual(original.jobs);
    expect(current.pagination).toEqual(original.pagination);
  }
  const live = (await f.repo.get(sent.id))!;
  // The link stays the same; the Timeline records the new recipient address.
  expect(
    live.events.find((e) => e.type === "recipient_email_changed")?.metadata,
  ).toEqual({ previous_email: sent.client.email, email: "jamie@example.test" });
  expect(live.versions).toHaveLength(sent.versions.length + 1);
  expect(live.versions[0]).toEqual(sent.versions[0]);
  expect(live.versions.at(-1)!.pagination).toEqual(plan);
  expect(live.versions.at(-1)!.variables_resolved["client.first_name"]).toBe(
    "Jamie",
  );
  expect(live.versions.at(-1)!.content_hash).toBe(
    versionHash(live.versions.at(-1)!),
  );
  expect(live.versions.at(-1)!.content_hash).not.toBe(
    sent.versions.at(-1)!.content_hash,
  );
  expect((await f.repo.get(f.draft.id))!.versions).toHaveLength(0);
  expect(await f.repo.get(signed.id)).toEqual(signed);
  for (const p of excluded) expect(f.repo.rows.get(p.id)).toEqual(p);
  const revision = (await f.repo.get(f.draft.id))!.revision;
  await f.service.updateClient(saved, staff);
  expect((await f.repo.get(f.draft.id))!.revision).toBe(revision);
  expect(await f.repo.emailLog(sent.id)).toEqual([previousEmail]);
  const published = await f.service.send(f.draft.id, staff, false, undefined, {
    delivery_method: "manual",
    expected_revision: revision,
  });
  expect(publicResult(published).recipient.email).toBe(saved.email);
  await expect(
    f.service.sign(
      published.id,
      signature(published.revision),
      "client",
      clientActor,
      { token: published.token!, password: "" },
    ),
  ).rejects.toThrow("Signer email must match recipient");
  const accepted = await f.service.sign(
    published.id,
    {
      ...signature(published.revision, saved.email),
      name: "Jamie Doe",
      typed_name: "Jamie Doe",
    },
    "client",
    clientActor,
    { token: published.token!, password: "" },
  );
  expect(accepted.status).toBe("signed_by_client");
});

it("normal validation, duplicate detection, staff authorization and connector client-only limits are retained", async () => {
  const f = await setup(),
    before = (await f.repo.get(f.draft.id))!;
  await expect(
    f.service.updateClient({ ...before.client, phone: "invalid" }, staff),
  ).rejects.toThrow("phone");
  const duplicate = {
    ...before.client,
    id: crypto.randomUUID(),
    email: "duplicate@example.test",
  };
  await f.repo.put("clients", duplicate);
  await expect(
    f.service.updateClient({ ...before.client, email: duplicate.email }, staff),
  ).rejects.toThrow("already exists");
  await expect(
    f.service.updateClient(before.client, { ...staff, actor: "ai:test" }),
  ).rejects.toMatchObject({ status: 403 });
  await saveClient(f.repo, {
    ...before.client,
    email: "connector@example.test",
  });
  expect(await f.repo.get(before.id)).toEqual(before);
});

it("a concurrent signature aborts the whole staff contact transaction without overwriting any proposal or client", async () => {
  const f = await setup();
  const sent = await f.service.send(f.draft.id, staff);
  const another = await f.service.create(
    {
      client_id: sent.client.id,
      template_id: sent.template_id!,
      title: "Other draft",
    },
    staff,
  );
  const anotherSnapshot = await f.repo.get(another.id);
  const original = f.repo.saveClientAndProposals.bind(f.repo);
  let signed: Proposal;
  vi.spyOn(f.repo, "saveClientAndProposals").mockImplementationOnce(
    async (client, documents) => {
      signed = await f.service.sign(
        sent.id,
        signature(sent.revision),
        "client",
        clientActor,
        { token: sent.token!, password: "" },
      );
      return original(client, documents);
    },
  );
  await expect(
    f.service.updateClient(
      { ...sent.client, email: "changed@example.test" },
      staff,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await f.repo.get(sent.id)).toEqual(signed!);
  expect(await f.repo.get(another.id)).toEqual(anotherSnapshot);
  expect(
    (await f.repo.entities<any>("clients")).find((c) => c.id === sent.client.id)
      .email,
  ).toBe(sent.client.email);
});

it("PostgreSQL commits contacts and unsigned proposals atomically, rejects stale/frozen/foreign updates and restricts execution to service_role", async () => {
  const db = await postgresFixture(),
    f = await setup();
  const original = await f.repo.get(f.draft.id);
  await db.query("insert into clients(id,workspace_id,data) values($1,$2,$3)", [
    f.draft.client.id,
    f.repo.workspaceId,
    JSON.stringify(f.draft.client),
  ]);
  await db.query("select save_proposal($1,-1)", [JSON.stringify(original)]);
  const write = f.repo.saveClientAndProposals.bind(f.repo);
  let changes: Proposal[] = [];
  vi.spyOn(f.repo, "saveClientAndProposals").mockImplementation(
    async (c, docs) => {
      changes = structuredClone(docs);
      return write(c, docs);
    },
  );
  const client = await f.service.updateClient(
    { ...f.draft.client, email: "updated@example.test" },
    staff,
  );
  const apply = (docs = changes, wid = f.repo.workspaceId) =>
    db.query("select save_client_and_proposals($1,$2,$3)", [
      wid,
      JSON.stringify(client),
      JSON.stringify(docs),
    ]);
  await db.exec("set role authenticated");
  await expect(apply()).rejects.toThrow("permission denied");
  await db.exec("reset role; set role service_role");
  await expect(apply(changes, crypto.randomUUID())).rejects.toThrow();
  await expect(
    apply(changes.map((p) => ({ ...p, revision: p.revision + 1 }))),
  ).rejects.toThrow("changed");
  expect(
    (await db.query<any>("select data from clients where id=$1", [client.id]))
      .rows[0].data.email,
  ).toBe(f.draft.client.email);
  await apply();
  expect(
    (
      await db.query<any>("select state from proposals where id=$1", [
        f.draft.id,
      ])
    ).rows[0].state.client,
  ).toEqual(client);
  expect(
    (await db.query<any>("select data from clients where id=$1", [client.id]))
      .rows[0].data,
  ).toEqual(client);
  await expect(apply()).rejects.toThrow("signed or changed");
  // A frozen version is excluded even when aggregate signers is empty.
  await db.exec("reset role");
  const frozen = {
    ...changes[0],
    revision: changes[0].revision + 1,
    versions: [
      {
        ...(await f.service.send(f.draft.id, staff)).versions[0],
        frozen: true,
      },
    ],
  };
  await db.query("select save_proposal($1,$2)", [
    JSON.stringify(frozen),
    changes[0].revision,
  ]);
  await db.exec("set role service_role");
  await expect(
    apply([
      {
        ...frozen,
        revision: frozen.revision + 1,
        client: { ...client, email: "bad@example.test" },
      },
    ]),
  ).rejects.toThrow("signed or changed");
  expect(
    (
      await db.query<any>("select state from proposals where id=$1", [
        f.draft.id,
      ])
    ).rows[0].state.versions,
  ).toEqual(frozen.versions);
  await db.close();
});
