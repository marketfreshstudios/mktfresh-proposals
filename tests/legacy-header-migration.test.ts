import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  defaultTemplateBands,
  TemplateBandsSchema,
} from "../src/lib/page-bands";

const workspace = "00000000-0000-4000-8000-000000000001";
const website = "a0fd95dd-30df-4ee4-8a53-41caf94a1c29";
const fresh = defaultTemplateBands();
const legacy = structuredClone(fresh);
const first = legacy.shared.header.slots[0].content[0].content!;
first[0].attrs!.src = "workspace-logo";
first[1].text = "{{workspace.name}}";
legacy.headerSpacing = {
  ...legacy.headerSpacing!,
  heightIn: 0.4,
  spaceToContent: 31,
};

it("upgrades the exact legacy lockup on editable templates without touching near matches", () => {
  expect(TemplateBandsSchema.parse(legacy).shared.header).toEqual(
    fresh.shared.header,
  );
  const custom = structuredClone(legacy);
  custom.shared.header.slots[0].content[0].content![1].text =
    "Contact {{workspace.name}}";
  expect(TemplateBandsSchema.parse(custom).shared.header).toEqual(
    custom.shared.header,
  );
});

it("repairs exact first slots, invalidates affected caches, and never writes published rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.templates (id uuid primary key, workspace_id uuid, data jsonb);
      create table public.proposals (id uuid primary key, revision integer, status text, source text, state jsonb);
    `);
    const pagination = { format: 1, pages: 1, starts: [] };
    const template = {
      starter_key: "website-design-build",
      header_footer: legacy,
      pagination,
      name: "Owner's existing template",
    };
    const custom = structuredClone(template);
    custom.header_footer.shared.header.slots[0].content[0].content![1].text =
      "Contact {{workspace.name}}";
    const defaultBands = { ...template, header_footer: fresh };
    const ids = Array.from(
      { length: 10 },
      (_, i) => `00000000-0000-4000-8000-00000000002${i}`,
    );
    for (const [id, data] of [
      [website, template],
      [ids[0], template],
      [ids[1], custom],
      [ids[2], defaultBands],
    ] as const)
      await db.query("insert into public.templates values ($1,$2,$3)", [
        id,
        workspace,
        JSON.stringify(data),
      ]);
    const state = {
      revision: 5,
      status: "draft",
      token: null,
      sent_at: null,
      signers: [],
      versions: [],
      header_footer: legacy,
      pagination,
    };
    const blocked = [
      { ...state, status: "sent", token: "sent-link" },
      { ...state, status: "signed_by_client", signers: [{ role: "client" }] },
      { ...state, versions: [{ frozen: true }] },
      { ...state, status: "draft", sent_at: "2026-11-10T12:00:00Z" },
      { ...state, header_footer: custom.header_footer },
    ];
    for (const [i, p] of [state, ...blocked].entries())
      await db.query(
        "insert into public.proposals values ($1,5,$2,'native',$3)",
        [ids[i], p.status, JSON.stringify(p)],
      );
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20261110175822_repair_legacy_header_lockup.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.exec(migration);
    const readTemplates = () =>
      db.query<{ id: string; data: typeof template }>(
        "select id, data from public.templates order by id",
      );
    const readProposals = () =>
      db.query<{ id: string; revision: number; state: typeof state }>(
        "select id, revision, state from public.proposals order by id",
      );
    const t = (await readTemplates()).rows,
      p = (await readProposals()).rows;
    expect(t.find((t) => t.id === website)?.data).toEqual({
      starter_key: template.starter_key,
      name: template.name,
      header_footer: {
        ...legacy,
        shared: fresh.shared,
        headerSpacing: fresh.headerSpacing,
      },
    });
    expect(t[0].data).toEqual({
      starter_key: template.starter_key,
      name: template.name,
      header_footer: { ...legacy, shared: fresh.shared },
    });
    expect(t[1].data).toEqual(custom);
    expect(t[2].data).toEqual(defaultBands);
    const { pagination: _cache, ...rest } = state;
    expect(p[0]).toEqual({
      id: ids[0],
      revision: 6,
      state: {
        ...rest,
        revision: 6,
        header_footer: { ...legacy, shared: fresh.shared },
      },
    });
    expect(p.slice(1).map((p) => p.state)).toEqual(blocked);
    await db.exec(migration);
    expect((await readTemplates()).rows).toEqual(t);
    expect((await readProposals()).rows).toEqual(p);
  } finally {
    await db.close();
  }
});
