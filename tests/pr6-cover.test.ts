import { it, expect } from "vitest";
import { setup, staff, signature, clientActor } from "./helpers";
import { defaultCover, CoverSchema } from "../src/lib/cover";
import { versionHash } from "../src/lib/content";
import { publicResult } from "../src/lib/service";
import { printContent } from "../src/lib/document-print";
it("new drafts inherit template covers and cover edits publish on the same token and freeze with the signed hash", async () => {
  const f = await setup();
  expect(f.draft.cover).toEqual(defaultCover(true));
  expect(f.draft.content[0].type).toBe("page_break");
  const t = (await f.repo.entities<any>("templates"))[0];
  t.cover = {
    ...defaultCover(),
    eyebrow: "For {{client.first_name}}",
    logo: null,
  };
  await f.repo.put("templates", t);
  const next = await f.service.create(
    { client_id: f.draft.client.id, template_id: t.id, title: "Another" },
    staff,
  );
  expect(next.cover).toEqual(t.cover);
  const sent = await f.service.send(f.draft.id, staff);
  const changed = await f.service.edit(
    sent.id,
    {
      revision: sent.revision,
      cover: { ...defaultCover(), workspace: "Independent studio", logo: null },
    },
    staff,
  );
  expect(changed.token).toBe(sent.token);
  expect(changed.jobs).toEqual(sent.jobs);
  expect(publicResult(changed).cover?.workspace).toBe("Independent studio");
  expect(changed.versions[0]).toEqual(sent.versions[0]);
  expect(changed.versions[1].content_hash).not.toBe(
    sent.versions[0].content_hash,
  );
  expect(versionHash(changed.versions[1])).toBe(
    changed.versions[1].content_hash,
  );
  const signed = await f.service.sign(
    changed.id,
    signature(changed.revision),
    "client",
    clientActor,
    { token: changed.token!, password: "" },
  );
  expect(signed.versions.at(-1)!.cover).toEqual(changed.cover);
  expect(versionHash(signed.versions.at(-1)!)).toBe(
    signed.versions.at(-1)!.content_hash,
  );
});
it("unset covers receive the new presentation without changing stored hash inputs; cover HTML escapes text and rejects remote images", () => {
  const common = {
    title: "Title",
    company: "Client",
    sender: "Alex",
    validity: "",
    content: [],
    quote: [],
    variables: {
      "workspace.name": "Studio",
      "client.company": "Client",
      "sender.name": "Alex",
      "proposal.validity": "",
    },
    currency: "USD",
  };
  const old = printContent(common);
  expect(old).toContain('<p class="prepared-for">Prepared for Client</p>');
  expect(old).not.toContain("Proposal for");
  expect(old).not.toContain("From Alex");
  expect(old).toContain("print-workspace");
  const html = printContent({
    ...common,
    cover: {
      ...defaultCover(),
      workspace: "<script>alert(1)</script>",
      logo: null,
    },
  });
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(
    CoverSchema.safeParse({
      ...defaultCover(),
      logo: "https://example.test/logo.png",
    }).success,
  ).toBe(false);
});
