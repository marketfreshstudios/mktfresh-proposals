import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { setup, staff, signature, clientActor } from "./helpers";
import {
  linkedContent,
  linkedHash,
  stampSavedBlocks,
  replaceLinkedBlocks,
  linkedInstances,
} from "../src/lib/linked-blocks";
import { writeStudioEntity } from "../src/lib/studio-history";
import { prepareLinkedSave, savedBlockUsage } from "../src/lib/saved-blocks";
import type { Block, SavedBlock, Template } from "../src/lib/model";
const row = (): SavedBlock => ({
  id: crypto.randomUUID(),
  name: "Case study",
  type: "group",
  block: { type: "heading", text: "Results", level: 1 },
  blocks: [
    { type: "heading", text: "Results", level: 1 },
    {
      type: "paragraph",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "We helped {{client.company}}." }],
          },
        ],
      },
    },
  ],
});
it("explicit sent replacement publishes a new version on the same link, preserves old versions/emails, and is refused after signing", async () => {
  const f = await setup(),
    original = row();
  await f.repo.put("content_library", original);
  let p = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      content: [...f.draft.content, ...stampSavedBlocks(original)],
    },
    staff,
  );
  p = await f.service.send(p.id, staff);
  const sent = structuredClone(p),
    emails = await f.repo.entities("email_log");
  await writeStudioEntity(
    f.repo,
    "content_library",
    original,
    {
      ...original,
      blocks: [{ type: "paragraph" as const, text: "Published latest story" }],
    },
    staff,
    { updateDrafts: true },
  );
  const replaced = await f.service.replaceSavedBlock(
    p.id,
    p.revision,
    original.id,
    staff,
  );
  expect(replaced.token).toBe(sent.token);
  expect(replaced.versions[0]).toEqual(sent.versions[0]);
  expect(replaced.versions).toHaveLength(2);
  expect(await f.repo.entities("email_log")).toEqual(emails);
  expect(replaced.content.at(-1)!.text).toBe("Published latest story");
  await expect(
    f.service.replaceSavedBlock(p.id, p.revision, original.id, staff),
  ).rejects.toMatchObject({ status: 409 });
  const signed = await f.service.sign(
    replaced.id,
    {
      ...signature(replaced.revision),
      version_hash: replaced.versions.at(-1)!.content_hash,
    },
    "client",
    clientActor,
    { token: replaced.token!, password: "" },
  );
  const snapshot = structuredClone(signed);
  await expect(
    f.service.replaceSavedBlock(signed.id, signed.revision, original.id, staff),
  ).rejects.toMatchObject({ status: 409 });
  expect(await f.repo.get(signed.id)).toEqual(snapshot);
});
describe("linked groups", () => {
  it("new proposals retain references as owned copies; bulk save updates only the approved draft IDs", async () => {
    const f = await setup(),
      source = row(),
      template = (await f.repo.entities<Template>("templates"))[0];
    await f.repo.put("content_library", source);
    await writeStudioEntity(
      f.repo,
      "templates",
      template,
      {
        ...template,
        content: [...template.content, ...stampSavedBlocks(source)],
      },
      staff,
    );
    const first = await f.service.create(
        {
          client_id: f.draft.client.id,
          template_id: template.id,
          title: "Approved draft",
        },
        staff,
      ),
      other = await f.service.create(
        {
          client_id: f.draft.client.id,
          template_id: template.id,
          title: "New unlisted draft",
        },
        staff,
      );
    const otherStored = await f.repo.get(other.id);
    expect(
      first.content.filter((b) => b.saved_block_id === source.id),
    ).toHaveLength(2);
    const saved = await writeStudioEntity(
      f.repo,
      "content_library",
      source,
      {
        ...source,
        blocks: [{ type: "paragraph" as const, text: "Approved replacement" }],
      },
      staff,
      { updateDrafts: true, draftIds: [first.id] },
    );
    expect((await f.repo.get(first.id))!.content.at(-1)!.text).toBe(
      "Approved replacement",
    );
    expect(await f.repo.get(other.id)).toEqual(otherStored);
    await expect(
      writeStudioEntity(
        f.repo,
        "content_library",
        saved,
        { ...saved, name: "Must not commit" },
        staff,
        { updateDrafts: true, draftIds: [crypto.randomUUID()] },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await f.repo.entities<SavedBlock>("content_library")).find(
        (r) => r.id === source.id,
      )!.name,
    ).toBe(source.name);
  });
  it("fingerprints ignore instance identity and match SHA-256 across Unicode and long blocks", () => {
    for (const text of ["", "Hello 🌍", "A".repeat(5000)]) {
      const b: Block = { id: "one", type: "paragraph", text };
      expect(linkedHash(b)).toBe(
        createHash("sha256")
          .update(JSON.stringify(linkedContent(b)))
          .digest("hex"),
      );
      expect(
        linkedHash({
          ...b,
          id: "other",
          saved_block_id: "ref",
          ai_review: { source: "ai", reviewed: false },
        }),
      ).toBe(linkedHash(b));
    }
  });
  it("updates whole unedited occurrences, keeps IDs, preserves local edits, and supports explicit Restore", () => {
    const original = row(),
      content = stampSavedBlocks(original),
      next = {
        ...original,
        version: 2,
        blocks: [
          { type: "heading" as const, text: "Updated", level: 1 as const },
          { type: "paragraph" as const, text: "New copy" },
          { type: "page_break" as const },
        ],
      };
    expect(linkedInstances(content, original.id)[0].edited).toBe(false);
    const changed = replaceLinkedBlocks(content, next);
    expect(changed).toHaveLength(3);
    expect(changed[0].id).toBe(content[0].id);
    expect(changed[0].text).toBe("Updated");
    const local = content.map((b, i) => (i ? { ...b, text: "Local edit" } : b));
    expect(replaceLinkedBlocks(local, next)).toEqual(local);
    expect(replaceLinkedBlocks(local, next, true)[1].text).toBe("New copy");
    expect(linkedInstances(content.slice(0, 1), original.id)[0].edited).toBe(
      true,
    );
  });
  it("saving defaults to templates only, skips edited copies and starters, and optionally updates drafts atomically with audit", async () => {
    const f = await setup(),
      original = row();
    await f.repo.put("content_library", original);
    const base = (await f.repo.entities<Template>("templates"))[0];
    const clean = {
      ...base,
      id: crypto.randomUUID(),
      content: stampSavedBlocks(original),
    };
    const local = {
      ...base,
      id: crypto.randomUUID(),
      content: stampSavedBlocks(original),
    };
    local.content[0].text = "Edited here";
    const starter = {
      ...base,
      id: crypto.randomUUID(),
      starter_key: "test-starter",
      content: stampSavedBlocks(original),
    };
    for (const t of [clean, local, starter]) await f.repo.put("templates", t);
    f.draft.content = stampSavedBlocks(original);
    await f.repo.save(f.draft, f.draft.revision);
    const changed = {
      ...original,
      blocks: [{ type: "paragraph" as const, text: "Second version" }],
    };
    const saved = await writeStudioEntity(
      f.repo,
      "content_library",
      original,
      changed,
      staff,
    );
    expect(
      (await f.repo.entities<Template>("templates")).find(
        (t) => t.id === clean.id,
      )!.content[0].text,
    ).toBe("Second version");
    expect(
      (await f.repo.entities<Template>("templates")).find(
        (t) => t.id === local.id,
      )!.content[0].text,
    ).toBe("Edited here");
    expect(
      (await f.repo.entities<Template>("templates")).find(
        (t) => t.id === starter.id,
      ),
    ).toEqual(starter);
    expect((await f.repo.get(f.draft.id))!.content).toEqual(f.draft.content);
    expect((await savedBlockUsage(f.repo, saved)).templates).toHaveLength(2);
    const third = await writeStudioEntity(
      f.repo,
      "content_library",
      saved,
      { ...saved, blocks: [{ type: "paragraph" as const, text: "Third" }] },
      staff,
      { updateDrafts: true },
    );
    const draft = (await f.repo.get(f.draft.id))!;
    expect(draft.content[0].text).toBe("Third");
    expect(draft.events.at(-1)!.type).toBe("saved_block_updated");
    expect(draft.versions).toEqual(f.draft.versions);
    expect(draft.token).toBe(f.draft.token);
    const commit = await prepareLinkedSave(
      f.repo,
      third,
      { ...third, name: "Atomic" },
      staff,
      true,
    );
    await f.repo.save(
      { ...draft, title: "Concurrent", revision: draft.revision + 1 },
      draft.revision,
    );
    expect(
      await f.repo.commitLinkedBlock(commit, {
        id: crypto.randomUUID(),
        ...staff,
        type: "test",
        created_at: new Date().toISOString(),
        metadata: {},
      }),
    ).toBe(false);
    expect(
      (await f.repo.entities<SavedBlock>("content_library")).find(
        (r) => r.id === original.id,
      )!.name,
    ).toBe(original.name);
  });
  it("never updates sent or signed proposals and deletion leaves their copies intact", async () => {
    const f = await setup(),
      original = row();
    await f.repo.put("content_library", original);
    f.draft.content = stampSavedBlocks(original);
    f.draft.status = "sent";
    f.draft.token = "existing-link";
    await f.repo.save(f.draft, f.draft.revision);
    const saved = await writeStudioEntity(
      f.repo,
      "content_library",
      original,
      { ...original, blocks: [{ type: "paragraph" as const, text: "Later" }] },
      staff,
      { updateDrafts: true },
    );
    expect(await f.repo.get(f.draft.id)).toEqual(f.draft);
    const change = await prepareLinkedSave(f.repo, saved, null, staff);
    expect(change.proposals).toEqual([]);
    expect(
      await f.repo.commitLinkedBlock(change, {
        id: crypto.randomUUID(),
        ...staff,
        type: "content_library_deleted",
        created_at: new Date().toISOString(),
        metadata: {},
      }),
    ).toBe(true);
    expect(await f.repo.get(f.draft.id)).toEqual(f.draft);
  });
});
