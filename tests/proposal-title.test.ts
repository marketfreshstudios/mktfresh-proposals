import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { proposalAction } from "../src/lib/proposal-actions";

it("a new proposal's name gets field values instead of codes", async () => {
  const { service, draft } = await setup();
  const p = await service.create(
    {
      client_id: draft.client.id,
      template_id: draft.template_id!,
      title: "A new website for {{client.company}}",
    },
    staff,
  );
  expect(p.title).toBe(`A new website for ${draft.client.company}`);
});

it("renaming fills known fields and leaves unknown codes as written", async () => {
  const { service, draft } = await setup();
  const p = await service.edit(
    draft.id,
    {
      revision: draft.revision,
      title: "{{client.first_name}} at {{client.company}} {{no.such_field}}",
    },
    staff,
  );
  expect(p.title).toBe(
    `${draft.client.first_name} at ${draft.client.company} {{no.such_field}}`,
  );
});

it("duplicate and change client never save a code into the name", async () => {
  const { repo, draft } = await setup();
  const copy = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "duplicate",
    staff,
    "",
    new Date(),
    undefined,
    { title: "Copy for {{client.company}}" },
  );
  expect(copy.title).toBe(`Copy for ${draft.client.company}`);
  const changed = await proposalAction(
    repo,
    copy.id,
    copy.revision,
    "change_client",
    staff,
    "",
    new Date(),
    undefined,
    { client_id: draft.client.id, title: "Again for {{client.company}}" },
  );
  expect(changed.title).toBe(`Again for ${draft.client.company}`);
});
