import { expect, it } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import { publicResult } from "../src/lib/service";
import { equalSecret } from "../src/lib/auth";
import { renderBlocks } from "../src/lib/content";
import { mutate } from "../src/lib/repository";
it("does not expose provider mappings, customer notes, audit IPs or jobs in public payload", async () => {
  const { service, draft } = await setup();
  const p = await service.send(draft.id, staff),
    text = JSON.stringify(publicResult(p));
  for (const field of [
    "qbo_item_id",
    "stripe_price_id",
    "password_hash",
    "jobs",
    "user_agent",
    "qbo_customer_id",
  ])
    expect(text).not.toContain(field);
});
it("fails invalid PNG, refuses public company signing, and blocks expired tokens immediately", async () => {
  const { repo, service, draft } = await setup();
  const p = await service.send(draft.id, staff);
  await expect(
    service.sign(
      p.id,
      {
        ...signature(p.revision),
        kind: "drawn",
        image: "data:image/png;base64,YWJj",
      },
      "client",
      clientActor,
      { token: p.token!, password: "" },
    ),
  ).rejects.toThrow("Invalid PNG");
  const signed = await service.sign(
    p.id,
    signature(p.revision),
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  await expect(
    service.sign(p.id, signature(signed.revision), "company", clientActor),
  ).rejects.toThrow("Staff authorization");
  const other = await setup();
  const sent = await other.service.send(other.draft.id, staff);
  await mutate(
    other.repo,
    sent.id,
    (p) => (p.valid_until = "2020-01-01T00:00:00.000Z"),
  );
  await expect(other.service.byToken(sent.token!)).rejects.toThrow("expired");
});
it("escapes rich text, rejects unknown nodes and compares nonempty secrets", () => {
  expect(equalSecret("", "")).toBe(false);
  expect(equalSecret("a", "ab")).toBe(false);
  expect(equalSecret("secret", "secret")).toBe(true);
  expect(
    renderBlocks(
      [
        {
          type: "paragraph",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "<img src=x onerror=alert(1)>",
                    marks: [{ type: "bold" }],
                  },
                ],
              },
            ],
          },
        },
      ],
      [],
      {},
    ),
  ).toContain("&lt;img");
  expect(() =>
    renderBlocks(
      [{ type: "paragraph", content: { type: "script", text: "x" } }],
      [],
      {},
    ),
  ).toThrow("Unsupported");
});
it("unchanged reads and idle workers do not invalidate a reviewed revision", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.view(p.token!, "", clientActor);
  const viewed = await service.view(p.token!, "", clientActor);
  expect(viewed.revision).toBe(p.revision);
  const unchanged = await mutate(repo, p.id, () => {});
  expect(unchanged.revision).toBe(p.revision);
});
it("draft edits cannot change a sent proposal", async () => {
  const { service, draft } = await setup();
  let p = await service.edit(
    draft.id,
    { revision: draft.revision, title: "Revised" },
    staff,
  );
  expect(p.title).toBe("Revised");
  p = await service.send(p.id, staff);
  await expect(
    service.edit(p.id, { revision: p.revision, title: "Tampered" }, staff),
  ).rejects.toThrow("Only drafts");
});
