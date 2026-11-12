import { expect, it } from "vitest";
import { setup, staff } from "./helpers";
import { proposalAction } from "../src/lib/proposal-actions";
import { titleForClient } from "../src/components/proposal-client-dialog";
import type { Client } from "../src/lib/model";

async function withSecondClient() {
  const f = await setup();
  const other: Client = {
    ...structuredClone(f.draft.client),
    id: "00000000-0000-4000-8000-0000000c1a02",
    company: "Second Client Co",
    email: "second@example.test",
  };
  await f.repo.put("clients", other);
  return { ...f, other };
}

it("duplicate creates the copy for the chosen client and title", async () => {
  const { repo, draft, other } = await withSecondClient();
  const copy = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "duplicate",
    staff,
    "",
    new Date(),
    undefined,
    { client_id: other.id, title: "Website for Second Client Co" },
  );
  expect(copy.client.id).toBe(other.id);
  expect(copy.client.company).toBe("Second Client Co");
  expect(copy.title).toBe("Website for Second Client Co");
  expect(copy.status).toBe("draft");
  expect((await repo.get(draft.id))!.client.id).toBe(draft.client.id);
});

it("duplicate without a client keeps the same client and adds (copy)", async () => {
  const { repo, draft } = await withSecondClient();
  const copy = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "duplicate",
    staff,
  );
  expect(copy.client.id).toBe(draft.client.id);
  expect(copy.title).toBe(`${draft.title} (copy)`);
});

it("the client changes on a never-sent draft and is recorded", async () => {
  const { repo, draft, other } = await withSecondClient();
  const next = await proposalAction(
    repo,
    draft.id,
    draft.revision,
    "change_client",
    staff,
    "",
    new Date(),
    undefined,
    { client_id: other.id },
  );
  expect(next.client.id).toBe(other.id);
  expect(next.title).toBe(draft.title);
  expect(next.events.at(-1)).toMatchObject({
    type: "client_changed",
    metadata: { company: "Second Client Co" },
  });
});

it("the client can't change once the proposal has been sent", async () => {
  const { repo, service, draft, other } = await withSecondClient();
  const sent = await service.send(draft.id, staff);
  await expect(
    proposalAction(
      repo,
      sent.id,
      sent.revision,
      "change_client",
      staff,
      "",
      new Date(),
      undefined,
      { client_id: other.id },
    ),
  ).rejects.toThrow(
    "The client can only change before the proposal is first sent",
  );
});

it("titles swap the old company name for the new one", () => {
  expect(
    titleForClient(
      "A new website for Acme Co",
      { company: "Acme Co" },
      { company: "Beta LLC" },
    ),
  ).toBe("A new website for Beta LLC");
  expect(
    titleForClient(
      "Website refresh",
      { company: "Acme Co" },
      { company: "Beta LLC" },
    ),
  ).toBe("Website refresh");
});
