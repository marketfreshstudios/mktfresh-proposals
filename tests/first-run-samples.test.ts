import { expect, it } from "vitest";
import { postgresFixture } from "./postgres-fixture";
import { CoverSchema } from "../src/lib/cover";
import { LOCAL_WORKSPACE_ID } from "../src/lib/workspace";
import { MemoryRepository } from "../src/lib/repository";
import type { Template } from "../src/lib/model";
import { randomUUID } from "node:crypto";

it("provisions three price-free, editable samples only on new workspace inserts", async () => {
  const db = await postgresFixture();
  const workspace = randomUUID();
  try {
    await db.query("insert into workspaces(id, name) values($1, $2)", [
      workspace,
      "New studio",
    ]);
    const { rows } = await db.query<{ data: Template }>(
      "select data from templates where workspace_id=$1 and data->>'sample'='true' order by data->>'name'",
      [workspace],
    );
    expect(rows.map(({ data }) => data.name)).toEqual([
      "Care plan",
      "Monthly retainer",
      "Website proposal",
    ]);
    for (const { data } of rows) {
      expect(data.starter_key).toBeUndefined();
      expect(data.active).toBe(true);
      expect(CoverSchema.parse(data.cover).layout).toBe("editorial");
      expect(data.default_quote).toEqual([]);
      expect(data.default_items).toEqual([]);
      expect(
        data.content
          .filter((b) => b.type === "signature_block")
          .map((b) => b.role),
      ).toEqual(["client", "company"]);
      expect(data.content.some((b) => b.type === "pricing_table")).toBe(true);
    }
    expect(
      (
        await db.query(
          "select id from templates where workspace_id=$1 and data->>'sample'='true'",
          [LOCAL_WORKSPACE_ID],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "select id from templates where workspace_id=$1 and data ? 'starter_key'",
          [workspace],
        )
      ).rows,
    ).toHaveLength(7);
  } finally {
    await db.close();
  }
});

it("removes only samples and leaves a deleted sample absent", async () => {
  const repo = new MemoryRepository();
  const template = { id: randomUUID(), name: "Template" };
  const sample = { id: randomUUID(), name: "Sample", sample: true };
  await repo.put("templates", template);
  await repo.put("templates", sample);
  expect(await repo.removeSampleTemplate(template.id)).toBe(false);
  expect(await repo.removeSampleTemplate(sample.id)).toBe(true);
  expect(await repo.entities("templates")).toEqual([template]);
});
