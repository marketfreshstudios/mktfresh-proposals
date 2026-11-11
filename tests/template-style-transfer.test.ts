import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import {
  saveTemplateStyles,
  templateStyleTarget,
  undoTemplateStyles,
} from "../src/lib/template-style-transfer";
import { studioRevision } from "../src/lib/studio-history";
import { sameAuthoredTemplate } from "../src/lib/starter-template-state";
import { defaultHeaderFooter } from "../src/lib/page-bands";
import { MemoryRepository } from "../src/lib/repository";
import type { Audit, Template } from "../src/lib/model";

async function stylesFixture() {
  const f = await setup();
  const p = (await f.repo.get(f.draft.id))!;
  p.style_overrides = {
    heading1: { space_below: 14 },
    body: { size: 18 },
    density: "comfortable",
    quote_layout: "table",
    margins: { left: 1.1 },
  };
  p.header_footer = defaultHeaderFooter();
  p.header_footer.headerSpacing.spaceToContent = 31;
  p.header_footer.shared.header.slots[1].content[0].content = [
    { type: "text", text: "Shared, not page-specific" },
  ];
  p.header_footer.overrides = { unique: { header: "hidden" } };
  await f.repo.save(p, p.revision);
  return {
    ...f,
    p: (await f.repo.get(p.id))!,
    template: (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === p.template_id,
    )!,
  };
}
it("Staff saves all resolved styles and shared bands, preserving template content, cover, pricing and proposal versions", async () => {
  const f = await stylesFixture();
  const actor = { ...staff, staff_role: "member" as const };
  const target = await templateStyleTarget(f.repo, f.p.id, actor);
  expect(target.changes).toEqual(
    expect.arrayContaining([
      expect.stringContaining("Heading 1: space below"),
      "Shared header content",
      "Header and footer spacing and visibility",
    ]),
  );
  const result = await saveTemplateStyles(f.repo, f.p.id, target, actor);
  const after = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.template.id,
  )!;
  expect(after.style_overrides).toMatchObject(f.p.style_overrides!);
  expect(after.header_footer!.headerSpacing.spaceToContent).toBe(31);
  expect(after.header_footer).not.toHaveProperty("overrides");
  expect(after.content).toEqual(f.template.content);
  expect(after.cover).toEqual(f.template.cover);
  expect(after.default_items).toEqual(f.template.default_items);
  expect(await f.repo.get(f.p.id)).toEqual(f.p);
  expect(result.event_id).toBeTruthy();
  const event = (await f.repo.entities<Audit>("workspace_events")).find(
    (e) => e.id === result.event_id,
  )!;
  expect(event.metadata).toMatchObject({
    proposal_id: f.p.id,
    proposal_title: f.p.title,
    editor_name: staff.staff_name,
  });
});
it("Undo restores only this template, using a revision guard", async () => {
  const f = await stylesFixture();
  const result = await saveTemplateStyles(
    f.repo,
    f.p.id,
    await templateStyleTarget(f.repo, f.p.id, staff),
    staff,
  );
  await undoTemplateStyles(f.repo, f.p.id, result.event_id!, staff);
  const after = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.template.id,
  )!;
  expect(after).toEqual(f.template);
});
it("a later template edit prevents both a stale save and Undo without overwriting it", async () => {
  const f = await stylesFixture();
  const target = await templateStyleTarget(f.repo, f.p.id, staff);
  await f.repo.put("templates", {
    ...f.template,
    name: "Concurrent staff edit",
  });
  await expect(
    saveTemplateStyles(f.repo, f.p.id, target, staff),
  ).rejects.toMatchObject({ status: 409 });
  const result = await saveTemplateStyles(
    f.repo,
    f.p.id,
    await templateStyleTarget(f.repo, f.p.id, staff),
    staff,
  );
  const current = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.template.id,
  )!;
  await f.repo.put("templates", { ...current, description: "Later work" });
  await expect(
    undoTemplateStyles(f.repo, f.p.id, result.event_id!, staff),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === current.id,
    )?.description,
  ).toBe("Later work");
});
it("a proposal edit after confirmation requires a new review", async () => {
  const f = await stylesFixture();
  const target = await templateStyleTarget(f.repo, f.p.id, staff);
  await f.repo.save({ ...f.p, revision: f.p.revision + 1 }, f.p.revision);
  await expect(
    saveTemplateStyles(f.repo, f.p.id, target, staff),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === f.template.id,
    ),
  ).toEqual(f.template);
});
it("saving a starter edits it in place; no changes means no revision or Activity event", async () => {
  const f = await stylesFixture();
  await f.repo.put("templates", {
    ...f.template,
    starter_key: "general-project",
  });
  await saveTemplateStyles(
    f.repo,
    f.p.id,
    await templateStyleTarget(f.repo, f.p.id, staff),
    staff,
  );
  const current = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.template.id,
  )!;
  expect(current.starter_key).toBe("general-project");
  expect(sameAuthoredTemplate(f.template, current)).toBe(false);
  const events = await f.repo.entities<Audit>("workspace_events");
  const result = await saveTemplateStyles(
    f.repo,
    f.p.id,
    await templateStyleTarget(f.repo, f.p.id, staff),
    staff,
  );
  expect(result).toMatchObject({
    event_id: null,
    revision: studioRevision(current),
  });
  expect(await f.repo.entities<Audit>("workspace_events")).toEqual(events);
});
it("the endpoint is staff-only and cannot cross the repository workspace", async () => {
  const f = await stylesFixture();
  await expect(
    templateStyleTarget(f.repo, f.p.id, { ...staff, actor: "ai:Claude" }),
  ).rejects.toMatchObject({ status: 403 });
  const other = new MemoryRepository(crypto.randomUUID());
  await expect(templateStyleTarget(other, f.p.id, staff)).rejects.toMatchObject(
    { status: 404 },
  );
  await f.repo.removeTemplate(f.template.id);
  await expect(
    templateStyleTarget(f.repo, f.p.id, staff),
  ).rejects.toMatchObject({ status: 404 });
});

it("explicit Cards and legacy default colors are the same settings as their omitted defaults", async () => {
  const f = await setup();
  const { legacyQuoteNeutrals } = await import("../src/lib/proposal-styles");
  const template = (await f.repo.entities<Template>("templates"))[0];
  template.style_overrides = {
    quote_layout: "cards",
    quote_neutrals: legacyQuoteNeutrals,
  };
  await f.repo.put("templates", template);
  const p = (await f.repo.get(f.draft.id))!;
  p.template_style_overrides = template.style_overrides;
  await f.repo.save(p, p.revision);
  const target = await templateStyleTarget(f.repo, p.id, staff);
  expect(target.changes).toEqual([]);
  const events = await f.repo.entities<Audit>("workspace_events");
  expect(
    (await saveTemplateStyles(f.repo, p.id, target, staff)).event_id,
  ).toBeNull();
  expect(await f.repo.entities<Audit>("workspace_events")).toEqual(events);
});
