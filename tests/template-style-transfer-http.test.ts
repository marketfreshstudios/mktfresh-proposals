import { expect, it, vi } from "vitest";
import { setup, staff } from "./helpers";
import { AppError, type Template } from "../src/lib/model";
import { MemoryRepository } from "../src/lib/repository";
const mocks = vi.hoisted(() => ({ staff: vi.fn(), runtime: vi.fn() }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mocks.staff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocks.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
function request(id: string, action = "template-styles", data?: unknown) {
  return handle(
    new Request(`http://localhost/api/proposals/${id}/${action}`, {
      method: data === undefined ? "GET" : "POST",
      ...(data === undefined
        ? {}
        : {
            headers: {
              "content-type": "application/json",
              origin: "http://localhost",
            },
            body: JSON.stringify(data),
          }),
    }),
    ["proposals", id, action],
  );
}
async function fixture() {
  const f = await setup();
  mocks.runtime.mockReturnValue(f);
  mocks.staff.mockResolvedValue({ ...staff, staff_role: "member" });
  const proposal = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      style_overrides: { heading1: { space_below: 24 } },
    },
    staff,
  );
  return { ...f, proposal };
}
it("staff HTTP save and Undo use authenticated, workspace-scoped revisions; browser input cannot replace content", async () => {
  const f = await fixture();
  const before = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === f.proposal.template_id,
  )!;
  const proposalBefore = await f.repo.get(f.proposal.id);
  const targetResponse = await request(f.proposal.id);
  expect(targetResponse.status).toBe(200);
  const target = await targetResponse.json();
  const input = {
    revision: target.revision,
    proposal_revision: target.proposal_revision,
  };
  expect(
    (await request(f.proposal.id, "template-styles", { ...input, content: [] }))
      .status,
  ).toBe(400);
  const saved = await request(f.proposal.id, "template-styles", input);
  expect(saved.status).toBe(200);
  const result = await saved.json();
  expect(result.style_overrides.heading1.space_below).toBe(24);
  expect((await request(f.proposal.id, "template-styles", input)).status).toBe(
    409,
  );
  expect(
    (
      await request(f.proposal.id, "undo-template-styles", {
        event_id: result.event_id,
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === before.id,
    ),
  ).toEqual(before);
  expect(await f.repo.get(f.proposal.id)).toEqual(proposalBefore);
});
it("anonymous, AI and another workspace cannot read or write the template styles", async () => {
  const f = await fixture();
  mocks.staff.mockRejectedValue(
    new AppError(401, "Staff authorization required"),
  );
  expect((await request(f.proposal.id)).status).toBe(401);
  expect((await request(f.proposal.id, "template-styles", {})).status).toBe(
    401,
  );
  mocks.staff.mockResolvedValue({ ...staff, actor: "ai:Claude" });
  expect((await request(f.proposal.id)).status).toBe(403);
  mocks.staff.mockResolvedValue(staff);
  mocks.runtime.mockReturnValue({
    ...f,
    repo: new MemoryRepository(crypto.randomUUID()),
  });
  expect((await request(f.proposal.id)).status).toBe(404);
  expect(
    (
      await request(f.proposal.id, "undo-template-styles", {
        event_id: crypto.randomUUID(),
      })
    ).status,
  ).toBe(409);
});
