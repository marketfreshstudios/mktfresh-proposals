import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { aiTool, toolDefinitions } from "../src/lib/ai-tools";
import {
  templateMarkdownBlocks,
  templateMarkdown,
} from "../src/lib/connector-template-markdown";
import { restoreConnectorChange } from "../src/lib/studio-history";
import { defaultCover } from "../src/lib/cover";
import type { Block, Template, Audit } from "../src/lib/model";
const scopes = ["proposals:read", "templates:edit"];
const marker = (id: string) => `<!-- yeswell:block:${id} -->`;
async function fixture() {
  const f = await setup();
  const template: Template = {
    id: crypto.randomUUID(),
    name: "Case studies",
    active: true,
    description: "Our copy",
    signature_heading_defaulted: true,
    default_quote: [],
    cover: defaultCover(true),
    content: [
      { id: "page-start", type: "page_break" },
      { id: "heading", type: "heading", level: 1, text: "Case studies" },
      {
        id: "text",
        type: "paragraph",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A sized **literal** word ",
                  marks: [{ type: "fontSize", attrs: { size: 24 } }],
                },
                {
                  type: "variable",
                  attrs: { path: "client.company" },
                  marks: [{ type: "bold" }],
                },
              ],
            },
          ],
        },
      },
      {
        id: "list",
        type: "paragraph",
        content: {
          type: "doc",
          content: [
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Nested example" }],
                    },
                    {
                      type: "orderedList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "One" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        id: "photo",
        type: "image",
        src: "data:image/png;base64,PRIVATE_IMAGE_BYTES",
        alt: "Work example",
        width_percent: 50,
      },
      {
        id: "divider",
        type: "paragraph",
        content: { type: "doc", content: [{ type: "horizontalRule" }] },
      },
      { id: "pricing", type: "pricing_table" },
      {
        id: "terms",
        type: "contract",
        text: "Terms",
        clauses: [
          {
            id: "clause",
            heading: "Our agreement",
            body: "Plain terms",
            show_when: null,
          },
        ],
      },
      { id: "client-sign", type: "signature_block", role: "client" },
      { id: "company-sign", type: "signature_block", role: "company" },
    ],
  };
  await f.repo.put("templates", template);
  const actor = {
    actor: "ai:Claude",
    workspace_id: f.repo.workspaceId,
    on_behalf_of_user_id: staff.actor.slice(6),
    on_behalf_of_name: staff.staff_name,
    ip: "",
    user_agent: "MCP",
  };
  const call = async (name: string, input: unknown) =>
    aiTool(f.repo, actor, name, input, scopes) as Promise<any>;
  const read = () => call("get_template", { template_id: template.id });
  const write = async (content: string, more: Record<string, unknown> = {}) =>
    call("update_template", {
      template_id: template.id,
      revision: (await read()).revision,
      content,
      ...more,
    });
  const current = async () =>
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === template.id,
    )!;
  return { ...f, template, call, read, write, current };
}
it("get/update round trips exact blocks, cover, rich marks, nested lists and opaque objects without leaking their JSON", async () => {
  const f = await fixture(),
    before = await f.repo.list(),
    view = await f.read();
  expect(typeof view.content).toBe("string");
  expect(view.content).not.toContain("PRIVATE_IMAGE_BYTES");
  expect(view.content).not.toContain('"clauses"');
  expect(view.content).not.toContain('"type"');
  expect(view.content).not.toContain("fontSize");
  expect(
    view.blocks.find((b: any) => b.id === "pricing").requires_remove_blocks,
  ).toBe(true);
  await f.write(view.content, { cover: view.cover });
  expect((await f.current()).content).toEqual(f.template.content);
  expect((await f.current()).cover).toEqual(f.template.cover);
  expect((await f.current()).active).toBe(true);
  expect(await f.repo.list()).toEqual(before);
});
it("marker order moves whole opaque blocks and text groups while retaining every untouched block", async () => {
  const f = await fixture(),
    rows = templateMarkdownBlocks(f.template);
  const order = [
    rows[8],
    rows[0],
    rows[2],
    rows[1],
    rows[3],
    rows[4],
    rows[5],
    rows[6],
    rows[7],
    rows[9],
  ];
  await f.write(order.map((row) => marker(row.id)).join("\n\n"));
  expect((await f.current()).content).toEqual(order.map((row) => row.block));
  await f.write(
    order
      .map((row) => marker(row.id) + (row.markdown ? `\n${row.markdown}` : ""))
      .join("\n\n"),
  );
  expect((await f.current()).content).toEqual(order.map((row) => row.block));
});
for (const id of ["heading", "text", "list", "photo", "divider"])
  it(`omitting ordinary ${id} removes exactly that block`, async () => {
    const f = await fixture(),
      content = templateMarkdownBlocks(f.template)
        .filter((row) => row.id !== id)
        .map(
          (row) => marker(row.id) + (row.markdown ? `\n${row.markdown}` : ""),
        )
        .join("\n\n");
    await f.write(content);
    expect((await f.current()).content).toEqual(
      f.template.content.filter((b) => b.id !== id),
    );
  });
