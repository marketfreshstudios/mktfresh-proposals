import { publicationState } from "../src/lib/editor-publication";
import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { setup, staff, clientActor, signature } from "./helpers";
import { defaultValidUntil, readableDate } from "../src/lib/validity";
import { variables, renderBlocks, versionHash } from "../src/lib/content";
import { publicAccess } from "../src/lib/service";
import { readiness } from "../src/lib/quote";
import { proposalAction } from "../src/lib/proposal-actions";
import {
  inView,
  needsCountersign,
  canCountersign,
  expiringWithinSevenDays,
  unfinishedJobs,
} from "../src/lib/proposal-state";
import { aiTool } from "../src/lib/ai-tools";
import { saveClient, DuplicateClient } from "../src/lib/clients";
import { postgresFixture } from "./postgres-fixture";
import { clientBilling } from "../src/lib/client-billing";
import type { Proposal } from "../src/lib/model";
it("defaults use the workspace calendar day and configured validity, while null clears expiry across staff and MCP", async () => {
  const { service, draft, repo, settings } = await setup();
  expect(
    defaultValidUntil(
      { ...settings, default_validity_days: 30 },
      new Date("2026-10-30T01:00:00Z"),
    ),
  ).toBe("2026-11-29T04:59:59.999Z");
  const created = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "Default",
    },
    staff,
  );
  expect(created.valid_until).toBe(defaultValidUntil(settings));
  const indefinite = await service.edit(
    created.id,
    { revision: created.revision, valid_until: null },
    staff,
  );
  expect(indefinite.valid_until).toBeNull();
  expect(
    readiness(indefinite, await repo.entities("pricing_items")).errors,
  ).not.toContain("Proposal expired");
  const ai = {
      ...clientActor,
      actor: "ai:test",
      workspace_id: repo.workspaceId,
    },
    base = {
      brief: "A scope",
      title: "AI",
      client_id: draft.client.id,
      template_id: draft.template_id,
      content_markdown: "Hello {{client.first_name}}",
    };
  const one = (await aiTool(repo, ai, "create_proposal_draft", base, [
    "proposals:draft",
  ])) as Proposal;
  expect(one.valid_until).toBe(defaultValidUntil(settings));
  const two = (await aiTool(
    repo,
    ai,
    "create_proposal_draft",
    { ...base, valid_until: null },
    ["proposals:draft"],
  )) as Proposal;
  expect(two.valid_until).toBeNull();
  const cleared = (await aiTool(
    repo,
    ai,
    "update_proposal_draft",
    { id: one.id, revision: one.revision, valid_until: null },
    ["proposals:draft"],
  )) as Proposal;
  expect(cleared.valid_until).toBeNull();
});
it("indefinite proposals remain signable, never auto-expire and are omitted from expiring groups", async () => {
  const { service, draft } = await setup();
  const edited = await service.edit(
    draft.id,
    { revision: draft.revision, valid_until: null },
    staff,
  );
  const sent = await service.send(edited.id, staff);
  service.clock = () => new Date("2099-01-01T12:00:00Z");
  await service.tick();
  const fresh = (await service.repo.get(sent.id))!;
  expect(fresh.status).toBe("sent");
  expect(expiringWithinSevenDays(fresh)).toBe(false);
  expect(
    expiringWithinSevenDays({
      ...fresh,
      published_state: {
        ...fresh.published_state!,
        valid_until: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
    }),
  ).toBe(true);
  expect(fresh.events.some((e) => e.type === "expired")).toBe(false);
  expect(() => publicAccess(fresh, "", service.clock())).not.toThrow();
  const signed = await service.sign(
    fresh.id,
    signature(fresh.revision),
    "client",
    clientActor,
    { token: fresh.token!, password: "" },
  );
  expect(signed.client_signed_at).toBeTruthy();
  expect(signed.valid_until).toBeNull();
});
it("readable dates, validity sentence and empty rich paragraphs render cleanly with an indefinite warning for custom wording", async () => {
  const { draft, repo } = await setup();
  draft.valid_until = "2026-11-29T23:59:59Z";
  const map = variables(draft);
  expect(map["proposal.valid_until"]).toBe("November 29, 2026");
  expect(
    variables({ ...draft, sent_at: "2026-11-01T02:00:00Z" })["proposal.date"],
  ).toBe("October 31, 2026");
  expect(readableDate("2026-11-29")).toBe("November 29, 2026");
  expect(map["proposal.validity"]).toBe(
    "This proposal is valid until November 29, 2026.",
  );
  const blocks: Proposal["content"] = [
    { type: "paragraph", text: "Before" },
    { type: "paragraph", text: "{{proposal.validity}}" },
    {
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: " " },
              { type: "variable", attrs: { path: "proposal.validity" } },
              { type: "text", text: " " },
            ],
          },
        ],
      },
    },
    { type: "variable", path: "proposal.validity" },
    { type: "paragraph", text: "After" },
  ];
  expect(renderBlocks(blocks, draft.quote, map)).toContain(
    "This proposal is valid until November 29, 2026.",
  );
  draft.valid_until = null;
  const rendered = renderBlocks(blocks, draft.quote, variables(draft));
  expect(rendered).toBe("<p>Before</p>\n<p>After</p>");
  expect(rendered).not.toMatch(/<p>\s*<\/p>/);
  draft.content.push({
    type: "paragraph",
    text: "Offer valid until {{proposal.valid_until}}.",
  });
  const ready = readiness(draft, await repo.entities("pricing_items"));
  expect(ready.errors).not.toContain(
    "Unresolved variable: proposal.valid_until",
  );
  expect(ready.warnings).toContain(
    "Valid until is used in the text but this proposal never expires — use {{proposal.validity}} instead",
  );
  expect(() =>
    renderBlocks([{ type: "paragraph", text: "{{unknown.field}}" }], [], {}),
  ).toThrow("Unresolved variable");
});
it("manual outcomes create no signature or billing, archive is reversible, and signed snapshots are immutable through actions", async () => {
  const { repo, service, draft, settings } = await setup();
  const won = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "mark_won",
    staff,
    "Agreed in person",
  );
  expect(won.marked_won_by).toBe(staff.actor);
  expect(won.status).toBe("completed");
  expect(won.signers).toEqual([]);
  expect(won.jobs).toEqual([]);
  expect(needsCountersign(won)).toBe(false);
  const archived = await proposalAction(
    repo,
    won.id,
    won.revision,
    "archive",
    staff,
  );
  expect(archived.status).toBe("completed");
  expect(inView(archived, "all")).toBe(false);
  expect(inView(archived, "archived")).toBe(true);
  expect(
    readiness(archived, await repo.entities("pricing_items")).errors,
  ).toContain("Unarchive this proposal before sending");
  const restored = await proposalAction(
    repo,
    won.id,
    archived.revision,
    "unarchive",
    staff,
  );
  expect(inView(restored, "won")).toBe(true);
  const duplicate = await proposalAction(
    repo,
    won.id,
    restored.revision,
    "duplicate",
    staff,
  );
  expect(duplicate.status).toBe("draft");
  expect(duplicate.marked_won_by).toBeUndefined();
  expect(duplicate.versions).toEqual([]);
  const sent = await service.send(duplicate.id, staff),
    signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
  const before = JSON.stringify(signed.versions);
  expect(needsCountersign(signed)).toBe(true);
  expect(canCountersign(signed, staff, settings)).toBe(true);
  expect(
    canCountersign(
      signed,
      { ...staff, actor: "staff:" + randomUUID() },
      settings,
    ),
  ).toBe(false);
  for (const action of ["mark_won", "mark_lost"] as const)
    await expect(
      proposalAction(repo, signed.id, signed.revision, action, staff),
    ).rejects.toThrow();
  const result = await proposalAction(
    repo,
    signed.id,
    signed.revision,
    "archive",
    staff,
  );
  expect(JSON.stringify(result.versions)).toBe(before);
  expect(versionHash(result.versions[0])).toBe(result.versions[0].content_hash);
  await expect(
    proposalAction(repo, result.id, result.revision, "unarchive", {
      ...staff,
      actor: "ai:test",
    }),
  ).rejects.toThrow("Staff authorization");
});
it("editing sent proposals preserves access, manual lost closes signing, resend uses the same link, and stale actions fail", async () => {
  const { repo, service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const oldToken = sent.token;
  const reminded = await proposalAction(
    repo,
    sent.id,
    sent.revision,
    "remind",
    staff,
  );
  expect(reminded.jobs.some((j) => j.payload.reminder_day === "manual")).toBe(
    true,
  );
  await expect(
    proposalAction(repo, sent.id, sent.revision, "mark_lost", staff),
  ).rejects.toThrow("Proposal changed");
  const editing = await service.edit(
    sent.id,
    { revision: reminded.revision, title: "Updated proposal" },
    staff,
  );
  expect(editing.status).toBe("sent");
  expect(editing.token).toBe(oldToken);
  expect(editing.versions[0]).toEqual(sent.versions[0]);
  expect(editing.versions).toHaveLength(sent.versions.length + 1);
  expect((await repo.byToken(oldToken!))?.id).toBe(sent.id);
  const resent = await service.send(editing.id, staff);
  expect(resent.token).toBe(oldToken);
  const lost = await proposalAction(
    repo,
    resent.id,
    resent.revision,
    "mark_lost",
    staff,
    "Paused",
  );
  expect(lost.token).toBe(oldToken);
  expect(lost.marked_lost_by).toBe(staff.actor);
  expect(lost.events.at(-1)?.metadata.reason).toBe("Paused");
});
it("duplicate emails are offered safely and client deletion is Super admin-only, reference guarded and audited", async () => {
  const { repo, draft } = await setup();
  const c = {
    ...draft.client,
    id: randomUUID(),
    email: "new@example.test",
    company: "New company",
  };
  await saveClient(repo, c);
  await expect(
    saveClient(repo, { ...c, id: randomUUID(), email: "NEW@example.test" }),
  ).rejects.toBeInstanceOf(DuplicateClient);
  await expect(repo.deleteClient(draft.client.id, staff)).rejects.toThrow(
    "Archive this client’s unsent drafts before deleting it.",
  );
  await expect(
    repo.deleteClient(c.id, { ...staff, actor: "ai:test" }),
  ).rejects.toThrow("Only super admins");
  await repo.deleteClient(c.id, staff);
  expect((await repo.entities("clients")).some((v: any) => v.id === c.id)).toBe(
    false,
  );
  expect((await repo.entities<any>("workspace_events")).at(-1)).toMatchObject({
    type: "client_deleted",
    actor: staff.actor,
    metadata: { company: "New company" },
  });
});
it("Postgres client deletion and audit are atomic, reference guarded across imported records and workspace scoped", async () => {
  const db = await postgresFixture(),
    { draft, repo } = await setup(),
    unused = {
      ...draft.client,
      id: randomUUID(),
      email: "unused@example.test",
    };
  try {
    for (const c of [draft.client, unused])
      await db.query(
        "insert into clients(id,workspace_id,data) values($1,$2,$3)",
        [c.id, repo.workspaceId, JSON.stringify(c)],
      );
    await db.query("select save_proposal($1::jsonb,-1)", [
      JSON.stringify({
        ...draft,
        source: "proposify_import",
        status: "archived",
        proposify_id: "fixture-import",
      }),
    ]);
    const audit = {
      id: randomUUID(),
      actor: staff.actor,
      staff_role: "owner",
      type: "client_deleted",
      created_at: new Date().toISOString(),
    };
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        repo.workspaceId,
        draft.client.id,
        JSON.stringify(audit),
      ]),
    ).rejects.toThrow("Archive the client instead");
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        "00000000-0000-4000-8000-000000000002",
        unused.id,
        JSON.stringify(audit),
      ]),
    ).rejects.toThrow("Client not found");
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        repo.workspaceId,
        unused.id,
        JSON.stringify({ ...audit, actor: "ai:test" }),
      ]),
    ).rejects.toThrow("Only super admins");
    expect(
      (await db.query("select id from clients where id=$1", [unused.id])).rows,
    ).toHaveLength(1);
    await db.query("select delete_unused_client($1,$2,$3)", [
      repo.workspaceId,
      unused.id,
      JSON.stringify(audit),
    ]);
    expect(
      (await db.query("select id from clients where id=$1", [unused.id])).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select data from workspace_events where id=$1", [
          audit.id,
        ])
      ).rows[0],
    ).toMatchObject({
      data: { type: "client_deleted", metadata: { company: unused.company } },
    });
    await db.exec("set role authenticated");
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        repo.workspaceId,
        draft.client.id,
        JSON.stringify(audit),
      ]),
    ).rejects.toThrow("permission denied");
  } finally {
    await db.close();
  }
});
it("client billing is read-only, current and paginated; test-mode checks and unavailable states are explicit", async () => {
  const { repo, draft } = await setup();
  expect((await clientBilling(repo, draft.client)).available).toBe(false);
  const c = { ...draft.client, stripe_customer_id: "cus_test" },
    calls: string[] = [];
  const api = {
    get: async <T>(path: string, params: any) => {
      calls.push(path);
      if (path.includes("/customers/"))
        return {
          livemode: false,
          email: c.email,
          invoice_settings: {
            default_payment_method: { card: { brand: "visa", last4: "4242" } },
          },
        } as T;
      if (path === "/v1/customers") return { data: [], has_more: false } as T;
      if (params.starting_after) return { data: [], has_more: false } as T;
      return {
        data: [
          {
            id: "sub_test",
            livemode: false,
            status: "active",
            current_period_end: 1793500000,
            items: {
              data: [
                {
                  id: "si_test",
                  quantity: 2,
                  price: {
                    unit_amount: 10000,
                    currency: "usd",
                    lookup_key: "hosted-standard-100",
                    nickname: "Hosting",
                    product: "prod_test",
                    recurring: { interval: "month", interval_count: 1 },
                  },
                },
              ],
            },
          },
        ],
        has_more: true,
      } as T;
    },
    post: async () => {
      throw new Error("Must not write");
    },
  };
  const result = await clientBilling(repo, c, api);
  expect(result.subscriber).toBe(true);
  expect(result.card).toBe("visa ending 4242");
  expect(result.items[0]).toMatchObject({
    amount: 10000,
    qty: 2,
    interval: "month",
  });
  expect(calls).toEqual([
    "/v1/customers/cus_test",
    "/v1/subscriptions",
    "/v1/subscriptions",
  ]);
  await expect(
    clientBilling(repo, c, {
      ...api,
      get: async <T>() => ({ livemode: true }) as T,
    }),
  ).rejects.toThrow("Test-mode customer required");
});

