import { it, expect } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import { withoutTitleHeading, moveSection } from "../src/lib/editor-document";
import { contentSections } from "../src/lib/ai-review";
import { versionHash } from "../src/lib/content";
import type { Block } from "../src/lib/model";
const content: Block[] = [
  {
    id: "a",
    type: "heading",
    text: "Scope",
    ai_review: { source: "assistant", reviewed: false },
  },
  {
    id: "b",
    type: "paragraph",
    text: "The scope.",
    ai_review: { source: "assistant", reviewed: false },
  },
  { id: "p", type: "pricing_table" },
  {
    id: "c",
    type: "heading",
    text: "Next steps",
    ai_review: { source: "assistant", reviewed: false },
  },
  { id: "d", type: "paragraph", text: "Read and sign." },
  { id: "e", type: "signature_block", role: "client" },
  { id: "f", type: "signature_block", role: "company" },
];
it("only an exact leading title field heading is stripped from new drafts, including MCP content", async () => {
  const { repo, service, draft } = await setup();
  const template = (await repo.entities<any>("templates"))[0];
  template.content = [
    { type: "heading", text: "{{proposal.title}}" },
    ...content,
  ];
  await repo.put("templates", template);
  const input = {
    title: "One cover title",
    client_id: draft.client.id,
    template_id: template.id,
  };
  const created = await service.create(input, staff);
  expect(created.content[0].text).toBe("Scope");
  const ai = await service.create(
    { ...input, content: template.content },
    { ...staff, actor: "ai:Assistant" },
  );
  expect(ai.content[0].text).toBe("Scope");
  expect(template.content[0].text).toBe("{{proposal.title}}");
  for (const text of [
    "Our {{proposal.title}}",
    "{{ proposal.title }}",
    "{{proposal.title}} ",
  ])
    expect(withoutTitleHeading([{ type: "heading", text }])[0].text).toBe(text);
  expect(
    withoutTitleHeading([
      content[0],
      { type: "heading", text: "{{proposal.title}}" },
    ]),
  ).toHaveLength(2);
});
it("outline reorder moves headings plus all following blocks up to the next heading", () => {
  expect(contentSections(content).map((s) => s.indices)).toEqual([
    [0, 1, 2],
    [3, 4, 5, 6],
  ]);
  expect(moveSection(content, "a", "c").map((b) => b.id)).toEqual([
    "c",
    "d",
    "e",
    "f",
    "a",
    "b",
    "p",
  ]);
  expect(moveSection(content, "absent", "c")).toBe(content);
});
it("bulk review writes one staff audit event naming sections, preserves price holds, and supports undo", async () => {
  const { service, draft } = await setup();
  const heldQuote = structuredClone(draft.quote);
  heldQuote[0].ai_entered = true;
  heldQuote[0].sublines[0].amount += 100;
  const p = await service.edit(
    draft.id,
    { revision: draft.revision, content, quote: heldQuote },
    staff,
  );
  expect(p.quote[0].sublines[0].amount).not.toBe(
    p.quote[0].sublines[0].list_amount,
  );
  expect(p.quote[0].ai_entered).toBe(true);
  const before = JSON.stringify(p.quote);
  const reviewed = await service.reviewSections(
    p.id,
    { revision: p.revision, section_ids: ["a", "c"], reviewed: true },
    staff,
  );
  expect(reviewed.ai_unreviewed).toBe(false);
  expect(
    reviewed.content
      .filter((b) => b.ai_review)
      .every((b) => b.ai_review?.reviewed),
  ).toBe(true);
  expect(JSON.stringify(reviewed.quote)).toBe(before);
  expect(
    (await service.checkReady(reviewed)).errors.some((error) =>
      error.includes("Use list price or Keep"),
    ),
  ).toBe(true);
  const events = reviewed.events.filter(
    (e) => e.type === "ai_sections_reviewed",
  );
  expect(events).toHaveLength(1);
  expect(events[0].actor).toBe(staff.actor);
  expect(events[0].metadata.sections).toEqual([
    { id: "a", title: "Scope" },
    { id: "c", title: "Next steps" },
  ]);
  const undo = await service.reviewSections(
    p.id,
    { revision: reviewed.revision, section_ids: ["a"], reviewed: false },
    staff,
  );
  expect(undo.ai_unreviewed).toBe(true);
  expect(undo.content.find((b) => b.id === "c")?.ai_review?.reviewed).toBe(
    true,
  );
  expect(undo.events.at(-1)?.type).toBe("ai_review_undone");
  await expect(
    service.reviewSections(
      p.id,
      { revision: undo.revision, section_ids: ["a"], reviewed: true },
      { ...staff, actor: "ai:Assistant" },
    ),
  ).rejects.toThrow("Only staff");
  await expect(
    service.reviewSections(
      p.id,
      { revision: reviewed.revision, section_ids: ["a"], reviewed: true },
      staff,
    ),
  ).rejects.toThrow("changed");
  await expect(
    service.reviewSections(
      p.id,
      { revision: undo.revision, section_ids: ["absent"], reviewed: true },
      staff,
    ),
  ).rejects.toThrow("Unknown section");
});
it("title and review changes never rewrite a sent/signed version or hash", async () => {
  const { service, draft } = await setup();
  const p = await service.send(draft.id, staff),
    frozen = await service.sign(
      p.id,
      signature(p.revision),
      "client",
      clientActor,
      { token: p.token!, password: "" },
    );
  const before = JSON.stringify(frozen.versions);
  await expect(
    service.edit(
      p.id,
      { revision: frozen.revision, title: "New title" },
      staff,
    ),
  ).rejects.toThrow("Signed");
  await expect(
    service.reviewSections(
      p.id,
      { revision: frozen.revision, section_ids: ["a"], reviewed: true },
      staff,
    ),
  ).rejects.toThrow("Signed");
  const read = await service.forRead(frozen);
  expect(JSON.stringify(read.versions)).toBe(before);
  expect(versionHash(read.versions.at(-1)!)).toBe(
    read.versions.at(-1)!.content_hash,
  );
});