for (const id of [
  "pricing",
  "terms",
  "client-sign",
  "company-sign",
  "page-start",
])
  it(`missing protected ${id} requires remove_blocks, and Restore recovers the exact state`, async () => {
    const f = await fixture(),
      content = templateMarkdownBlocks(f.template)
        .filter((row) => row.id !== id)
        .map(
          (row) => marker(row.id) + (row.markdown ? `\n${row.markdown}` : ""),
        )
        .join("\n\n");
    await expect(f.write(content)).rejects.toThrow(
      new RegExp(`${id}.*remove_blocks`),
    );
    expect(await f.current()).toEqual(f.template);
    await f.write(content, { remove_blocks: [id] });
    expect((await f.current()).content).toEqual(
      f.template.content.filter((b) => b.id !== id),
    );
    const event = (await f.repo.entities<Audit>("workspace_events"))
      .filter((e) => e.type === "connector_template_updated")
      .at(-1)!;
    await restoreConnectorChange(f.repo, event.id, staff);
    expect(await f.current()).toEqual(f.template);
  });
it("rejects unknown, foreign, duplicated, malformed and edited markers atomically", async () => {
  const f = await fixture(),
    md = (await f.read()).content;
  for (const content of [
    md + "\n\n" + marker("foreign-id"),
    md + "\n\n" + marker("text"),
    md.replace(marker("text"), '<!-- yeswell:block:text {"type":"image"} -->'),
    md.replace(marker("text"), "<!--yeswell:block:text-->"),
    md.replace(marker("text"), "<!-- yeswell:block:TEXT -->"),
    md + "\n\n<!-- arbitrary comment -->",
    md.replace(marker("text"), "yeswell:block:text -->"),
    md.replace(marker("text"), "before " + marker("text")),
  ])
    await expect(f.write(content)).rejects.toThrow(/marker/);
  expect(await f.current()).toEqual(f.template);
  expect(
    (await f.repo.entities<Audit>("workspace_events")).filter(
      (e) => e.type === "connector_template_updated",
    ),
  ).toHaveLength(0);
  for (const more of [
    { remove_blocks: ["unknown"] },
    { remove_blocks: ["pricing", "pricing"] },
    { remove_blocks: ["pricing"] },
  ])
    await expect(f.write(md, more)).rejects.toThrow(/remove_blocks/);
  await expect(
    f.call("update_template", {
      template_id: f.template.id,
      revision: (await f.read()).revision,
      remove_blocks: ["pricing"],
    }),
  ).rejects.toThrow(/requires content/);
});
it("edits Markdown at its marker, adds new text, keeps fields, refuses unknown fields and stale revisions", async () => {
  const f = await fixture(),
    view = await f.read();
  await f.write(
    "# New section\n\n" +
      view.content.replace(
        "# Case studies",
        "## Results for {{workspace.name}}",
      ),
  );
  const after = await f.current();
  expect(after.content[0].type).toBe("heading");
  const heading = after.content.find((b) => b.id === "heading")!;
  expect(heading.level).toBe(2);
  expect(JSON.stringify(heading.content)).toContain('"type":"variable"');
  expect(after.content.find((b) => b.id === "text")).toEqual(
    f.template.content.find((b) => b.id === "text"),
  );
  await expect(
    f.call("update_template", {
      template_id: f.template.id,
      revision: view.revision,
      content: view.content,
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    f.write((await f.read()).content + "\n\nUnknown {{client.secret}}"),
  ).rejects.toThrow(/Valid fields/);
  await expect(
    f.write((await f.read()).content + "\n\n<script>alert(1)</script>"),
  ).rejects.toThrow(/Unsupported Markdown/);
});
it("legacy missing/unsafe/duplicate IDs use stable opaque aliases, without mutating the read", async () => {
  const f = await fixture(),
    blocks: Block[] = [
      { type: "page_break" },
      { type: "paragraph", text: "Legacy" },
      { id: "same", type: "paragraph", text: "First" },
      { id: "same", type: "image", src: "private" },
      { id: "bad-->id", type: "signature_block", role: "client" },
    ];
  await f.repo.put("templates", { ...f.template, content: blocks });
  const first = await f.read(),
    second = await f.read();
  expect(first).toEqual(second);
  expect(first.content).not.toContain("bad-->id");
  expect(new Set(first.blocks.map((b: any) => b.id)).size).toBe(blocks.length);
  await f.write(first.content);
  expect((await f.current()).content).toEqual(blocks);
});
it("get/update descriptions publish every guard and the new scope is enforced", async () => {
  for (const name of ["get_template", "update_template"]) {
    const desc = toolDefinitions.find((t) => t.name === name)!.description;
    for (const term of [
      "opaque",
      "duplicated",
      "edited",
      "remove_blocks",
      "pricing_table",
      "signature_block",
      "contract",
      "page_break",
    ])
      expect(desc).toContain(term);
  }
  const f = await fixture();
  await expect(
    aiTool(
      f.repo,
      {
        actor: "ai:Claude",
        workspace_id: f.repo.workspaceId,
        ip: "",
        user_agent: "MCP",
      },
      "update_template",
      {
        template_id: f.template.id,
        revision: (await f.read()).revision,
        name: "Denied",
      },
      ["proposals:read", "proposals:draft"],
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("public template tools edit starters in place, can duplicate, and never expose availability changes", async () => {
  const f = await fixture();
  await f.repo.put("templates", {
    ...f.template,
    starter_key: "sample-starter",
  });
  const starter = await f.read();
  const updated = await f.call("update_template", {
    template_id: f.template.id,
    revision: starter.revision,
    content: starter.content.replace("# Case studies", "# Edited starter"),
  });
  expect(updated.template_id).toBe(f.template.id);
  expect((await f.read()).content).toContain("# Edited starter");
  expect((await f.read()).starter_key).toBe(starter.starter_key);
  const savedStarter = await f.current();
  const copy = await f.call("duplicate_template", {
    template_id: f.template.id,
    name: "Our editable copy",
  });
  expect(copy.available_for_new_proposals).toBe(false);
  const view = await f.call("get_template", { template_id: copy.template_id });
  expect(view.starter_key).toBeUndefined();
  await f.call("update_template", {
    template_id: copy.template_id,
    revision: view.revision,
    content: view.content.replace("# Edited starter", "# Our stories"),
  });
  expect(
    (await f.call("get_template", { template_id: copy.template_id })).content,
  ).toContain("# Our stories");
  await expect(
    f.call("update_template", {
      template_id: copy.template_id,
      revision: (
        await f.call("get_template", { template_id: copy.template_id })
      ).revision,
      active: true,
    }),
  ).rejects.toThrow();
  expect((await f.current()).starter_key).toBe("sample-starter");
  expect(await f.current()).toEqual(savedStarter);
});

it("a stale read gets actionable 409 before parsing markers removed by a concurrent edit", async () => {
  const f = await fixture(),
    view = await f.read();
  const next = templateMarkdownBlocks(f.template)
    .filter((row) => row.id !== "pricing")
    .map((row) => marker(row.id))
    .join("\n\n");
  await f.write(next, { remove_blocks: ["pricing"] });
  await expect(
    f.call("update_template", {
      template_id: f.template.id,
      revision: view.revision,
      content: view.content,
    }),
  ).rejects.toMatchObject({
    status: 409,
    message: expect.stringContaining("get_template"),
  });
  expect((await f.current()).content.some((b) => b.id === "pricing")).toBe(
    false,
  );
});