it("preview PDFs stay in PDF jobs, use current branding, and never queue mail on success or renderer failure", async () => {
  const { Worker, MockMailer } = await import("../src/lib/jobs"),
    { MockBillingProvider } = await import("../src/lib/billing"),
    { sha256 } = await import("../src/lib/content");
  const { repo, draft, settings } = await setup(),
    mailer = new MockMailer(),
    objects = new Map<string, Uint8Array>(),
    storage = {
      put: async (path: string, bytes: Uint8Array) => {
        objects.set(path, bytes);
      },
      get: async (path: string) => objects.get(path)!,
    };
  const providers = {
    qbo: new MockBillingProvider("qbo"),
    stripe: new MockBillingProvider("stripe"),
  };
  let renderSettings: unknown;
  const worker = new Worker(
    repo,
    storage,
    mailer,
    providers,
    async (_v, _s, _e, _c, options) => {
      renderSettings = options?.settings;
      return {
        pdf: Buffer.from("pdf"),
        body: Buffer.from("body"),
        bodyHash: sha256("body"),
      };
    },
  );
  const queued = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "preview_pdf",
    staff,
  );
  expect(queued.versions).toEqual([]);
  expect(queued.jobs).toHaveLength(1);
  expect(queued.jobs[0].kind).toBe("pdf");
  await worker.drain(draft.id, "pdf");
  const rendered = (await repo.get(draft.id))!;
  expect(renderSettings).toMatchObject({ company_name: settings.company_name });
  expect(rendered.files.every((f) => f.kind === "render")).toBe(true);
  expect(rendered.jobs.some((j) => j.kind === "email")).toBe(false);
  expect(unfinishedJobs(rendered)).toEqual([]);
  expect(mailer.sent.size).toBe(0);
  const oldStage = rendered.jobs[0].payload.stage;
  await repo.put("workspace_settings", {
    ...settings,
    accent_colour: "#245547",
  });
  const second = await proposalAction(
    repo,
    rendered.id,
    rendered.revision,
    "preview_pdf",
    staff,
  );
  expect(second.jobs.at(-1)?.payload.stage).not.toBe(oldStage);
  const failing = new Worker(repo, storage, mailer, providers, async () => {
    throw new Error("Renderer unavailable");
  });
  expect(await failing.drain(draft.id, "pdf")).toMatchObject([
    { status: "failed" },
  ]);
  const failed = (await repo.get(draft.id))!;
  expect(failed.jobs.at(-1)?.last_error).toBe("Renderer unavailable");
  expect(failed.jobs.some((j) => j.kind === "email")).toBe(false);
  expect(mailer.sent.size).toBe(0);
});
it("manual invoice recording changes billing evidence without changing signed snapshots, and AI cannot delete clients", async () => {
  const { repo, service, draft } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  signed.billing_links = [
    {
      provider: "qbo",
      status: "needs_review",
      attempts: 0,
      last_error: "Invoice manually",
    },
  ];
  await repo.save(signed, signed.revision);
  const before = JSON.stringify(signed.versions);
  const recorded = await proposalAction(
    repo,
    signed.id,
    signed.revision,
    "invoice_manually",
    staff,
    "INV-001",
  );
  expect(recorded.billing_links[0]).toMatchObject({
    status: "succeeded",
    metadata: {
      manual_invoice: true,
      reference: "INV-001",
      marked_by: staff.actor,
    },
  });
  expect(JSON.stringify(recorded.versions)).toBe(before);
  expect(recorded.events.at(-1)?.type).toBe("manual_invoice_recorded");
  await expect(
    aiTool(
      repo,
      { ...clientActor, actor: "ai:test", workspace_id: repo.workspaceId },
      "delete_client",
      { id: draft.client.id },
      ["proposals:draft"],
    ),
  ).rejects.toThrow("forbidden");
});
it("Reopen retains an unsigned lost proposal link and sender without email; stale and signed requests are refused", async () => {
  const { repo, service, draft, settings } = await setup();
  const sent = await service.send(draft.id, staff);
  const lost = await proposalAction(
    repo,
    sent.id,
    sent.revision,
    "mark_lost",
    staff,
  );
  await repo.put("workspace_settings", {
    ...settings,
    company_name: "Current Company",
  });
  const reopened = await proposalAction(
    repo,
    lost.id,
    lost.revision,
    "mark_sent",
    staff,
    "",
    new Date(),
    service,
  );
  expect(reopened.status).toBe("sent");
  expect(reopened.token).toBe(sent.token);
  expect(reopened.workspace_settings?.company_name).toBe(settings.company_name);
  expect(reopened.sender?.user_id).toBe(staff.actor.slice(6));
  expect(reopened.marked_lost_by).toBeUndefined();
  expect(reopened.events.some((e) => e.type === "marked_lost")).toBe(true);
  expect(reopened.events.some((e) => e.type === "reopened")).toBe(true);
  expect(reopened.signers).toEqual([]);
  expect(reopened.jobs.some((j) => j.kind === "billing")).toBe(false);
  await expect(
    proposalAction(
      repo,
      reopened.id,
      lost.revision,
      "mark_sent",
      staff,
      "",
      new Date(),
      service,
    ),
  ).rejects.toThrow("Proposal changed");
  const signed = await service.sign(
    reopened.id,
    signature(reopened.revision),
    "client",
    clientActor,
    { token: reopened.token!, password: "" },
  );
  await expect(
    proposalAction(
      repo,
      signed.id,
      signed.revision,
      "mark_sent",
      staff,
      "",
      new Date(),
      service,
    ),
  ).rejects.toThrow("Only unsigned Lost or Expired proposals");
  const archived = await proposalAction(
    repo,
    signed.id,
    signed.revision,
    "archive",
    staff,
  );
  await expect(
    service.sign(
      archived.id,
      {
        ...signature(archived.revision),
        reviewed_hash: archived.versions[0].content_hash,
      },
      "client",
      clientActor,
      { token: archived.token!, password: "" },
    ),
  ).rejects.toThrow();
});
it("shows a matching customer without automatically linking or showing it as the linked subscriber", async () => {
  const { repo, draft } = await setup();
  const api = {
    get: async <T>(path: string) =>
      (path === "/v1/customers"
        ? {
            data: [
              {
                id: "cus_existing",
                email: draft.client.email,
                livemode: false,
              },
            ],
            has_more: false,
          }
        : path.includes("/customers/")
          ? { livemode: false, email: draft.client.email }
          : {
              data: [
                {
                  id: "sub_existing",
                  livemode: false,
                  status: "active",
                  items: { data: [] },
                },
              ],
              has_more: false,
            }) as T,
    post: async <T>() => {
      throw new Error("Must not write");
    },
  };
  const result = await clientBilling(repo, draft.client, api);
  expect(result.subscriber).toBe(false);
  expect(result.candidates).toMatchObject([
    { id: "cus_existing", subscriptions: 1 },
  ]);
  expect(
    (await repo.entities<any>("clients"))[0].stripe_customer_id,
  ).toBeNull();
});

