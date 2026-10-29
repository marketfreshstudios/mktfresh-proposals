import { expect, it } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import type { WorkspaceSettings } from "../src/lib/workspace";
import { aiTool } from "../src/lib/ai-tools";
import { readiness } from "../src/lib/quote";
import { withDraftSettings } from "../src/lib/proposal-settings";
import { previewResult } from "../src/lib/preview";
import type { Item } from "../src/lib/model";
it("draft storage has no settings snapshot; reads and previews use current settings without persisting them", async () => {
  const { repo, service, draft, settings } = await setup();
  const stored = await repo.get(draft.id);
  expect(stored).not.toHaveProperty("workspace_settings");
  const updated = {
    ...settings,
    company_name: "Current Studio",
    phone: "555-1234",
    accent_colour: "#123456",
  };
  await repo.put("workspace_settings", updated);
  const read = await service.forRead(draft);
  expect(read.workspace_settings).toMatchObject({
    company_name: "Current Studio",
    phone: "555-1234",
    accent_colour: "#123456",
  });
  expect(read.workspace_settings!.company_signatory!.image).toBeNull();
  expect(previewResult(draft, updated).company.name).toBe("Current Studio");
  expect(await repo.get(draft.id)).toEqual(stored);
  const edited = await service.edit(
    draft.id,
    { revision: draft.revision, title: "Edited draft" },
    staff,
  );
  expect(edited.workspace_settings!.company_name).toBe("Current Studio");
  expect(await repo.get(draft.id)).not.toHaveProperty("workspace_settings");
});
it("send and resend snapshot current settings and resolve each version with its send-time settings", async () => {
  const { repo, service, draft, settings } = await setup();
  draft.content.unshift({
    type: "paragraph",
    text: "{{company.name}} · {{company.phone}}",
  });
  await repo.save(draft, draft.revision);
  const first = {
    ...settings,
    company_name: "First Send Studio",
    phone: "111",
    reminder_days: [2, 5],
  };
  await repo.put("workspace_settings", first);
  const sent = await service.send(draft.id, staff);
  expect(sent.workspace_settings).toMatchObject({
    company_name: first.company_name,
    phone: "111",
    reminder_days: [2, 5],
  });
  expect(sent.versions[0].variables_resolved["company.name"]).toBe(
    first.company_name,
  );
  const originalVersion = structuredClone(sent.versions[0]);
  const next = {
    ...first,
    company_name: "Resent Studio",
    phone: "222",
    reminder_days: [4, 8],
  };
  await repo.put("workspace_settings", next);
  const resent = await service.send(draft.id, staff);
  expect(resent.workspace_settings).toMatchObject({
    company_name: next.company_name,
    phone: "222",
    reminder_days: [4, 8],
  });
  expect(resent.versions[1].variables_resolved["company.name"]).toBe(
    next.company_name,
  );
  expect(resent.versions[0]).toEqual(originalVersion);
  expect(resent.sender!.company_name).toBe(next.company_name);
  expect(resent.workspace_settings!.company_signatory!.image).toBeNull();
});
it("draft readiness uses current settings in the staff view and AI connector, ignoring stale draft values", async () => {
  const { repo, service, draft, settings } = await setup();
  draft.content.unshift({ type: "paragraph", text: "Call {{company.phone}}" });
  draft.workspace_settings = { ...settings, phone: "Old phone" };
  await repo.save(draft, draft.revision);
  const current = { ...settings, phone: "" };
  await repo.put("workspace_settings", current);
  const catalog = await repo.entities<Item>("pricing_items");
  expect(readiness(withDraftSettings(draft, current), catalog).ready).toBe(
    false,
  );
  const actor = {
    ...staff,
    actor: "ai:Assistant",
    workspace_id: repo.workspaceId,
  };
  const ready = (await aiTool(repo, actor, "check_ready", { id: draft.id }, [
    "proposals:read",
  ])) as any;
  expect(ready.errors).toContain("Unresolved variable: company.phone");
  await expect(service.send(draft.id, staff)).rejects.toThrow(
    "Unresolved variable: company.phone",
  );
  await repo.put("workspace_settings", { ...current, phone: "New phone" });
  expect(
    (
      (await aiTool(repo, actor, "check_ready", { id: draft.id }, [
        "proposals:read",
      ])) as any
    ).ready,
  ).toBe(true);
  const sent = await service.send(draft.id, staff);
  expect(sent.versions[0].variables_resolved["company.phone"]).toBe(
    "New phone",
  );
});
it("signed proposal settings and versions remain frozen when workspace settings change", async () => {
  const { repo, service, draft, settings } = await setup();
  const sent = await service.send(draft.id, staff);
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const frozen = structuredClone(signed);
  await repo.put("workspace_settings", {
    ...settings,
    company_name: "Changed after signature",
    phone: "999",
  });
  expect(await service.forRead((await repo.get(signed.id))!)).toEqual(frozen);
  await expect(service.send(signed.id, staff)).rejects.toThrow(
    "Cannot send signed",
  );
  expect(await repo.get(signed.id)).toEqual(frozen);
});
