import { it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
import { workspaceStarterTemplates } from "../seed/starter-templates";
import {
  libraryStarterAction,
  libraryTemplates,
} from "../src/lib/template-library";
import { studioRevision } from "../src/lib/studio-history";
import { sameStarterState } from "../src/lib/starter-template-state";
import type { Item, Template } from "../src/lib/model";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), runtime: vi.fn() }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mocks.staff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocks.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
async function fixture() {
  const f = await setup();
  const templates = workspaceStarterTemplates(
    f.repo.workspaceId,
    await f.repo.entities<Item>("pricing_items"),
  );
  for (const t of templates) await f.repo.put("templates", t);
  mocks.staff.mockResolvedValue(staff);
  mocks.runtime.mockReturnValue(f);
  return { ...f, templates };
}
const request = (path: string[], method = "POST", body: any = {}) =>
  handle(
    new Request(`http://localhost/api/${path.join("/")}`, {
      method,
      ...(method !== "GET"
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    }),
    path,
  );
it("saves starter changes in place, preserves protected metadata, and duplicates the saved version independently", async () => {
  const f = await fixture(),
    t = f.templates[1],
    originalProposal = await f.service.create(
      {
        client_id: f.draft.client.id,
        template_id: t.id,
        title: "From the library",
      },
      staff,
    ),
    edited = structuredClone(t);
  edited.content[1].text = "Customized wording";
  edited.style_overrides = { body: { size: 18 } };
  edited.default_items![0].name = "A tailored product";
  edited.cover = {
    ...t.cover!,
    layout: "split",
    background: { type: "solid" },
  };
  const put = await request(["templates"], "PUT", {
    ...edited,
    starter_key: "tampered-key",
    starter_order: 0,
    active: false,
    expected_revision: studioRevision(t),
  });
  expect(put.status).toBe(201);
  const saved = await put.json();
  expect(saved).toMatchObject({
    id: t.id,
    active: t.active,
    starter_key: t.starter_key,
    starter_order: t.starter_order,
    starter_edited: true,
    cover: edited.cover,
    content: edited.content,
    default_items: edited.default_items,
    style_overrides: edited.style_overrides,
  });
  expect(
    (
      await request(["templates"], "POST", {
        ...t,
        expected_revision: studioRevision(t),
      })
    ).status,
  ).toBe(409);
  expect((await request(["templates", t.id], "DELETE")).status).toBe(403);
  const copyResponse = await request(["templates", t.id, "copy"], "POST", {
    name: "Custom website",
  });
  expect(copyResponse.status).toBe(200);
  const copy = await copyResponse.json();
  expect(copy).toMatchObject({
    source_starter_key: t.starter_key,
    content: saved.content,
    cover: saved.cover,
    default_items: saved.default_items,
    style_overrides: saved.style_overrides,
  });
  expect(copy.id).not.toBe(t.id);
  expect(copy.starter_key).toBeUndefined();
  expect(await f.repo.get(originalProposal.id)).toMatchObject({
    template_id: t.id,
    content: t.content,
  });
  const rows = await (await request(["templates"], "GET")).json();
  expect(rows.find((v: Template) => v.id === t.id)).toMatchObject({
    starter_edited: true,
    revision: saved.revision,
  });
  expect(rows.find((v: Template) => v.id === copy.id).source_starter_name).toBe(
    t.name,
  );
});
it("Reset resolves current SKU products, preserves identity/availability, Undo restores the exact edited row, and proposals never change", async () => {
  const f = await fixture(),
    t = structuredClone(f.templates[1]),
    proposals = await f.repo.list();
  t.content[1].text = "Keep this edited version";
  t.cover!.eyebrow = "Edited";
  t.name = "Workspace website name";
  t.active = false;
  await f.repo.put("templates", t);
  const snapshot = structuredClone(t),
    result = (await libraryStarterAction(
      f.repo,
      staff,
      t.id,
      "reset",
      {},
    )) as any;
  expect(result.template.id).toBe(t.id);
  expect(result.template.name).toBe(t.name);
  expect(result.template.active).toBe(false);
  expect(result.template.starter_edited).toBe(false);
  expect(result.template.content).toEqual(f.templates[1].content);
  expect(result.template.default_items).toEqual(f.templates[1].default_items);
  expect(await f.repo.list()).toEqual(proposals);
  await libraryStarterAction(f.repo, staff, t.id, "undo-reset", {
    event_id: result.event_id,
  });
  expect(
    (await f.repo.entities<Template>("templates")).find((v) => v.id === t.id),
  ).toEqual(snapshot);
  const backup = (await libraryStarterAction(f.repo, staff, t.id, "copy", {
    name: "Backup",
  })) as Template;
  await libraryStarterAction(f.repo, staff, t.id, "reset", {});
  expect(backup.content).toEqual(snapshot.content);
  expect(backup.cover).toEqual(snapshot.cover);
});
it("Staff cannot reset, undo reset or hide; a stale undo cannot overwrite a later availability change", async () => {
  const f = await fixture(),
    t = f.templates[0],
    member = { ...staff, staff_role: "member" as const };
  mocks.staff.mockResolvedValue(member);
  for (const action of ["reset", "availability", "undo-reset"]) {
    expect(
      (
        await request(["templates", t.id, action], "POST", {
          active: false,
          event_id: crypto.randomUUID(),
        })
      ).status,
    ).toBe(403);
  }
  const result = (await libraryStarterAction(
    f.repo,
    staff,
    t.id,
    "reset",
    {},
  )) as any;
  await libraryStarterAction(f.repo, staff, t.id, "availability", {
    active: false,
  });
  await expect(
    libraryStarterAction(f.repo, staff, t.id, "undo-reset", {
      event_id: result.event_id,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await f.repo.entities<Template>("templates")).find((v) => v.id === t.id)!
      .active,
  ).toBe(false);
});
it("seed equality ignores timestamps, annotations and object-key ordering; edit then undo is unchanged", async () => {
  const f = await fixture(),
    seed = f.templates[0],
    row = {
      ...structuredClone(seed),
      updated_at: "later",
      metadata: { last_actor: "staff" },
    };
  expect(
    sameStarterState({ ...row, name: "A workspace name", active: false }, seed),
  ).toBe(true);
  expect(sameStarterState(row, seed)).toBe(true);
  expect(
    sameStarterState(
      Object.fromEntries(Object.entries(seed).reverse()) as Template,
      seed,
    ),
  ).toBe(true);
  row.content[1].text = "Edited";
  expect(sameStarterState(row, seed)).toBe(false);
  row.content = structuredClone(seed.content);
  expect(sameStarterState(row, seed)).toBe(true);
  expect((await libraryTemplates(f.repo, [row]))[0].starter_edited).toBe(false);
});
it("workspace-scoped SQL CAS is atomic, rejects stale writes and is service-role only", async () => {
  const { PGlite } = await import("@electric-sql/pglite"),
    { readFile } = await import("node:fs/promises");
  const db = await PGlite.create();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table templates(id uuid primary key,workspace_id uuid,data jsonb);create table workspace_events(id uuid primary key,workspace_id uuid,data jsonb);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261106205000_starter_library.sql",
        "utf8",
      ),
    );
    const f = await fixture(),
      t = f.templates[0],
      workspace = f.repo.workspaceId,
      after = { ...t, cover: { ...t.cover!, layout: "split" as const } },
      event = { id: crypto.randomUUID() };
    await db.query("insert into templates values($1,$2,$3)", [
      t.id,
      workspace,
      t,
    ]);
    const call = (w: string, b: Template, e: any) =>
      db.query<{ ok: boolean }>(
        "select replace_library_starter($1,$2,$3,$4,$5) ok",
        [w, t.id, b, after, e],
      );
    expect((await call(crypto.randomUUID(), t, event)).rows[0].ok).toBe(false);
    expect((await call(workspace, t, event)).rows[0].ok).toBe(true);
    expect(
      (await call(workspace, t, { id: crypto.randomUUID() })).rows[0].ok,
    ).toBe(false);
    expect(
      (await db.query("select * from workspace_events")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('authenticated','public.replace_library_starter(uuid,uuid,jsonb,jsonb,jsonb)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
  } finally {
    await db.close();
  }
});