it("lists open published links expiring within seven workspace calendar days across daylight saving", async () => {
  const { draft } = await setup();
  const timezone = "America/New_York";
  const now = Date.parse("2026-10-30T16:00:00Z");
  const sent = {
    ...draft,
    status: "sent" as const,
    valid_until: "2026-11-06T17:00:00Z",
  };
  expect(expiringWithinSevenDays(sent, now, timezone)).toBe(true);
  expect(
    expiringWithinSevenDays(
      { ...sent, valid_until: "2026-11-06T17:00:00.001Z" },
      now,
      timezone,
    ),
  ).toBe(false);
  expect(
    expiringWithinSevenDays(
      { ...sent, archived_at: sent.created_at },
      now,
      timezone,
    ),
  ).toBe(false);
  expect(
    expiringWithinSevenDays({ ...sent, status: "declined" }, now, timezone),
  ).toBe(false);
  const published = { ...publicationState(sent), valid_until: null };
  expect(
    expiringWithinSevenDays(
      { ...sent, published_state: published },
      now,
      timezone,
    ),
  ).toBe(false);
});

it("archives and restores a protected client without touching their proposal or provider links", async () => {
  const { repo, service, draft } = await setup();
  const client = await saveClient(repo, {
    ...draft.client,
    stripe_customer_id: "cus_test_client",
    qbo_customer_id: "qbo_test_client",
  });
  const sent = await service.send(draft.id, staff);
  const archived = await proposalAction(
    repo,
    sent.id,
    sent.revision,
    "archive",
    staff,
  );
  await expect(repo.deleteClient(client.id, staff)).rejects.toThrow(
    "proposal history",
  );
  await expect(
    repo.deleteClient(client.id, { ...staff, staff_role: "member" }),
  ).rejects.toThrow("Only super admins");
  const afterArchive = await repo.archiveClient(client.id, true, staff);
  expect(afterArchive.archived_at).toBeTruthy();
  expect(afterArchive).toMatchObject({
    stripe_customer_id: client.stripe_customer_id,
    qbo_customer_id: client.qbo_customer_id,
  });
  await expect(
    service.create(
      {
        client_id: client.id,
        template_id: draft.template_id!,
        title: "Another proposal",
      },
      staff,
    ),
  ).rejects.toThrow("Restore this client");
  await expect(
    repo.archiveClient(client.id, false, staff),
  ).resolves.toMatchObject({ archived_at: null });
  expect(await repo.get(draft.id)).toEqual(archived);
  expect(
    (await repo.entities<any>("workspace_events"))
      .slice(-2)
      .map(({ type }) => type),
  ).toEqual(["client_archived", "client_restored"]);
});

