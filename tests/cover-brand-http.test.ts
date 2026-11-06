import { expect, it, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({ fixture: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => ({
    ...staff,
    workspace_id: state.fixture.repo.workspaceId,
  }),
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  allRuntimes: vi.fn(),
  publicRuntime: vi.fn(),
}));
import { handle } from "../src/lib/http";
import { setup, staff } from "./helpers";
import { defaultCover } from "../src/lib/cover";
import type { Template } from "../src/lib/model";
beforeEach(async () => {
  state.fixture = await setup();
});
async function save(template: Template) {
  const response = await handle(
    new Request("http://localhost/api/templates", {
      method: "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify(template),
    }),
    ["templates"],
  );
  expect(response.status).toBe(201);
  return (await response.json()) as Template;
}
it("missing legacy covers stay legacy through template save and proposal creation; only new templates get automatic branding", async () => {
  const { repo, service, draft } = state.fixture;
  const original = (await repo.entities("templates")).find(
    (t: Template) => t.id === draft.template_id,
  ) as Template;
  delete original.cover;
  await repo.put("templates", original);
  const legacy = await save({ ...original, name: "Edited legacy template" });
  expect(legacy.cover).toEqual(defaultCover());
  const fresh = await save({
    ...original,
    id: crypto.randomUUID(),
    name: "New template",
  });
  expect(fresh.cover).toEqual(defaultCover(true));
  for (const template of [legacy, fresh]) {
    const proposal = await service.create(
      {
        template_id: template.id,
        client_id: draft.client.id,
        title: "Inherited cover",
      },
      staff,
    );
    expect(proposal.cover).toEqual(template.cover);
  }
});
it("omitting a cover when saving an authored template retains its exact stored cover", async () => {
  const { repo, draft } = state.fixture;
  const template = (await repo.entities("templates")).find(
    (t: Template) => t.id === draft.template_id,
  ) as Template;
  const cover = {
    ...defaultCover(),
    workspace: "An authored line",
    logo: null,
  };
  await repo.put("templates", { ...template, cover });
  delete template.cover;
  expect((await save(template)).cover).toEqual(cover);
});
