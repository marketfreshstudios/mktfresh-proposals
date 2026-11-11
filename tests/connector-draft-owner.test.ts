import { describe, it, expect } from "vitest";
import { setup, staff } from "./helpers";
import { seedIds } from "../seed/marketfresh";
import { proposalOwnerId } from "../src/lib/proposal-owner";
import type { Actor } from "../src/lib/model";

const assistant = (userId: string): Actor => ({
  actor: "ai:Claude",
  connector_id: "connector-1",
  on_behalf_of_user_id: userId,
  on_behalf_of_name: "Alex Morgan",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  ip: "",
  user_agent: "MCP",
});

describe("connector drafts", () => {
  it("are owned by the staff member who connected the assistant", async () => {
    const f = await setup();
    const p = await f.service.create(
      {
        client_id: f.draft.client.id,
        template_id: seedIds.template,
        title: "Connector draft",
      },
      assistant(staff.actor.slice(6)),
    );
    expect(p.owner).toEqual({
      user_id: staff.actor.slice(6),
      display_name: "Alex Morgan",
      email: "staff@example.test",
    });
    expect(proposalOwnerId(p)).toBe(staff.actor.slice(6));
  });
  it("stay unowned when the connecting member is no longer in the workspace", async () => {
    const f = await setup();
    const p = await f.service.create(
      {
        client_id: f.draft.client.id,
        template_id: seedIds.template,
        title: "Connector draft",
      },
      assistant("00000000-0000-4000-8000-0000000000ff"),
    );
    expect(p.owner).toBeUndefined();
  });
});