it("Postgres deletes only never-sent archived drafts and retains their original immutable evidence", async () => {
  const db = await postgresFixture();
  const { draft, repo } = await setup();
  const member = { ...staff, staff_role: "member" as const };
  const audit = (type: string, actor = staff) =>
    JSON.stringify({
      ...actor,
      id: randomUUID(),
      type,
      created_at: new Date().toISOString(),
    });
  const args = [repo.workspaceId, draft.client.id];
  const events = () =>
    db.query("select * from events where proposal_id=$1 order by id", [
      draft.id,
    ]);
  try {
    await db.exec("set role service_role");
    await db.query(
      "insert into clients(id,workspace_id,data) values($1,$2,$3)",
      [draft.client.id, repo.workspaceId, JSON.stringify(draft.client)],
    );
    await db.query("select save_proposal($1::jsonb,-1)", [
      JSON.stringify(draft),
    ]);
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        ...args,
        audit("client_deleted"),
      ]),
    ).rejects.toThrow("Archive this client");
    await db.query("select set_client_archived($1,$2,true,$3)", [
      ...args,
      audit("client_archived"),
    ]);
    expect(
      (
        await db.query("select archived_at from clients where id=$1", [
          draft.client.id,
        ])
      ).rows[0],
    ).toMatchObject({ archived_at: expect.any(Date) });
    await db.query("select set_client_archived($1,$2,false,$3)", [
      ...args,
      audit("client_restored"),
    ]);
    const archivedAt = new Date().toISOString();
    await db.query("select save_proposal($1::jsonb,0)", [
      JSON.stringify({ ...draft, archived_at: archivedAt, revision: 1 }),
    ]);
    const evidence = (await events()).rows;
    expect(evidence.length).toBeGreaterThan(0);
    await expect(
      db.query("select delete_unused_client($1,$2,$3)", [
        ...args,
        audit("client_deleted", member),
      ]),
    ).rejects.toThrow("Only super admins");
    await db.query("select delete_unused_client($1,$2,$3)", [
      ...args,
      audit("client_deleted"),
    ]);
    expect(
      (await db.query("select id from proposals where id=$1", [draft.id])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select id from clients where id=$1", [draft.client.id]))
        .rows,
    ).toEqual([]);
    expect((await events()).rows).toEqual(evidence);
    await db.exec("reset role");
    await expect(
      db.query("delete from events where proposal_id=$1", [draft.id]),
    ).rejects.toThrow("Append-only record");
    expect(
      (
        await db.query(
          "select data from workspace_events where data->>'type'='client_deleted'",
        )
      ).rows,
    ).toMatchObject([
      { data: { metadata: { deleted_draft_ids: [draft.id] } } },
    ]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select id from proposal_evidence_ids"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select set_client_archived($1,$2,true,$3)", [
          ...args,
          audit("client_archived"),
        ]),
      ).rejects.toThrow("permission denied");
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
