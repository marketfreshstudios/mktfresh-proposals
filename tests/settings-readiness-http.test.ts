import { expect, it, vi } from "vitest";
import { setup, staff } from "./helpers";
const mocked = vi.hoisted(() => ({ staff: vi.fn(), runtime: vi.fn() }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: mocked.staff,
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: mocked.runtime,
  publicRuntime: vi.fn(),
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
it("staff draft reads and readiness resolve current settings without saving a snapshot", async () => {
  const { repo, service, draft, settings } = await setup();
  draft.content.unshift({ type: "paragraph", text: "Call {{company.phone}}" });
  await repo.save(draft, draft.revision);
  const storedBefore = await repo.get(draft.id);
  await repo.put("workspace_settings", {
    ...settings,
    phone: "555-CURRENT",
    company_name: "Current company",
  });
  mocked.runtime.mockReturnValue({ repo, service });
  mocked.staff.mockResolvedValue({ ...staff, workspace_id: repo.workspaceId });
  const get = () =>
    handle(new Request(`http://localhost/api/proposals/${draft.id}`), [
      "proposals",
      draft.id,
    ]);
  const ready = () =>
    handle(new Request(`http://localhost/api/proposals/${draft.id}/ready`), [
      "proposals",
      draft.id,
      "ready",
    ]);
  expect((await (await get()).json()).workspace_settings.company_name).toBe(
    "Current company",
  );
  expect((await (await ready()).json()).ready).toBe(true);
  await repo.put("workspace_settings", { ...settings, phone: "" });
  expect((await (await ready()).json()).errors).toContain(
    "Unresolved variable: company.phone",
  );
  expect(await repo.get(draft.id)).toEqual(storedBefore);
});
