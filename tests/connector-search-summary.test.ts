import { expect, it } from "vitest";
import { aiTool } from "../src/lib/ai-tools";
import { setup } from "./helpers";

it("search_proposals returns short summaries; get_proposal keeps the full proposal", async () => {
  const { repo, draft } = await setup();
  const actor = {
    actor: "ai:test-client",
    workspace_id: repo.workspaceId,
  } as never;
  const hits = (await aiTool(repo, actor, "search_proposals", { query: "" }, [
    "proposals:read",
  ])) as Record<string, unknown>[];
  const hit = hits.find((h) => h.id === draft.id)!;
  expect(hit).toBeTruthy();
  expect(Object.keys(hit)).not.toContain("content");
  expect(Object.keys(hit)).not.toContain("search_text");
  expect(hit).toMatchObject({
    title: draft.title,
    status: draft.status,
    client: { company: draft.client.company },
  });
  expect(typeof hit.one_time_total).toBe("string");
  const full = (await aiTool(repo, actor, "get_proposal", { id: draft.id }, [
    "proposals:read",
  ])) as Record<string, unknown>;
  expect(full.content).toBeTruthy();
});
