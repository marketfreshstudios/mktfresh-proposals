import { expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ supabase: vi.fn() }));
vi.mock("../src/lib/repository", async (original) => ({
  ...(await original<typeof import("../src/lib/repository")>()),
  supabase: mocked.supabase,
}));
import { updateStaffDisplayName, workspaceStaff } from "../src/lib/auth";
import { staff } from "./helpers";
it("team edits preserve email and membership and enforce owner/self and tenant boundaries", async () => {
  const member = {
    user_id: staff.actor.slice(6),
    role: "member",
    display_name: "Alex",
  };
  const calls: unknown[] = [];
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((...args) => {
      calls.push(args);
      return query;
    }),
    update: vi.fn().mockImplementation((value) => {
      calls.push(value);
      return query;
    }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: [member], error: null }),
    single: async () => ({ data: member, error: null }),
  };
  mocked.supabase.mockReturnValue({
    from: () => query,
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: "trusted@example.test" } },
          error: null,
        }),
      },
    },
  });
  const actor = {
    ...staff,
    staff_role: "member" as const,
    workspace_id: "00000000-0000-4000-8000-000000000001",
  };
  expect((await workspaceStaff(actor.workspace_id))[0]).toMatchObject({
    display_name: "Alex",
    email: "trusted@example.test",
  });
  await updateStaffDisplayName(actor, member.user_id, "Alex Updated");
  expect(calls).toContainEqual({ display_name: "Alex Updated" });
  expect(calls).toContainEqual(["workspace_id", actor.workspace_id]);
  expect(calls).toContainEqual(["user_id", member.user_id]);
  await expect(
    updateStaffDisplayName(
      actor,
      "00000000-0000-4000-8000-000000000099",
      "Other",
    ),
  ).rejects.toThrow("Only owners");
  await expect(
    updateStaffDisplayName(
      { ...actor, staff_role: "owner" },
      "00000000-0000-4000-8000-000000000099",
      "Other",
    ),
  ).rejects.toThrow("not found in this workspace");
  await expect(
    updateStaffDisplayName(
      { ...actor, actor: "ai:connector" },
      member.user_id,
      "Other",
    ),
  ).rejects.toThrow("Staff authorization");
  await expect(
    updateStaffDisplayName(actor, member.user_id, "Name\r\nBcc: bad"),
  ).rejects.toThrow("line breaks");
});
