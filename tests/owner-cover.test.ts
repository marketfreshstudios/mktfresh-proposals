import { it, expect } from "vitest";
import { defaultCover, loadedCover, contentAfterCover } from "../src/lib/cover";
import { setup, staff, signature, clientActor } from "./helpers";
import { printContent } from "../src/lib/document-print";
import { versionHash } from "../src/lib/content";
it("new covers contain only the requested defaults and migrate only unset/old default copy", () => {
  const cover = defaultCover();
  expect(cover.eyebrow).toBe("");
  expect(cover.prepared_for).toBe("Prepared for {{client.company}}");
  expect(cover.byline).toBe("{{proposal.validity}}");
  const old = {
    workspace: "{{workspace.name}}",
    eyebrow: "Proposal for {{client.company}}",
    byline: "From {{sender.name}} · {{proposal.validity}}",
    logo: null,
    logo_height: 64,
  };
  expect(loadedCover(old)).toEqual({
    ...defaultCover(),
    logo: null,
    logo_height: 64,
  });
  expect(loadedCover({ ...old, eyebrow: "A custom introduction" })).toEqual({
    ...old,
    eyebrow: "A custom introduction",
  });
  const blocks = [{ id: "scope", type: "heading" as const, text: "Scope" }];
  const next = contentAfterCover(blocks);
  expect(next[0].type).toBe("page_break");
  expect(next[1]).toBe(blocks[0]);
  expect(contentAfterCover(next)).toBe(next);
  expect(blocks).toHaveLength(1);
});
it("manual and AI creates start content on page 2, and AI edits cannot put scope on the cover", async () => {
  const f = await setup();
  for (const actor of [staff, { ...staff, actor: "ai:Assistant" }]) {
    const p = await f.service.create(
      {
        client_id: f.draft.client.id,
        template_id: f.draft.template_id!,
        title: "Cover fixture",
        content: [{ id: "body", type: "paragraph", text: "Scope" }],
      },
      actor,
    );
    expect(p.cover).toEqual(defaultCover());
    expect(p.content.map((b) => b.type)).toEqual(["page_break", "paragraph"]);
    if (actor.actor.startsWith("ai:")) {
      const edited = await f.service.edit(
        p.id,
        {
          revision: p.revision,
          content: [{ id: "new", type: "paragraph", text: "New scope" }],
        },
        actor,
      );
      expect(edited.content[0].type).toBe("page_break");
      expect(edited.content[1].text).toBe("New scope");
    }
  }
});
it("cover order and indefinite validity are empty safe, while signed payloads and hashes never migrate", async () => {
  const f = await setup();
  let sent = await f.service.send(f.draft.id, staff);
  const signed = await f.service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const version = signed.versions[0],
    before = JSON.stringify(version),
    hash = versionHash(version);
  const html = printContent({
    title: "The proposal",
    company: "Sample Company",
    sender: "Staff",
    validity: "",
    content: [],
    quote: [],
    variables: {
      "workspace.name": "The Studio",
      "client.company": "Sample Company",
      "proposal.validity": "",
    },
    currency: "USD",
    cover: version.cover,
  });
  expect(html.indexOf("The Studio")).toBeLessThan(html.indexOf("The proposal"));
  expect(html.indexOf("The proposal")).toBeLessThan(
    html.indexOf("Prepared for Sample Company"),
  );
  expect(html).not.toContain('class="byline"');
  expect(html).not.toContain("From Staff");
  expect(JSON.stringify(version)).toBe(before);
  expect(versionHash(version)).toBe(hash);
});
