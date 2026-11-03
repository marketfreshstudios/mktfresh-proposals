import { describe, expect, it } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import {
  StyleOverridesSchema,
  resolveStyles,
  freezeStyles,
  documentStyleCss,
  validateStyleContrast,
} from "../src/lib/proposal-styles";
import { contentSections, reviewBlocks } from "../src/lib/ai-review";
import { convertTextStyle, moveSection } from "../src/lib/editor-document";
import { markdownBlocks } from "../src/lib/markdown";
import {
  renderBlocks,
  versionHash,
  sha256,
  canonical,
} from "../src/lib/content";
import { publicResult } from "../src/lib/service";
import type { Block, Template } from "../src/lib/model";
import { previewResult } from "../src/lib/preview";
it("converts text levels without losing field tokens, IDs or review state", () => {
  const p: Block = {
    id: "stable",
    type: "paragraph",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hi " },
            { type: "variable", attrs: { path: "client.first_name" } },
          ],
        },
      ],
    },
    ai_review: { source: "assistant", reviewed: false },
  };
  const h = convertTextStyle(p, 3);
  expect(h).toMatchObject({
    id: "stable",
    type: "heading",
    level: 3,
    text: "Hi {{client.first_name}}",
    ai_review: p.ai_review,
  });
  expect(convertTextStyle(h, 0)).toMatchObject({
    type: "paragraph",
    level: undefined,
    text: "Hi {{client.first_name}}",
  });
  expect(
    reviewBlocks([{ type: "heading", text: "Existing" }], false)[0].level,
  ).toBe(1);
  expect(() =>
    reviewBlocks([{ type: "heading", level: 4 as any }], false),
  ).toThrow("Heading level");
});
it("markdown headings are semantic subheadings and only H1 splits/drags sections", () => {
  const blocks = reviewBlocks(
    markdownBlocks(
      "# First\n\nA\n\n## Detail\n\n### Smaller\n\n# Second\n\nB",
      [],
    ),
    false,
  );
  const sections = contentSections(blocks);
  expect(sections.map((s) => s.title)).toEqual(["First", "Second"]);
  expect(sections[0].indices).toHaveLength(4);
  const moved = moveSection(blocks, sections[0].id, sections[1].id);
  expect(moved.map((b) => b.text).filter(Boolean)).toEqual([
    "Second",
    "First",
    "Detail",
    "Smaller",
  ]);
  const html = renderBlocks(blocks, [], {}, "USD");
  expect(html).toContain('<h2 data-heading-level="1">First</h2>');
  expect(html).toContain('<h3 data-heading-level="2">Detail</h3>');
  expect(html).toContain('<h4 data-heading-level="3">Smaller</h4>');
});
it("resolves styles per property: proposal > template > workspace > defaults", () => {
  const result = resolveStyles(
    { proposal_styles: { heading2: { size: 24, weight: 700 } } },
    { heading2: { size: 22, space_above: 35 } },
    { heading2: { size: 20 } },
  );
  expect(result.heading2).toMatchObject({
    size: 20,
    weight: 700,
    space_above: 35,
    letter_case: "normal",
    font: "serif",
  });
  expect(resolveStyles().title.size).toBe(40);
  expect(
    StyleOverridesSchema.safeParse({ body: { colour: "#eeeeee" } }).success,
  ).toBe(false);
  expect(() =>
    validateStyleContrast(
      resolveStyles({
        proposal_styles: { body: { colour: "accent" } },
        accent_colour: "#ffffff",
      }),
      "#ffffff",
    ),
  ).toThrow("4.5:1");
  const frozen = freezeStyles({
    accent_colour: "#123456",
    proposal_styles: { heading1: { colour: "accent" } },
  });
  expect(frozen.heading1.colour).toBe("#123456");
  const css = documentStyleCss(frozen);
  expect(css).toContain("color:#123456");
  expect(css).toContain("text-transform:none");
  expect(css).toContain(".print-root h2");
  expect(css).toContain(".document-reading h2");
});
it("inherits template overrides, snapshots latest workspace styles at send and freezes styles with the signed evidence", async () => {
  const { repo, service, settings, draft } = await setup();
  const template = (await repo.entities<Template>("templates"))[0];
  template.style_overrides = {
    heading1: { size: 29 },
    heading2: { weight: 700 },
  };
  await repo.put("templates", template);
  let p = await service.create(
    {
      client_id: draft.client.id,
      template_id: template.id,
      title: "Styled agreement",
    },
    staff,
  );
  expect(p.template_style_overrides).toEqual(template.style_overrides);
  settings.proposal_styles = {
    body: { size: 18 },
    heading1: { size: 26, space_above: 34 },
  };
  await repo.put("workspace_settings", settings);
  p = await service.edit(
    p.id,
    { revision: p.revision, style_overrides: { heading1: { size: 31 } } },
    staff,
  );
  expect(previewResult(p, settings).resolved_styles?.heading1.size).toBe(31);
  p = await service.send(p.id, staff);
  const version = p.versions.at(-1)!;
  expect(version.resolved_styles?.heading1).toMatchObject({
    size: 31,
    space_above: 34,
  });
  expect(version.resolved_styles?.heading2.weight).toBe(700);
  expect(version.resolved_styles?.body.size).toBe(18);
  expect(versionHash(version)).toBe(version.content_hash);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  const frozen = JSON.stringify(p.versions.at(-1)!);
  settings.proposal_styles = { body: { size: 35 }, heading1: { size: 50 } };
  template.style_overrides = { heading1: { size: 60 } };
  await repo.put("workspace_settings", settings);
  await repo.put("templates", template);
  const read = await service.forRead((await repo.get(p.id))!);
  expect(JSON.stringify(read.versions.at(-1)!)).toBe(frozen);
  expect(publicResult(read).resolved_styles?.body.size).toBe(18);
  const tampered = structuredClone(read.versions.at(-1)!);
  tampered.resolved_styles!.body.size++;
  expect(versionHash(tampered)).not.toBe(tampered.content_hash);
});
it("old stored versions retain their exact hash input and never gain styles on read", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  const v = p.versions[0];
  delete v.resolved_styles;
  const oldInput = {
    content: v.content,
    quote: v.quote,
    variables_resolved: v.variables_resolved,
  };
  v.content_hash = sha256(canonical(oldInput));
  expect(versionHash(v)).toBe(v.content_hash);
  const bytes = JSON.stringify(v);
  publicResult(p);
  await service.forRead(p);
  expect(JSON.stringify(v)).toBe(bytes);
  expect(publicResult(p).resolved_styles).toBeUndefined();
});
it("migrates draft/template headings only, with a revision bump; sent and frozen bytes stay unchanged", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile, readdir } = await import("node:fs/promises");
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table storage.buckets(id text primary key,name text,public boolean);grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`,
    );
    const file = "20261102065523_editor_heading_levels_styles.sql";
    for (const name of (await readdir("supabase/migrations"))
      .filter((n) => n.endsWith(".sql") && n < file)
      .sort())
      await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
    const { repo, service, draft } = await setup();
    const sent = await service.send(draft.id, staff);
    const signed = await service.sign(
      sent.id,
      signature(sent.revision),
      "client",
      clientActor,
      { token: sent.token!, password: "" },
    );
    const content = [
      { type: "heading", text: "Old heading" },
      { type: "heading", level: 2, text: "Detail" },
    ];
    await db.query(
      "insert into clients(id,data,workspace_id) values($1,$2,$3)",
      [draft.client.id, JSON.stringify(draft.client), repo.workspaceId],
    );
    for (const status of ["draft", "sent", "signed_by_client"]) {
      const id = status === "draft" ? draft.id : crypto.randomUUID(),
        p = {
          ...structuredClone(signed),
          id,
          status,
          content,
          token: id,
          revision: 5,
        };
      // Deliberately store pre-feature versions, byte-stable through the migration.
      delete p.versions[0].resolved_styles;
      p.versions[0].content = structuredClone(content) as Block[];
      p.versions[0].content_hash = versionHash(p.versions[0]);
      await db.query(
        `insert into proposals(id,revision,state,client_id,title,status,source,created_at,updated_at,workspace_id) values($1,5,$2,$3,'Fixture',$4,'native',now(),now(),$5)`,
        [id, JSON.stringify(p), draft.client.id, status, repo.workspaceId],
      );
      await db.query(
        `insert into proposal_versions(id,proposal_id,version_no,data,workspace_id) values($1,$2,1,$3,$4)`,
        [
          crypto.randomUUID(),
          id,
          JSON.stringify(p.versions[0]),
          repo.workspaceId,
        ],
      );
    }
    const templateId = crypto.randomUUID();
    await db.query(
      "insert into templates(id,data,workspace_id) values($1,$2,$3)",
      [templateId, JSON.stringify({ content }), repo.workspaceId],
    );
    const sentBefore = await db.query(
        "select state from proposals where status <> 'draft' order by id",
      ),
      versionsBefore = await db.query(
        "select data from proposal_versions order by id",
      );
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    expect(
      (
        await db.query(
          "select state from proposals where status <> 'draft' order by id",
        )
      ).rows,
    ).toEqual(sentBefore.rows);
    expect(
      (await db.query("select data from proposal_versions order by id")).rows,
    ).toEqual(versionsBefore.rows);
    const migrated = (
      await db.query<any>(
        "select revision,state from proposals where status='draft'",
      )
    ).rows[0];
    expect(migrated.revision).toBe(6);
    expect(migrated.state.revision).toBe(6);
    expect(migrated.state.content.map((b: Block) => b.level)).toEqual([1, 2]);
    expect(
      (
        await db.query<any>("select data from templates where id=$1", [
          templateId,
        ])
      ).rows[0].data.content[0].level,
    ).toBe(1);
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    expect(
      (
        await db.query<any>(
          "select revision from proposals where status='draft'",
        )
      ).rows[0].revision,
    ).toBe(6);
  } finally {
    await db.close();
  }
});
it("rejects fonts outside this workspace at every style level and rejects low contrast or AI style edits", async () => {
  const { service, draft } = await setup();
  const alien = {
    id: crypto.randomUUID(),
    name: "Other workspace font",
    path: "elsewhere/fonts/a.woff2",
    format: "woff2" as const,
    hash: "a".repeat(64),
  };
  await expect(
    service.edit(
      draft.id,
      {
        revision: draft.revision,
        style_overrides: { heading3: { font: alien } },
      },
      staff,
    ),
  ).rejects.toThrow("uploaded to this workspace");
  await expect(
    service.edit(
      draft.id,
      {
        revision: draft.revision,
        style_overrides: { body: { colour: "#ffffff" } },
      },
      staff,
    ),
  ).rejects.toThrow("4.5:1");
  await expect(
    service.edit(
      draft.id,
      { revision: draft.revision, style_overrides: { body: { size: 20 } } },
      { ...staff, actor: "ai:Assistant" },
    ),
  ).rejects.toThrow("Only staff");
});
it("keeps client.name as an exact token through Heading 2 and paragraph conversion", () => {
  const paragraph: Block = {
    id: "token-block",
    type: "paragraph",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello " },
            { type: "variable", attrs: { path: "client.name" } },
            { type: "text", text: ", a useful proposal." },
          ],
        },
      ],
    },
    ai_review: { source: "assistant", reviewed: false },
  };
  const heading = convertTextStyle(paragraph, 2);
  expect(heading).toMatchObject({
    id: paragraph.id,
    type: "heading",
    level: 2,
    text: "Hello {{client.name}}, a useful proposal.",
    ai_review: paragraph.ai_review,
  });
  const restored = convertTextStyle(heading, 0);
  expect(restored).toMatchObject({
    id: paragraph.id,
    type: "paragraph",
    text: "Hello {{client.name}}, a useful proposal.",
    ai_review: paragraph.ai_review,
  });
  expect(paragraph.content?.content?.[0].content?.[1]).toEqual({
    type: "variable",
    attrs: { path: "client.name" },
  });
});
