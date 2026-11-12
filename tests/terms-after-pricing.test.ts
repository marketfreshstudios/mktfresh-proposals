import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  moveTermsAfterPricing,
  starterTemplates,
} from "../seed/starter-templates";
import { preTermsMoveStarter } from "../seed/starter-legacy-copy";
import type { Block, Template } from "../src/lib/model";

const migration = "supabase/migrations/20261112034500_terms_after_pricing.sql";
const kinds = (content: Block[]) => content.map((b) => b.type);

it("starters place Terms right after the pricing section", () => {
  for (const t of starterTemplates("00000000-0000-4000-8000-000000000000")) {
    const types = kinds(t.content);
    const terms = types.indexOf("contract");
    expect(terms, t.name).toBeGreaterThan(types.indexOf("pricing_table"));
    expect(t.content[terms + 1], t.name).toMatchObject({
      type: "heading",
      text: "Next steps",
    });
    expect(types.slice(-3), t.name).toEqual([
      "heading",
      "signature_block",
      "signature_block",
    ]);
  }
});

it("the migration moves Terms where it is last before the signatures, seeds new workspaces the same way, and is idempotent", async () => {
  const db = await PGlite.create();
  try {
    const current = starterTemplates("00000000-0000-4000-8000-000000000000");
    const old = current.map(preTermsMoveStarter);
    expect(kinds(old[0].content)).not.toEqual(kinds(current[0].content));
    const payload = JSON.stringify(old.map(({ id, ...t }) => t));
    await db.exec(`
      create table public.workspaces(id uuid primary key);
      create table public.templates(id uuid primary key, workspace_id uuid references public.workspaces, data jsonb not null);
      create function public.seed_new_workspace_templates() returns trigger language plpgsql as $fn$
      begin
        insert into public.templates(id, workspace_id, data)
          select gen_random_uuid(), new.id, item
          from jsonb_array_elements($starter$${payload}$starter$::jsonb) item;
        return new;
      end $fn$;
      create trigger seed_templates after insert on public.workspaces
        for each row execute function public.seed_new_workspace_templates();
    `);
    const ws = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [ws]);
    const block = (type: string, text?: string) =>
      ({ type, ...(text ? { text } : {}) }) as Block;
    // Terms not last before the signatures: left alone.
    const custom: Block[] = [
      block("pricing_table"),
      block("page_break"),
      block("contract", "Terms"),
      block("paragraph", "A closing note"),
      block("signature_block"),
    ];
    // No pricing at all: left alone.
    const noPricing: Block[] = [
      block("paragraph", "Intro"),
      block("contract", "Terms"),
      block("signature_block"),
    ];
    const customId = crypto.randomUUID(),
      plainId = crypto.randomUUID();
    await db.query("insert into templates values($1,$2,$3),($4,$2,$5)", [
      customId,
      ws,
      JSON.stringify({ name: "Custom", content: custom }),
      plainId,
      JSON.stringify({ name: "Plain", content: noPricing }),
    ]);
    const sql = await readFile(migration, "utf8");
    await db.exec(sql);
    const rows = async (workspace: string) =>
      (
        await db.query<{ id: string; data: Template }>(
          "select id, data from templates where workspace_id=$1 order by data->>'starter_order', data->>'name'",
          [workspace],
        )
      ).rows;
    const after = await rows(ws);
    for (const t of current) {
      const row = after.find((r) => r.data.starter_key === t.starter_key)!;
      expect(row.data.content, t.name).toEqual(
        JSON.parse(JSON.stringify(t.content)),
      );
    }
    expect(after.find((r) => r.id === customId)!.data.content).toEqual(custom);
    expect(after.find((r) => r.id === plainId)!.data.content).toEqual(
      noPricing,
    );
    // New workspaces receive the moved order.
    const next = crypto.randomUUID();
    await db.query("insert into workspaces values($1)", [next]);
    for (const row of await rows(next)) {
      const t = current.find((c) => c.starter_key === row.data.starter_key)!;
      expect(row.data.content, t.name).toEqual(
        JSON.parse(JSON.stringify(t.content)),
      );
    }
    // Running it again changes nothing.
    const snapshot = await rows(ws);
    await db.exec(sql);
    expect(await rows(ws)).toEqual(snapshot);
    // The SQL and the code agree on the same input.
    expect(
      moveTermsAfterPricing(structuredClone(old[1].content)).map((b) => b.id),
    ).toEqual(current[1].content.map((b) => b.id));
  } finally {
    await db.close();
  }
});
