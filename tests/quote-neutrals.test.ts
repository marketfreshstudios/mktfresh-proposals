import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  documentStyleCss,
  freezeStyles,
  harborQuoteNeutrals,
  resolveStyles,
} from "../src/lib/proposal-styles";
import { sameAuthoredTemplate } from "../src/lib/starter-template-state";
import { postgresFixture } from "./postgres-fixture";
import { setup, staff } from "./helpers";
import type { Proposal, Template } from "../src/lib/model";

it("resolves each color from workspace to template to proposal, while keeping old custom styles", () => {
  expect(
    resolveStyles(undefined, { body: { size: 18 } }).layout?.quote_neutrals,
  ).toBeUndefined();
  const settings = {
    proposal_styles: { quote_neutrals: { dividers: "#c2cdd2" } },
  };
  const template = { quote_neutrals: { group_border: "#a1afb5" } };
  const proposal = { quote_neutrals: { group_fill: "#e4eaed" } };
  expect(
    resolveStyles(settings, template, proposal).layout?.quote_neutrals,
  ).toEqual({
    ...harborQuoteNeutrals,
    dividers: "#c2cdd2",
    group_border: "#a1afb5",
    group_fill: "#e4eaed",
  });
  const saved = freezeStyles(settings, template, proposal);
  expect(documentStyleCss(saved, "#365c4a")).toContain(
    "background:#e4eaed;border-color:#a1afb5",
  );
  expect(documentStyleCss(saved, "#365c4a")).toContain(
    "border-bottom-color:#c2cdd2",
  );
});

it("only stamps exact default drafts and templates; the migration is idempotent and keeps published JSON", async () => {
  const db = await postgresFixture(),
    f = await setup();
  const template = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.draft.template_id,
  )!;
  const templates = [
    template,
    {
      ...template,
      id: randomUUID(),
      style_overrides: { heading1: { size: 31 } },
    },
  ];
  const published = await f.service.send(f.draft.id, staff);
  const drafts = [
    f.draft,
    {
      ...f.draft,
      id: randomUUID(),
      style_overrides: { margins: { top: 1.1 } },
    },
    { ...published, id: randomUUID(), revision: 0 },
  ];
  const migration = await readFile(
    "supabase/migrations/20261110204400_harbor_quote_neutrals.sql",
    "utf8",
  );
  try {
    await db.query(
      "insert into clients(id,workspace_id,data) values($1,$2,$3)",
      [f.draft.client.id, f.repo.workspaceId, f.draft.client],
    );
    await db.query(
      "insert into workspace_settings(id,workspace_id,data) values($1,$1,$2)",
      [f.repo.workspaceId, f.settings],
    );
    for (const t of templates) {
      await db.query(
        "insert into templates(id,workspace_id,data) values($1,$2,$3)",
        [t.id, f.repo.workspaceId, t],
      );
    }
    for (const p of drafts)
      await db.query("select save_proposal($1::jsonb,-1)", [p]);
    const snapshots = async () => ({
      proposals: (
        await db.query<{ id: string; state: Proposal }>(
          "select id,state from proposals order by id",
        )
      ).rows,
      templates: (
        await db.query<{ id: string; data: Template }>(
          "select id,data from templates order by id",
        )
      ).rows,
      versions: (
        await db.query("select id,data from proposal_versions order by id")
      ).rows,
    });
    const before = await snapshots();
    await db.exec(migration);
    const after = await snapshots();
    expect(after.versions).toEqual(before.versions);
    for (const row of after.templates) {
      const original = before.templates.find((t) => t.id === row.id)!;
      if (row.id === template.id) {
        expect(row.data).toEqual({
          ...original.data,
          style_overrides: { quote_neutrals: {} },
        });
        expect(sameAuthoredTemplate(row.data, original.data)).toBe(true);
      } else expect(row).toEqual(original);
    }
    for (const row of after.proposals) {
      const original = before.proposals.find((p) => p.id === row.id)!;
      expect(row.state).toEqual(
        row.id === f.draft.id
          ? {
              ...original.state,
              style_overrides: { quote_neutrals: {} },
            }
          : original.state,
      );
    }
    await db.exec(migration);
    expect(await snapshots()).toEqual(after);
  } finally {
    await db.close();
  }
});
